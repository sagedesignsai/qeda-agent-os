/**
 * Idempotent migration of legacy Trace documents to primitive element graphs.
 * Migration is a read normalization, not an editor operation, so it never
 * creates undo history.
 */

import type {
  TraceAnimation,
  TraceArtboard,
  TraceDocument,
  TraceElement,
  TraceStage,
  TraceStageInput,
  TraceElementType,
  PropertyTrack,
} from './types';
import { TRACE_DEFAULT_DURATION_MS, TRACE_DEFAULT_FPS } from './defaults';
import {
  isTraceDocument,
  readTraceSchemaVersion,
  TRACE_DEFAULT_ANIMATION_ID,
  TRACE_DEFAULT_ARTBOARD_ID,
  TRACE_SCHEMA_VERSION,
  TraceSchemaInvalidError,
  TraceSchemaNewerError,
} from './schema';
import { ensureStoryboard } from './storyboard';
import { expandRecipe } from './recipes';

const LEGACY_TYPES = new Set([
  'counter',
  'progress-ring',
  'bar-chart',
  'kinetic-text',
  'lower-third',
  'shape',
  'star',
  'spline-tracer',
]);

function legacyStarPoints(radius: number, ratio: number): string {
  const points: string[] = [];
  for (let index = 0; index < 10; index += 1) {
    const current = index % 2 === 0 ? radius : radius * ratio;
    const angle = (Math.PI * index) / 5 - Math.PI / 2;
    points.push(`${current * Math.cos(angle)},${current * Math.sin(angle)}`);
  }
  return points.join(' ');
}

type LegacyElement = TraceElement & {
  type: string;
  attributes: Record<string, any>;
  tracks: Array<PropertyTrack & { property: string }>;
};

function isLegacy(element: TraceElement): boolean {
  return LEGACY_TYPES.has(element.type);
}

function tracksFor(element: LegacyElement, property: string): PropertyTrack[] {
  return element.tracks.filter((track) => track.property === property);
}

function mappedTrack(
  track: PropertyTrack,
  property: PropertyTrack['property'],
  label: string,
  convert: (value: number | string) => number | string = (value) => value,
): PropertyTrack {
  return {
    ...track,
    property,
    label,
    keyframes: track.keyframes.map((keyframe) => ({
      ...keyframe,
      value: convert(keyframe.value),
    })),
  };
}

function formatCounterValue(value: number | string, attributes: Record<string, any>): string {
  const numeric = Number(value);
  const decimals = Math.max(0, Math.round(Number(attributes.decimals ?? 0)));
  const formatted = Number.isFinite(numeric)
    ? attributes.thousandsSeparator === false
      ? numeric.toFixed(decimals)
      : new Intl.NumberFormat('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(numeric)
    : String(value);
  return `${attributes.prefix ?? ''}${formatted}${attributes.suffix ?? ''}`;
}

function copyRootMetadata(
  legacy: LegacyElement,
  root: TraceElement,
  recipeChildIds: string[],
  tracks: PropertyTrack[],
): TraceElement {
  return {
    ...root,
    id: legacy.id,
    name: legacy.name,
    visible: legacy.visible,
    locked: legacy.locked,
    sceneId: legacy.sceneId,
    parentId: legacy.parentId,
    origin: legacy.origin,
    attributes: {
      ...root.attributes,
      ...Object.fromEntries(
        ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity'].flatMap((key) =>
          legacy.attributes[key] === undefined
            ? []
            : [[key, legacy.attributes[key]]],
        ),
      ),
    },
    tracks,
    childrenIds: [...recipeChildIds, ...(legacy.childrenIds ?? [])],
  };
}

