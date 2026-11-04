/**
 * components/motion/scene/nodes/geometry.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Device shells. One renderer serves every device kind; dimensions, bezel and
 * shell material all come from node props so the inspector drives the geometry.
 */

import { useMemo } from 'react';

import type { MotionNode } from '@/lib/motion/types';

import { boolProp, numberProp, roundedRectangle, stringProp } from './helpers';

export function DeviceRenderer({ node }: { node: MotionNode }) {
  const width = numberProp(node, 'width', 3.82);
  const height = numberProp(node, 'height', 2.42);
  const depth = numberProp(node, 'depth', 0.15);
  const bezel = numberProp(node, 'bezel', 0.18);
  const body = useMemo(
    () => roundedRectangle(width, height, Math.min(0.13, width / 12, height / 12)),
    [height, width],
  );
  const faceWidth = Math.max(0.1, width - bezel * 2);
  const faceHeight = Math.max(0.1, height - bezel * 2);
  const shellColor = stringProp(node, 'color', '#252a34');
  const metalness = numberProp(node, 'metalness', 0.82);
  const roughness = numberProp(node, 'roughness', 0.24);
  const powerRing = boolProp(node, 'powerRing', true);

  return (
    <>
      <mesh position={[0, 0, -depth / 2]} castShadow receiveShadow>
        <extrudeGeometry
          args={[
            body,
            {
              depth,
              bevelEnabled: true,
              bevelSegments: 3,
              bevelSize: Math.min(0.025, depth / 4),
              bevelThickness: Math.min(0.025, depth / 4),
              curveSegments: 8,
            },
          ]}
        />
        <meshStandardMaterial color={shellColor} metalness={metalness} roughness={roughness} />
      </mesh>

      <mesh position={[0, 0, depth / 2 + 0.002]}>
        <planeGeometry args={[faceWidth, faceHeight]} />
        <meshBasicMaterial color="#080a0f" />
      </mesh>

      {powerRing && (
        <>
          <mesh position={[0, height / 2 - 0.05, depth / 2 + 0.014]}>
            <circleGeometry args={[0.022, 24]} />
            <meshBasicMaterial color="#07090d" />
          </mesh>
          <mesh position={[0, height / 2 - 0.05, depth / 2 + 0.016]}>
            <circleGeometry args={[0.008, 16]} />
            <meshBasicMaterial color="#345d9c" />
          </mesh>
        </>
      )}

      <mesh position={[0, -height / 2 + 0.035, depth / 2 + 0.014]}>
        <boxGeometry args={[0.26, 0.012, 0.012]} />
        <meshStandardMaterial color="#11151d" metalness={0.45} roughness={0.4} />
      </mesh>
    </>
  );
}
