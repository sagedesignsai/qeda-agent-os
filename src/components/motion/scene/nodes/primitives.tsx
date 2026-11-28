/**
 * components/motion/scene/nodes/primitives.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * 3D geometry primitive renderers. Each primitive reads its dimensions and
 * material from node props and renders a Three.js mesh with standard material.
 * One renderer function serves all primitives to keep the registry concise.
 */

import { RoundedBox } from '@react-three/drei';

import type { MotionNode } from '@/lib/motion/types';

import { numberProp, stringProp } from './helpers';

type MaterialPreset = {
  metalness?: number;
  roughness?: number;
  transmission?: number;
  thickness?: number;
  ior?: number;
  dispersion?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  envMapIntensity?: number;
};

const MATERIAL_PRESETS: Record<string, MaterialPreset> = {
  chrome: { metalness: 1, roughness: 0.16, envMapIntensity: 1.6 },
  glass: {
    transmission: 1,
    thickness: 0.6,
    ior: 1.3,
    roughness: 0.03,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.2,
  },
  'frosted-glass': {
    transmission: 1,
    thickness: 0.8,
    ior: 1.35,
    roughness: 0.45,
    clearcoat: 0.6,
    envMapIntensity: 1,
  },
  'liquid-glass': {
    transmission: 1,
    thickness: 1.2,
    ior: 1.45,
    roughness: 0.05,
    dispersion: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.4,
  },
};

