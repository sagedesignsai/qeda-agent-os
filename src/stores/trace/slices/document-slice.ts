/**
 * stores/trace/slices/document-slice.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Document state: the project, its save lifecycle and the single mutation entry
 * point (`dispatch`). Nothing else in the store mutates the document directly.
 */

import { applyOps } from '@/lib/trace/ops';
import { migrateTraceProject } from '@/lib/trace/migrate';
import { transformPatch } from '@/lib/trace/resolve';
import type { TraceApplyOpsResult, TraceOp } from '@/lib/trace/ops/types';
import type { TraceProject } from '@/lib/trace/types';

import { setHistoryOpActive } from './history';
import type {
  TraceDocumentActions,
  TraceDocumentState,
  TraceSliceCreator,
} from './types';

function clampTime(project: TraceProject | null, timeMs: number): number {
  const duration = project?.durationMs ?? 0;
  if (!Number.isFinite(timeMs)) return 0;
  return Math.min(Math.max(0, Math.round(timeMs)), Math.max(0, duration));
}

function activeSceneOf(project: TraceProject | null): string | null {
  if (!project?.storyboard) return null;
  return (
    project.storyboard.activeSceneId ?? project.storyboard.scenes[0]?.id ?? null
  );
}

function diffIsEmpty(result: TraceApplyOpsResult): boolean {
  const { diff } = result;
  return (
    diff.added.length === 0 &&
    diff.updated.length === 0 &&
    diff.removed.length === 0 &&
    diff.scenes.added.length === 0 &&
    diff.scenes.updated.length === 0 &&
    diff.scenes.removed.length === 0
  );
}

const initialState: TraceDocumentState = {
  project: null,
  projectPath: null,
  revision: 0,
  dirty: false,
  saveState: 'idle',
  saveError: null,
};

export const createDocumentSlice: TraceSliceCreator<
  TraceDocumentState & TraceDocumentActions
