/**
 * lib/trace/runtime/transform-resolver.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Transform evaluation at 60–120 fps. Pure and DOM-free so the stage, the video
 * exporter and Jest all agree about where an element is at time T.
 *
 * Position convention (shared with `lib/trace/resolve.ts`): `baseX/baseY` is the
 * layout position and `x/y` is an animation offset; when no base pair exists,
 * `x/y` is the position.
 */

import { getValueAtTime } from '../animation/interpolator';
import type { TraceElement } from '../types';

export type ElementTransform = {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
};

function numberOr(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function trackValueAt(
  element: TraceElement,
  property: string,
  timeMs: number,
): unknown {
  for (const track of element.tracks ?? []) {
    if (track.property !== property) continue;
    const value = getValueAtTime(track, timeMs);
    if (value !== null && value !== undefined) return value;
  }
  return undefined;
}

export function getElementTransformAtTime(
  element: TraceElement,
  timeMs: number,
): ElementTransform {
  const attributes = element.attributes ?? {};

  const animatedX = trackValueAt(element, 'x', timeMs);
  const animatedY = trackValueAt(element, 'y', timeMs);
  const animatedRotation = trackValueAt(element, 'rotation', timeMs);
  const animatedScaleX = trackValueAt(element, 'scaleX', timeMs);
  const animatedScaleY = trackValueAt(element, 'scaleY', timeMs);

  const hasBasePosition =
    typeof attributes.baseX === 'number' ||
    typeof attributes.baseY === 'number';

  const offsetX = numberOr(animatedX ?? attributes.x, 0);
  const offsetY = numberOr(animatedY ?? attributes.y, 0);

  return {
    x: hasBasePosition ? numberOr(attributes.baseX, 0) + offsetX : offsetX,
    y: hasBasePosition ? numberOr(attributes.baseY, 0) + offsetY : offsetY,
    rotation: numberOr(animatedRotation ?? attributes.rotation, 0),
    scaleX: numberOr(animatedScaleX ?? attributes.scaleX, 1),
    scaleY: numberOr(animatedScaleY ?? attributes.scaleY, 1),
  };
}

/**
 * CSS transform for an element. Origin is resolved against the element's own
 * local coordinate space, which keeps rotation/scaling stable while dragging.
 */
export function getElementTransformCss(
  element: TraceElement,
  timeMs: number,
): string {
  const { x, y, rotation, scaleX, scaleY } = getElementTransformAtTime(
    element,
    timeMs,
  );
  const parts = [`translate(${x}px, ${y}px)`];
  if (rotation !== 0) parts.push(`rotate(${rotation}deg)`);
  if (scaleX !== 1 || scaleY !== 1) parts.push(`scale(${scaleX}, ${scaleY})`);
  return parts.join(' ');
}

export function getElementOrigin(element: TraceElement): {
  x: number;
  y: number;
} {
  const origin = element.origin ?? { x: 0, y: 0 };
  return {
    x: numberOr(origin.x, 0),
    y: numberOr(origin.y, 0),
  };
}