function expandCompound(
  element: LegacyElement,
  occupiedIds: Set<string>,
): TraceElement[] {
  const legacyType = String(element.type);
  const attrs = element.attributes ?? {};
  const rootId = element.id;
  const factory = () => rootId;
  const commonOptions = {
    x: Number(attrs.x ?? element.origin.x ?? 0),
    y: Number(attrs.y ?? element.origin.y ?? 0),
    name: element.name,
    sceneId: element.sceneId,
  };
  let recipeId: string;
  let options: Record<string, any>;
  let passThroughTracks: PropertyTrack[] = [];
  let mappedChildTracks = new Map<string, PropertyTrack[]>();

  switch (legacyType) {
    case 'counter': {
      recipeId = 'counter';
      options = {
        ...commonOptions,
        startVal: attrs.startVal ?? 0,
        endVal: attrs.endVal ?? 100,
        prefix: attrs.prefix ?? '',
        suffix: attrs.suffix ?? '',
        decimals: attrs.decimals ?? 0,
        caption: attrs.text ?? attrs.caption ?? '',
        fontSize: attrs.fontSize ?? 48,
        fill: attrs.fill ?? '#ffffff',
      };
      const oldValueTracks = tracksFor(element, 'counterValue');
      if (oldValueTracks.length) {
        mappedChildTracks.set(
          `${rootId}-value`,
          oldValueTracks.map((track) =>
            mappedTrack(track, 'text', 'Value', (value) =>
              formatCounterValue(value, attrs),
            ),
          ),
        );
      }
      passThroughTracks = element.tracks.filter((track) =>
        ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity'].includes(
          track.property,
        ),
      );
      break;
    }
    case 'progress-ring': {
      recipeId = 'progress-ring';
      options = {
        ...commonOptions,
        radius: attrs.radius ?? attrs.r ?? 40,
        thickness: attrs.thickness ?? 8,
        progress: attrs.progress ?? 0,
        progressColor: attrs.progressColor ?? '#38bdf8',
        trackColor: attrs.trackColor ?? '#1e293b',
        showPercentageLabel: attrs.showPercentageLabel !== false,
      };
      const radius = Number(options.radius);
      const circumference = 2 * Math.PI * radius;
      const progressTracks = tracksFor(element, 'progress');
      if (progressTracks.length) {
        mappedChildTracks.set(
          `${rootId}-indicator`,
          progressTracks.map((track) =>
            mappedTrack(
              track,
              'strokeDashoffset',
              'Progress',
              (value) =>
                circumference *
                (1 -
                  Math.max(0, Math.min(100, Number(value))) / 100),
            ),
          ),
        );
        mappedChildTracks.set(
          `${rootId}-label`,
          progressTracks.map((track) =>
            mappedTrack(track, 'text', 'Progress label', (value) =>
              `${Math.round(Number(value))}%`,
            ),
          ),
        );
      }
      passThroughTracks = element.tracks.filter((track) =>
        ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity'].includes(
          track.property,
        ),
      );
      break;
    }
    case 'bar-chart': {
      recipeId = 'bar-chart';
      options = {
        ...commonOptions,
        width: attrs.width ?? 400,
        height: attrs.height ?? 300,
        bars: attrs.bars,
        maxVal: attrs.maxVal,
        barSpacing: attrs.barSpacing ?? 16,
        barRadius: attrs.barRadius ?? 4,
        orientation: attrs.orientation ?? 'vertical',
      };
      const progressTracks = tracksFor(element, 'progress');
      if (progressTracks.length) {
        const bars = Array.isArray(attrs.bars)
          ? attrs.bars
          : [
              { id: 'a', label: 'Q1', value: 45, color: '#38bdf8' },
              { id: 'b', label: 'Q2', value: 78, color: '#22d3ee' },
              { id: 'c', label: 'Q3', value: 62, color: '#818cf8' },
              { id: 'd', label: 'Q4', value: 95, color: '#c084fc' },
            ];
        const max = Number(
          attrs.maxVal ?? Math.max(1, ...bars.map((bar: any) => Number(bar.value) || 0)),
        );
        const vertical = options.orientation !== 'horizontal';
        const extent = Number(vertical ? options.height : options.width);
        const count = bars.length;
        const spacing = Number(options.barSpacing);
        const thickness = Math.max(
          8,
          ((vertical ? Number(options.width) : Number(options.height)) -
            spacing * Math.max(0, count - 1)) /
            Math.max(1, count),
        );
        bars.forEach((bar: any, index: number) => {
          const length = Math.max(
            4,
            Math.round((Number(bar.value) / max) * extent),
          );
          const baseline = vertical ? Number(options.height) : 0;
          const barId = `${rootId}-bar-${index}`;
          const asLength = (value: number | string) =>
            (length * Math.max(0, Math.min(100, Number(value)))) / 100;
          const lengthTracks = progressTracks.map((track) =>
            mappedTrack(
              track,
              vertical ? 'height' : 'width',
              'Progress',
              asLength,
            ),
          );
          const positionTracks = vertical
            ? progressTracks.map((track) =>
                mappedTrack(track, 'y', 'Progress position', (value) =>
                  baseline - asLength(value),
                ),
              )
            : progressTracks.map((track) =>
                mappedTrack(track, 'x', 'Progress position', () => 0),
              );
          mappedChildTracks.set(barId, [...lengthTracks, ...positionTracks]);
        });
      }
      passThroughTracks = element.tracks.filter((track) =>
        ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity'].includes(
          track.property,
        ),
      );
      break;
    }
    case 'kinetic-text': {
      recipeId = 'kinetic-text';
      options = {
        ...commonOptions,
        text: attrs.text ?? '',
        fontSize: attrs.fontSize ?? 44,
        fontWeight: attrs.fontWeight ?? 800,
        fontFamily: attrs.fontFamily ?? 'Inter, sans-serif',
        fill: attrs.fill ?? '#ffffff',
        staggerMs: attrs.staggerMs ?? 90,
      };
      const revealTracks = tracksFor(element, 'revealProgress');
      const words = String(attrs.text ?? '').split(/\s+/).filter(Boolean);
      if (revealTracks.length) {
        words.forEach((_word, index) => {
          const wordId = `${rootId}-word-${index}`;
          const wordProgress = (value: number | string) =>
            Math.max(
              0,
              Math.min(
                100,
                (Number(value) - (index * 100) / Math.max(1, words.length)) *
                  Math.max(1, words.length),
              ),
            );
          mappedChildTracks.set(
            wordId,
            revealTracks.flatMap((track) => [
              mappedTrack(track, 'opacity', 'Reveal opacity', (value) =>
                wordProgress(value) / 100,
              ),
              mappedTrack(track, 'y', 'Reveal position', (value) =>
                24 * (1 - wordProgress(value) / 100),
              ),
            ]),
          );
        });
      }
      passThroughTracks = element.tracks.filter((track) =>
        ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity'].includes(
          track.property,
        ),
      );
      break;
    }
    case 'lower-third': {
      recipeId = 'lower-third';
      options = {
        ...commonOptions,
        width: attrs.width ?? 380,
        height: attrs.height ?? 64,
        title: attrs.title ?? attrs.text ?? 'Title',
        subtitle: attrs.subtitle ?? '',
        accentColor: attrs.accentColor ?? '#38bdf8',
        cardBg: attrs.cardBg ?? 'rgba(15, 23, 42, 0.85)',
      };
      const progressTracks = tracksFor(element, 'progress');
      if (progressTracks.length) {
        mappedChildTracks.set(
          `${rootId}-accent`,
          progressTracks.map((track) =>
            mappedTrack(track, 'width', 'Progress', (value) =>
              (4 * Math.max(0, Math.min(100, Number(value)))) / 100,
            ),
          ),
        );
      }
      passThroughTracks = element.tracks.filter((track) =>
        ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity'].includes(
          track.property,
        ),
      );
      break;
    }
    default:
      throw new Error(`Unsupported compound element type "${legacyType}".`);
  }

  const expanded = expandRecipe(recipeId, options, factory);
  const childIdMap = new Map<string, string>();
  const children = expanded.children.map((child) => {
    let childId = child.id;
    let suffix = 1;
    while (occupiedIds.has(childId)) {
      childId = `${child.id}-migrated-${suffix}`;
      suffix += 1;
    }
    occupiedIds.add(childId);
    childIdMap.set(child.id, childId);
    const mappedTracks = mappedChildTracks.get(child.id) ?? [];
    const role = child.id.slice(rootId.length + 1);
    const progress = Math.max(
      0,
      Math.min(100, Number(attrs.progress ?? 100)),
    ) / 100;
    const childAttributes = { ...child.attributes };
    if (legacyType === 'counter' && role === 'value') {
      childAttributes.text = formatCounterValue(
        attrs.counterValue ?? attrs.endVal ?? 0,
        attrs,
      );
    } else if (legacyType === 'progress-ring') {
      if (role === 'indicator') {
        const circumference =
          2 * Math.PI * Number(options.radius ?? options.r ?? 40);
        childAttributes.strokeDashoffset =
          circumference * (1 - Number(options.progress ?? 0) / 100);
      } else if (role === 'label') {
        childAttributes.text = `${Math.round(Number(options.progress ?? 0))}%`;
        childAttributes.fontSize = attrs.fontSize ?? 24;
        childAttributes.fontWeight = attrs.fontWeight ?? 600;
        childAttributes.fill = attrs.fill ?? '#f8fafc';
      }
    } else if (
      legacyType === 'bar-chart' &&
      /^bar-\d+$/.test(role)
    ) {
      const index = Number(role.slice('bar-'.length));
      const bars = Array.isArray(options.bars) ? options.bars : [];
      const bar = bars[index];
      const max = Number(
        options.maxVal ??
          Math.max(1, ...bars.map((item: any) => Number(item.value) || 0)),
      );
      const vertical = options.orientation !== 'horizontal';
      const extent = Number(vertical ? options.height : options.width);
      const spacing = Number(options.barSpacing ?? 16);
      const chartExtent = Number(vertical ? options.width : options.height);
      const thickness = Math.max(
        4,
        (chartExtent - spacing * Math.max(0, bars.length - 1)) /
          Math.max(1, bars.length),
      );
      const length = extent * (Number(bar?.value ?? 0) / max);
      if (vertical) {
        childAttributes.x = index * (thickness + spacing);
        childAttributes.y = extent - length * progress;
        childAttributes.width = thickness;
        childAttributes.height = length * progress;
      } else {
        childAttributes.x = 0;
        childAttributes.y = index * (thickness + spacing);
        childAttributes.width = length * progress;
        childAttributes.height = thickness;
      }
    } else if (
      legacyType === 'bar-chart' &&
      role.startsWith('label-')
    ) {
      child.visible = false;
    } else if (legacyType === 'counter' && role === 'caption') {
      const fontSize = Number(attrs.fontSize ?? 48);
      childAttributes.y = fontSize + 8;
      childAttributes.dominantBaseline = 'middle';
      child.origin = { x: 0, y: fontSize + 8 };
    } else if (legacyType === 'lower-third' && child.id === `${rootId}-accent`) {
      childAttributes.width = 4 * progress;
    } else if (
      legacyType === 'lower-third' &&
      child.id === `${rootId}-card`
    ) {
      childAttributes.rx = 10;
    } else if (legacyType === 'kinetic-text' && role.startsWith('word-')) {
      const wordIndex = Number(role.slice('word-'.length));
      const wordCount = Math.max(
        1,
        String(attrs.text ?? '').split(/\s+/).filter(Boolean).length,
      );
      const reveal = Math.max(
        0,
        Math.min(
          100,
          (Number(attrs.revealProgress ?? 100) -
            (wordIndex * 100) / wordCount) *
            wordCount,
        ),
      );
      childAttributes.opacity = reveal / 100;
      childAttributes.y = 24 * (1 - reveal / 100);
    }

    return {
      ...child,
      id: childId,
      parentId: rootId,
      attributes: childAttributes,
      tracks: mappedTracks,
    };
  });
  const root = copyRootMetadata(
    element,
    expanded.root,
    children.map((child) => child.id),
    passThroughTracks,
  );
  root.childrenIds = [
    ...(expanded.root.childrenIds ?? []).map(
      (id) => childIdMap.get(id) ?? id,
    ),
    ...(element.childrenIds ?? []),
  ];
  return [root, ...children];
}

