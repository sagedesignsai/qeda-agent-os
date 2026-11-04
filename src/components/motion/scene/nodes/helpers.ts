/**
 * components/motion/scene/nodes/helpers.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Prop readers and geometry shared by the node renderers. Values are read with a
 * fallback because documents written before a prop existed do not carry it until
 * the node is next edited.
 */

import { Shape, type Texture } from 'three';

import type { MotionNode } from '@/lib/motion/types';

export function numberProp(node: MotionNode, key: string, fallback: number): number {
  const value = node.props[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function stringProp(node: MotionNode, key: string, fallback: string): string {
  const value = node.props[key];
  return typeof value === 'string' ? value : fallback;
}

export function boolProp(node: MotionNode, key: string, fallback: boolean): boolean {
  const value = node.props[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function roundedRectangle(width: number, height: number, radius: number): Shape {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const shape = new Shape();

  shape.moveTo(-halfWidth + radius, -halfHeight);
  shape.lineTo(halfWidth - radius, -halfHeight);
  shape.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + radius);
  shape.lineTo(halfWidth, halfHeight - radius);
  shape.quadraticCurveTo(halfWidth, halfHeight, halfWidth - radius, halfHeight);
  shape.lineTo(-halfWidth + radius, halfHeight);
  shape.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - radius);
  shape.lineTo(-halfWidth, -halfHeight + radius);
  shape.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + radius, -halfHeight);
  return shape;
}

/**
 * Plane size for a media surface. `contain` shrinks the plane to the media's
 * aspect; `cover` and `stretch` keep the authored dimensions.
 */
export function surfacePlaneSize(
  width: number,
  height: number,
  fit: string,
  aspect: number | null,
): { width: number; height: number } {
  if (fit !== 'contain' || !aspect) return { width, height };
  return aspect > width / height
    ? { width, height: width / aspect }
    : { width: height * aspect, height };
}

/** UV crop that turns a `cover` surface into a centre-cropped fill. */
export function surfaceCoverUv(
  aspect: number | null,
  planeAspect: number,
): { repeat: [number, number]; offset: [number, number] } | null {
  if (!aspect) return null;
  if (aspect > planeAspect) {
    const visible = planeAspect / aspect;
    return { repeat: [visible, 1], offset: [(1 - visible) / 2, 0] };
  }
  const visible = aspect / planeAspect;
  return { repeat: [1, visible], offset: [0, (1 - visible) / 2] };
}

export function textureAspect(texture: Texture | null): number | null {
  const image = texture?.image as
    | { width?: number; height?: number; videoWidth?: number; videoHeight?: number }
    | undefined;
  const width = image?.width ?? image?.videoWidth ?? 0;
  const height = image?.height ?? image?.videoHeight ?? 0;
  return width > 0 && height > 0 ? width / height : null;
}
