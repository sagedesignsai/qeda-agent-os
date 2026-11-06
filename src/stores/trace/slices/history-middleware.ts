/**
 * stores/trace/slices/history-middleware.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Records undo/redo snapshots automatically.
 *
 * - Discrete edits (element add/remove, keyframe count changes, canvas changes)
 *   always start a new step.
 * - Continuous edits (dragging a value) coalesce inside a 400 ms window.
 * - Loading or closing a project clears the stack instead of recording it.
 */

import {
  cloneProject,
  isHistoryOpActive,
  setHistoryOpActive,
  TRACE_HISTORY_LIMIT,
} from './history';
import type { TraceSliceCreator, TraceStoreState } from './types';

const COALESCE_MS = 400;

function keyframeCount(project: TraceStoreState['project']): number {
  if (!project) return 0;
  return Object.values(project.elements).reduce(
    (total, element) =>
      total +
      (element.tracks ?? []).reduce(
        (sum, track) => sum + (track.keyframes?.length ?? 0),
        0,
      ),
    0,
  );
}

export function traceHistoryMiddleware(
  creator: TraceSliceCreator<TraceStoreState>,
): TraceSliceCreator<TraceStoreState> {
  return (set, get, api) => {
    let lastSnapshotAt = 0;

    const trackingSet: typeof set = (partial, replace) => {
      const before = get();
      (set as (p: unknown, r?: boolean) => void)(partial, replace);
      const after = get();

      if (
        isHistoryOpActive() ||
        !before.project ||
        !after.project ||
        before.project === after.project
      ) {
        return;
      }

      if (
        before.projectPath !== after.projectPath ||
        before.project.id !== after.project.id
      ) {
        setHistoryOpActive(true);
        set({ past: [], future: [], canUndo: false, canRedo: false });
        setHistoryOpActive(false);
        lastSnapshotAt = Date.now();
        return;
      }

      const now = Date.now();
      const discrete =
        Object.keys(before.project.elements).length !==
          Object.keys(after.project.elements).length ||
        (before.project.rootElementIds ?? []).length !==
          (after.project.rootElementIds ?? []).length ||
        (before.project.storyboard?.scenes.length ?? 0) !==
          (after.project.storyboard?.scenes.length ?? 0) ||
        keyframeCount(before.project) !== keyframeCount(after.project) ||
        before.project.width !== after.project.width ||
        before.project.height !== after.project.height ||
        before.project.durationMs !== after.project.durationMs ||
        before.project.fps !== after.project.fps;

      if (!discrete && now - lastSnapshotAt < COALESCE_MS) return;

      const past = [...before.past, cloneProject(before.project)].slice(
        -TRACE_HISTORY_LIMIT,
      );
      setHistoryOpActive(true);
      set({ past, future: [], canUndo: past.length > 0, canRedo: false });
      setHistoryOpActive(false);
      lastSnapshotAt = now;
    };

    return creator(trackingSet, get, api);
  };
}
