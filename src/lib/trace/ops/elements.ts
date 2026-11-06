/**
 * lib/trace/ops/elements.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Declarative element specs for `addElement`.
 *
 * Specs are a thin authoring surface over the same attributes the inspectors
 * write. They exist so agents can create layers without hand-building the
 * element graph, and so the copilot, HTTP API and IPC server all produce
 * identical elements.
 *
 * Adapted from sagedesigns-os lib/motion/ops/elements.ts for Nova Trace.
 */

import type {
  BarChartItem,
  KineticTextEffect,
  TraceElement,
  TraceElementType,
} from '../types';

interface SpecBase {
  /** Caller-supplied id. Generated when omitted; always returned by the op. */
  id?: string;
  name?: string;
  /** `null` keeps the element out of any scene. Omitted = active scene. */
  sceneId?: string | null;
  visible?: boolean;
  locked?: boolean;
}

interface PositionedSpec extends SpecBase {
  /** Anchor. Center for text/composites, top-left for shapes. */
  x?: number;
  y?: number;
}

export interface KineticTextSpec extends PositionedSpec {
  type: 'kinetic-text';
  text: string;
  fontSize?: number;
  fontWeight?: number | string;
  fontFamily?: string;
  fill?: string;
  opacity?: number;
  textAnchor?: 'start' | 'middle' | 'end';
  effect?: KineticTextEffect;
  revealProgress?: number;
  letterSpacing?: number;
  staggerMs?: number;
}

export interface LowerThirdSpec extends PositionedSpec {
  type: 'lower-third';
  title: string;
  subtitle?: string;
  badgeText?: string;
  accentColor?: string;
  cardBg?: string;
  width?: number;
  height?: number;
  opacity?: number;
}

export interface CounterSpec extends PositionedSpec {
  type: 'counter';
  /** Optional caption rendered under the number. */
  text?: string;
  startVal?: number;
  endVal?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  fontSize?: number;
  fontWeight?: number | string;
  fill?: string;
  opacity?: number;
}

export interface ProgressRingSpec extends PositionedSpec {
  type: 'progress-ring';
  radius?: number;
  thickness?: number;
  progress?: number;
  progressColor?: string;
  trackColor?: string;
  showPercentageLabel?: boolean;
  fontSize?: number;
  fontWeight?: number | string;
  fill?: string;
  opacity?: number;
}

export interface BarChartSpec extends PositionedSpec {
  type: 'bar-chart';
  bars: BarChartItem[];
  maxVal?: number;
  width?: number;
  height?: number;
  barSpacing?: number;
  barRadius?: number;
  orientation?: 'vertical' | 'horizontal';
  opacity?: number;
}

export interface TextSpec extends PositionedSpec {
  type: 'text';
  text: string;
  fontSize?: number;
  fontWeight?: number | string;
  fontFamily?: string;
  fontStyle?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  textAnchor?: 'start' | 'middle' | 'end';
  opacity?: number;
}

export interface ShapeSpec extends PositionedSpec {
  type: 'rect' | 'circle' | 'ellipse' | 'polygon' | 'star';
  width?: number;
  height?: number;
  radius?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  rx?: number;
}

export interface PathSpec extends PositionedSpec {
  type: 'path';
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  closed?: boolean;
  opacity?: number;
}

export interface GroupSpec extends PositionedSpec {
  type: 'group';
  name?: string;
  childrenIds?: string[];
  opacity?: number;
}

export interface SplineTracerSpec extends SpecBase {
  type: 'spline-tracer';
  name?: string;
  radius?: number;
  fill?: string;
  opacity?: number;
  tracerGlow?: boolean;
  autoRotate?: boolean;
  motionPathTargetId?: string;
  motionPathData?: string;
  pathProgress?: number;
}

export type TraceElementSpec =
  | KineticTextSpec
  | LowerThirdSpec
  | CounterSpec
  | ProgressRingSpec
  | BarChartSpec
  | TextSpec
  | ShapeSpec
  | PathSpec
  | GroupSpec
  | SplineTracerSpec;

function withScene(element: TraceElement, spec: SpecBase): TraceElement {
  return {
    ...element,
    sceneId: spec.sceneId ?? null,
    visible: spec.visible ?? true,
    locked: spec.locked ?? false,
  };
}

