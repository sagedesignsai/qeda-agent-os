/**
 * components/motion/scene/nodes/placeholders.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Failure visuals. `MissingAssetRenderer` stands in for a node whose asset is
 * absent, failed to load, or could not be decoded; `MissingRenderer` is the
 * canvas fallback for a node type with no binding at all.
 */

import { Html } from '@react-three/drei';

import type { MotionNode } from '@/lib/motion/types';

export function MissingAssetRenderer({ node }: { node: MotionNode }) {
  return (
    <mesh userData={{ missingAsset: node.props.assetId }}>
      <boxGeometry args={[0.8, 0.5, 0.08]} />
      <meshBasicMaterial color="#d946ef" wireframe />
      <Html center distanceFactor={5}>
        <span className="rounded bg-background/90 px-2 py-1 text-xs text-destructive">
          Missing {node.name}
        </span>
      </Html>
    </mesh>
  );
}

export function MissingRenderer({ node }: { node: MotionNode }) {
  return (
    <mesh userData={{ unresolvedNodeType: node.type }}>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshBasicMaterial color="#d946ef" wireframe />
    </mesh>
  );
}
