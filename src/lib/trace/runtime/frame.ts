/**
 * lib/trace/runtime/frame.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure frame sampling for Nova Trace.
 *
 * `sampleFrame` is the single evaluation path: renderers and exporters project
 * a `TraceFrame` and never read tracks themselves. Sampling is DOM-free,
 * deterministic and allocation-bounded — no linting, no diffs, no formatting.
 *
 * Layers are the seam future state machines blend through: one layer is exact
 * evaluation, several layers combine by normalized weight.
 */

import { parseTraceColor } from '../animation/color-math';
import { getValueAtTime } from '../animation/interpolator';
import { activeArtboard, animationOf } from '../document';
import { parsePathData, type PathNode } from '../path/model';
import type {
  PropertyTrack,
  TraceAnimation,
  TraceArtboard,
  TraceDocument,
  TraceElement,
  TraceElementType,
  TraceGradient,
} from '../types';

export type FrameTransform = {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  originX: number;
  originY: number;
};

export type FrameElement = {
  id: string;
  artboardId: string;
  type: TraceElementType;
  name: string;
  parentId: string | null;
  childrenIds: string[];
  visible: boolean;
  opacity: number;
  transform: FrameTransform;
  /** Resolved base attributes overlaid by tracks and (later) bindings. */
  attributes: Record<string, unknown>;
};

export type TraceFrame = {
  artboardId: string;
  animationId: string;
  timeMs: number;
  durationMs: number;
  width: number;
  height: number;
  background?: string;
  elements: Record<string, FrameElement>;
  rootElementIds: string[];
  defs?: string;
  gradients?: Record<string, TraceGradient>;
};

/** One animation contributing to a frame. Phase 1 uses more than one. */
export type FrameLayer = {
  animationId: string;
  timeMs: number;
  weight: number;
  speed?: number;
};

export type SampleOptions = {
  timeMs: number;
  /** Single-animation sampling. Mutually exclusive with `layers`. */
  animationId?: string;
  layers?: readonly FrameLayer[];
  /** Sample a specific artboard instead of the document's active one. */
  artboardId?: string;
  /**
   * Optional: restrict to one scene plus scene-less elements. Never implicit —
   * scenes organise the timeline but do not filter rendering by default.
   */
  sceneId?: string | null;
  /** Phase 2 hook. Ignored in v2.0. */
  bindings?: Readonly<Record<string, unknown>>;
};

/** One element's tracks evaluated for one layer. */
export type AttributeLayer = {
  timeMs: number;
  weight: number;
  tracks: readonly PropertyTrack[];
};

const COLOR_PROPERTIES = new Set([
  'fill',
  'stroke',
  'color',
  'backgroundColor',
  'borderColor',
]);

const FLATTEN_STEPS = 16;

function clampNumber(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === 'object') {
    const clone: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      clone[key] = cloneValue(nested);
    }
    return clone;
  }
  return value;
}

function cloneAttributes(
  source: Record<string, any> | undefined,
): Record<string, unknown> {
  const clone: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    clone[key] = cloneValue(value);
  }
  return clone;
}

type Contribution = {
  value: number | string;
  weight: number;
  layerIndex: number;
};

function dominantContribution(contributions: Contribution[]): Contribution {
  let winner = contributions[0];
  for (const contribution of contributions.slice(1)) {
    if (contribution.weight > winner.weight) winner = contribution;
  }
  return winner;
}

/**
 * Combine one property across layers.
 *
 * Numbers and colors interpolate by weight; discrete values take the heaviest
 * layer (ties go to the earlier layer). Unparseable colors fall back to the
 * dominant layer instead of jumping at 50 %.
 */
