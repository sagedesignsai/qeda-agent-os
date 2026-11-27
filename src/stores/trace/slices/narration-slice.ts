/**
 * stores/trace/slices/narration-slice.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Narration editing actions.
 *
 * The document model stores narration as ordinary data, so every action here
 * compiles to a `setNarration` / timing op batch and goes through `dispatch`.
 * There is no side channel: undo, autosave and the copilot all see the same
 * document.
 */

import {
  buildNarrationTimingOps,
  type NarrationTimingOptions,
} from '@/lib/trace/narration-timing';
import type {
  TraceNarration,
  TraceNarrationLine,
  TraceScene,
} from '@/lib/trace/types';

import type { TraceNarrationActions, TraceSliceCreator } from './types';

let narrationLineCounter = 0;

function narrationLineId(): string {
  narrationLineCounter += 1;
  return `narr-${Date.now().toString(36)}-${narrationLineCounter}`;
}

function defaultSceneId(project: {
  storyboard?: { scenes: TraceScene[]; activeSceneId?: string };
} | null): string | null {
  if (!project?.storyboard) return null;
  return (
    project.storyboard.activeSceneId ??
    project.storyboard.scenes[0]?.id ??
    null
  );
}

function mergeLine(
  narration: TraceNarration,
  lineId: string,
  patch: Partial<Omit<TraceNarrationLine, 'id'>>,
): TraceNarration {
  return {
    ...narration,
    lines: narration.lines.map((line) =>
      line.id === lineId ? { ...line, ...patch } : line,
    ),
  };
}

export const createNarrationSlice: TraceSliceCreator<TraceNarrationActions> = (
  _set,
  get,
) => ({
  setNarration: (narration) => {
    get().dispatch([{ type: 'setNarration', narration }]);
  },

  updateNarrationLine: (lineId, patch) => {
    const project = get().project;
    if (!project?.narration) return;
    get().dispatch([
      {
        type: 'setNarration',
        narration: mergeLine(project.narration, lineId, patch),
      },
    ]);
  },

  addNarrationLine: (input = {}) => {
    const project = get().project;
    if (!project) return null;
    const line: TraceNarrationLine = {
      id: narrationLineId(),
      text: input.text ?? '',
      sceneId: input.sceneId ?? defaultSceneId(project),
    };
    const narration: TraceNarration = {
      ...(project.narration ?? { lines: [] }),
      lines: [...(project.narration?.lines ?? []), line],
    };
    get().dispatch([{ type: 'setNarration', narration }]);
    return line.id;
  },

  removeNarrationLine: (lineId) => {
    const project = get().project;
    if (!project?.narration) return;
    get().dispatch([
      {
        type: 'setNarration',
        narration: {
          ...project.narration,
          lines: project.narration.lines.filter((line) => line.id !== lineId),
        },
      },
    ]);
  },

  fitNarrationTiming: (options?: NarrationTimingOptions) => {
    const project = get().project;
    if (!project?.narration) return null;
    const built = buildNarrationTimingOps(project, project.narration, options);
    get().dispatch(built.ops);
    return { untimedLineIds: built.untimedLineIds };
  },
});