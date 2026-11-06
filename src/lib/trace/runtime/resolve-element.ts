/**
 * lib/trace/runtime/resolve-element.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Resolve an element's full attribute bag at time T.
 *
 * Compatibility wrapper over the shared sampler maths in `frame.ts`. It exists
 * for the v1 editor path (stage, exporters and tests that only have a single
 * element) until renderers consume `TraceFrame` directly.
 *
 * Unlike `sampleFrame`, this includes every track regardless of its
 * `animationId`, because a v1 document has no animations to filter by.
 *
 * @deprecated Use `sampleFrame` from `runtime/frame`; this wrapper goes away
 * once the stage renders frames.
 */

import type { TraceElement } from '../types';
import {
  composeElementTransform,
  overlayAttributeLayers,
  sampleMotionPoint,
} from './frame';
import type { ElementTransform } from './transform-resolver';

export type ResolvedElement = {
  attributes: Record<string, any>;
  transform: ElementTransform;
  /** Animated motion path position, when the element follows a path. */
  motionPathPoint: { x: number; y: number } | null;
};

export function resolveElementAtTime(
  element: TraceElement,
  timeMs: number,
): ResolvedElement {
  const attributes = overlayAttributeLayers(element, [
    { timeMs, weight: 1, tracks: element.tracks ?? [] },
  ]);

  const pathData =
    (typeof attributes.motionPathData === 'string' &&
      attributes.motionPathData) ||
    (typeof attributes.d === 'string' && element.type === 'path'
      ? attributes.d
      : '');

  // v2 authors `motionPathProgress`; v1 documents used `pathProgress` for both
  // motion-following and text-on-path offsets, so fall back for them.
  const progress =
    attributes.motionPathProgress ??
    (pathData ? attributes.pathProgress : undefined);

  const motion =
    progress === undefined || progress === null || !pathData
      ? null
      : sampleMotionPoint(pathData, Number(progress));

  const transform = composeElementTransform(element, attributes, motion);

  return {
    attributes,
    transform: {
      x: transform.x,
      y: transform.y,
      rotation: transform.rotation,
      scaleX: transform.scaleX,
      scaleY: transform.scaleY,
    },
    motionPathPoint: motion ? motion.point : null,
  };
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