function blendContributions(
  property: string,
  contributions: Contribution[],
): number | string {
  if (contributions.length === 1) return contributions[0].value;

  const allNumbers = contributions.every(
    (entry) => typeof entry.value === 'number',
  );
  if (allNumbers) {
    return contributions.reduce(
      (total, entry) => total + entry.weight * (entry.value as number),
      0,
    );
  }

  if (COLOR_PROPERTIES.has(property)) {
    const parsed = contributions.map((entry) => ({
      ...entry,
      rgba: parseTraceColor(String(entry.value)),
    }));
    if (parsed.every((entry) => entry.rgba !== null)) {
      const totalWeight = parsed.reduce((sum, entry) => sum + entry.weight, 0);
      if (totalWeight > 0) {
        const mix = parsed.reduce(
          (accumulator, entry) => {
            const weight = entry.weight / totalWeight;
            const rgba = entry.rgba as NonNullable<typeof entry.rgba>;
            return {
              r: accumulator.r + rgba.r * weight,
              g: accumulator.g + rgba.g * weight,
              b: accumulator.b + rgba.b * weight,
              a: accumulator.a + rgba.a * weight,
            };
          },
          { r: 0, g: 0, b: 0, a: 0 },
        );
        return `rgba(${Math.round(mix.r)}, ${Math.round(mix.g)}, ${Math.round(
          mix.b,
        )}, ${Math.round(mix.a * 1000) / 1000})`;
      }
    }
    return dominantContribution(contributions).value;
  }

  return dominantContribution(contributions).value;
}

/**
 * Overlay one element's attributes with the given layers.
 *
 * A property that no layer defines falls through to the element's base
 * attribute, which is why the base bag is cloned first.
 */
/**
 * The value a property holds when a layer does not animate it: the element's
 * base attribute, or the element default for the standard transform keys.
 */
function baseAttributeValue(
  element: TraceElement,
  property: string,
): number | string | null {
  const raw = (element.attributes as Record<string, unknown>)?.[property];
  if (typeof raw === 'number' || typeof raw === 'string') return raw;
  if (property === 'opacity' || property === 'scaleX' || property === 'scaleY') {
    return 1;
  }
  // No authored value and no implicit default: the property simply does not
  // exist for this element, so the layer contributes nothing.
  return null;
}

export function overlayAttributeLayers(
  element: TraceElement,
  layers: readonly AttributeLayer[],
): Record<string, unknown> {
  const attributes = cloneAttributes(element.attributes);
  const active = layers.filter(
    (layer) => layer.weight > 0 && layer.tracks.length > 0,
  );
  if (active.length === 0) return attributes;

  if (active.length === 1) {
    const layer = active[0];
    for (const track of layer.tracks) {
      const value = getValueAtTime(track, layer.timeMs);
      if (value !== null && value !== undefined) attributes[track.property] = value;
    }
    return attributes;
  }

  const totalWeight = active.reduce((sum, layer) => sum + layer.weight, 0);
  const properties = new Set<string>();
  for (const layer of active) {
    for (const track of layer.tracks) properties.add(track.property);
  }

  for (const property of properties) {
    const contributions: Contribution[] = [];
    active.forEach((layer, layerIndex) => {
      const track = layer.tracks.find(
        (candidate) => candidate.property === property,
      );
      if (!track) {
        // A layer that does not animate this property still holds the element
        // at its base value for its share of the blend.
        const base = baseAttributeValue(element, property);
        if (base === null) return;
        contributions.push({
          value: base,
          weight: layer.weight / totalWeight,
          layerIndex,
        });
        return;
      }
      const value = getValueAtTime(track, layer.timeMs);
      if (value === null || value === undefined) return;
      contributions.push({
        value,
        weight: layer.weight / totalWeight,
        layerIndex,
      });
    });
    if (contributions.length > 0) {
      attributes[property] = blendContributions(property, contributions);
    }
  }

  return attributes;
}

export type MotionSample = {
  point: { x: number; y: number };
  /** Tangent direction in degrees, clockwise from +x. */
  angle: number;
};

function cubicAt(
  from: PathNode,
  to: PathNode,
  t: number,
): { x: number; y: number } {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x:
      a * from.point.x +
      b * from.handleOut.x +
      c * to.handleIn.x +
      d * to.point.x,
    y:
      a * from.point.y +
      b * from.handleOut.y +
      c * to.handleIn.y +
      d * to.point.y,
  };
}

type MotionPoint = { x: number; y: number; length: number };

/**
 * Sample a point and its tangent along path data by arc length.
 *
 * Curves contribute their flattened length, so a progress of 50 % lands at the
 * geometric midpoint instead of half the anchor count.
 */
