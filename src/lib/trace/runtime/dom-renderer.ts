/**
 * lib/trace/runtime/dom-renderer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Direct SVG DOM rendering for Nova Trace.
 *
 * This is the 60–120 fps path: it evaluates every element track at `timeMs` and
 * mutates the mounted SVG nodes in place. React is never re-rendered during
 * playback, which is what keeps a scrubbing stage smooth.
 *
 * Every element group is rendered with `data-trace-id` and, for fast lookup,
 * `id="trace-elem-<elementId>"`.
 *
 * Adapted from sagedesigns-os lib/motion/runtime/dom-renderer.ts.
 */

import type { TraceElement, TraceProject } from '../types';
import { getTraceRuntimeBridge } from './bridge';
import {
  formatTraceTimecode,
  resolveElementAtTime,
} from './resolve-element';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function elementDomId(elementId: string): string {
  return `trace-elem-${elementId}`;
}

export function findElementDom(elementId: string): SVGElement | null {
  if (typeof document === 'undefined') return null;
  return (
    (document.getElementById(elementDomId(elementId)) as SVGElement | null) ??
    (document.querySelector(
      `[data-trace-id="${cssEscape(elementId)}"]`,
    ) as SVGElement | null)
  );
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function')
    return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}

const pathLengthCache = new Map<string, number>();

function pathLengthOf(path: SVGPathElement, data: string): number {
  const cached = pathLengthCache.get(data);
  if (cached !== undefined) return cached;

  let length = 0;
  try {
    if (typeof path.getTotalLength === 'function')
      length = path.getTotalLength();
  } catch {
    length = 0;
  }

  if (length > 0 && pathLengthCache.size < 500)
    pathLengthCache.set(data, length);
  return length;
}

/** Approximate dash geometry for a trimmed path (AE "Trim Paths"). */
function applyTrim(
  node: SVGElement,
  data: string,
  start: number,
  end: number,
  offset: number,
): void {
  const total = pathLengthOf(node as SVGPathElement, data);
  if (total <= 0) return;

  const from = Math.max(0, Math.min(100, start));
  const to = Math.max(0, Math.min(100, end));
  const visible = (Math.max(0, to - from) / 100) * total;
  const dashOffset = -((from / 100) * total) - (offset / 100) * total;

  node.setAttribute('stroke-dasharray', `${visible} ${Math.max(total * 2, 1)}`);
  node.setAttribute('stroke-dashoffset', String(dashOffset));
  (node as SVGElement & { style: CSSStyleDeclaration }).style.strokeDashoffset =
    String(dashOffset);
}

