/**
 * lib/trace/resolve.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Resolve an element's attributes at a point in time.
 *
 * Pure and DOM-free so the stage, a future export compiler and Jest all agree on
 * what the document says at time T. Position follows the document's convention:
 * `baseX/baseY` is the layout position and `x/y` is the animation offset. When an
 * element has no `baseX/baseY` (shapes authored by ops), `x/y` *is* the position.
 */

import { getValueAtTime } from './animation/interpolator';
import { resolveElementAtTime } from './runtime/resolve-element';
import type { TraceElement } from './types';

export type ResolvedAttributes = Record<string, any>;

export type ResolvedTransform = {
  attributes: ResolvedAttributes;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  transform: string;
};

export function resolveElementAttributes(
  element: TraceElement,
  timeMs: number,
): ResolvedAttributes {
  const resolved: ResolvedAttributes = { ...(element.attributes ?? {}) };

  for (const track of element.tracks ?? []) {
    const value = getValueAtTime(track, timeMs);
    if (value !== null && value !== undefined) resolved[track.property] = value;
  }

  return resolved;
}

function numberOr(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function getElementPosition(
  element: TraceElement,
  timeMs: number,
): { x: number; y: number } {
  const { transform } = resolveElementAtTime(element, timeMs);
  return { x: transform.x, y: transform.y };
}

/**
 * Build the attribute patch that places an element at an absolute canvas
 * position while preserving the base/offset convention: elements authored with
 * `baseX/baseY` keep animated `x/y` as offsets, everything else uses `x/y`
 * directly.
 */
export function positionPatch(
  element: TraceElement,
  position: { x: number; y: number },
  timeMs: number,
): Record<string, number> {
  const attributes = element.attributes ?? {};
  const hasBase =
    typeof attributes.baseX === 'number' ||
    typeof attributes.baseY === 'number';
  if (!hasBase) return { x: position.x, y: position.y };

  const { transform } = resolveElementAtTime(element, timeMs);
  const offsetX = transform.x - numberOr(attributes.baseX, 0);
  const offsetY = transform.y - numberOr(attributes.baseY, 0);
  return {
    baseX: position.x - offsetX,
    baseY: position.y - offsetY,
  };
}

export interface DesiredTransform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

/**
 * Build the attribute patch that places an element at a desired resolved
 * transform (artboard x/y plus rotation/scale) at `timeMs`.
 *
 * Generalises `positionPatch`: elements with `baseX/baseY` keep animated
 * `x/y` as offsets (only the base moves), everything else writes `x/y`
 * directly. `rotation`/`scaleX`/`scaleY` have no base variant and are
 * written directly, so `updateAttributes` auto-keyframes them when a
 * track exists — the same path the inspector uses.
 */
export function transformPatch(
  element: TraceElement,
  desired: DesiredTransform,
  timeMs: number,
): Record<string, number> {
  const position = positionPatch(
    element,
    { x: desired.x, y: desired.y },
    timeMs,
  );
  return {
    ...position,
    rotation: desired.rotation,
    scaleX: desired.scaleX,
    scaleY: desired.scaleY,
  };
}

export function resolveTransform(
  element: TraceElement,
  timeMs: number,
): ResolvedTransform {
  const attributes = resolveElementAttributes(element, timeMs);

  const hasBasePosition =
    typeof attributes.baseX === 'number' ||
    typeof attributes.baseY === 'number';

  const x = hasBasePosition
    ? numberOr(attributes.baseX, 0) + numberOr(attributes.x, 0)
    : numberOr(attributes.x, 0);
  const y = hasBasePosition
    ? numberOr(attributes.baseY, 0) + numberOr(attributes.y, 0)
    : numberOr(attributes.y, 0);

  const scaleX = numberOr(attributes.scaleX, 1);
  const scaleY = numberOr(attributes.scaleY, 1);
  const rotation = numberOr(attributes.rotation, 0);
  const opacity = numberOr(attributes.opacity, 1);

  const transform = [
    `translate(${x} ${y})`,
    rotation ? `rotate(${rotation})` : '',
    scaleX !== 1 || scaleY !== 1 ? `scale(${scaleX} ${scaleY})` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return { attributes, x, y, scaleX, scaleY, rotation, opacity, transform };
}
