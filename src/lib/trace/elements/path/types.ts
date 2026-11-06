import type { BaseTraceElement } from '../core/base-element';
import type { StrokeLinecap, StrokeLinejoin } from '../shape/types';

export interface PathAttributes {
  /** SVG Path data commands (M, C, S, Q, T, A, L, H, V, Z) */
  d: string;
  /** Whether the path is explicitly closed with a Z command */
  closed?: boolean;

  /** Positioning coordinates */
  baseX?: number;
  baseY?: number;
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;

  /** Stroke styling */
  stroke?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  strokeLinecap?: StrokeLinecap;
  strokeLinejoin?: StrokeLinejoin;
  strokeMiterlimit?: number;
  strokeDasharray?: string;
  strokeDashoffset?: number;

  /** Fill styling */
  fill?: string;
  fillOpacity?: number;
  fillRule?: 'nonzero' | 'evenodd';

  /** Layer opacity & filters */
  opacity?: number;
  filter?: string;
  /** SVG mask reference, e.g. `url(#mask-id)`. */
  mask?: string;
  /** SVG clip path reference, e.g. `url(#clip-id)`. */
  clipPath?: string;

  /** Trim Paths Engine (AE & DrawSVG style 0..100%) */
  trimStart?: number;
  trimEnd?: number;
  trimOffset?: number;

  /** MotionPath guide layer: visible on canvas, hidden on production export */
  isGuide?: boolean;
  motionPathTargetId?: string;
  autoRotate?: boolean;
  alignOrigin?: [number, number];

  /** Morph engine: target path data + interpolation progress (0..100%) */
  morphTargetD?: string;
  morphProgress?: number;
  [key: string]: any;
}

export interface PathElement extends BaseTraceElement {
  type: 'path';
  attributes: PathAttributes;
}
