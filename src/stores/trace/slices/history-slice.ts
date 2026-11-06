import { stageOf } from '@/lib/trace/document';
/**
 * stores/trace/slices/history-slice.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Undo / redo over whole-document snapshots.
 */

import {
  cloneProject,
  pushHistory,
  setHistoryOpActive,
  TRACE_HISTORY_LIMIT,
} from './history';
import type {
  TraceHistoryActions,
  TraceHistoryState,
  TraceSliceCreator,
} from './types';

export const createHistorySlice: TraceSliceCreator<
  TraceHistoryState & TraceHistoryActions
> = (set, get) => ({
  past: [],
  future: [],
  canUndo: false,
  canRedo: false,

  undo: () => {
    const { past, future, project, selection } = get();
    const previous = past[past.length - 1];
    if (!previous || !project) return;

    const nextPast = past.slice(0, -1);
    const nextFuture = [cloneProject(project), ...future].slice(
      0,
      TRACE_HISTORY_LIMIT,
    );
    const selectionExists =
      !selection.selectedElementId ||
      Boolean(stageOf(previous).elements[selection.selectedElementId]);

    setHistoryOpActive(true);
    set({
      project: cloneProject(previous),
      past: nextPast,
      future: nextFuture,
      canUndo: nextPast.length > 0,
      canRedo: true,
      dirty: true,
      saveState: 'idle',
      selection: selectionExists
        ? { ...selection, selectedKeyframeIds: [] }
        : {
            ...selection,
            selectedElementId: stageOf(previous).rootElementIds[0] ?? null,
            selectedKeyframeIds: [],
          },
      playback: {
        ...get().playback,
        currentTimeMs: Math.min(
          get().playback.currentTimeMs,
          previous.durationMs,
        ),
        isPlaying: false,
      },
    });
    setHistoryOpActive(false);
  },

  redo: () => {
    const { past, future, project, selection } = get();
    const next = future[0];
    if (!next || !project) return;

    const nextFuture = future.slice(1);
    const nextPast = pushHistory(past, project);
    const selectionExists =
      !selection.selectedElementId ||
      Boolean(stageOf(next).elements[selection.selectedElementId]);

    setHistoryOpActive(true);
    set({
      project: cloneProject(next),
      past: nextPast,
      future: nextFuture,
      canUndo: true,
      canRedo: nextFuture.length > 0,
      dirty: true,
      saveState: 'idle',
      selection: selectionExists
        ? { ...selection, selectedKeyframeIds: [] }
        : {
            ...selection,
            selectedElementId: stageOf(next).rootElementIds[0] ?? null,
            selectedKeyframeIds: [],
          },
      playback: {
        ...get().playback,
        currentTimeMs: Math.min(get().playback.currentTimeMs, next.durationMs),
        isPlaying: false,
      },
    });
    setHistoryOpActive(false);
  },

  clearHistory: () => {
    setHistoryOpActive(true);
    set({ past: [], future: [], canUndo: false, canRedo: false });
    setHistoryOpActive(false);
  },
});
