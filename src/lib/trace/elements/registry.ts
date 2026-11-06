/**
 * lib/trace/elements/registry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The single source of truth for what a Trace layer is, what it can animate,
 * and how each property should be edited.
 *
 * Pure metadata: the stage renderer, timeline, inspector, add-track menus and
 * the copilot all read from here, so a new animatable property only has to be
 * declared once.
 */

import type {
  AnimatableProperty,
  TraceElement,
  TraceElementType,
} from '../types';

export type PropertyGroup =
  'transform' | 'appearance' | 'geometry' | 'text' | 'content';

export type PropertyKind =
  'number' | 'percent' | 'color' | 'text' | 'boolean' | 'select' | 'borderRadius' | 'strokeDash' | 'boxShadow' | 'progress';

export interface PropertyDescriptor {
  property: AnimatableProperty;
  label: string;
  group: PropertyGroup;
  kind: PropertyKind;
  step?: number;
  min?: number;
  max?: number;
  /** Attribute holding the static value when no track animates the property. */
  attribute?: string;
  options?: Array<{ label: string; value: string }>;
}

export interface ElementDescriptor {
  type: TraceElementType;
  label: string;
  /** Default size used for selection boxes and new elements. */
  defaultWidth: number;
  defaultHeight: number;
  properties: PropertyDescriptor[];
}

const TRANSFORM: PropertyDescriptor[] = [
  {
    property: 'x',
    label: 'X',
    group: 'transform',
    kind: 'number',
    step: 1,
    attribute: 'x',
  },
  {
    property: 'y',
    label: 'Y',
    group: 'transform',
    kind: 'number',
    step: 1,
    attribute: 'y',
  },
  {
    property: 'rotation',
    label: 'Rotation',
    group: 'transform',
    kind: 'number',
    step: 1,
    attribute: 'rotation',
  },
  {
    property: 'scaleX',
    label: 'Scale X',
    group: 'transform',
    kind: 'number',
    step: 0.01,
    attribute: 'scaleX',
  },
  {
    property: 'scaleY',
    label: 'Scale Y',
    group: 'transform',
    kind: 'number',
    step: 0.01,
    attribute: 'scaleY',
  },
  {
    property: 'opacity',
    label: 'Opacity',
    group: 'appearance',
    kind: 'percent',
    step: 0.01,
    min: 0,
    max: 1,
    attribute: 'opacity',
  },
];

const PAINT: PropertyDescriptor[] = [
  {
    property: 'fill',
    label: 'Fill',
    group: 'appearance',
    kind: 'color',
    attribute: 'fill',
  },
  {
    property: 'fillOpacity',
    label: 'Fill opacity',
    group: 'appearance',
    kind: 'percent',
    step: 0.01,
    min: 0,
    max: 1,
    attribute: 'fillOpacity',
  },
  {
    property: 'stroke',
    label: 'Stroke',
    group: 'appearance',
    kind: 'color',
    attribute: 'stroke',
  },
  {
    property: 'strokeWidth',
    label: 'Stroke width',
    group: 'appearance',
    kind: 'number',
    step: 0.5,
    min: 0,
    attribute: 'strokeWidth',
  },
  {
    property: 'strokeDasharray',
    label: 'Stroke dash',
    group: 'appearance',
    kind: 'strokeDash',
    attribute: 'strokeDasharray',
  },
  {
    property: 'strokeDashoffset',
    label: 'Stroke dash offset',
    group: 'appearance',
    kind: 'number',
    step: 1,
    attribute: 'strokeDashoffset',
  },
];

const GEOMETRY: PropertyDescriptor[] = [
  {
    property: 'width',
    label: 'Width',
    group: 'geometry',
    kind: 'number',
    step: 1,
    min: 0,
    attribute: 'width',
  },
  {
    property: 'height',
    label: 'Height',
    group: 'geometry',
    kind: 'number',
    step: 1,
    min: 0,
    attribute: 'height',
  },
  {
    property: 'rx',
    label: 'Corner radius',
    group: 'geometry',
    kind: 'borderRadius',
    step: 1,
    min: 0,
    attribute: 'rx',
  },
];

