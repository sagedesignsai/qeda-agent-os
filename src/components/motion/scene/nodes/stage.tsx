/**
 * components/motion/scene/nodes/stage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renderable stage geometry. Opacity is applied by the frame binding, not baked
 * into the material.
 *
 * A backdrop wall is content: it can be keyed, parallaxed and exported, unlike
 * the scene world (`scene.background`), which is global. The `pano` mode is the
 * one place a backdrop approximates a surround — for real IBL use the world.
 */

import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import {
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Fog,
  Float32BufferAttribute,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  TextureLoader,
} from 'three';

import { motionAssetUrl } from '@/lib/motion/assets';
import type { MotionDocument, MotionNode } from '@/lib/motion/types';

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

export function BackdropRenderer({
  node,
  document,
}: {
  node: MotionNode;
  document: MotionDocument;
}) {
  const gl = useThree((state) => state.gl);
  const mode = stringProp(node, 'mode', 'gradient');
  const width = numberProp(node, 'width', 26);
  const height = numberProp(node, 'height', 15);
  const radius = numberProp(node, 'radius', 18);
  const brightness = numberProp(node, 'brightness', 1);
  const topColor = stringProp(node, 'topColor', '#1b2440');
  const bottomColor = stringProp(node, 'bottomColor', '#070a12');
  const assetId = stringProp(node, 'assetId', '');
  const asset = document.assets.find((item) => item.id === assetId);
  const mediaUrl =
    asset && asset.hash !== 'builtin'
      ? motionAssetUrl(document.meta.id, asset.id)
      : '';

  const gradient = useMemo(
    () => (mode === 'gradient' ? createBackdropTexture(topColor, bottomColor) : null),
    [bottomColor, mode, topColor],
  );

  const media = useMemo(() => {
    if (mode === 'gradient' || !mediaUrl) return null;
    const texture = new TextureLoader().load(mediaUrl);
    texture.colorSpace = SRGBColorSpace;
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    return texture;
  }, [gl, mediaUrl, mode]);

  useEffect(
    () => () => {
      gradient?.dispose();
    },
    [gradient],
  );
  useEffect(
    () => () => {
      media?.dispose();
    },
    [media],
  );

  const tint = useMemo(
    () => new Color(1, 1, 1).multiplyScalar(Math.max(0, brightness)),
    [brightness],
  );

  // A missing image falls back to the gradient colours rather than a black or
  // magenta plane: the shot stays usable, preflight reports the missing media.
  const map = media ?? gradient;
  const fallbackColor = media ? topColor : undefined;

  if (mode === 'pano') {
    return (
      <mesh>
        <sphereGeometry args={[radius, 64, 32]} />
        <meshBasicMaterial
          map={map ?? undefined}
          color={media ? tint : fallbackColor ? new Color(topColor) : tint}
          side={BackSide}
          toneMapped={false}
        />
      </mesh>
    );
  }

  if (mode === 'image') {
    return (
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          map={map ?? undefined}
          color={media ? tint : new Color(topColor)}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>
    );
  }

  return (
    <mesh>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={map ?? undefined}
        color={map ? tint : new Color(topColor)}
        side={DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

/**
 * An infinite-sweep cove: floor → quarter-round → back wall. Geometry is exact
 * rather than approximated: the cylinder segment (axis rotated onto X) spans
 * 0…π/2, joining the floor plane at z = 0 to the wall at z = -radius, y = radius.
 */
export function CycloramaRenderer({ node }: { node: MotionNode }) {
  const width = numberProp(node, 'width', 22);
  const height = numberProp(node, 'height', 9);
  const depth = numberProp(node, 'depth', 14);
  const requestedRadius = numberProp(node, 'radius', 1.8);
  const color = stringProp(node, 'color', '#1a1f2a');
  const roughness = numberProp(node, 'roughness', 0.78);
  const metalness = numberProp(node, 'metalness', 0.04);
  const shadow = boolProp(node, 'shadow', true);
  const cove = Math.max(0.2, Math.min(requestedRadius, height * 0.9, depth * 0.9));
  const wallHeight = Math.max(0.01, height - cove);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, depth / 2]} receiveShadow={shadow}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} side={DoubleSide} />
      </mesh>
      <mesh
        position={[0, cove + wallHeight / 2, -cove]}
        receiveShadow={shadow}
      >
        <planeGeometry args={[width, wallHeight]} />
        <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} side={DoubleSide} />
      </mesh>
      <mesh position={[0, 0, -cove]} receiveShadow={shadow}>
        <cylinderGeometry args={[cove, cove, width, 48, 1, true, 0, Math.PI / 2]} />
        <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} side={DoubleSide} />
      </mesh>
    </group>
  );
}

/** Distance fog. The node renders nothing; it sets `scene.fog` while present. */
export function FogRenderer({ node }: { node: MotionNode }) {
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  const color = stringProp(node, 'color', '#c8d4e2');
  const near = numberProp(node, 'near', 12);
  const far = numberProp(node, 'far', 42);

  useEffect(() => {
    const previous = scene.fog;
    scene.fog = new Fog(color, near, Math.max(near + 0.01, far));
    invalidate();
    return () => {
      scene.fog = previous ?? null;
      invalidate();
    };
  }, [color, far, near, scene, invalidate]);

  return null;
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