export function sampleMotionPoint(
  pathData: string,
  progress: number,
): MotionSample | null {
  if (typeof pathData !== 'string' || pathData.length === 0) return null;

  const model = parsePathData(pathData);
  const samples: MotionPoint[] = [];
  let total = 0;

  const push = (point: { x: number; y: number }, connect: boolean): void => {
    const previous = samples[samples.length - 1];
    if (previous && connect) {
      total += Math.hypot(point.x - previous.x, point.y - previous.y);
    }
    samples.push({ x: point.x, y: point.y, length: total });
  };

  for (const subpath of model.subpaths) {
    const nodes = subpath.nodes;
    if (nodes.length === 0) continue;

    push(nodes[0].point, samples.length > 0);

    for (let index = 1; index < nodes.length; index += 1) {
      for (let step = 1; step <= FLATTEN_STEPS; step += 1) {
        push(cubicAt(nodes[index - 1], nodes[index], step / FLATTEN_STEPS), true);
      }
    }

    if (subpath.closed && nodes.length > 1) {
      for (let step = 1; step <= FLATTEN_STEPS; step += 1) {
        push(cubicAt(nodes[nodes.length - 1], nodes[0], step / FLATTEN_STEPS), true);
      }
    }
  }

  if (samples.length === 0) return null;

  const first = samples[0];
  if (total <= 0) return { point: { x: first.x, y: first.y }, angle: 0 };

  const ratio = clamp01(clampNumber(progress, 0) / 100);
  const target = ratio * total;

  let index = 1;
  while (index < samples.length && samples[index].length < target) index += 1;

  const previous = samples[Math.max(0, index - 1)];
  const next = samples[Math.min(samples.length - 1, index)];
  const span = next.length - previous.length;
  const localRatio = span > 0 ? (target - previous.length) / span : 0;

  const point = {
    x: previous.x + (next.x - previous.x) * localRatio,
    y: previous.y + (next.y - previous.y) * localRatio,
  };

  let dx = next.x - previous.x;
  let dy = next.y - previous.y;
  if (dx === 0 && dy === 0) {
    // Degenerate window: walk outwards until two distinct samples are found.
    for (let offset = 2; offset < samples.length; offset += 1) {
      const back = samples[Math.max(0, index - offset)];
      const ahead = samples[Math.min(samples.length - 1, index + offset)];
      dx = ahead.x - back.x;
      dy = ahead.y - back.y;
      if (dx !== 0 || dy !== 0) break;
    }
  }

  const angle = dx === 0 && dy === 0 ? 0 : (Math.atan2(dy, dx) * 180) / Math.PI;
  return { point, angle };
}

/**
 * Compose an element's resolved transform.
 *
 * `baseX/baseY` is layout and `x`/`y` is an animated offset; without a base
 * pair `x`/`y` is the position. A motion sample overrides the position and,
 * with `autoRotate`, adds the tangent to `rotationOffset`.
 */
export function composeElementTransform(
  element: TraceElement,
  attributes: Record<string, unknown>,
  motion?: MotionSample | null,
): FrameTransform {
  const hasBasePosition =
    typeof attributes.baseX === 'number' || typeof attributes.baseY === 'number';

  const offsetX = clampNumber(attributes.x, 0);
  const offsetY = clampNumber(attributes.y, 0);
  let x = hasBasePosition ? clampNumber(attributes.baseX, 0) + offsetX : offsetX;
  let y = hasBasePosition ? clampNumber(attributes.baseY, 0) + offsetY : offsetY;
  let rotation = clampNumber(attributes.rotation, 0);

  if (motion) {
    x = motion.point.x;
    y = motion.point.y;
    if (attributes.autoRotate) {
      rotation = motion.angle + clampNumber(attributes.rotationOffset, 0);
    }
  }

  return {
    x,
    y,
    rotation,
    scaleX: clampNumber(attributes.scaleX, 1),
    scaleY: clampNumber(attributes.scaleY, 1),
    originX: clampNumber(element.origin?.x, 0),
    originY: clampNumber(element.origin?.y, 0),
  };
}

type ResolvedSampleLayer = {
  animationId: string;
  timeMs: number;
  weight: number;
};

function frameDurationOf(
  document: TraceDocument,
  animation: TraceAnimation | null,
): number {
  const duration = animation?.durationMs;
  if (typeof duration === 'number' && duration > 0) return duration;
  const stored = Number(document.durationMs);
  return Number.isFinite(stored) && stored > 0 ? stored : 1;
}

