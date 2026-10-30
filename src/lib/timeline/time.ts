/**
 * lib/timeline/time.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Time ↔ pixel math, ruler ticks and magnet snapping for the reusable timeline.
 *
 * Two rules that keep any timeline stable at any zoom:
 *   1. Scroll is stored in **seconds**, not pixels, so resizing the pane or
 *      changing zoom does not move content under the user's cursor.
 *   2. Snap thresholds are expressed in **pixels** and converted to seconds
 *      through the current scale, so the magnet feels the same at 5 px/s and at
 *      2000 px/s.
 */

import type { TimelineView } from './types';

export const MIN_PX_PER_SECOND = 4;
export const MAX_PX_PER_SECOND = 4000;

export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

export const timeToX = (seconds: number, view: TimelineView): number =>
  (seconds - view.scrollSeconds) * view.pxPerSecond;

export const xToTime = (x: number, view: TimelineView): number =>
  view.scrollSeconds + x / view.pxPerSecond;

export type VisibleTimeRange = { start: number; end: number };

export const visibleTimeRange = (view: TimelineView, width: number): VisibleTimeRange => ({
  start: view.scrollSeconds,
  end: view.scrollSeconds + width / Math.max(1e-6, view.pxPerSecond),
});

export const secondsPerPixel = (view: TimelineView): number => 1 / view.pxPerSecond;

/**
 * Smallest "nice" step whose on-screen spacing clears `minSpacingPx`.
 * The ladder is human-readable durations rather than powers of ten, because a
 * motion timeline is measured in frames and seconds, not kilometres.
 */
export const TICK_LADDER_SECONDS: readonly number[] = [
  1 / 120,
  1 / 60,
  1 / 30,
  1 / 24,
  1 / 15,
  1 / 12,
  1 / 10,
  0.25,
  0.5,
  1,
  2,
  5,
  10,
  15,
  30,
  60,
  120,
  300,
  600,
  900,
  1800,
  3600,
];

export function chooseTickStep(pxPerSecond: number, minSpacingPx = 84): number {
  for (const step of TICK_LADDER_SECONDS) {
    if (step * pxPerSecond >= minSpacingPx) return step;
  }
  return TICK_LADDER_SECONDS[TICK_LADDER_SECONDS.length - 1];
}

/** Minor ticks subdivide the major step, never closer than `minSpacingPx`. */
export function chooseMinorTickStep(majorStep: number, pxPerSecond: number, minSpacingPx = 9): number {
  for (const fraction of [1 / 10, 1 / 5, 1 / 4, 1 / 2]) {
    const step = majorStep * fraction;
    if (step * pxPerSecond >= minSpacingPx) return step;
  }
  return 0;
}

const pad = (value: number, width = 2): string => String(Math.floor(value)).padStart(width, '0');

/** `MM:SS:FF` — the frame component is what makes frame-exact work verifiable. */
export function formatTimecode(seconds: number, fps: number): string {
  const safeFps = Math.max(1, Math.round(fps > 0 ? fps : 30));
  const sign = seconds < 0 ? '-' : '';
  const totalFrames = Math.round(Math.abs(seconds) * safeFps);
  const frames = totalFrames % safeFps;
  const totalSeconds = Math.floor(totalFrames / safeFps);
  return `${sign}${pad(Math.floor(totalSeconds / 60))}:${pad(totalSeconds % 60)}:${pad(frames)}`;
}

/**
 * Ruler label in Rive's animate-mode style: `00:00s` at the origin, whole
 * seconds for coarse steps, and `10f` / `20f` frame counts once the ruler is
 * zoomed past one second per tick.
 *
 * Thinking in frames is the point: a key that lands between frames is a frame
 * that never renders as authored.
 */
export function formatTickLabel(seconds: number, step: number, fps = 30): string {
  if (step >= 1) {
    const totalSeconds = Math.round(seconds);
    if (totalSeconds === 0) return '00:00s';
    if (totalSeconds < 60) return `${totalSeconds}s`;
    return `${Math.floor(totalSeconds / 60)}:${pad(totalSeconds % 60)}`;
  }
  const frame = Math.round(seconds * (fps > 0 ? fps : 30));
  return frame === 0 ? '00:00s' : `${frame}f`;
}

/**
 * Snap a time to the nearest whole frame. Rive never lets a key sit between
 * frames, and neither should a render-derived timeline: an off-frame key is a
 * value that is interpolated but never sampled by the encoder.
 */
export function quantizeToFrame(seconds: number, fps: number): number {
  const safeFps = fps > 0 ? fps : 30;
  return Math.round(seconds * safeFps) / safeFps;
}

export function formatSeconds(seconds: number): string {
  return Math.abs(seconds) >= 10 ? `${seconds.toFixed(1)}s` : `${seconds.toFixed(2)}s`;
}

export type SnapResult = { time: number; target: number | null };

/**
 * Snap `time` to the nearest candidate within `thresholdPx`, else return it
 * unchanged. Comparing in pixels is what makes the magnet zoom-independent.
 */
export function snapToCandidates(
  time: number,
  candidates: readonly number[],
  view: TimelineView,
  thresholdPx = 7,
): SnapResult {
  const thresholdSeconds = thresholdPx * secondsPerPixel(view);
  let best: number | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - time);
    if (distance <= thresholdSeconds && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best === null ? { time, target: null } : { time: best, target: best };
}

/** Zoom keeping the time under `anchorX` fixed — wheel zoom must not slide content. */
export function zoomAround(
  view: TimelineView,
  anchorX: number,
  nextPxPerSecond: number,
  minPxPerSecond = MIN_PX_PER_SECOND,
  maxPxPerSecond = MAX_PX_PER_SECOND,
): TimelineView {
  const pxPerSecond = clamp(nextPxPerSecond, minPxPerSecond, maxPxPerSecond);
  if (pxPerSecond === view.pxPerSecond) return view;
  const anchorTime = xToTime(anchorX, view);
  return { pxPerSecond, scrollSeconds: Math.max(0, anchorTime - anchorX / pxPerSecond) };
}

/** Keep the end reachable but never scroll into negative time. */
export function clampScroll(view: TimelineView, width: number, duration: number): TimelineView {
  const visible = width / Math.max(1e-6, view.pxPerSecond);
  const maxScroll = Math.max(0, duration + visible * 0.25 - visible);
  const scrollSeconds = clamp(view.scrollSeconds, 0, maxScroll);
  return scrollSeconds === view.scrollSeconds ? view : { ...view, scrollSeconds };
}

export function totalFrames(duration: number, fps: number): number {
  return Math.max(1, Math.round(duration * Math.max(1, fps)));
}

/** Timeline default scale: a 10s composition fits a ~1200px pane. */
export function fitPxPerSecond(duration: number, width: number, padding = 0.08): number {
  if (width <= 0 || duration <= 0) return 60;
  return clamp((width * (1 - padding)) / duration, MIN_PX_PER_SECOND, MAX_PX_PER_SECOND);
}
