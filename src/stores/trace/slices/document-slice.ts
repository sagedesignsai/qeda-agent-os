/**
 * stores/trace/slices/document-slice.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Document state: the project, its save lifecycle and the single mutation entry
 * point (`dispatch`). Nothing else in the store mutates the document directly.
 */

import { applyOps } from '@/lib/trace/ops';
import { migrateTraceProject } from '@/lib/trace/migrate';
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
        selectedKeyframeIds: [],
        expandedElementIds: [],
        collapsedElementIds: [],
        activeSceneId: activeSceneOf(normalizedProject),
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
        selectedKeyframeIds: [],
        expandedElementIds: [],
        collapsedElementIds: [],
        activeSceneId: null,
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
    const selectionExists =
      !selection.selectedElementId ||
      Boolean(result.project.elements[selection.selectedElementId]);

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
        ...(selectionExists
          ? selection
          : { ...selection, selectedElementId: null, selectedKeyframeIds: [] }),
        activeSceneId: activeSceneOf(result.project) ?? selection.activeSceneId,
      },
    });

    return result;
  },

  updateAttributes: (elementId, patch) => {
    const state = get();
    const element = state.project?.elements[elementId];
    if (!element) return;

    const ops: TraceOp[] = [
      { type: 'updateElement', id: elementId, attributes: patch },
    ];

    // Auto-keyframe: an existing track for an edited property gains a keyframe at
    // the playhead, matching the behaviour of a professional motion editor.
    if (state.playback.autoKeyframe) {
      const timeMs = state.playback.currentTimeMs;
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
