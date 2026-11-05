/**
 * components/motion/scene/nodes/lighting.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Light bindings. Each kind maps its own props onto the matching Three.js light;
 * intensity is also re-applied per frame by the frame binding so it animates.
 */

import type { MotionNode } from '@/lib/motion/types';

import { boolProp, numberProp, stringProp } from './helpers';

export function AmbientLightRenderer({ node }: { node: MotionNode }) {
  return (
    <ambientLight
      intensity={numberProp(node, 'intensity', 1.2)}
      color={stringProp(node, 'color', '#ffffff')}
    />
  );
}

export function DirectionalLightRenderer({ node }: { node: MotionNode }) {
  const shadowMapSize = Math.round(numberProp(node, 'shadowMapSize', 1024));
  return (
    <directionalLight
      intensity={numberProp(node, 'intensity', 2.2)}
      color={stringProp(node, 'color', '#ffffff')}
      castShadow={boolProp(node, 'castShadow', true)}
      shadow-mapSize-width={shadowMapSize}
      shadow-mapSize-height={shadowMapSize}
    />
  );
}

export function PointLightRenderer({ node }: { node: MotionNode }) {
  return (
    <pointLight
      intensity={numberProp(node, 'intensity', 2)}
      color={stringProp(node, 'color', '#6b8fff')}
      distance={numberProp(node, 'distance', 0)}
      decay={numberProp(node, 'decay', 2)}
    />
  );
}

export function SpotLightRenderer({ node }: { node: MotionNode }) {
  const intensity = numberProp(node, 'intensity', 3);
  const color = stringProp(node, 'color', '#ffffff');
  const distance = numberProp(node, 'distance', 0);
  const angle = numberProp(node, 'angle', 0.4);
  const penumbra = numberProp(node, 'penumbra', 0.3);
  const decay = numberProp(node, 'decay', 2);
  const castShadow = boolProp(node, 'castShadow', true);
  return (
    <spotLight
      intensity={intensity}
      color={color}
      distance={distance}
      angle={angle}
      penumbra={penumbra}
      decay={decay}
      castShadow={castShadow}
    />
  );
}