function migrateShape(element: LegacyElement): TraceElement {
  const attributes = { ...element.attributes };
  const kind = String(attributes.shapeKind ?? element.type);
  if (kind === 'star') {
    const width = Number(attributes.width ?? 100);
    const height = Number(attributes.height ?? width);
    const radius = Number(attributes.radius ?? width / 2);
    const points = legacyStarPoints(radius, Number(attributes.starRatio ?? 0.5))
      .split(' ')
      .map((point) => {
        const [x, y] = point.split(',').map(Number);
        return `${x + width / 2},${y + height / 2}`;
      })
      .join(' ');
    attributes.points = points;
    delete attributes.shapeKind;
    delete attributes.starRatio;
    delete attributes.radius;
    return { ...element, type: 'polygon', attributes };
  }
  delete attributes.shapeKind;
  const primitiveTypes = new Set([
    'rect',
    'circle',
    'ellipse',
    'line',
    'polyline',
    'polygon',
    'path',
    'text',
    'image',
    'use',
    'group',
  ]);
  return {
    ...element,
    type: (primitiveTypes.has(kind) ? kind : 'rect') as TraceElementType,
    attributes,
  };
}

function migrateSplineTracer(element: LegacyElement): TraceElement {
  const attributes = { ...element.attributes };
  const radius = Number(attributes.r ?? attributes.radius ?? 5);
  attributes.radius = radius;
  attributes.cx = 0;
  attributes.cy = 0;
  attributes.width = radius * 2;
  attributes.height = radius * 2;
  delete attributes.r;
  delete attributes.tracerGlow;
  return { ...element, type: 'circle', attributes };
}