function resolveSampleLayers(
  document: TraceDocument,
  artboard: TraceArtboard | null,
  animation: TraceAnimation | null,
  options: SampleOptions,
): ResolvedSampleLayer[] {
  const fallbackDuration = frameDurationOf(document, animation);

  if (options.layers && options.layers.length > 0) {
    return options.layers
      .filter((layer) => Number.isFinite(layer.weight) && layer.weight > 0)
      .map((layer) => {
        const layerAnimation = artboard
          ? animationOf(artboard, layer.animationId)
          : null;
        const duration = layerAnimation?.durationMs ?? fallbackDuration;
        return {
          animationId: layer.animationId,
          timeMs: Math.max(0, Math.min(duration, clampNumber(layer.timeMs, 0))),
          weight: layer.weight,
        };
      });
  }

  return [
    {
      animationId: animation?.id ?? '',
      timeMs: Math.max(
        0,
        Math.min(fallbackDuration, clampNumber(options.timeMs, 0)),
      ),
      weight: 1,
    },
  ];
}

/**
 * Evaluate a document into a frame.
 *
 * Empty documents produce an empty frame rather than throwing: a missing
 * artboard is a lint error, and a player still needs dimensions to lay out.
 */
export function sampleFrame(
  document: TraceDocument,
  options: SampleOptions,
): TraceFrame {
  const artboard = activeArtboard(document, options.artboardId);
  const animation = artboard ? animationOf(artboard, options.animationId) : null;
  const durationMs = frameDurationOf(document, animation);
  const layers = resolveSampleLayers(document, artboard, animation, options);
  const singleLayer = layers.length === 1;

  const width = Math.max(
    1,
    Math.round(clampNumber(artboard?.width ?? document.width, 1280)),
  );
  const height = Math.max(
    1,
    Math.round(clampNumber(artboard?.height ?? document.height, 720)),
  );

  const elements: Record<string, FrameElement> = {};
  for (const element of Object.values(artboard?.elements ?? {})) {
    if (
      options.sceneId !== undefined &&
      options.sceneId !== null &&
      element.sceneId != null &&
      element.sceneId !== options.sceneId
    ) {
      continue;
    }

    const attributeLayers: AttributeLayer[] = layers.map((layer) => ({
      timeMs: layer.timeMs,
      weight: layer.weight,
      // Untagged tracks belong to the single-layer (v1 / half-migrated) case
      // only; in a blend they would be counted once per layer.
      tracks: (element.tracks ?? []).filter(
        (track) =>
          track.animationId === layer.animationId ||
          (singleLayer && track.animationId === undefined),
      ),
    }));

    const attributes = overlayAttributeLayers(element, attributeLayers);

    const pathData =
      typeof attributes.motionPathData === 'string'
        ? attributes.motionPathData
        : element.type === 'path' && typeof attributes.d === 'string'
          ? attributes.d
          : '';
    const motionProgress = attributes.motionPathProgress;
    const motion =
      motionProgress === undefined ||
      motionProgress === null ||
      !pathData
        ? null
        : sampleMotionPoint(pathData, clampNumber(motionProgress, 0));

    const transform = composeElementTransform(element, attributes, motion);
    const opacity = clamp01(clampNumber(attributes.opacity, 1));

    elements[element.id] = {
      id: element.id,
      artboardId: artboard?.id ?? '',
      type: element.type,
      name: element.name,
      parentId: element.parentId ?? null,
      childrenIds: [...(element.childrenIds ?? [])],
      visible: element.visible !== false,
      opacity,
      transform,
      attributes,
    };
  }

  return {
    artboardId: artboard?.id ?? '',
    animationId: animation?.id ?? '',
    timeMs: layers[0]?.timeMs ?? 0,
    durationMs,
    width,
    height,
    ...(artboard?.background ? { background: artboard.background } : {}),
    elements,
    rootElementIds: [...(artboard?.rootElementIds ?? [])],
    ...(artboard?.defs ? { defs: artboard.defs } : {}),
    ...(artboard?.gradients ? { gradients: { ...artboard.gradients } } : {}),
  };
}
