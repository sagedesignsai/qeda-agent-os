/**
 * lib/timeline/trim.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Trim-handle math for the neutral timeline kit. The canvas only knows pixels and
 * seconds; resolving a drag into `start`/`trimIn`/`duration` lives here so both
 * the handle drag and its tests share one explanation of the bounds.
 */

export type TimelineTrimOrigin = {
  start: number;
  duration: number;
  trimIn: number;
  /** Full length of the source clip, bounding the right handle. Omit when unknown. */
  sourceDuration?: number;
};

export type TimelineTrimInput = {
  edge: 'start' | 'end';
  /** Pointer movement in seconds from where the drag began. */
  delta: number;
  origin: TimelineTrimOrigin;
  /** Left-edge slip: move the placement without changing what is trimmed. */
  slip?: boolean;
  fps?: number;
  /** Shortest visible duration; defaults to one frame. */
  minDuration?: number;
};

export type TimelineTrimResult = {
  start: number;
  duration: number;
  trimIn: number;
};

const EPSILON = 1e-9;

export function minimumTimelineTrimDuration(fps?: number): number {
  return fps && Number.isFinite(fps) && fps > 0 ? 1 / fps : 0.05;
}

export function resolveTimelineTrim({
  edge,
  delta,
  origin,
  slip = false,
  fps,
  minDuration,
}: TimelineTrimInput): TimelineTrimResult {
  const shortest = Math.max(EPSILON, minDuration ?? minimumTimelineTrimDuration(fps));
  const originDuration = Math.max(origin.duration, shortest);

  if (edge === 'end') {
    const newest = Math.max(shortest, originDuration + delta);
    const limit = typeof origin.sourceDuration === 'number'
      ? Math.max(shortest, origin.sourceDuration - origin.trimIn)
      : Number.POSITIVE_INFINITY;
    return {
      start: origin.start,
      duration: Math.min(newest, limit),
      trimIn: origin.trimIn,
    };
  }

  if (slip) {
    return {
      start: Math.max(0, origin.start + delta),
      duration: originDuration,
      trimIn: origin.trimIn,
    };
  }

  // Left trim moves the content edge: start, trimIn and duration change together.
  // The drag also stops at t=0, so the trim cannot outrun the placement itself.
  const earliestIn = -Math.min(origin.trimIn, origin.start);
  const latestIn = originDuration - shortest;
  const clamped = Math.min(Math.max(delta, earliestIn), latestIn);
  return {
    start: origin.start + clamped,
    duration: originDuration - clamped,
    trimIn: origin.trimIn + clamped,
  };
}
