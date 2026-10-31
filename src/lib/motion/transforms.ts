/**
 * lib/motion/transforms.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure 4×4 math for hierarchy edits. Reparenting keeps a node visually still by
 * rewriting its local transform, and that requires world matrices — which the
 * document layer owns so no op has to reach into Three.js.
 *
 * Conventions match the renderer: row-major matrices and Euler angles in `XYZ`
 * order (Three.js' default for `Object3D.rotation`).
 */

import type { MotionNode, MotionNodeTransform } from './types';

export type MotionMatrix4 = readonly number[];

export function motionIdentityMatrix(): MotionMatrix4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** Composition order is translate · rotate · scale, like `Matrix4.compose`. */
export function composeMotionMatrix(transform: MotionNodeTransform): MotionMatrix4 {
  const [x, y, z] = transform.rotation;
  const [sx, sy, sz] = transform.scale;
  const [tx, ty, tz] = transform.position;
  const a = Math.cos(x);
  const b = Math.sin(x);
  const c = Math.cos(y);
  const d = Math.sin(y);
  const e = Math.cos(z);
  const f = Math.sin(z);
  const ae = a * e;
  const af = a * f;
  const be = b * e;
  const bf = b * f;

  // Rotation (XYZ) scaled on the right by the scale diagonal.
  return [
    c * e * sx, -c * f * sy, d * sz, tx,
    (af + be * d) * sx, (ae - bf * d) * sy, -b * c * sz, ty,
    (bf - ae * d) * sx, (be + af * d) * sy, a * c * sz, tz,
    0, 0, 0, 1,
  ];
}

export function multiplyMotionMatrices(a: MotionMatrix4, b: MotionMatrix4): MotionMatrix4 {
  const out = new Array<number>(16).fill(0);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      let value = 0;
      for (let k = 0; k < 4; k += 1) {
        value += a[row * 4 + k] * b[k * 4 + column];
      }
      out[row * 4 + column] = value;
    }
  }
  return out;
}

export function invertMotionMatrix(matrix: MotionMatrix4): MotionMatrix4 {
  const [a, b, c, d, e, f, g, h, i, j, k, l] = matrix;
  const determinant =
    a * (f * k - g * j) -
    b * (e * k - g * i) +
    c * (e * j - f * i);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) {
    throw new Error('Motion transform matrix is not invertible.');
  }
  const inverse = 1 / determinant;
  const c00 = (f * k - g * j) * inverse;
  const c01 = (c * j - b * k) * inverse;
  const c02 = (b * g - c * f) * inverse;
  const c10 = (g * i - e * k) * inverse;
  const c11 = (a * k - c * i) * inverse;
  const c12 = (c * e - a * g) * inverse;
  const c20 = (e * j - f * i) * inverse;
  const c21 = (b * i - a * j) * inverse;
  const c22 = (a * f - b * e) * inverse;
  return [
    c00, c01, c02, -(c00 * d + c01 * h + c02 * l),
    c10, c11, c12, -(c10 * d + c11 * h + c12 * l),
    c20, c21, c22, -(c20 * d + c21 * h + c22 * l),
    0, 0, 0, 1,
  ];
}

export function decomposeMotionMatrix(matrix: MotionMatrix4): MotionNodeTransform {
  const position: MotionNodeTransform['position'] = [matrix[3], matrix[7], matrix[11]];
  let sx = Math.hypot(matrix[0], matrix[4], matrix[8]);
  const sy = Math.hypot(matrix[1], matrix[5], matrix[9]);
  const sz = Math.hypot(matrix[2], matrix[6], matrix[10]);

  // A negative determinant means one axis is mirrored; Three.js attributes it to X.
  const determinant =
    matrix[0] * (matrix[5] * matrix[10] - matrix[6] * matrix[9]) -
    matrix[1] * (matrix[4] * matrix[10] - matrix[6] * matrix[8]) +
    matrix[2] * (matrix[4] * matrix[9] - matrix[5] * matrix[8]);
  if (determinant < 0) sx = -sx;

  const m00 = matrix[0] / sx;
  const m01 = matrix[1] / sy;
  const m02 = matrix[2] / sz;
  const m11 = matrix[5] / sy;
  const m12 = matrix[6] / sz;
  const m21 = matrix[9] / sy;
  const m22 = matrix[10] / sz;

  // Euler XYZ, exactly as Three.js derives it from a rotation matrix.
  const y = Math.asin(Math.max(-1, Math.min(1, m02)));
  if (Math.abs(m02) < 0.9999999) {
    return {
      position,
      rotation: [Math.atan2(-m12, m22), y, Math.atan2(-m01, m00)],
      scale: [sx, sy, sz],
    };
  }
  return { position, rotation: [Math.atan2(m21, m11), y, 0], scale: [sx, sy, sz] };
}

/** Walks the parent chain so a transform is always relative to the scene root. */
export function motionWorldMatrix(nodes: readonly MotionNode[], nodeId: string): MotionMatrix4 {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const chain: MotionNode[] = [];
  let cursor = byId.get(nodeId);
  const guard = new Set<string>();
  while (cursor && !guard.has(cursor.id)) {
    guard.add(cursor.id);
    chain.unshift(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return chain.reduce<MotionMatrix4>(
    (world, node) => multiplyMotionMatrices(world, composeMotionMatrix(node.transform)),
    motionIdentityMatrix(),
  );
}

/** The local transform that puts a node at `world` under `parentId`. */
export function motionLocalTransformForWorld(
  nodes: readonly MotionNode[],
  parentId: string | null,
  world: MotionMatrix4,
): MotionNodeTransform {
  if (!parentId) return decomposeMotionMatrix(world);
  return decomposeMotionMatrix(
    multiplyMotionMatrices(invertMotionMatrix(motionWorldMatrix(nodes, parentId)), world),
  );
}