/** Write a single animated value to the property's correct DOM slot. */
function applyTrackValue(
  node: SVGElement,
  element: TraceElement,
  property: string,
  value: string | number,
  attributes: Record<string, any>,
): void {
  const style = (node as SVGElement & { style?: CSSStyleDeclaration }).style;
  const tag = node.tagName.toLowerCase();

  switch (property) {
    case 'x':
    case 'y':
    case 'rotation':
    case 'scaleX':
    case 'scaleY':
      // Transform properties are applied together below.
      return;
    case 'opacity':
      if (style) style.opacity = String(value);
      node.setAttribute('opacity', String(value));
      return;
    case 'fill':
      node.setAttribute('fill', String(value));
      return;
    case 'fillOpacity':
      node.setAttribute('fill-opacity', String(value));
      return;
    case 'stroke':
      node.setAttribute('stroke', String(value));
      return;
    case 'strokeWidth':
      node.setAttribute('stroke-width', String(value));
      return;
    case 'strokeDashoffset':
      node.setAttribute('stroke-dashoffset', String(value));
      if (style) style.strokeDashoffset = String(value);
      return;
    case 'strokeDasharray':
      node.setAttribute('stroke-dasharray', String(value));
      return;
    case 'width': {
      const width = Number(value);
      node.setAttribute('width', String(width));
      if (tag === 'circle') node.setAttribute('r', String(width / 2));
      if (tag === 'ellipse') node.setAttribute('rx', String(width / 2));
      return;
    }
    case 'height': {
      const height = Number(value);
      node.setAttribute('height', String(height));
      if (tag === 'ellipse') node.setAttribute('ry', String(height / 2));
      return;
    }
    case 'rx':
      node.setAttribute('rx', String(value));
      return;
    case 'ry':
      node.setAttribute('ry', String(value));
      return;
    case 'x1':
    case 'y1':
    case 'x2':
    case 'y2':
      node.setAttribute(property, String(value));
      return;
    case 'points':
      node.setAttribute('points', String(value));
      return;
    case 'fontSize':
      node.setAttribute('font-size', String(value));
      if (style) style.fontSize = `${value}px`;
      return;
    case 'letterSpacing':
      node.setAttribute('letter-spacing', String(value));
      if (style) style.letterSpacing = `${value}px`;
      return;
    case 'text': {
      const target = node.querySelector('text') ?? node;
      target.textContent = String(value);
      return;
    }
    case 'pathProgress': {
      const textPath = node.querySelector('textPath');
      if (textPath) textPath.setAttribute('startOffset', `${Number(value)}%`);
      return;
    }
    case 'trimStart':
      applyTrim(
        node,
        String(attributes.d ?? ''),
        Number(value),
        Number(attributes.trimEnd ?? 100),
        Number(attributes.trimOffset ?? 0),
      );
      return;
    case 'trimEnd':
      applyTrim(
        node,
        String(attributes.d ?? ''),
        Number(attributes.trimStart ?? 0),
        Number(value),
        Number(attributes.trimOffset ?? 0),
      );
      return;
    case 'trimOffset':
      applyTrim(
        node,
        String(attributes.d ?? ''),
        Number(attributes.trimStart ?? 0),
        Number(attributes.trimEnd ?? 100),
        Number(value),
      );
      return;
    default:
      return;
  }
}

/** Evaluate one element at `timeMs` and mutate its mounted DOM node. */
export function applyElementAnimationAtTime(
  node: SVGElement,
  element: TraceElement,
  timeMs: number,
  domOverride?: SVGElement | null,
): void {
  const { attributes, transform } = resolveElementAtTime(element, timeMs);

  // Track-driven attributes first.
  for (const track of element.tracks ?? []) {
    const resolved = attributes[track.property];
    if (resolved === undefined) continue;
    applyTrackValue(node, element, track.property, resolved, attributes);
  }

  // Base attributes apply where no track animates them.
  const animated = new Set(
    (element.tracks ?? []).map((track) => track.property),
  );
  if (!animated.has('opacity') && attributes.opacity !== undefined) {
    node.style.opacity = String(attributes.opacity);
  }
  if (!animated.has('fill') && attributes.fill !== undefined) {
    node.setAttribute('fill', String(attributes.fill));
  }
  if (!animated.has('stroke') && attributes.stroke !== undefined) {
    node.setAttribute('stroke', String(attributes.stroke));
  }
  if (!animated.has('strokeWidth') && attributes.strokeWidth !== undefined) {
    node.setAttribute('stroke-width', String(attributes.strokeWidth));
  }
  if (!animated.has('fillOpacity') && attributes.fillOpacity !== undefined) {
    node.setAttribute('fill-opacity', String(attributes.fillOpacity));
  }

  // Static trim settings (no trim track) still need dash geometry.
  if (
    !animated.has('trimStart') &&
    !animated.has('trimEnd') &&
    !animated.has('trimOffset') &&
    (attributes.trimStart !== undefined || attributes.trimEnd !== undefined)
  ) {
    applyTrim(
      node,
      String(attributes.d ?? ''),
      Number(attributes.trimStart ?? 0),
      Number(attributes.trimEnd ?? 100),
      Number(attributes.trimOffset ?? 0),
    );
  }

  const origin = element.origin ?? { x: 0, y: 0 };
  node.style.transformOrigin = `${origin.x}px ${origin.y}px`;
  node.style.transformBox = 'view-box';
  node.style.transform = `translate(${transform.x}px, ${transform.y}px) rotate(${transform.rotation}deg) scale(${transform.scaleX}, ${transform.scaleY})`;

  if (domOverride)
    domOverride.setAttribute('data-trace-time', String(Math.round(timeMs)));
}