const TRIM: PropertyDescriptor[] = [
  {
    property: 'trimStart',
    label: 'Trim start',
    group: 'geometry',
    kind: 'percent',
    step: 1,
    min: 0,
    max: 100,
    attribute: 'trimStart',
  },
  {
    property: 'trimEnd',
    label: 'Trim end',
    group: 'geometry',
    kind: 'percent',
    step: 1,
    min: 0,
    max: 100,
    attribute: 'trimEnd',
  },
  {
    property: 'trimOffset',
    label: 'Trim offset',
    group: 'geometry',
    kind: 'percent',
    step: 1,
    min: -100,
    max: 100,
    attribute: 'trimOffset',
  },
  {
    property: 'pathProgress',
    label: 'Path progress',
    group: 'geometry',
    kind: 'progress',
    step: 1,
    min: 0,
    max: 100,
    attribute: 'pathProgress',
  },
  {
    property: 'morphProgress',
    label: 'Morph progress',
    group: 'geometry',
    kind: 'progress',
    step: 1,
    min: 0,
    max: 100,
    attribute: 'morphProgress',
  },
];

const TEXT_PROPS: PropertyDescriptor[] = [
  {
    property: 'text',
    label: 'Text',
    group: 'text',
    kind: 'text',
    attribute: 'text',
  },
  {
    property: 'fontSize',
    label: 'Font size',
    group: 'text',
    kind: 'number',
    step: 1,
    min: 1,
    attribute: 'fontSize',
  },
  {
    property: 'letterSpacing',
    label: 'Tracking',
    group: 'text',
    kind: 'number',
    step: 0.5,
    attribute: 'letterSpacing',
  },
  {
    property: 'color',
    label: 'Text color',
    group: 'text',
    kind: 'color',
    attribute: 'color',
  },
];

const LINE_COORDS: PropertyDescriptor[] = [
  {
    property: 'x1',
    label: 'X1',
    group: 'geometry',
    kind: 'number',
    step: 1,
    attribute: 'x1',
  },
  {
    property: 'y1',
    label: 'Y1',
    group: 'geometry',
    kind: 'number',
    step: 1,
    attribute: 'y1',
  },
  {
    property: 'x2',
    label: 'X2',
    group: 'geometry',
    kind: 'number',
    step: 1,
    attribute: 'x2',
  },
  {
    property: 'y2',
    label: 'Y2',
    group: 'geometry',
    kind: 'number',
    step: 1,
    attribute: 'y2',
  },
];

const POLY_PROPS: PropertyDescriptor[] = [
  {
    property: 'points',
    label: 'Points',
    group: 'geometry',
    kind: 'text',
    attribute: 'points',
  },
];


