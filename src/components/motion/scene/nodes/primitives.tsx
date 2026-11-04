/**
 * components/motion/scene/nodes/primitives.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * 3D geometry primitive renderers. Each primitive reads its dimensions and
 * material from node props and renders a Three.js mesh with standard material.
 * One renderer function serves all primitives to keep the registry concise.
 */

import type { MotionNode } from '@/lib/motion/types';

import { numberProp, stringProp } from './helpers';

function materialProps(node: MotionNode) {
  const opacity = numberProp(node, 'opacity', 1);
  return {
    color: stringProp(node, 'color', '#5885f7'),
    roughness: numberProp(node, 'roughness', 0.5),
    metalness: numberProp(node, 'metalness', 0),
    transparent: opacity < 1,
    opacity,
  };
}

export function BoxRenderer({ node }: { node: MotionNode }) {
  const width = numberProp(node, 'width', 1);
  const height = numberProp(node, 'height', 1);
  const depth = numberProp(node, 'depth', 1);
  const mat = materialProps(node);

  return (
    <mesh castShadow receiveShadow>
      <boxGeometry args={[width, height, depth]} />
      <meshStandardMaterial {...mat} />
    </mesh>
  );
}

export function SphereRenderer({ node }: { node: MotionNode }) {
  const radius = numberProp(node, 'radius', 0.5);
  const segments = numberProp(node, 'segments', 32);
  const mat = materialProps(node);

  return (
    <mesh castShadow receiveShadow>
      <sphereGeometry args={[radius, segments, segments]} />
      <meshStandardMaterial {...mat} />
    </mesh>
  );
}

export function CylinderRenderer({ node }: { node: MotionNode }) {
  const radiusTop = numberProp(node, 'radiusTop', 0.5);
  const radiusBottom = numberProp(node, 'radiusBottom', 0.5);
  const height = numberProp(node, 'height', 1);
  const segments = numberProp(node, 'segments', 32);
  const mat = materialProps(node);

  return (
    <mesh castShadow receiveShadow>
      <cylinderGeometry args={[radiusTop, radiusBottom, height, segments]} />
      <meshStandardMaterial {...mat} />
    </mesh>
  );
}

export function TorusRenderer({ node }: { node: MotionNode }) {
  const radius = numberProp(node, 'radius', 0.5);
  const tube = numberProp(node, 'tube', 0.2);
  const radialSegments = numberProp(node, 'radialSegments', 16);
  const tubularSegments = numberProp(node, 'tubularSegments', 48);
  const mat = materialProps(node);

  return (
    <mesh castShadow receiveShadow>
      <torusGeometry args={[radius, tube, radialSegments, tubularSegments]} />
      <meshStandardMaterial {...mat} />
    </mesh>
  );
}

export function ConeRenderer({ node }: { node: MotionNode }) {
  const radius = numberProp(node, 'radius', 0.5);
  const height = numberProp(node, 'height', 1);
  const segments = numberProp(node, 'segments', 32);
  const mat = materialProps(node);

  return (
    <mesh castShadow receiveShadow>
      <coneGeometry args={[radius, height, segments]} />
      <meshStandardMaterial {...mat} />
    </mesh>
  );
}

export function CapsuleRenderer({ node }: { node: MotionNode }) {
  const radius = numberProp(node, 'radius', 0.5);
  const height = numberProp(node, 'height', 1);
  const capSegments = numberProp(node, 'capSegments', 4);
  const radialSegments = numberProp(node, 'radialSegments', 16);
  const mat = materialProps(node);

  return (
    <mesh castShadow receiveShadow>
      <capsuleGeometry args={[radius, height, capSegments, radialSegments]} />
      <meshStandardMaterial {...mat} />
    </mesh>
  );
}
