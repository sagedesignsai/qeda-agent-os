/**
 * components/motion/scene/nodes/shapes.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Solid surfaces. Opacity is written once by `motion-frame-binding`, so the
 * material must not bake `opacity` here or it would be applied twice.
 */

import { useMemo } from 'react';

import type { MotionNode } from '@/lib/motion/types';

import { numberProp, roundedRectangle, stringProp } from './helpers';

export function ShapeRenderer({ node }: { node: MotionNode }) {
  const width = numberProp(node, 'width', 1);
  const height = numberProp(node, 'height', 1);
  const ellipse = node.type === 'shape.ellipse';
  const color = stringProp(node, 'color', '#5885f7');
  const radius = Math.min(numberProp(node, 'cornerRadius', 0.06), width / 2, height / 2);
  const shape = useMemo(
    () => (ellipse ? null : roundedRectangle(width, height, radius)),
    [ellipse, height, radius, width],
  );

  return (
    <mesh scale={ellipse ? [width / 2, height / 2, 1] : undefined}>
      {ellipse ? <circleGeometry args={[1, 48]} /> : <shapeGeometry args={[shape!]} />}
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}
