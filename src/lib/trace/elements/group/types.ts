import type { BaseTraceElement } from '../core/base-element';

export interface GroupAttributes {
  /** Array of child element IDs nested inside this group */
  childrenIds?: string[];
  /** Enforces CSS isolation to contain blend modes and filters */
  isolate?: boolean;
  /** Master opacity of the container group (0..1) */
  opacity?: number;
  /** SVG filter definition or drop-shadow effect */
  filter?: string;
  /** SVG mask reference, e.g. `url(#mask-id)`. */
  mask?: string;
  /** SVG clip path reference, e.g. `url(#clip-id)`. */
  clipPath?: string;
  /** Translation offset X */
  x?: number;
  /** Translation offset Y */
  y?: number;
  /** Baseline layout position X */
  baseX?: number;
  /** Baseline layout position Y */
  baseY?: number;
  /** Horizontal scale multiplier */
  scaleX?: number;
  /** Vertical scale multiplier */
  scaleY?: number;
  /** Rotation angle in degrees */
  rotation?: number;
  [key: string]: any;
}

export interface GroupElement extends BaseTraceElement {
  type: 'group';
  attributes: GroupAttributes;
  childrenIds?: string[];
}
