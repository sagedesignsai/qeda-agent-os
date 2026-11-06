/**
 * lib/trace/animation/easing.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Parses and evaluates easing functions given progress t in [0, 1].
 *
 * Adapted from sagedesigns-os lib/motion/animation/easing.ts for Nova Trace.
 */

import type { EasingType } from '../types';

export function evaluateEasing(easing: EasingType, t: number): number {
  const clampedT = Math.max(0, Math.min(1, t));

  switch (easing) {
    case 'linear':
      return clampedT;

    case 'power1.out':
      return 1 - (1 - clampedT) * (1 - clampedT);

    case 'power1.in':
      return clampedT * clampedT;

    case 'power1.inOut':
      return clampedT < 0.5
        ? 2 * clampedT * clampedT
        : 1 - Math.pow(-2 * clampedT + 2, 2) / 2;

    case 'ease-out':
    case 'power2.out':
      return 1 - Math.pow(1 - clampedT, 3);

    case 'ease-in':
    case 'power2.in':
      return Math.pow(clampedT, 3);

    case 'ease':
    case 'ease-in-out':
    case 'power2.inOut':
      return clampedT < 0.5
        ? 4 * Math.pow(clampedT, 3)
        : 1 - Math.pow(-2 * clampedT + 2, 3) / 2;

    case 'power3.out':
      return 1 - Math.pow(1 - clampedT, 4);

    case 'power3.in':
      return Math.pow(clampedT, 4);

    case 'power3.inOut':
      return clampedT < 0.5
        ? 8 * Math.pow(clampedT, 4)
        : 1 - Math.pow(-2 * clampedT + 2, 4) / 2;

    case 'power4.out':
    case 'expo.out':
      return clampedT === 1 ? 1 : 1 - Math.pow(2, -10 * clampedT);

    case 'expo.inOut':
      if (clampedT === 0) return 0;
      if (clampedT === 1) return 1;
      return clampedT < 0.5
        ? Math.pow(2, 20 * clampedT - 10) / 2
        : (2 - Math.pow(2, -20 * clampedT + 10)) / 2;

    case 'circ.out':
      return Math.sqrt(1 - Math.pow(clampedT - 1, 2));

    case 'sine.out':
      return Math.sin((clampedT * Math.PI) / 2);

    case 'sine.inOut':
      return -(Math.cos(Math.PI * clampedT) - 1) / 2;

    case 'back.out': {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return (
        1 + c3 * Math.pow(clampedT - 1, 3) + c1 * Math.pow(clampedT - 1, 2)
      );
    }

    case 'back.inOut': {
      const c1 = 1.70158;
      const c2 = c1 * 1.525;
      return clampedT < 0.5
        ? (Math.pow(2 * clampedT, 2) * ((c2 + 1) * 2 * clampedT - c2)) / 2
        : (Math.pow(2 * clampedT - 2, 2) *
            ((c2 + 1) * (clampedT * 2 - 2) + c2) +
            2) /
            2;
    }

    case 'elastic.out': {
      const c4 = (2 * Math.PI) / 3;
      if (clampedT === 0) return 0;
      if (clampedT === 1) return 1;
      return (
        Math.pow(2, -10 * clampedT) * Math.sin((clampedT * 10 - 0.75) * c4) + 1
      );
    }

    case 'bounce.out': {
      const n1 = 7.5625;
      const d1 = 2.75;
      let x = clampedT;
      if (x < 1 / d1) {
        return n1 * x * x;
      } else if (x < 2 / d1) {
        return n1 * (x -= 1.5 / d1) * x + 0.75;
      } else if (x < 2.5 / d1) {
        return n1 * (x -= 2.25 / d1) * x + 0.9375;
      } else {
        return n1 * (x -= 2.625 / d1) * x + 0.984375;
      }
    }

    default:
      // Custom cubic-bezier(x1, y1, x2, y2)
      if (typeof easing === 'string' && easing.startsWith('cubic-bezier(')) {
        const match = easing.match(
          /cubic-bezier\\(([^,]+),([^,]+),([^,]+),([^)]+)\\)/,
        );
        if (match) {
          const x1 = parseFloat(match[1]);
          const y1 = parseFloat(match[2]);
          const x2 = parseFloat(match[3]);
          const y2 = parseFloat(match[4]);
          return solveCubicBezier(x1, y1, x2, y2, clampedT);
        }
      }
      return clampedT;
  }
}

/**
 * Evaluates cubic-bezier curve y for a given x (t) using Newton-Raphson.
 */
export function solveCubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  t: number,
): number {
  let low = 0;
  let high = 1;
  let guess = t;

  // Binary subdivision / Newton-Raphson approximation for parameter u such that bezierX(u) == t
  for (let i = 0; i < 8; i++) {
    const currentX =
      3 * (1 - guess) * (1 - guess) * guess * x1 +
      3 * (1 - guess) * guess * guess * x2 +
      guess * guess * guess;
    if (Math.abs(currentX - t) < 0.001) break;
    if (currentX < t) {
      low = guess;
    } else {
      high = guess;
    }
    guess = (low + high) / 2;
  }

  // Evaluate bezierY(u)
  return (
    3 * (1 - guess) * (1 - guess) * guess * y1 +
    3 * (1 - guess) * guess * guess * y2 +
    guess * guess * guess
  );
}
