import type { BaseTraceElement } from '../core/base-element';
import type { FillPaintType } from '../../types';

export type ShapeKind = 'rect' | 'circle' | 'ellipse' | 'polygon' | 'star';
export type StrokeLinecap = 'butt' | 'round' | 'square';
export type StrokeLinejoin = 'miter' | 'round' | 'bevel';

export interface ShapeAttributes {
  /** Primitive shape kind: rect, circle, ellipse, polygon, star */
  shapeKind: ShapeKind;
  /** Top-left or base anchor coordinate X */
  baseX?: number;
  x?: number;
  /** Top-left or base anchor coordinate Y */
  baseY?: number;
  y?: number;
  /** Bounding box width in pixels */
  width: number;
  /** Bounding box height in pixels */
  height: number;
  /** Uniform corner radius for rectangles or circles (px) */
  rx?: number;
  /** Secondary vertical corner radius (px) */
  ry?: number;
  /** Optional 4-corner independent radii: [tl, tr, br, bl] */
  corners?: [number, number, number, number];
  /** Number of sides for regular polygons (3 = triangle, 5 = pentagon, ...) */
  polygonSides?: number;
  /** Ratio between inner and outer radius for stars (0.1..0.9) */
  starRatio?: number;
  /** Primary fill color (hex, rgb, or 'none') */
  fill?: string;
  /** Fill transparency 0..1 */
  fillOpacity?: number;
  /** Fill paint type */
  fillPaintType?: FillPaintType;
  /** Outline stroke color */
  stroke?: string;
  /** Outline stroke width in pixels */
  strokeWidth?: number;
  /** Stroke dash pattern string (e.g. '8 4') */
  strokeDasharray?: string;
  /** Stroke dash offset for draw-in animation */
  strokeDashoffset?: number;
  /** Stroke cap style */
  strokeLinecap?: StrokeLinecap;
  /** Stroke corner join style */
  strokeLinejoin?: StrokeLinejoin;
  /** Overall element opacity 0..1 */
  opacity?: number;
  /** Optional SVG filter ID */
  filter?: string;
  [key: string]: any;
}

export interface ShapeElement extends BaseTraceElement {
  type: 'shape';
  attributes: ShapeAttributes;
}
