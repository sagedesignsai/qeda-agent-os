/**
 * lib/trace/export/render-plan.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Frame-exact export timing for Trace. Project time is milliseconds (the
 * document's unit); encoded timestamps are seconds at the chosen frame rate.
 *
 * Mirrors `lib/motion/export/render-plan.ts`, which proved this shape.
 */

export type TraceRenderFrame = {
  index: number;
  /** Project time to sample, in ms. */
  timeMs: number;
  /** Encoded timestamp in seconds, relative to the export start. */
  timestamp: number;
  /** Encoded frame duration in seconds. */
  duration: number;
};

const FRAME_EPSILON = 1e-9;

export function traceRenderFrameCount(durationMs: number, fps: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error('Render duration must be positive.');
  }
  if (!Number.isInteger(fps) || fps <= 0) {
    throw new Error('Render frame rate must be a positive integer.');
  }
  const count = Math.ceil((durationMs / 1000) * fps - FRAME_EPSILON);
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error('Render duration produces an invalid frame count.');
  }
  return count;
}

/** Lazily plan frames so long exports do not allocate a frame-sized array. */
export function* traceRenderFrames(
  durationMs: number,
  fps: number,
): Generator<TraceRenderFrame> {
  const frameCount = traceRenderFrameCount(durationMs, fps);
  for (let index = 0; index < frameCount; index += 1) {
    const timestamp = index / fps;
    const remaining = durationMs / 1000 - timestamp;
    yield {
      index,
      timeMs: Math.round(timestamp * 1000),
      timestamp,
      duration: Math.min(1 / fps, Math.max(0, remaining)),
    };
  }
}