> = (set, get) => ({
  ...initialState,

  loadProject: (project, options = {}) => {
    const normalizedProject = migrateTraceProject(project);
    setHistoryOpActive(true);
    set({
      project: normalizedProject,
      projectPath: options.path ?? null,
      revision: options.revision ?? 0,
      dirty: false,
      saveState: 'idle',
      saveError: null,
      playback: {
        ...get().playback,
        currentTimeMs: 0,
        isPlaying: false,
      },
      selection: {
        selectedElementId: null,
        selectedElementIds: [],
        selectedKeyframeIds: [],
        expandedElementIds: [],
        collapsedElementIds: [],
        activeSceneId: activeSceneOf(normalizedProject),
        editingPathElementId: null,
      },
      past: [],
      future: [],
      canUndo: false,
      canRedo: false,
    });
    setHistoryOpActive(false);
  },

  closeProject: () => {
    setHistoryOpActive(true);
    set({
      ...initialState,
      playback: { ...get().playback, currentTimeMs: 0, isPlaying: false },
      selection: {
        selectedElementId: null,
        selectedElementIds: [],
        selectedKeyframeIds: [],
        expandedElementIds: [],
        collapsedElementIds: [],
        activeSceneId: null,
        editingPathElementId: null,
      },
      past: [],
      future: [],
      canUndo: false,
      canRedo: false,
    });
    setHistoryOpActive(false);
  },

  dispatch: (ops: TraceOp[]) => {
    const state = get();
    if (!state.project) return null;

    const result = applyOps(state.project, ops);
    if (!result.ok || diffIsEmpty(result)) return result;

    const selection = state.selection;
    const selectedElementIds = (selection.selectedElementIds ?? []).filter(
      (id) => Boolean(result.project.elements[id]),
    );
    const primaryExists = Boolean(
      selection.selectedElementId &&
        result.project.elements[selection.selectedElementId],
    );
    if (
      primaryExists &&
      selection.selectedElementId &&
      !selectedElementIds.includes(selection.selectedElementId)
    ) {
      selectedElementIds.push(selection.selectedElementId);
    }
    const selectedElementId = primaryExists
      ? selection.selectedElementId
      : (selectedElementIds[selectedElementIds.length - 1] ?? null);

    set({
      project: result.project,
      dirty: true,
      saveState: 'idle',
      saveError: null,
      playback: {
        ...state.playback,
        currentTimeMs: clampTime(result.project, state.playback.currentTimeMs),
      },
      selection: {
        ...selection,
        selectedElementId,
        selectedElementIds,
        selectedKeyframeIds: primaryExists
          ? selection.selectedKeyframeIds
          : [],
        editingPathElementId: result.project.elements[
          selection.editingPathElementId ?? ''
        ]
          ? selection.editingPathElementId
          : null,
        activeSceneId: activeSceneOf(result.project) ?? selection.activeSceneId,
      },
    });

    return result;
  },

  updateAttributes: (elementId, patch) => {
    get().updateAttributesMany([{ elementId, patch }]);
  },

  updateAttributesMany: (entries) => {
    const state = get();
    const timeMs = state.playback.currentTimeMs;
    const ops: TraceOp[] = [];

    for (const { elementId, patch } of entries) {
      const element = state.project?.elements[elementId];
      if (!element) continue;

      ops.push({ type: 'updateElement', id: elementId, attributes: patch });

      // Auto-keyframe: an existing track for an edited property gains a
      // keyframe at the playhead, matching a professional motion editor.
      if (!state.playback.autoKeyframe) continue;

      for (const [property, value] of Object.entries(patch)) {
        if (value === null || value === undefined) continue;
        const track = element.tracks.find(
          (entry) => entry.property === property,
        );
        if (!track) continue;

        const nextKeyframes = track.keyframes
          .filter((keyframe) => Math.abs(keyframe.timeMs - timeMs) > 10)
          .concat({
            id: keyframeId(),
            timeMs,
            value: value as number | string,
            easing: 'power2.out',
          })
          .sort((a, b) => a.timeMs - b.timeMs);

        ops.push({
          type: 'setTrack',
          elementId,
          property: track.property,
          trackId: track.id,
          keyframes: nextKeyframes.map((keyframe) => ({
            id: keyframe.id,
            timeMs: keyframe.timeMs,
            value: keyframe.value,
            easing: keyframe.easing,
          })),
        });
      }
    }

    if (ops.length > 0) get().dispatch(ops);
  },

  updateTransform: (elementId, transform, origin) => {
    const state = get();
    const element = state.project?.elements[elementId];
    if (!element) return;

    const timeMs = state.playback.currentTimeMs;
    const patch = transformPatch(element, transform, timeMs);

    const ops: TraceOp[] = [
      {
        type: 'updateElement',
        id: elementId,
        attributes: patch,
        ...(origin ? { origin: { ...origin } } : {}),
      },
    ];

    // Same auto-keyframe rule as updateAttributes: tracked properties gain
    // a keyframe at the playhead. baseX/baseY never match a track, so a
    // base move stays a base move across the whole timeline.
    if (state.playback.autoKeyframe) {
      for (const [property, value] of Object.entries(patch)) {
        if (value === null || value === undefined) continue;
        const track = element.tracks.find(
          (entry) => entry.property === property,
        );
        if (!track) continue;

        const nextKeyframes = track.keyframes
          .filter((keyframe) => Math.abs(keyframe.timeMs - timeMs) > 10)
          .concat({
            id: keyframeId(),
            timeMs,
            value: value as number | string,
            easing: 'power2.out',
          })
          .sort((a, b) => a.timeMs - b.timeMs);

        ops.push({
          type: 'setTrack',
          elementId,
          property: track.property,
          trackId: track.id,
          keyframes: nextKeyframes.map((keyframe) => ({
            id: keyframe.id,
            timeMs: keyframe.timeMs,
            value: keyframe.value,
            easing: keyframe.easing,
          })),
        });
      }
    }

    get().dispatch(ops);
  },

  setCanvas: (patch) => get().dispatch([{ type: 'setCanvas', ...patch }]),

  markSaving: () => set({ saveState: 'saving', saveError: null }),

  markSaved: (revision) =>
    set({ saveState: 'saved', saveError: null, dirty: false, revision }),

  markSaveFailed: (message) => set({ saveState: 'error', saveError: message }),

  markDirty: () => set({ dirty: true }),
});

let keyframeCounter = 0;
export function keyframeId(): string {
  keyframeCounter += 1;
  return `kf-${Date.now().toString(36)}-${keyframeCounter}`;
}

let trackCounter = 0;
export function trackId(property: string): string {
  trackCounter += 1;
  return `tr-${property}-${Date.now().toString(36)}-${trackCounter}`;
}
