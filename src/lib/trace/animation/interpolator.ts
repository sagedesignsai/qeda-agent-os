/**
 * lib/trace/animation/interpolator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns the exact value of a property track at timeMs using binary search and interpolation.
 *
 * Adapted from sagedesigns-os lib/motion/animation/interpolator.ts for Nova Trace.
 */

import type { PropertyTrack } from '../types';
import { evaluateEasing } from './easing';
import { lerpNumber, lerpColor } from './color-math';

/**
 * Returns the exact value of a property track at timeMs using binary search and interpolation.
 */
export function getValueAtTime(
  track: PropertyTrack,
  timeMs: number,
): number | string | null {
  const { keyframes } = track;
  if (!keyframes || keyframes.length === 0) return null;
  if (keyframes.length === 1) return keyframes[0].value;

  // Clamped before first keyframe
  if (timeMs <= keyframes[0].timeMs) {
    return keyframes[0].value;
  }

  // Clamped after last keyframe
  const lastKey = keyframes[keyframes.length - 1];
  if (timeMs >= lastKey.timeMs) {
    return lastKey.value;
  }

  // Binary search for surrounding keyframes
  let low = 0;
  let high = keyframes.length - 1;
  let kPrev = keyframes[0];
  let kNext = keyframes[1];

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (keyframes[mid].timeMs <= timeMs) {
      kPrev = keyframes[mid];
      kNext = keyframes[mid + 1] || keyframes[mid];
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const duration = kNext.timeMs - kPrev.timeMs;
  if (duration <= 0) return kPrev.value;

  const progress = (timeMs - kPrev.timeMs) / duration;
  const easedProgress = evaluateEasing(kPrev.easing, progress);

  // Interpolate based on value type
  if (typeof kPrev.value === 'number' && typeof kNext.value === 'number') {
    return lerpNumber(kPrev.value, kNext.value, easedProgress);
  }

  if (typeof kPrev.value === 'string' && typeof kNext.value === 'string') {
    // If it's a color property (fill, stroke)
    if (track.property === 'fill' || track.property === 'stroke') {
      return lerpColor(kPrev.value, kNext.value, easedProgress);
    }

    // Progressive character slicing for Typewriter / Kinetic Text
    if (track.property === 'text') {
      const p = Math.max(0, Math.min(1, easedProgress));
      const strPrev = String(kPrev.value);
      const strNext = String(kNext.value);

      if (strPrev === '') {
        const charCount = Math.round(strNext.length * p);
        return strNext.slice(0, charCount);
      } else if (strNext === '') {
        const charCount = Math.round(strPrev.length * (1 - p));
        return strPrev.slice(0, charCount);
      } else {
        // Transition: backspace prev, then type next
        if (p < 0.5) {
          const eraseP = p * 2;
          const count = Math.round(strPrev.length * (1 - eraseP));
          return strPrev.slice(0, count);
        } else {
          const typeP = (p - 0.5) * 2;
          const count = Math.round(strNext.length * typeP);
          return strNext.slice(0, count);
        }
      }
    }
  }

  // Non-interpolatable discrete properties: jump at 50%
  return easedProgress >= 0.5 ? kNext.value : kPrev.value;
}