/**
 * Expand legacy macro elements while keeping their ids and parent/root slots.
 * A second invocation returns the same object without allocating.
 */
export function migrateTraceStage(input: TraceStageInput): TraceStage {
  const legacyElements = Object.values(input.elements ?? {})
    .filter(isLegacy)
    .map((element) => element as LegacyElement);

  // Nothing to expand: return the same object so callers can treat migration
  // as a no-op and a second pass as idempotent.
  if (legacyElements.length === 0) return input as TraceStage;

  const project: TraceStage = {
    artboardId: TRACE_DEFAULT_ARTBOARD_ID,
    animationId: TRACE_DEFAULT_ANIMATION_ID,
    ...input,
  };

  const elements: Record<string, TraceElement> = { ...project.elements };
  const occupiedIds = new Set(Object.keys(project.elements));
  for (const element of legacyElements) {
    const legacyType = String(element.type);
    const migrated =
      legacyType === 'shape' || legacyType === 'star'
        ? [migrateShape(element)]
        : legacyType === 'spline-tracer'
          ? [migrateSplineTracer(element)]
          : expandCompound(element, occupiedIds);
    for (const item of migrated) elements[item.id] = item;
  }

  return { ...project, elements };
}

/* ── Document v2 ─────────────────────────────────────────────────────────────
 *
 * v2 nests element graphs inside artboards and keyframes inside named
 * animations. Migration is a read normalization: it never mutates its input,
 * only copies the branches it changes, and it returns the same reference on a
 * second call so callers can cheaply check "did this change?".
 *
 * Order matters: legacy compound elements expand first, because expansion
 * creates tracks that then need an `animationId` like every other track.
 */

