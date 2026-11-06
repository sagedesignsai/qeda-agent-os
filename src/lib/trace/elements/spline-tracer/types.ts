import type { BaseTraceElement } from '../core/base-element';

export interface SplineTracerAttributes {
  /** Particle orb radius in pixels */
  r?: number;
  /** Fill color of the tracer particle */
  fill?: string;
  /** Master opacity (0..1) */
  opacity?: number;
  /** Whether to render a neon glow aura filter */
  tracerGlow?: boolean;
  /** Target SVG path element ID to traverse along */
  motionPathTargetId?: string;
  /** Direct SVG bezier path data if not referencing another element */
  motionPathData?: string;
  /** Automatically orient rotation tangent to the path curve */
  autoRotate?: boolean;
  /** Anchor origin offset along the path, default [0.5, 0.5] */
  alignOrigin?: [number, number];
  /** Comet tail length factor (0 = single orb, 1..5 = tail) */
  tailLength?: number;
  [key: string]: any;
}

export interface SplineTracerElement extends BaseTraceElement {
  type: 'spline-tracer';
  attributes: SplineTracerAttributes;
}
