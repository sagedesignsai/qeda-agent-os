/**
 * lib/trace/runtime/resolve-element.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Resolve an element's full attribute bag at time T: base attributes overlaid by
 * every property track, plus motion-path position when a `pathProgress` track
 * exists. Shared by the stage renderer, the animated-SVG exporter and tests.
 */

import { getValueAtTime } from '../animation/interpolator';
import type { TraceElement } from '../types';
import {
  getElementTransformAtTime,
  type ElementTransform,
} from './transform-resolver';

export type ResolvedElement = {
  attributes: Record<string, any>;
  transform: ElementTransform;
  /** Animated motion path position, when the element follows a path. */
  motionPathPoint: { x: number; y: number } | null;
};

function samplePolyline(
  pathData: string,
  progress: number,
): { x: number; y: number } | null {
  // A DOM-free linear estimator for M/L/H/V commands. Curves fall back to the
  // endpoints, which is enough for export previews and headless tests.
  const tokens = pathData.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g);
  if (!tokens) return null;

  const points: Array<{ x: number; y: number }> = [];
  let index = 0;
  let command = 'M';
  let cursor = { x: 0, y: 0 };

  const nextNumber = () => {
    const token = tokens[index];
    if (token === undefined) return null;
    index += 1;
    const value = Number(token);
    return Number.isFinite(value) ? value : null;
  };

  while (index < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[index])) {
      command = tokens[index];
      index += 1;
      if (command === 'Z' || command === 'z') {
        if (points.length > 0) points.push(points[0]);
        continue;
      }
    }

    const upper = command.toUpperCase();
    const relative = command !== upper;
    if (upper === 'H') {
      const x = nextNumber();
      if (x === null) break;
      cursor = { x: relative ? cursor.x + x : x, y: cursor.y };
      points.push({ ...cursor });
    } else if (upper === 'V') {
      const y = nextNumber();
      if (y === null) break;
      cursor = { x: cursor.x, y: relative ? cursor.y + y : y };
      points.push({ ...cursor });
    } else {
      const x = nextNumber();
      const y = nextNumber();
      if (x === null || y === null) break;
      cursor = {
        x: relative ? cursor.x + x : x,
        y: relative ? cursor.y + y : y,
      };
      points.push({ ...cursor });
      // Consume the remaining coordinate pairs of a curve command, keeping the
      // final control endpoint as the visited point.
      if (upper === 'C' || upper === 'S' || upper === 'Q' || upper === 'T') {
        const extra =
          upper === 'C' ? 4 : upper === 'Q' || upper === 'S' ? 2 : 0;
        for (let step = 0; step < extra; step += 1) {
          const value = nextNumber();
          if (value !== null) {
            if (step % 2 === 0)
              cursor = { ...cursor, x: relative ? cursor.x + value : value };
            else cursor = { ...cursor, y: relative ? cursor.y + value : value };
          }
        }
        points.push({ ...cursor });
      }
    }
  }

  if (points.length === 0) return null;

  const clamped = Math.max(0, Math.min(100, progress)) / 100;
  const scaled = clamped * (points.length - 1);
  const low = Math.floor(scaled);
  const high = Math.min(points.length - 1, low + 1);
  const ratio = scaled - low;
  return {
    x: points[low].x + (points[high].x - points[low].x) * ratio,
    y: points[low].y + (points[high].y - points[low].y) * ratio,
  };
}

export function resolveElementAtTime(
  element: TraceElement,
  timeMs: number,
): ResolvedElement {
  const attributes: Record<string, any> = { ...(element.attributes ?? {}) };

  for (const track of element.tracks ?? []) {
    const value = getValueAtTime(track, timeMs);
    if (value !== null && value !== undefined)
      attributes[track.property] = value;
  }

  const transform = getElementTransformAtTime(element, timeMs);
  let motionPathPoint: { x: number; y: number } | null = null;

  const pathProgress = attributes.pathProgress;
  const pathData =
    (typeof attributes.motionPathData === 'string' &&
      attributes.motionPathData) ||
    (typeof attributes.d === 'string' && element.type === 'path'
      ? attributes.d
      : '');
  if (pathProgress !== undefined && pathData) {
    const point = samplePolyline(pathData, Number(pathProgress));
    if (point) {
      motionPathPoint = point;
      transform.x = point.x;
      transform.y = point.y;
      if (attributes.autoRotate) {
        transform.rotation += Number(attributes.rotationOffset ?? 0);
      }
    }
  }

  return { attributes, transform, motionPathPoint };
}

export function opacityAt(element: TraceElement, timeMs: number): number {
  const { attributes } = resolveElementAtTime(element, timeMs);
  const value = Number(attributes.opacity ?? 1);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}

export function formatTraceTimecode(timeMs: number): string {
  const safe = Math.max(0, timeMs);
  const totalSeconds = safe / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const hundredths = Math.floor((safe % 1000) / 10);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(minutes)}:${pad(seconds)}.${pad(hundredths)}`;
}