export { TRACE_DEFAULT_ANIMATION_ID, TRACE_DEFAULT_ARTBOARD_ID } from './schema';
const MOTION_TRACK_SUFFIX = '__motion';

export type TraceMigration = {
  project: TraceDocument;
  changed: boolean;
  from: 1 | 2;
};

function hasMotionPath(attributes: Record<string, unknown>): boolean {
  return (
    typeof attributes.motionPathData === 'string' &&
    attributes.motionPathData.length > 0
  );
}

function hasTextPathTarget(attributes: Record<string, unknown>): boolean {
  return typeof attributes.textPathTargetId === 'string';
}

/**
 * Stamp every track with the animation that owns it, and split the overloaded
 * `pathProgress` property:
 *
 * - no motion path          → stays `pathProgress` (text-on-path offset)
 * - motion path only        → renamed to `motionPathProgress`, id kept
 * - motion path + text path → `pathProgress` kept, plus a `__motion` duplicate
 *
 * Idempotent because an element that already owns a `motionPathProgress` track
 * is left alone.
 */
function retagElementTracks(
  element: TraceElement,
  animationId: string,
): TraceElement {
  const tracks = element.tracks ?? [];
  if (tracks.length === 0) return element;

  const attributes = (element.attributes ?? {}) as Record<string, unknown>;
  const followsPath = hasMotionPath(attributes);
  const hasTextOffset = hasTextPathTarget(attributes);
  const alreadySplit = tracks.some(
    (track) => track.property === 'motionPathProgress',
  );

  let changed = false;
  const nextTracks: PropertyTrack[] = [];

  for (const track of tracks) {
    let next: PropertyTrack = track;

    if (!track.animationId) {
      next = { ...next, animationId };
      changed = true;
    }

    if (next.property === 'pathProgress' && followsPath && !alreadySplit) {
      if (hasTextOffset) {
        nextTracks.push(next);
        nextTracks.push({
          ...next,
          id: `${next.id}${MOTION_TRACK_SUFFIX}`,
          property: 'motionPathProgress',
        });
        changed = true;
        continue;
      }
      next = { ...next, property: 'motionPathProgress' };
      changed = true;
    }

    nextTracks.push(next);
  }

  return changed ? { ...element, tracks: nextTracks } : element;
}

