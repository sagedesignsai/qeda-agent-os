/**
 * stores/trace/slices/playback-slice.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Transport state only. The engine (GSAP clock + DOM renderer) observes
 * `isPlaying` and the committed playhead from the editor shell; keeping the
 * driver out of the store keeps it testable without a DOM.
 */

import type {
  TracePlaybackActions,
  TracePlaybackState,
  TraceSliceCreator,
} from './types';

export const TRACE_DEFAULT_ZOOM = 120;
export const TRACE_MIN_ZOOM = 10;
export const TRACE_MAX_ZOOM = 1600;

function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return TRACE_DEFAULT_ZOOM;
  return Math.min(TRACE_MAX_ZOOM, Math.max(TRACE_MIN_ZOOM, Math.round(value)));
}

export function clampPlayhead(timeMs: number, durationMs: number): number {
  if (!Number.isFinite(timeMs)) return 0;
  return Math.min(Math.max(0, Math.round(timeMs)), Math.max(0, durationMs));
}

export const createPlaybackSlice: TraceSliceCreator<
  TracePlaybackState & TracePlaybackActions
> = (set, get) => ({
  playback: {
    currentTimeMs: 0,
    isPlaying: false,
    isLooping: true,
    zoomRatio: TRACE_DEFAULT_ZOOM,
    playbackSpeed: 1,
    playbackDirection: 'forward',
    autoKeyframe: true,
    isTimelineCollapsed: false,
  },

  setPlayhead: (timeMs, options = {}) => {
    const duration = get().project?.durationMs ?? 0;
    set((state) => ({
      playback: {
        ...state.playback,
        currentTimeMs: clampPlayhead(timeMs, duration),
      },
    }));
    // `commit: false` leaves the authoritative timestamp to the driver; the UI
    // is already being moved by the DOM renderer during a scrub.
    if (options.commit === false) return;
  },

  setPlaying: (playing) =>
    set((state) => ({
      playback: { ...state.playback, isPlaying: playing },
    })),

  togglePlay: () =>
    set((state) => ({
      playback: { ...state.playback, isPlaying: !state.playback.isPlaying },
    })),

  setLooping: (looping) =>
    set((state) => ({
      playback: { ...state.playback, isLooping: looping },
    })),

  setZoomRatio: (zoomRatio) =>
    set((state) => ({
      playback: { ...state.playback, zoomRatio: clampZoom(zoomRatio) },
    })),

  setPlaybackSpeed: (speed) =>
    set((state) => ({
      playback: {
        ...state.playback,
        playbackSpeed: Math.min(
          4,
          Math.max(0.1, Number.isFinite(speed) ? speed : 1),
        ),
      },
    })),

  setPlaybackDirection: (direction) =>
    set((state) => ({
      playback: { ...state.playback, playbackDirection: direction },
    })),

  setAutoKeyframe: (enabled) =>
    set((state) => ({
      playback: { ...state.playback, autoKeyframe: enabled },
    })),

  setTimelineCollapsed: (collapsed) =>
    set((state) => ({
      playback: { ...state.playback, isTimelineCollapsed: collapsed },
    })),
});
