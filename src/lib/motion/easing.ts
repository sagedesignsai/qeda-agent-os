/**
 * lib/motion/easing.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Easing curves, solved deterministically.
 *
 * Cubic bezier interpolation is solved by bisection rather than Newton
 * iteration on purpose: the renderer must produce byte-identical frames from the
 * same document on every machine, and bisection converges to a fixed answer
 * without depending on floating-point derivatives or iteration heuristics.
 * Thirty bisection steps resolve x to ~1e-9, far below one 8-bit colour step.
 */

import type { MotionEasing } from './types';

const BISECTION_STEPS = 30;

function bezierAxis(t: number, p1: number, p2: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t;
}

/** Progress `u ∈ [0,1]` along a cubic bezier timing function → eased value. */
export function cubicBezierEase(x1: number, y1: number, x2: number, y2: number, u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;

  let lo = 0;
  let hi = 1;
  let t = u;
  for (let i = 0; i < BISECTION_STEPS; i += 1) {
    const x = bezierAxis(t, x1, x2);
    if (Math.abs(x - u) < 1e-9) break;
    if (x < u) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return bezierAxis(t, y1, y2);
}

/**
 * Map linear progress to eased progress.
 *
 * `step` holds the outgoing value until the next keyframe and snaps at the very
 * end, which is what a stepped channel means in every editor that has one.
 */
export function applyEasing(easing: MotionEasing, u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  switch (easing.type) {
    case 'step':
      return 0;
    case 'linear':
      return u;
    case 'cubic':
      return cubicBezierEase(easing.x1, easing.y1, easing.x2, easing.y2, u);
    default:
      return u;
  }
}

export const EASING_PRESETS = {
  linear: { label: 'Linear', value: { type: 'linear' } as MotionEasing },
  step: { label: 'Hold', value: { type: 'step' } as MotionEasing },
  easeIn: {
    label: 'Ease in',
    value: { type: 'cubic', x1: 0.42, y1: 0, x2: 1, y2: 1 } as MotionEasing,
  },
  easeOut: {
    label: 'Ease out',
    value: { type: 'cubic', x1: 0, y1: 0, x2: 0.58, y2: 1 } as MotionEasing,
  },
  easeInOut: {
    label: 'Ease in-out',
    value: { type: 'cubic', x1: 0.42, y1: 0, x2: 0.58, y2: 1 } as MotionEasing,
  },
  smooth: {
    label: 'Smooth',
    value: { type: 'cubic', x1: 0.4, y1: 0, x2: 0.2, y2: 1 } as MotionEasing,
  },
} as const;

export type EasingPresetId = keyof typeof EASING_PRESETS;

export function easingLabel(easing: MotionEasing): string {
  for (const preset of Object.values(EASING_PRESETS)) {
    if (sameEasing(preset.value, easing)) return preset.label;
  }
  return easing.type === 'cubic' ? 'Custom' : 'Linear';
}

export function sameEasing(a: MotionEasing, b: MotionEasing): boolean {
  if (a.type !== b.type) return false;
  if (a.type !== 'cubic' || b.type !== 'cubic') return true;
  return a.x1 === b.x1 && a.y1 === b.y1 && a.x2 === b.x2 && a.y2 === b.y2;
}