function normalizeArtboard(artboard: TraceArtboard): TraceArtboard {
  let changed = false;

  let animations: TraceAnimation[] = Array.isArray(artboard.animations)
    ? artboard.animations
    : [];
  if (animations.length === 0) {
    animations = [
      {
        id: TRACE_DEFAULT_ANIMATION_ID,
        name: 'Animation 1',
        durationMs: TRACE_DEFAULT_DURATION_MS,
        loop: 'loop',
      },
    ];
    changed = true;
  }

  const animationIds = new Set(animations.map((animation) => animation.id));
  let defaultAnimationId = artboard.defaultAnimationId;
  if (!animationIds.has(defaultAnimationId)) {
    defaultAnimationId = animations[0].id;
    changed = true;
  }

  const animationOrder = Array.isArray(artboard.animationOrder)
    ? artboard.animationOrder.filter((id) => animationIds.has(id))
    : [];
  for (const animation of animations) {
    if (!animationOrder.includes(animation.id)) animationOrder.push(animation.id);
  }
  const previousOrder = artboard.animationOrder ?? [];
  if (
    animationOrder.length !== previousOrder.length ||
    animationOrder.some((id, index) => id !== previousOrder[index])
  ) {
    changed = true;
  }

  const elements: Record<string, TraceElement> = {};
  for (const [id, element] of Object.entries(artboard.elements ?? {})) {
    const next = retagElementTracks(element, defaultAnimationId);
    if (next !== element) changed = true;
    elements[id] = next;
  }

  if (!changed) return artboard;

  return {
    ...artboard,
    elements,
    animations,
    animationOrder,
    defaultAnimationId,
  };
}

