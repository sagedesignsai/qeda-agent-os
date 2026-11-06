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
  TraceElement,
  TraceElementType,
} from '../types';
import { starPoints } from '../serialize/svg-markup';

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
  ry?: number;
  starRatio?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  rx?: number;
  points?: string;
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

export interface LineSpec extends PositionedSpec {
  type: 'line';
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

export interface PolylineSpec extends PositionedSpec {
  type: 'polyline';
  points?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

export interface ImageSpec extends PositionedSpec {
  type: 'image';
  href?: string;
  width?: number;
  height?: number;
  preserveAspectRatio?: string;
  opacity?: number;
}

export interface UseSpec extends PositionedSpec {
  type: 'use';
  href?: string;
  width?: number;
  height?: number;
  opacity?: number;
}

export type TraceElementSpec =
  | TextSpec
  | ShapeSpec
  | PathSpec
  | GroupSpec
  | LineSpec
  | PolylineSpec
  | ImageSpec
  | UseSpec;

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
    case 'star': {
      const x = spec.x ?? 0;
      const y = spec.y ?? 0;
      const w = spec.width ?? 160;
      const h = spec.height ?? w;
      const radius = spec.radius ?? w / 2;
      const starRatio = spec.starRatio ?? 0.5;
      const points = starPoints(radius, starRatio)
        .split(' ')
        .map((point) => {
          const [pointX, pointY] = point.split(',').map(Number);
          return `${pointX + w / 2},${pointY + h / 2}`;
        })
        .join(' ');
      return withScene(
        {
          id,
          name: spec.name ?? 'Star',
          type: 'polygon' as TraceElementType,
          visible,
          locked,
          origin: { x, y },
          attributes: {
            x,
            y,
            width: w,
            height: h,
            points,
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
    case 'rect':
    case 'circle':
    case 'ellipse':
    case 'polygon': {
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
            ry: spec.ry,
            ...(spec.points ? { points: spec.points } : {}),
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
    case 'line': {
      const x = spec.x ?? 0;
      const y = spec.y ?? 0;
      return withScene(
        {
          id,
          name: spec.name ?? 'Line',
          type: 'line' as TraceElementType,
          visible,
          locked,
          origin: { x, y },
          attributes: {
            x,
            y,
            x1: spec.x1 ?? 0,
            y1: spec.y1 ?? 0,
            x2: spec.x2 ?? 200,
            y2: spec.y2 ?? 0,
            stroke: spec.stroke ?? '#38bdf8',
            strokeWidth: spec.strokeWidth ?? 2,
            opacity: spec.opacity ?? 1,
          },
          tracks: [],
        },
        spec,
      );
    }
    case 'polyline': {
      const x = spec.x ?? 0;
      const y = spec.y ?? 0;
      return withScene(
        {
          id,
          name: spec.name ?? 'Polyline',
          type: 'polyline' as TraceElementType,
          visible,
          locked,
          origin: { x, y },
          attributes: {
            x,
            y,
            points: spec.points ?? '0,60 60,0 120,60 180,0 240,60',
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
    case 'image': {
      const x = spec.x ?? 0;
      const y = spec.y ?? 0;
      return withScene(
        {
          id,
          name: spec.name ?? 'Image',
          type: 'image' as TraceElementType,
          visible,
          locked,
          origin: { x, y },
          attributes: {
            x,
            y,
            href: spec.href ?? '',
            width: spec.width ?? 240,
            height: spec.height ?? 160,
            preserveAspectRatio: spec.preserveAspectRatio ?? 'xMidYMid meet',
            opacity: spec.opacity ?? 1,
          },
          tracks: [],
        },
        spec,
      );
    }
    case 'use': {
      const x = spec.x ?? 0;
      const y = spec.y ?? 0;
      return withScene(
        {
          id,
          name: spec.name ?? 'Use',
          type: 'use' as TraceElementType,
          visible,
          locked,
          origin: { x, y },
          attributes: {
            x,
            y,
            href: spec.href ?? '',
            width: spec.width ?? 100,
            height: spec.height ?? 100,
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

    default:
      throw new Error('Unsupported element spec type.');
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
