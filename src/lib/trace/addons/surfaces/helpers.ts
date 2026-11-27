/**
 * lib/trace/addons/surfaces/helpers.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure builders for the Surfaces add-on.
 *
 * Surfaces are ordinary Trace layers: rects, circles, paths, structured
 * gradients and filters with ordinary tracks. No canvas painter, shader or
 * renderer-specific primitive is involved, so every surface previews, edits,
 * exports to SMIL/GSAP, and survives project round-trips exactly like
 * hand-authored artwork.
 */

import type { TraceAssetFragment } from '../../assets/types';
import type { TraceFilter } from '../../filters/types';
import type {
  PropertyTrack,
  TraceElement,
  TraceGradient,
} from '../../types';
import { blockElement, blockTrack } from '../../blocks/helpers';

/** Surface loops are authored on a four-second canvas by default. */
export const SURFACE_DURATION_MS = 4000;

export interface SurfaceResources {
  gradients?: Record<string, TraceGradient>;
  filters?: Record<string, TraceFilter>;
}

export function surfaceGroup(
  id: string,
  name: string,
  attributes: Record<string, unknown>,
  childrenIds: string[],
  tracks: PropertyTrack[] = [],
  origin: { x: number; y: number } = { x: 0, y: 0 },
): TraceElement {
  return blockElement({
    id,
    name,
    type: 'group',
    attributes,
    childrenIds,
    tracks,
    origin,
  });
}

export function surfaceRect(
  id: string,
  name: string,
  attributes: Record<string, unknown>,
  tracks: PropertyTrack[] = [],
  origin?: { x: number; y: number },
): TraceElement {
  const width = Number(attributes.width ?? 0);
  const height = Number(attributes.height ?? 0);
  return blockElement({
    id,
    name,
    type: 'rect',
    attributes: { x: 0, y: 0, ...attributes },
    tracks,
    origin: origin ?? { x: width / 2, y: height / 2 },
  });
}

export function surfaceCircle(
  id: string,
  name: string,
  centerX: number,
  centerY: number,
  radius: number,
  attributes: Record<string, unknown>,
  tracks: PropertyTrack[] = [],
): TraceElement {
  return blockElement({
    id,
    name,
    type: 'circle',
    attributes: {
      x: centerX - radius,
      y: centerY - radius,
      width: radius * 2,
      height: radius * 2,
      ...attributes,
    },
    tracks,
    origin: { x: radius, y: radius },
  });
}

export function surfacePath(
  id: string,
  name: string,
  d: string,
  attributes: Record<string, unknown>,
  tracks: PropertyTrack[] = [],
  origin: { x: number; y: number } = { x: 0, y: 0 },
): TraceElement {
  return blockElement({
    id,
    name,
    type: 'path',
    attributes: { d, ...attributes },
    tracks,
    origin,
  });
}

export function surfaceTrack(
  id: string,
  property: PropertyTrack['property'],
  label: string,
  keyframes: Array<{ timeMs: number; value: number | string; easing?: string }>,
  discrete?: boolean,
): PropertyTrack {
  const track = blockTrack(id, property, label, keyframes);
  if (discrete) track.discrete = true;
  return track;
}

/**
 * Assemble a surface root and its descendants. Elements that already declare a
 * parent keep it; everything else attaches directly to the root. This supports
 * nested groups (an orbiting system or a rotated speed-line field).
 */
export function assembleSurface(
  root: TraceElement,
  children: Record<string, TraceElement>,
  width: number,
  height: number,
  resources: SurfaceResources = {},
): TraceAssetFragment {
  const elements: Record<string, TraceElement> = {
    [root.id]: { ...root, parentId: null },
  };
  for (const [id, child] of Object.entries(children)) {
    if (id === root.id) continue;
    elements[id] = { ...child, parentId: child.parentId ?? root.id };
  }
  // childrenIds is the render view; parentId is the inspector/migration view.
  // Reconcile them so nested groups stay nested in both.
  const parents = new Map<string, string>();
  for (const [id, element] of Object.entries(elements)) {
    for (const childId of element.childrenIds ?? []) {
      if (elements[childId]) parents.set(childId, id);
    }
  }
  for (const [id, element] of Object.entries(elements)) {
    if (id === root.id) continue;
    const parentId = parents.get(id) ?? root.id;
    if (element.parentId !== parentId) {
      elements[id] = { ...element, parentId };
    }
  }
  return {
    width,
    height,
    elements,
    rootElementIds: [root.id],
    ...(resources.gradients && Object.keys(resources.gradients).length > 0
      ? { gradients: resources.gradients }
      : {}),
    ...(resources.filters && Object.keys(resources.filters).length > 0
      ? { filters: resources.filters }
      : {}),
  };
}