export const ELEMENT_DESCRIPTORS: Record<TraceElementType, ElementDescriptor> =
  {
    text: {
      type: 'text',
      label: 'Text',
      defaultWidth: 320,
      defaultHeight: 80,
      properties: [...TRANSFORM, ...TEXT_PROPS, ...PAINT, {
        property: 'boxShadow',
        label: 'Drop shadow',
        group: 'appearance',
        kind: 'boxShadow',
        attribute: 'boxShadow',
      }, {
        property: 'borderRadius',
        label: 'Border radius',
        group: 'geometry',
        kind: 'borderRadius',
        step: 1,
        min: 0,
        attribute: 'borderRadius',
      }],
    },
    rect: {
      type: 'rect',
      label: 'Rectangle',
      defaultWidth: 240,
      defaultHeight: 160,
      properties: [...TRANSFORM, ...GEOMETRY, ...PAINT, {
        property: 'boxShadow',
        label: 'Drop shadow',
        group: 'appearance',
        kind: 'boxShadow',
        attribute: 'boxShadow',
      }, {
        property: 'borderRadius',
        label: 'Border radius',
        group: 'geometry',
        kind: 'borderRadius',
        step: 1,
        min: 0,
        attribute: 'borderRadius',
      }, {
        property: 'backgroundColor',
        label: 'Background',
        group: 'appearance',
        kind: 'color',
        attribute: 'backgroundColor',
      }, {
        property: 'borderColor',
        label: 'Border color',
        group: 'appearance',
        kind: 'color',
        attribute: 'borderColor',
      }],
    },
    circle: {
      type: 'circle',
      label: 'Circle',
      defaultWidth: 160,
      defaultHeight: 160,
      properties: [...TRANSFORM, ...GEOMETRY, ...PAINT],
    },
    ellipse: {
      type: 'ellipse',
      label: 'Ellipse',
      defaultWidth: 160,
      defaultHeight: 100,
      properties: [...TRANSFORM, ...GEOMETRY, ...PAINT],
    },
    line: {
      type: 'line',
      label: 'Line',
      defaultWidth: 160,
      defaultHeight: 2,
      properties: [...TRANSFORM, ...LINE_COORDS, ...PAINT],
    },
    polyline: {
      type: 'polyline',
      label: 'Polyline',
      defaultWidth: 160,
      defaultHeight: 160,
      properties: [...TRANSFORM, ...POLY_PROPS, ...PAINT],
    },
    polygon: {
      type: 'polygon',
      label: 'Polygon',
      defaultWidth: 160,
      defaultHeight: 160,
      properties: [...TRANSFORM, ...POLY_PROPS, ...PAINT],
    },
    path: {
      type: 'path',
      label: 'Vector path',
      defaultWidth: 240,
      defaultHeight: 120,
      properties: [...TRANSFORM, ...TRIM, ...PAINT],
    },
    image: {
      type: 'image',
      label: 'Image',
      defaultWidth: 200,
      defaultHeight: 200,
      properties: [...TRANSFORM, ...GEOMETRY],
    },
    use: {
      type: 'use',
      label: 'Use / instance',
      defaultWidth: 24,
      defaultHeight: 24,
      properties: [...TRANSFORM],
    },
    group: {
      type: 'group',
      label: 'Group',
      defaultWidth: 300,
      defaultHeight: 200,
      properties: [...TRANSFORM],
    },
  };

export function getElementDescriptor(
  type: TraceElementType,
): ElementDescriptor {
  return ELEMENT_DESCRIPTORS[type] ?? ELEMENT_DESCRIPTORS.rect;
}

export function getAnimatableProperties(
  type: TraceElementType,
): PropertyDescriptor[] {
  return getElementDescriptor(type).properties;
}

export function getPropertyDescriptor(
  type: TraceElementType,
  property: AnimatableProperty,
): PropertyDescriptor | undefined {
  return getAnimatableProperties(type).find(
    (entry) => entry.property === property,
  );
}

export const TRACK_LABELS: Record<string, string> = Object.values(
  ELEMENT_DESCRIPTORS,
)
  .flatMap((descriptor) => descriptor.properties)
  .reduce<Record<string, string>>((labels, property) => {
    labels[property.property] = property.label;
    return labels;
  }, {});

/** Value used when a track is created for the first time. */
export function defaultValueForProperty(
  element: TraceElement,
  property: AnimatableProperty,
): number | string {
  const animated = element.tracks?.find((track) => track.property === property);
  const last = animated?.keyframes[animated.keyframes.length - 1]?.value;
  if (last !== undefined) return last;

  const descriptor = getPropertyDescriptor(element.type, property);
  const attribute = descriptor?.attribute ?? property;
  const raw = element.attributes?.[attribute];
  if (raw !== undefined && raw !== null) return raw;

  switch (property) {
    case 'scaleX':
    case 'scaleY':
    case 'opacity':
    case 'fillOpacity':
      return 1;
    case 'trimEnd':
    case 'fill':
      return element.attributes?.fill ?? '#ffffff';
    case 'stroke':
      return element.attributes?.stroke ?? '#38bdf8';
    default:
      return 0;
  }
}

/** Static (untracked) value for a property at authoring time. */
export function baseValueForProperty(
  element: TraceElement,
  property: AnimatableProperty,
): number | string {
  const descriptor = getPropertyDescriptor(element.type, property);
  const attribute = descriptor?.attribute ?? property;
  const value = element.attributes?.[attribute];
  return value !== undefined && value !== null
    ? value
    : defaultValueForProperty(element, property);
}

export const ADDABLE_ELEMENT_TYPES: TraceElementType[] = [
  'text',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'path',
  'image',
  'use',
  'group',
];