export function createElementFromSpec(
  spec: TraceElementSpec,
  id: string,
): TraceElement {
  const { visible = true, locked = false } = spec;

  switch (spec.type) {
    case 'text': {
      const x = spec.x ?? 0;
      const y = spec.y ?? 0;
      return withScene(
        {
          id,
          name: spec.name ?? 'Text',
          type: 'text' as TraceElementType,
          visible,
          locked,
          origin: { x: x, y: y },
          attributes: {
            text: spec.text,
            baseX: x,
            baseY: y,
            fontSize: spec.fontSize ?? 24,
            fontWeight: spec.fontWeight ?? 400,
            fontFamily: spec.fontFamily ?? 'Inter, sans-serif',
            fill: spec.fill ?? '#ffffff',
            stroke: spec.stroke ?? 'none',
            strokeWidth: spec.strokeWidth ?? 0,
            textAnchor: spec.textAnchor ?? 'start',
            opacity: spec.opacity ?? 1,
          },
          tracks: [],
        },
        spec,
      );
    }
    case 'rect':
    case 'circle':
    case 'ellipse':
    case 'polygon':
    case 'star': {
      const x = spec.x ?? 0;
      const y = spec.y ?? 0;
      return withScene(
        {
          id,
          name:
            spec.name ?? spec.type.charAt(0).toUpperCase() + spec.type.slice(1),
          type: spec.type as TraceElementType,
          visible,
          locked,
          origin: { x, y },
          attributes: {
            x,
            y,
            width: spec.width ?? 100,
            height: spec.height ?? 100,
            radius: spec.radius,
            rx: spec.rx,
            fill: spec.fill ?? '#38bdf8',
            stroke: spec.stroke ?? 'none',
            strokeWidth: spec.strokeWidth ?? 0,
            opacity: spec.opacity ?? 1,
          },
          tracks: [],
        },
        spec,
      );
    }
    case 'path': {
      const x = spec.x ?? 0;
      const y = spec.y ?? 0;
      return withScene(
        {
          id,
          name: spec.name ?? 'Vector Path',
          type: 'path' as TraceElementType,
          visible,
          locked,
          origin: { x: 0, y: 0 },
          attributes: {
            d: spec.d,
            closed: spec.closed ?? false,
            x,
            y,
            fill: spec.fill ?? 'none',
            stroke: spec.stroke ?? '#38bdf8',
            strokeWidth: spec.strokeWidth ?? 2,
            opacity: spec.opacity ?? 1,
          },
          tracks: [],
        },
        spec,
      );
    }
    case 'group': {
      const x = spec.x ?? 0;
      const y = spec.y ?? 0;
      const element = {
        id,
        name: spec.name ?? 'Group',
        type: 'group' as TraceElementType,
        visible,
        locked,
        origin: { x, y },
        attributes: {
          x,
          y,
          ...(spec.opacity !== undefined ? { opacity: spec.opacity } : {}),
        },
        tracks: [],
        childrenIds: spec.childrenIds ?? [],
        parentId: undefined,
      };
      return withScene(element, spec);
    }

    case 'spline-tracer': {
      return withScene(
        {
          id,
          name: spec.name ?? 'Spline Tracer',
          type: 'spline-tracer' as TraceElementType,
          visible,
          locked,
          origin: { x: 0, y: 0 },
          attributes: {
            r: spec.radius ?? 5,
            fill: spec.fill ?? '#38bdf8',
            opacity: spec.opacity ?? 1,
            tracerGlow: spec.tracerGlow ?? true,
            autoRotate: spec.autoRotate ?? true,
            alignOrigin: [0.5, 0.5] as [number, number],
            tailLength: 2,
            pathProgress: spec.pathProgress ?? 0,
            ...(spec.motionPathTargetId
              ? { motionPathTargetId: spec.motionPathTargetId }
              : {}),
            ...(spec.motionPathData
              ? { motionPathData: spec.motionPathData }
              : {}),
          },
          tracks: [],
        },
        spec,
      );
    }
    case 'kinetic-text': {
      const x = spec.x ?? 0;
      const y = spec.y ?? 0;
      return withScene(
        {
          id,
          name: spec.name ?? 'Kinetic Text',
          type: 'kinetic-text' as TraceElementType,
          visible,
          locked,
          origin: { x, y },
          attributes: {
            text: spec.text,
            baseX: x,
            baseY: y,
            fontSize: spec.fontSize ?? 44,
            fontWeight: spec.fontWeight ?? 800,
            fontFamily: spec.fontFamily ?? 'Inter, sans-serif',
            fill: spec.fill ?? '#ffffff',
            textAnchor: spec.textAnchor ?? 'start',
            letterSpacing: spec.letterSpacing ?? 0,
            opacity: spec.opacity ?? 1,
            effect: spec.effect ?? 'typewriter',
            revealProgress: spec.revealProgress ?? 0,
            staggerMs: spec.staggerMs ?? 0,
          },
          tracks: [],
        },
        spec,
      );
    }

    case 'lower-third': {
      const x = spec.x ?? 0;
      const y = spec.y ?? 0;
      return withScene(
        {
          id,
          name: spec.name ?? 'Lower Third',
          type: 'lower-third' as TraceElementType,
          visible,
          locked,
          origin: { x, y },
          attributes: {
            title: spec.title,
            subtitle: spec.subtitle ?? '',
            badgeText: spec.badgeText ?? '',
            accentColor: spec.accentColor ?? '#38bdf8',
            cardBg: spec.cardBg ?? 'rgba(15, 23, 42, 0.85)',
            width: spec.width ?? 380,
            height: spec.height ?? 64,
            x,
            y,
            opacity: spec.opacity ?? 1,
          },
          tracks: [],
        },
        spec,
      );
    }
    case 'counter': {
      const x = spec.x ?? 0;
      const y = spec.y ?? 0;
      return withScene(
        {
          id,
          name: spec.name ?? 'Counter',
          type: 'counter' as TraceElementType,
          visible,
          locked,
          origin: { x, y },
          attributes: {
            text: spec.text ?? '',
            startVal: spec.startVal ?? 0,
            endVal: spec.endVal ?? 100,
            prefix: spec.prefix ?? '',
            suffix: spec.suffix ?? '',
            decimals: spec.decimals ?? 0,
            fontSize: spec.fontSize ?? 48,
            fontWeight: spec.fontWeight ?? 800,
            fill: spec.fill ?? '#ffffff',
            opacity: spec.opacity ?? 1,
            counterValue: 0,
          },
          tracks: [],
        },
        spec,
      );
    }

    case 'progress-ring': {
      const x = spec.x ?? 0;
      const y = spec.y ?? 0;
      return withScene(
        {
          id,
          name: spec.name ?? 'Progress Ring',
          type: 'progress-ring' as TraceElementType,
          visible,
          locked,
          origin: { x, y },
          attributes: {
            radius: spec.radius ?? 40,
            thickness: spec.thickness ?? 8,
            progress: spec.progress ?? 0,
            progressColor: spec.progressColor ?? '#38bdf8',
            trackColor: spec.trackColor ?? '#e2e8f0',
            showPercentageLabel: spec.showPercentageLabel ?? true,
            fontSize: spec.fontSize ?? 24,
            fontWeight: spec.fontWeight ?? 600,
            fill: spec.fill ?? '#ffffff',
            opacity: spec.opacity ?? 1,
          },
          tracks: [],
        },
        spec,
      );
    }

    case 'bar-chart': {
      const x = spec.x ?? 0;
      const y = spec.y ?? 0;
      return withScene(
        {
          id,
          name: spec.name ?? 'Bar Chart',
          type: 'bar-chart' as TraceElementType,
          visible,
          locked,
          origin: { x, y },
          attributes: {
            bars: spec.bars,
            maxVal: spec.maxVal,
            width: spec.width ?? 400,
            height: spec.height ?? 300,
            barSpacing: spec.barSpacing ?? 16,
            barRadius: spec.barRadius ?? 4,
            orientation: spec.orientation ?? 'vertical',
            opacity: spec.opacity ?? 1,
          },
          tracks: [],
        },
        spec,
      );
    }

    default: {
      const exhaustive: never = spec;
      throw new Error(`Unknown element spec: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Recipe ids understood by `applyRecipe`. */
export interface RecipeMeta {
  id: string;
  title: string;
  description: string;
}

export const ELEMENT_RECIPES: RecipeMeta[] = [
  {
    id: 'counter',
    title: 'KPI Counter',
    description:
      'Rolling numeric counter with optional prefix/suffix and label.',
  },
  {
    id: 'progress-ring',
    title: 'Progress Ring',
    description: 'Circular gauge with track, indicator and percentage label.',
  },
  {
    id: 'bar-chart',
    title: 'Bar Chart',
    description: 'Vertical or horizontal bar chart with grow-in tracks.',
  },
  {
    id: 'kinetic-text',
    title: 'Kinetic Text',
    description: 'Typewriter or blur-fade headline built from editable glyphs.',
  },
  {
    id: 'lower-third',
    title: 'Lower Third',
    description: 'Broadcast title card with accent bar, title and subtitle.',
  },
];
