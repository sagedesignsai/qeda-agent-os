/**
 * lib/trace/runtime/bridge.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The playback engine lives outside React and must read the document without
 * importing the store (which imports the engine). This module is the seam: the
 * store registers a small bridge at module init, the engine reads through it.
 *
 * Adapted from sagedesigns-os lib/motion/runtime/store-ref.ts for Nova Trace.
 */

import type { TraceProject } from '../types';

export type TracePlaybackSnapshot = {
  currentTimeMs: number;
  isPlaying: boolean;
  isLooping: boolean;
  /** Timeline scale in pixels per second. */
  zoomRatio: number;
  playbackSpeed: number;
  playbackDirection: 'forward' | 'reverse';
};

export interface TraceRuntimeBridge {
  getProject: () => TraceProject | null;
  getPlayback: () => TracePlaybackSnapshot;
  /** Commit the authoritative playhead after a pause, stop or scrub. */
  commitTime: (timeMs: number) => void;
  setPlaying: (playing: boolean) => void;
}

let bridge: TraceRuntimeBridge | null = null;

export function registerTraceRuntimeBridge(next: TraceRuntimeBridge): void {
  bridge = next;
}

export function getTraceRuntimeBridge(): TraceRuntimeBridge | null {
  return bridge;
}

export function requireTraceRuntimeBridge(): TraceRuntimeBridge {
  if (!bridge) {
    throw new Error(
      'Nova Trace runtime bridge is not registered. Import the Trace store before starting playback.',
    );
  }
  return bridge;
}