function updateTransportUi(timeMs: number, project: TraceProject): void {
  if (typeof document === 'undefined') return;

  const needle = document.getElementById('trace-playhead-needle');
  if (needle) {
    const zoom = getTraceRuntimeBridge()?.getPlayback().zoomRatio ?? 120;
    needle.style.transform = `translate3d(${timeMs * (zoom / 1000)}px, 0, 0)`;
  }

  const progress = document.getElementById('trace-mini-progress');
  if (progress) {
    const duration = project.durationMs || 1;
    progress.style.width = `${Math.min(100, Math.max(0, (timeMs / duration) * 100))}%`;
  }

  const formatted = formatTraceTimecode(timeMs);
  const timecodes = document.querySelectorAll<HTMLElement>(
    '[data-trace-timecode]',
  );
  timecodes.forEach((node) => {
    node.textContent = formatted;
  });
}

/**
 * Evaluate every element at `timeMs` and mutate the SVG DOM.
 * Runs at display refresh rate during playback and on every scrub tick.
 */
export function syncTraceDomAtTime(
  timeMs: number,
  project?: TraceProject | null,
): void {
  if (typeof document === 'undefined') return;

  const doc = project ?? getTraceRuntimeBridge()?.getProject() ?? null;
  if (!doc) return;

  for (const element of Object.values(doc.elements)) {
    const node = findElementDom(element.id);
    if (!node) continue;
    applyElementAnimationAtTime(node, element, timeMs);
  }

  updateTransportUi(timeMs, doc);
}

export interface TransformPreview {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

/**
 * Mutate a mounted node to a preview transform during a gizmo drag.
 * No React, no store write — the caller commits once on pointer-up.
 * `origin` overrides the element's anchor for origin-marker drags.
 */
export function applyTransformPreview(
  node: SVGElement,
  transform: TransformPreview,
  origin?: { x: number; y: number },
): void {
  const anchor = origin ?? { x: 0, y: 0 };
  node.style.transformOrigin = `${anchor.x}px ${anchor.y}px`;
  node.style.transformBox = 'view-box';
  node.style.transform = `translate(${transform.x}px, ${transform.y}px) rotate(${transform.rotation}deg) scale(${transform.scaleX}, ${transform.scaleY})`;
}

/**
 * Measure an element's local bounding box with its own CSS transform
 * neutralised, so the result is in element-local space regardless of
 * browser getBBox() transform semantics. Restores synchronously.
 */
export function measureElementBBox(
  node: SVGGraphicsElement,
): { x: number; y: number; width: number; height: number } | null {
  if (!node || typeof node.getBBox !== 'function') return null;
  const previousTransform = node.style.transform;
  const previousOrigin = node.style.transformOrigin;
  try {
    node.style.transform = 'none';
    const box = node.getBBox();
    return {
      x: box.x,
      y: box.y,
      width: Math.max(0, box.width),
      height: Math.max(0, box.height),
    };
  } catch {
    return null;
  } finally {
    node.style.transform = previousTransform;
    node.style.transformOrigin = previousOrigin;
  }
}

/** Drop cached geometry after a document change (d paths can change). */
export function invalidateTraceDomCaches(): void {
  pathLengthCache.clear();
}

/** Build a detached SVG group for an element — used by exports and tests. */
export function createDetachedElementNode(
  element: TraceElement,
): SVGGElement | null {
  if (typeof document === 'undefined') return null;
  const group = document.createElementNS(SVG_NS, 'g') as SVGGElement;
  group.setAttribute('data-trace-id', element.id);
  return group;
}
