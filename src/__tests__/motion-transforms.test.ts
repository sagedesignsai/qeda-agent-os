/**
 * __tests__/motion-transforms.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Reparenting relies on these matrices to keep a node visually still. A wrong
 * Euler order or a row/column mix-up would silently move every edited object.
 */

import {
  composeMotionMatrix,
  decomposeMotionMatrix,
  invertMotionMatrix,
  motionIdentityMatrix,
  motionLocalTransformForWorld,
  motionWorldMatrix,
  multiplyMotionMatrices,
} from '@/lib/motion/transforms';
import { createMotionNode } from '@/lib/motion/node-registry';
import type { MotionNodeTransform } from '@/lib/motion/types';

const transform: MotionNodeTransform = {
  position: [1.5, -2, 3.25],
  rotation: [0.3, -0.4, 0.2],
  scale: [2, 0.5, 1.5],
};

function expectTransformClose(
  actual: MotionNodeTransform,
  expected: MotionNodeTransform,
): void {
  actual.position.forEach((value, index) => expect(value).toBeCloseTo(expected.position[index], 5));
  actual.rotation.forEach((value, index) => expect(value).toBeCloseTo(expected.rotation[index], 5));
  actual.scale.forEach((value, index) => expect(value).toBeCloseTo(expected.scale[index], 5));
}

describe('motion transform math', () => {
  it('round-trips a composed transform through decomposition', () => {
    expectTransformClose(decomposeMotionMatrix(composeMotionMatrix(transform)), transform);
  });

  it('inverts a matrix back to identity', () => {
    const identity = multiplyMotionMatrices(
      composeMotionMatrix(transform),
      invertMotionMatrix(composeMotionMatrix(transform)),
    );
    identity.forEach((value, index) => {
      const expected = index % 5 === 0 ? 1 : 0;
      expect(value).toBeCloseTo(expected, 6);
    });
  });

  it('multiplies child transforms into a world matrix', () => {
    const parent = {
      ...createMotionNode('scene.group', 'parent'),
      transform: { position: [1, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [2, 2, 2] as [number, number, number] },
    };
    const child = {
      ...createMotionNode('scene.group', 'child', { parentId: 'parent' }),
      transform: { position: [1, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number] },
    };

    const world = motionWorldMatrix([parent, child], 'child');
    expect(world[3]).toBeCloseTo(3);
    expect(decomposeMotionMatrix(world).scale[0]).toBeCloseTo(2);
  });

  it('computes a local transform that reproduces the given world matrix', () => {
    const parent = {
      ...createMotionNode('scene.group', 'parent'),
      transform: { position: [2, 1, 0] as [number, number, number], rotation: [0, 0.5, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number] },
    };
    const world = composeMotionMatrix(transform);
    const local = motionLocalTransformForWorld([parent], 'parent', world);
    const rebuilt = multiplyMotionMatrices(composeMotionMatrix(parent.transform), composeMotionMatrix(local));
    rebuilt.forEach((value, index) => expect(value).toBeCloseTo(world[index], 5));
  });

  it('returns identity for a node at the scene root', () => {
    expect(motionWorldMatrix([], 'missing')).toEqual(motionIdentityMatrix());
  });
});