/** Deterministic pseudo-random stream so a block preview is stable. */
export function seededRandom(seed: number): () => number {
  let state = (Math.abs(Math.round(seed)) || 1) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function linearGradient(
  id: string,
  angle: number,
  stops: Array<{ offset: number; color: string; opacity?: number }>,
): TraceGradient {
  return {
    id,
    type: 'linear',
    angle,
    cx: 0.5,
    cy: 0.5,
    r: 0.5,
    stops: stops.map((stop, index) => ({
      id: `${id}-stop-${index}`,
      offset: Math.max(0, Math.min(1, stop.offset)),
      color: stop.color,
      opacity: Math.max(0, Math.min(1, stop.opacity ?? 1)),
    })),
  };
}

export function radialGradient(
  id: string,
  stops: Array<{ offset: number; color: string; opacity?: number }>,
  cx = 0.5,
  cy = 0.5,
  r = 0.5,
): TraceGradient {
  return {
    id,
    type: 'radial',
    angle: 0,
    cx,
    cy,
    r,
    stops: stops.map((stop, index) => ({
      id: `${id}-stop-${index}`,
      offset: Math.max(0, Math.min(1, stop.offset)),
      color: stop.color,
      opacity: Math.max(0, Math.min(1, stop.opacity ?? 1)),
    })),
  };
}

export function blurFilter(
  id: string,
  stdDeviation: number,
  label = 'Soft blur',
): TraceFilter {
  return {
    id,
    label,
    kind: 'blur',
    region: 30,
    primitives: [
      {
        id: `${id}-blur`,
        kind: 'feGaussianBlur',
        in: 'SourceGraphic',
        params: { stdDeviation },
      },
    ],
  };
}

/**
 * Film grain via turbulence. The grain overlay is a full-frame rect; the filter
 * replaces its flat fill with monochrome noise. `seed` makes the pattern
 * reproducible per insert.
 */
export function grainFilter(
  id: string,
  baseFrequency = 0.9,
  seed = 7,
): TraceFilter {
  return {
    id,
    label: 'Film grain',
    kind: 'distort',
    region: 0,
    colorSpace: 'sRGB',
    primitives: [
      {
        id: `${id}-noise`,
        kind: 'feTurbulence',
        result: 'noise',
        params: {
          type: 'fractalNoise',
          baseFrequency,
          numOctaves: 2,
          seed,
        },
      },
      {
        id: `${id}-mono`,
        kind: 'feColorMatrix',
        in: 'noise',
        result: 'mono',
        params: { type: 'saturate', values: 0 },
      },
    ],
  };
}

/** A smooth wave path across `width`, expressed with cubic segments. */
export function wavePath(
  width: number,
  baseline: number,
  amplitude: number,
  segments = 4,
): string {
  const step = width / segments;
  let d = `M 0 ${baseline}`;
  for (let index = 0; index < segments; index += 1) {
    const x = index * step;
    const direction = index % 2 === 0 ? -1 : 1;
    d += ` C ${x + step * 0.35} ${baseline + amplitude * direction} ${
      x + step * 0.65
    } ${baseline + amplitude * direction} ${x + step} ${baseline}`;
  }
  return d;
}

/** A jagged ridge line pinned to the bottom of the canvas. */
export function ridgePath(
  width: number,
  height: number,
  baseline: number,
  relief: number,
  steps: number,
  random: () => number,
): string {
  const step = width / steps;
  let d = `M 0 ${height} L 0 ${baseline}`;
  let previous = baseline;
  for (let index = 1; index <= steps; index += 1) {
    const x = Math.min(width, index * step);
    const next = baseline - (random() - 0.35) * relief;
    const controlX = x - step * 0.5;
    d += ` Q ${controlX} ${previous} ${x} ${Math.max(0, next)}`;
    previous = Math.max(0, next);
  }
  d += ` L ${width} ${height} Z`;
  return d;
}

/** Regular polygon path, used for Bauhaus triangles and diamonds. */
export function polygonPath(
  centerX: number,
  centerY: number,
  radius: number,
  sides: number,
  rotationDegrees = 0,
): string {
  const count = Math.max(3, Math.round(sides));
  const points: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle =
      (Math.PI * 2 * index) / count -
      Math.PI / 2 +
      (rotationDegrees * Math.PI) / 180;
    points.push(
      `${centerX + Math.cos(angle) * radius},${centerY + Math.sin(angle) * radius}`,
    );
  }
  return `M ${points.join(' L ')} Z`;
}