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

import { overlayAttributeLayers } from './runtime/frame';
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
  return overlayAttributeLayers(element, [
    { timeMs, weight: 1, tracks: element.tracks ?? [] },
  ]) as ResolvedAttributes;
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
}/**
 * @deprecated Use `sampleFrame` or `resolveElementAtTime`; kept for callers
 * that still want the CSS-shaped view of one element.
 */
export function resolveTransform(
  element: TraceElement,
  timeMs: number,
): ResolvedTransform {
  const { attributes, transform: resolved } = resolveElementAtTime(
    element,
    timeMs,
  );
  const opacity = numberOr(attributes.opacity, 1);

  const transform = [
    `translate(${resolved.x} ${resolved.y})`,
    resolved.rotation ? `rotate(${resolved.rotation})` : '',
    resolved.scaleX !== 1 || resolved.scaleY !== 1
      ? `scale(${resolved.scaleX} ${resolved.scaleY})`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    attributes,
    x: resolved.x,
    y: resolved.y,
    scaleX: resolved.scaleX,
    scaleY: resolved.scaleY,
    rotation: resolved.rotation,
    opacity,
    transform,
  };
}