function optionalNumber(node: MotionNode, key: string): number | undefined {
  const value = node.props[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalString(node: MotionNode, key: string): string | undefined {
  const value = node.props[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function materialProps(node: MotionNode): {
  physical: boolean;
  props: Record<string, unknown>;
} {
  const presetId = stringProp(node, 'materialPreset', 'custom');
  const preset = MATERIAL_PRESETS[presetId] ?? {};
  const custom = presetId === 'custom';
  const opacity = numberProp(node, 'opacity', 1);
  const roughness = custom
    ? numberProp(node, 'roughness', 0.5)
    : preset.roughness ?? numberProp(node, 'roughness', 0.5);
  const metalness = custom
    ? numberProp(node, 'metalness', 0)
    : preset.metalness ?? numberProp(node, 'metalness', 0);
  const transmission = optionalNumber(node, 'transmission') ?? preset.transmission ?? 0;
  const thickness = optionalNumber(node, 'thickness') ?? preset.thickness ?? 0;
  const ior = optionalNumber(node, 'ior') ?? preset.ior ?? 1.5;
  const dispersion = optionalNumber(node, 'dispersion') ?? preset.dispersion ?? 0;
  const clearcoat = optionalNumber(node, 'clearcoat') ?? preset.clearcoat ?? 0;
  const clearcoatRoughness =
    optionalNumber(node, 'clearcoatRoughness') ?? preset.clearcoatRoughness ?? 0;
  const iridescence = optionalNumber(node, 'iridescence') ?? 0;
  const iridescenceIOR = optionalNumber(node, 'iridescenceIOR') ?? 1.3;
  const sheen = optionalNumber(node, 'sheen') ?? 0;
  const envMapIntensity = optionalNumber(node, 'envMapIntensity') ?? preset.envMapIntensity ?? 1;
  const attenuationColor = optionalString(node, 'attenuationColor');
  const attenuationDistance = optionalNumber(node, 'attenuationDistance');
  const emissive = optionalString(node, 'emissive');
  const emissiveIntensity = optionalNumber(node, 'emissiveIntensity');

  const base: Record<string, unknown> = {
    color: stringProp(node, 'color', '#5885f7'),
    roughness,
    metalness,
    transparent: opacity < 1,
    opacity,
    envMapIntensity,
  };
  if (emissive) {
    base.emissive = emissive;
    base.emissiveIntensity = emissiveIntensity ?? 1;
  }

  const physical = transmission > 0 || clearcoat > 0 || iridescence > 0 || sheen > 0 || dispersion > 0;
  if (!physical) return { physical: false, props: base };

  return {
    physical: true,
    props: {
      ...base,
      transmission,
      thickness,
      ior,
      dispersion,
      clearcoat,
      clearcoatRoughness,
      iridescence,
      iridescenceIOR,
      sheen,
      ...(attenuationColor ? { attenuationColor } : {}),
      ...(attenuationDistance !== undefined ? { attenuationDistance } : {}),
    },
  };
}

/** Shared material binding for every primitive that uses the material schema. */
export function MotionMaterial({ node, side }: { node: MotionNode; side?: number }) {
  const material = materialProps(node);
  const props = side === undefined ? material.props : { ...material.props, side };
  return material.physical ? (
    <meshPhysicalMaterial {...(props as Record<string, string | number | boolean>)} />
  ) : (
    <meshStandardMaterial {...(props as Record<string, string | number | boolean>)} />
  );
}

export function BoxRenderer({ node }: { node: MotionNode }) {
  const width = numberProp(node, 'width', 1);
  const height = numberProp(node, 'height', 1);
  const depth = numberProp(node, 'depth', 1);

  return (
    <mesh castShadow receiveShadow>
      <boxGeometry args={[width, height, depth]} />
      <MotionMaterial node={node} />
    </mesh>
  );
}

export function SphereRenderer({ node }: { node: MotionNode }) {
  const radius = numberProp(node, 'radius', 0.5);
  const segments = numberProp(node, 'segments', 32);

  return (
    <mesh castShadow receiveShadow>
      <sphereGeometry args={[radius, segments, segments]} />
      <MotionMaterial node={node} />
    </mesh>
  );
}

export function CylinderRenderer({ node }: { node: MotionNode }) {
  const radiusTop = numberProp(node, 'radiusTop', 0.5);
  const radiusBottom = numberProp(node, 'radiusBottom', 0.5);
  const height = numberProp(node, 'height', 1);
  const segments = numberProp(node, 'segments', 32);

  return (
    <mesh castShadow receiveShadow>
      <cylinderGeometry args={[radiusTop, radiusBottom, height, segments]} />
      <MotionMaterial node={node} />
    </mesh>
  );
}

export function TorusRenderer({ node }: { node: MotionNode }) {
  const radius = numberProp(node, 'radius', 0.5);
  const tube = numberProp(node, 'tube', 0.2);
  const radialSegments = numberProp(node, 'radialSegments', 16);
  const tubularSegments = numberProp(node, 'tubularSegments', 48);

  return (
    <mesh castShadow receiveShadow>
      <torusGeometry args={[radius, tube, radialSegments, tubularSegments]} />
      <MotionMaterial node={node} />
    </mesh>
  );
}

export function ConeRenderer({ node }: { node: MotionNode }) {
  const radius = numberProp(node, 'radius', 0.5);
  const height = numberProp(node, 'height', 1);
  const segments = numberProp(node, 'segments', 32);

  return (
    <mesh castShadow receiveShadow>
      <coneGeometry args={[radius, height, segments]} />
      <MotionMaterial node={node} />
    </mesh>
  );
}

export function CapsuleRenderer({ node }: { node: MotionNode }) {
  const radius = numberProp(node, 'radius', 0.5);
  const height = numberProp(node, 'height', 1);
  const capSegments = numberProp(node, 'capSegments', 4);
  const radialSegments = numberProp(node, 'radialSegments', 16);

  return (
    <mesh castShadow receiveShadow>
      <capsuleGeometry args={[radius, height, capSegments, radialSegments]} />
      <MotionMaterial node={node} />
    </mesh>
  );
}

export function IcosahedronRenderer({ node }: { node: MotionNode }) {
  const radius = numberProp(node, 'radius', 0.6);
  const detail = numberProp(node, 'detail', 0);
  return (
    <mesh castShadow receiveShadow>
      <icosahedronGeometry args={[radius, detail]} />
      <MotionMaterial node={node} />
    </mesh>
  );
}

export function TorusKnotRenderer({ node }: { node: MotionNode }) {
  const radius = numberProp(node, 'radius', 0.5);
  const tube = numberProp(node, 'tube', 0.18);
  const p = numberProp(node, 'p', 2);
  const q = numberProp(node, 'q', 3);
  const tubularSegments = numberProp(node, 'tubularSegments', 64);
  const radialSegments = numberProp(node, 'radialSegments', 8);
  return (
    <mesh castShadow receiveShadow>
      <torusKnotGeometry args={[radius, tube, tubularSegments, radialSegments, p, q]} />
      <MotionMaterial node={node} />
    </mesh>
  );
}

export function RingRenderer({ node }: { node: MotionNode }) {
  const innerRadius = numberProp(node, 'innerRadius', 0.6);
  const outerRadius = numberProp(node, 'outerRadius', 1);
  const thetaSegments = numberProp(node, 'thetaSegments', 48);
  return (
    <mesh castShadow receiveShadow>
      <ringGeometry args={[innerRadius, outerRadius, thetaSegments]} />
      <MotionMaterial node={node} side={2} />
    </mesh>
  );
}

export function PlaneRenderer({ node }: { node: MotionNode }) {
  const width = numberProp(node, 'width', 2);
  const height = numberProp(node, 'height', 2);
  return (
    <mesh castShadow receiveShadow>
      <planeGeometry args={[width, height]} />
      <MotionMaterial node={node} side={2} />
    </mesh>
  );
}

export function RoundedBoxRenderer({ node }: { node: MotionNode }) {
  const width = numberProp(node, 'width', 1);
  const height = numberProp(node, 'height', 1);
  const depth = numberProp(node, 'depth', 1);
  const radius = Math.max(
    0,
    Math.min(numberProp(node, 'radius', 0.08), Math.min(width, height, depth) / 2 - 0.001),
  );
  const segments = Math.max(1, Math.round(numberProp(node, 'segments', 4)));
  return (
    <RoundedBox args={[width, height, depth]} radius={radius} smoothness={segments} castShadow receiveShadow>
      <MotionMaterial node={node} />
    </RoundedBox>
  );
}
