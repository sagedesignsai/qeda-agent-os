/**
 * stores/trace-store.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Editor state for Nova Trace — the 2D vector motion workspace.
 *
 * Deliberately separate from the 3D Motion store: a different document, a
 * different renderer and a different lifecycle. Nothing here is shared with
 * Motion beyond the IPC/React shell.
 *
 * Architecture (ported from the sagedesigns-os Motion system):
 *  - slices own a single concern each (document, playback, selection, tracks,
 *    storyboard, history),
 *  - history is written by middleware from document snapshots,
 *  - every mutation is a semantic op, so the store, the copilot and IPC callers
 *    produce identical documents.
 */

import { create, type StateCreator } from 'zustand';

import { registerTraceRuntimeBridge } from '@/lib/trace/runtime/bridge';

import { createDocumentSlice } from './trace/slices/document-slice';
import { createHistorySlice } from './trace/slices/history-slice';
import { traceHistoryMiddleware } from './trace/slices/history-middleware';
import { createPlaybackSlice } from './trace/slices/playback-slice';
import { createSelectionSlice } from './trace/slices/selection-slice';
import { createStoryboardSlice } from './trace/slices/storyboard-slice';
import { createTracksSlice } from './trace/slices/tracks-slice';
import type { TraceStoreState } from './trace/slices/types';

export const useTraceStore = create<TraceStoreState>()(
  traceHistoryMiddleware((set, get, api) => ({
    ...createDocumentSlice(set, get, api),
    ...createPlaybackSlice(set, get, api),
    ...createSelectionSlice(set, get, api),
    ...createTracksSlice(set, get, api),
    ...createStoryboardSlice(set, get, api),
    ...createHistorySlice(set, get, api),
  })) as unknown as StateCreator<TraceStoreState>,
);

registerTraceRuntimeBridge({
  getProject: () => useTraceStore.getState().project,
  getPlayback: () => useTraceStore.getState().playback,
  commitTime: (timeMs) => useTraceStore.getState().setPlayhead(timeMs),
  setPlaying: (playing) => useTraceStore.getState().setPlaying(playing),
});

export type { TraceStoreState };
export type {
  TracePlayback,
  TraceSaveState,
  TraceSelection,
} from './trace/slices/types';
export { TRACE_HISTORY_LIMIT, cloneProject } from './trace/slices/history';
export {
  TRACE_DEFAULT_ZOOM,
  TRACE_MAX_ZOOM,
  TRACE_MIN_ZOOM,
  clampPlayhead,
} from './trace/slices/playback-slice';
