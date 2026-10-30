/**
 * main/motion/render-plan.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Frame-exact export timing shared by the render host and its tests. All project
 * times are seconds; encoded timestamps are relative to the chosen range.
 */

export type MotionRenderRange = { start: number; end: number };
export type MotionRenderFrame = { index: number; sceneTime: number; timestamp: number; duration: number };

const FRAME_EPSILON = 1e-9;

export function motionRenderFrameCount(range: MotionRenderRange, fps: number): number {
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start < 0 || range.end <= range.start) {
    throw new Error('Render range must be a positive interval with a non-negative start.');
  }
  if (!Number.isInteger(fps) || fps <= 0) throw new Error('Render frame rate must be a positive integer.');
  const count = Math.ceil((range.end - range.start) * fps - FRAME_EPSILON);
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('Render range produces an invalid frame count.');
  return count;
}

/** Lazily plan frames so long exports do not allocate a frame-sized array. */
export function* motionRenderFrames(range: MotionRenderRange, fps: number): Generator<MotionRenderFrame> {
  const frameCount = motionRenderFrameCount(range, fps);
  for (let index = 0; index < frameCount; index += 1) {
    const timestamp = index / fps;
    const remaining = range.end - range.start - timestamp;
    yield {
      index,
      sceneTime: range.start + timestamp,
      timestamp,
      duration: Math.min(1 / fps, remaining),
    };
  }
}
