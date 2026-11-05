/**
 * components/motion/scene/nodes/stage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renderable stage geometry. Opacity is applied by the frame binding, not baked
 * into the material.
 */

import { useEffect, useMemo } from 'react';
import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';

import type { MotionNode } from '@/lib/motion/types';

import { boolProp, numberProp, stringProp } from './helpers';

export function PedestalRenderer({ node }: { node: MotionNode }) {
  const radius = numberProp(node, 'radius', 1.4);
  const height = numberProp(node, 'height', 0.5);
  const color = stringProp(node, 'color', '#1b212c');
  const accent = stringProp(node, 'accentColor', '#5885f7');
  const roughness = numberProp(node, 'roughness', 0.32);
  const metalness = numberProp(node, 'metalness', 0.18);

  return (
    <group>
      <mesh position={[0, -height / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[radius * 0.9, radius, height, 64]} />
        <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
      </mesh>
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[radius * 0.9, 64]} />
        <meshStandardMaterial color={color} roughness={roughness * 0.8} metalness={metalness} />
      </mesh>
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.84, radius * 0.9, 64]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
    </group>
  );
}

function createBackdropTexture(topColor: string, bottomColor: string): CanvasTexture | null {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, topColor);
  gradient.addColorStop(1, bottomColor);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function BackdropRenderer({ node }: { node: MotionNode }) {
  const width = numberProp(node, 'width', 26);
  const height = numberProp(node, 'height', 15);
  const topColor = stringProp(node, 'topColor', '#1b2440');
  const bottomColor = stringProp(node, 'bottomColor', '#070a12');
  const texture = useMemo(
    () => createBackdropTexture(topColor, bottomColor),
    [bottomColor, topColor],
  );

  useEffect(() => () => texture?.dispose(), [texture]);

  return (
    <mesh>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture ?? undefined} color={texture ? undefined : topColor} toneMapped={false} />
    </mesh>
  );
}

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

import { Points, BufferGeometry, Float32BufferAttribute, PointsMaterial } from 'three';

export function GridRenderer({ node }: { node: MotionNode }) {
  const size = numberProp(node, 'size', 20);
  const divisions = numberProp(node, 'divisions', 20);
  const color = stringProp(node, 'color', '#1b2230');
  const accent = stringProp(node, 'accentColor', '#5885f7');
  const opacity = numberProp(node, 'opacity', 0.6);
  const step = size / divisions;
  const half = size / 2;
  const positions: number[] = [];
  for (let i = 0; i <= divisions; i++) {
    const v = -half + i * step;
    positions.push(-half, 0, v, half, 0, v);
    positions.push(v, 0, -half, v, 0, half);
  }
  const geo = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    return g;
  }, [positions.join(',')]);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={color} transparent opacity={opacity} />
    </lineSegments>
  );
}

export function ParticlesRenderer({ node }: { node: MotionNode }) {
  const count = Math.min(2000, numberProp(node, 'count', 400));
  const radius = numberProp(node, 'radius', 4);
  const size = numberProp(node, 'size', 0.02);
  const color = stringProp(node, 'color', '#ffffff');
  const seed = numberProp(node, 'seed', 1);
  const opacity = numberProp(node, 'opacity', 0.8);
  const positions = useMemo(() => {
    let s = seed >>> 0;
    const rng = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = radius * Math.cbrt(rng());
      const theta = rng() * Math.PI * 2;
      const phi = Math.acos(2 * rng() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, [count, radius, seed]);
  const geo = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    return g;
  }, [positions]);
  return (
    <points geometry={geo}>
      <pointsMaterial size={size} color={color} transparent opacity={opacity} sizeAttenuation />
    </points>
  );
}