function normalizeV2Document(document: TraceDocument): TraceMigration {
  const artboards: Record<string, TraceArtboard> = {};
  let changed = false;

  for (const [id, artboard] of Object.entries(document.artboards)) {
    const next = normalizeArtboard(artboard);
    if (next !== artboard) changed = true;
    artboards[id] = next;
  }

  const known = new Set(Object.keys(artboards));
  const order = (document.artboardOrder ?? []).filter((id) => known.has(id));
  for (const id of known) {
    if (!order.includes(id)) order.push(id);
  }
  if (order.length === 0) {
    throw new TraceSchemaInvalidError(
      'A Nova Trace document needs at least one artboard.',
    );
  }

  const previousOrder = document.artboardOrder ?? [];
  if (
    order.length !== previousOrder.length ||
    order.some((id, index) => id !== previousOrder[index])
  ) {
    changed = true;
  }

  const activeArtboardId = known.has(document.activeArtboardId)
    ? document.activeArtboardId
    : order[0];
  if (activeArtboardId !== document.activeArtboardId) changed = true;

  if (!changed) return { project: document, changed: false, from: 2 };

  return {
    project: { ...document, artboards, artboardOrder: order, activeArtboardId },
    changed: true,
    from: 2,
  };
}

function migrateV1(input: TraceStage): TraceMigration {
  const expanded = migrateTraceStage(input);
  const storyboard = ensureStoryboard(expanded);
  const activeScene =
    storyboard.scenes.find((scene) => scene.id === storyboard.activeSceneId) ??
    storyboard.scenes[0];

  const width = Math.max(1, Math.round(Number(expanded.width) || 1280));
  const height = Math.max(1, Math.round(Number(expanded.height) || 720));
  const fps = Math.max(1, Math.round(Number(expanded.fps) || TRACE_DEFAULT_FPS));
  const durationMs = Math.max(
    1,
    Math.round(Number(expanded.durationMs) || TRACE_DEFAULT_DURATION_MS),
  );

  const animation: TraceAnimation = {
    id: TRACE_DEFAULT_ANIMATION_ID,
    name: 'Animation 1',
    durationMs,
    loop: 'loop',
  };

  const elements: Record<string, TraceElement> = {};
  for (const [id, element] of Object.entries(expanded.elements ?? {})) {
    elements[id] = retagElementTracks(element, animation.id);
  }

  const artboard: TraceArtboard = {
    id: TRACE_DEFAULT_ARTBOARD_ID,
    name: 'Artboard 1',
    width,
    height,
    ...(activeScene?.background ? { background: activeScene.background } : {}),
    elements,
    rootElementIds: [...(expanded.rootElementIds ?? [])],
    ...(expanded.defs ? { defs: expanded.defs } : {}),
    ...(expanded.gradients ? { gradients: expanded.gradients } : {}),
    animations: [animation],
    animationOrder: [animation.id],
    defaultAnimationId: animation.id,
  };

  // Copy the root so unknown fields written by a newer minor version survive.
  const rest: Record<string, unknown> = {
    ...(expanded as unknown as Record<string, unknown>),
  };
  delete rest.elements;
  delete rest.rootElementIds;
  delete rest.defs;
  delete rest.gradients;
  delete rest.schemaVersion;

  const project = {
    ...rest,
    id: expanded.id,
    schemaVersion: 2,
    name: expanded.name,
    width,
    height,
    durationMs,
    fps,
    storyboard,
    artboards: { [artboard.id]: artboard },
    artboardOrder: [artboard.id],
    activeArtboardId: artboard.id,
  } as unknown as TraceDocument;

  return { project, changed: true, from: 1 };
}

/**
 * Convert any Trace document — v1, v2, or already normalized — into v2.
 *
 * - missing `schemaVersion` → v1, migrated
 * - `schemaVersion: 2` → repaired if needed, otherwise returned by reference
 * - `schemaVersion > 2` → `TraceSchemaNewerError`, never partially migrated
 */
export function migrateTraceDocument(input: unknown): TraceMigration {
  const version = readTraceSchemaVersion(input);
  if (version > TRACE_SCHEMA_VERSION) throw new TraceSchemaNewerError(version);

  if (!input || typeof input !== 'object') {
    throw new TraceSchemaInvalidError('A Nova Trace document must be an object.');
  }

  if (version >= TRACE_SCHEMA_VERSION) {
    if (!isTraceDocument(input)) {
      throw new TraceSchemaInvalidError(
        'This Nova Trace document claims schema 2 but has no artboards.',
      );
    }
    return normalizeV2Document(input);
  }

  return migrateV1(input as TraceStage);
}
