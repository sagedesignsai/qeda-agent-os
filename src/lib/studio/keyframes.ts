/**
 * lib/studio/keyframes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Universal, property-addressed keyframes on clips.
 *
 * A `StudioKeyframe` (see types.ts) is a point on a named property timeline:
 * `timeMs` is the position within the clip and `value` the target value. This
 * module evaluates keyframes to values at arbitrary clip times and provides
 * speed (time-remap) integration for video/audio clips.
 *
 * Semantics:
 *   - No keyframes for a property → `undefined` (caller falls back to the
 *     property's static value).
 *   - Before the first keyframe: the first keyframe's value (hold).
 *   - After the last keyframe: the last keyframe's value (hold).
 *   - Between keyframes: linear interpolation, eased by the keyframe's
 *     `easing`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { StudioKeyframe, StudioAnimationEasing, TimelineClip } from './types';
import type { EvaluatedTimelineClip } from './timeline/evaluate';

// ── Easing evaluation ────────────────────────────────────────────────────────

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

/** Cubic Bézier easing, e.g. 'cubic-bezier(0.5, 0, 0.5, 1)'. */
function bezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return (
    u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
  );
}

function solveCubicBezierX(x: number, x1: number, x2: number): number {
  // Newton iterations on B(t) = x for the x-component of the curve.
  let t = x;
  for (let i = 0; i < 8; i++) {
    const b = bezier(t, 0, x1, x2, 1) - x;
    if (Math.abs(b) < 1e-6) return t;
    const a = 3 * x1 - 3 * x2 + 1;
    const bb = 6 * x2 - 6 * x1;
    const c = 3 * x1;
    const db = 3 * a * t * t + 2 * bb * t + c;
    if (Math.abs(db) < 1e-6) break;
    t -= b / db;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
  }
  // Bisection fallback.
  let lo = 0;
  let hi = 1;
  t = x;
  while (hi - lo > 1e-6) {
    if (bezier(t, 0, x1, x2, 1) < x) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return t;
}

/**
 * Evaluate an easing curve at t ∈ [0, 1].
 *
 * Supports the named GSAP easings used by `mapEasingToGsap` plus
 * 'cubic-bezier(...)' strings; unknown easings fall back to linear.
 */
export function easeAt(easing: StudioAnimationEasing, t: number): number {
  const x = clamp01(t);
  if (!easing || easing === 'linear' || easing === 'none') return x;
  if (easing === 'ease-in') return x * x;
  if (easing === 'ease-out') return 1 - (1 - x) * (1 - x);
  if (easing === 'ease-in-out') {
    return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  }
  if (easing.startsWith('cubic-bezier(')) {
    const m = /cubic-bezier\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/.exec(easing);
    if (m) {
      const x1 = Number(m[1]);
      const y1 = Number(m[2]);
      const x2 = Number(m[3]);
      const y2 = Number(m[4]);
      if (
        [x1, y1, x2, y2].every(Number.isFinite) &&
        [x1, x2].every((v) => v >= 0 && v <= 1)
      ) {
        return bezier(solveCubicBezierX(x, x1, x2), 0, y1, y2, 1);
      }
    }
    return x;
  }

  switch (easing) {
    case 'power2.out':
      return 1 - (1 - x) ** 2;
    case 'power2.in':
      return x * x;
    case 'power2.inOut':
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    case 'power3.out':
      return 1 - (1 - x) ** 3;
    case 'power3.in':
      return x ** 3;
    case 'power3.inOut':
      return x < 0.5 ? 4 * x ** 3 : 1 - Math.pow(-2 * x + 2, 3) / 2;
    case 'power4.out':
      return 1 - (1 - x) ** 4;
    case 'power4.in':
      return x ** 4;
    case 'power4.inOut':
      return x < 0.5 ? 8 * x ** 4 : 1 - Math.pow(-2 * x + 2, 4) / 2;
    case 'expo.out':
      return x === 1 ? 1 : 1 - 2 ** (-10 * x);
    case 'expo.in':
      return x === 0 ? 0 : 2 ** (10 * x - 10);
    case 'sine.out':
      return Math.sin((x * Math.PI) / 2);
    case 'sine.in':
      return 1 - Math.cos((x * Math.PI) / 2);
    case 'sine.inOut':
      return -Math.cos((x * Math.PI) / 2) / 2 + 0.5;
    case 'circ.out':
      return Math.sqrt(1 - (1 - x) ** 2);
    case 'circ.in':
      return 1 - Math.sqrt(1 - x * x);
    case 'circ.inOut':
      return x < 0.5
        ? 1 - Math.sqrt(1 - (2 * x) ** 2) / 2
        : (1 + Math.sqrt(1 - (2 * x - 2) ** 2)) / 2;
    case 'back.out':
      return 1 + (1.70158 + 1) * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;
    case 'back.in':
      return 1.70158 * x ** 3 + (1.70158 - 2) * x;
    case 'back.inOut':
      return x < 0.5
        ? (2 * (1.70158 * 2) * x - (1.70158 * 2 - 2) * x) / 2
        : (2 + (1.70158 * 2 + 1) * (2 * x - 2) - (1.70158 * 2 - 2) * (2 * x - 2) ** 2) / 2;
    case 'elastic.out': {
      if (x === 0) return 0;
      if (x === 1) return 1;
      const period = 0.3;
      const amplitude = 1;
      const offset = Math.asin(1 / amplitude) * (period / (2 * Math.PI));
      return (
        amplitude *
          2 ** (-10 * x) *
          Math.sin((x * 10 - offset) * (2 * Math.PI) / period) +
        1
      );
    }
    case 'bounce.out': {
      if (x < 1 / 2.75) return 7.5625 * x * x;
      if (x < 2 / 2.75) {
        const t = x - 1.5 / 2.75;
        return 7.5625 * t * t + 0.75;
      }
      if (x < 2.5 / 2.75) {
        const t = x - 2.25 / 2.75;
        return 7.5625 * t * t + 0.9375;
      }
      const t = x - 2.625 / 2.75;
      return 7.5625 * t * t + 0.984375;
    }
    default:
      return x;
  }
}

// ── Universal keyframe evaluation ────────────────────────────────────────────

/**
 * Evaluate `keyframes` for `property` at `timeMs`.
 *
 * Returns `undefined` when there are no keyframes for the property, so callers
 * can distinguish "no keyframes" from "keyframes evaluate to 0".
 */
export function evaluateKeyframesAt(
  keyframes: readonly StudioKeyframe[],
  timeMs: number,
  property: string,
  defaultValue?: number,
): number | undefined {
  const filtered = keyframes
    .filter((k) => k.property === property)
    .sort((a, b) => a.timeMs - b.timeMs);
  if (filtered.length === 0) return defaultValue;

  const first = filtered[0];
  if (timeMs <= first.timeMs) return first.value;

  const last = filtered[filtered.length - 1];
  if (timeMs >= last.timeMs) return last.value;

  for (let i = 1; i < filtered.length; i++) {
    if (timeMs < filtered[i].timeMs) {
      const prev = filtered[i - 1];
      const next = filtered[i];
      const span = next.timeMs - prev.timeMs;
      const frac = span > 0 ? (timeMs - prev.timeMs) / span : 1;
      const eased = easeAt(next.easing, frac);
      return prev.value + (next.value - prev.value) * eased;
    }
  }
  return last.value;
}

// ── Speed (time-remap) evaluation ────────────────────────────────────────────

/**
 * Static playback speed: source-seconds per composition-second.
 *
 * Falls back to the legacy rules (sourceDurationMs/durationMs, then `speed`,
 * then 1) so behavior is unchanged for clips without speed keyframes.
 */
export function staticSpeed(clip: TimelineClip): number {
  if (clip.durationMs > 0 && clip.sourceDurationMs > 0) {
    return clip.sourceDurationMs / clip.durationMs;
  }
  const speed = clip.payload?.speed ?? 1;
  return Number.isFinite(speed) && speed > 0 ? speed : 1;
}

/** Speed multiplier at composition time `t` (no defaulting; returns static). */
export function speedMultiplierAtMs(clip: TimelineClip, t: number): number {
  const keyframes = clip.payload?.keyframes?.filter((k) => k.property === 'speed');
  if (keyframes && keyframes.length > 0) {
    return evaluateKeyframesAt(keyframes, t, 'speed', 1) ?? 1;
  }
  return staticSpeed(clip);
}

/** Grid step used when integrating the speed curve into a cumulative map. */
const SPEED_INTEGRATION_STEP_MS = 2;

const speedIntegralCache = new WeakMap<TimelineClip, Float32Array>();

/**
 * Cumulative source-time integral over the clip's timeline: `integrated[i]`
 * is the source-ms advanced by composition time `i * stepMs`. Computed via
 * trapezoidal integration of the (eased) speed curve.
 */
function getSpeedIntegral(clip: TimelineClip): Float32Array {
  const cached = speedIntegralCache.get(clip);
  if (cached) return cached;

  const durationMs = Math.max(0, clip.durationMs);
  const points = Math.max(1, Math.ceil(durationMs / SPEED_INTEGRATION_STEP_MS) + 1);
  const integral = new Float32Array(points);
  let acc = 0;
  for (let i = 1; i < points; i++) {
    const tNow = Math.min(i * SPEED_INTEGRATION_STEP_MS, durationMs);
    const tPrev = Math.min((i - 1) * SPEED_INTEGRATION_STEP_MS, durationMs);
    const sPrev = speedMultiplierAtMs(clip, tPrev);
    const sNow = speedMultiplierAtMs(clip, tNow);
    acc += ((sPrev + sNow) / 2) * (tNow - tPrev);
    integral[i] = acc;
  }
  speedIntegralCache.set(clip, integral);
  return integral;
}

/**
 * Source-ms advanced by `localTimeMs` composition time, accounting for speed
 * keyframes (time remap). With no speed keyframes this equals
 * `localTimeMs * staticSpeed(clip)`.
 */
export function integratedSpeedAtMs(clip: TimelineClip, localTimeMs: number): number {
  const integral = getSpeedIntegral(clip);
  const stepMs = SPEED_INTEGRATION_STEP_MS;
  const t = Math.min(Math.max(0, localTimeMs), Math.max(0, clip.durationMs));
  const idx = t / stepMs;
  const i0 = Math.min(Math.floor(idx), integral.length - 1);
  const i1 = Math.min(i0 + 1, integral.length - 1);
  const frac = idx - i0;
  return integral[i0] + (integral[i1] - integral[i0]) * frac;
}

// ── Clip-level convenience ───────────────────────────────────────────────────

export interface ClipKeyframeValues {
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
  intensity?: number;
}

const CLIP_VALUE_PROPERTIES = [
  'x',
  'y',
  'scale',
  'rotation',
  'opacity',
  'intensity',
] as const;

/**
 * Evaluate the universal transform/intensity keyframes of a clip at
 * `localTimeMs`. Only properties that have keyframes appear in the result.
 */
export function evaluateClipKeyframeValues(
  clip: TimelineClip,
  localTimeMs: number,
): ClipKeyframeValues {
  const out: ClipKeyframeValues = {};
  const keyframes = clip.payload?.keyframes;
  if (!keyframes) return out;
  for (const prop of CLIP_VALUE_PROPERTIES) {
    const value = evaluateKeyframesAt(keyframes, localTimeMs, prop, undefined);
    if (value !== undefined) out[prop] = value;
  }
  return out;
}

let keyframeCounter = 0;

/** Stable-ish ids for new keyframes. */
export function generateKeyframeId(): string {
  keyframeCounter += 1;
  return `u-${keyframeCounter}-${Date.now().toString(36)}`;
}

/** Property namespaced keyframe on a clip, for evaluateEditorTimeline. */
export type { EvaluatedTimelineClip };
