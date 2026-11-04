/**
 * components/motion/scene/nodes/stage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renderable stage geometry. Opacity is applied by the frame binding, not baked
 * into the material.
 */

import type { MotionNode } from '@/lib/motion/types';

import { boolProp, numberProp, stringProp } from './helpers';

export function GroundRenderer({ node }: { node: MotionNode }) {
  const size = numberProp(node, 'size', 20);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow={boolProp(node, 'shadow', true)}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial
        color={stringProp(node, 'color', '#171b24')}
        roughness={numberProp(node, 'roughness', 0.72)}
        metalness={numberProp(node, 'metalness', 0.08)}
      />
    </mesh>
  );
}
