/**
 * components/motion/scene/MotionNodeRenderers.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Three.js-specific bindings for registered Motion node types. All persistent
 * values arrive as node data; editor-only stage elements live in MotionSceneCanvas.
 */

import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  Shape,
  TextureLoader,
} from 'three';
import type { Group } from 'three';

import { createMotionScreenArtwork } from '@/components/motion/scene/create-motion-screen-artwork';
import { motionStore } from '@/hooks/use-motion-store';
import { motionAssetUrl } from '@/lib/motion/assets';
import type { MotionNode } from '@/lib/motion/types';

export type MotionThreeNodeRenderer = ComponentType<{ node: MotionNode }>;

const renderers = new Map<string, MotionThreeNodeRenderer>();

export function registerMotionThreeRenderer(
  nodeType: string,
  renderer: MotionThreeNodeRenderer,
): void {
  if (renderers.has(nodeType)) {
    throw new Error(`Three.js renderer already registered for Motion node "${nodeType}".`);
  }
  renderers.set(nodeType, renderer);
}

export function getMotionThreeRenderer(nodeType: string): MotionThreeNodeRenderer | undefined {
  return renderers.get(nodeType);
}

function numberProp(node: MotionNode, key: string, fallback: number): number {
  const value = node.props[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringProp(node: MotionNode, key: string, fallback: string): string {
  const value = node.props[key];
  return typeof value === 'string' ? value : fallback;
}

function roundedRectangle(width: number, height: number, radius: number): Shape {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const shape = new Shape();

  shape.moveTo(-halfWidth + radius, -halfHeight);
  shape.lineTo(halfWidth - radius, -halfHeight);
  shape.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + radius);
  shape.lineTo(halfWidth, halfHeight - radius);
  shape.quadraticCurveTo(halfWidth, halfHeight, halfWidth - radius, halfHeight);
  shape.lineTo(-halfWidth + radius, halfHeight);
  shape.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - radius);
  shape.lineTo(-halfWidth, -halfHeight + radius);
  shape.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + radius, -halfHeight);
  return shape;
}

function GroupRenderer() {
  return null;
}

function CameraRenderer() {
  return null;
}

function TabletRenderer({ node }: { node: MotionNode }) {
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
        <meshStandardMaterial color="#252a34" metalness={0.82} roughness={0.24} />
      </mesh>

      <mesh position={[0, 0, depth / 2 + 0.002]}>
        <planeGeometry args={[faceWidth, faceHeight]} />
        <meshBasicMaterial color="#080a0f" />
      </mesh>

      <mesh position={[0, height / 2 - 0.05, depth / 2 + 0.014]}>
        <circleGeometry args={[0.022, 24]} />
        <meshBasicMaterial color="#07090d" />
      </mesh>
      <mesh position={[0, height / 2 - 0.05, depth / 2 + 0.016]}>
        <circleGeometry args={[0.008, 16]} />
        <meshBasicMaterial color="#345d9c" />
      </mesh>

      <mesh position={[0, -height / 2 + 0.035, depth / 2 + 0.014]}>
        <boxGeometry args={[0.26, 0.012, 0.012]} />
        <meshStandardMaterial color="#11151d" metalness={0.45} roughness={0.4} />
      </mesh>
    </>
  );
}

function ScreenRenderer({ node }: { node: MotionNode }) {
  const gl = useThree((state) => state.gl);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const width = numberProp(node, 'width', 3.46);
  const height = numberProp(node, 'height', 1.947);
  const source = stringProp(node, 'source', stringProp(node, 'assetId', ''));
  const projectId = motionStore.getDocument().meta.id;
  const assetId = stringProp(node, 'assetId', source);
  const asset = motionStore.getDocument().assets.find((item) => item.id === assetId);
  const mediaSource = asset && asset.hash !== 'builtin'
    ? motionAssetUrl(projectId, asset.id)
    : source;
  const loadFailed = failedSource === mediaSource;
  const texture = useMemo(() => {
    if (source === 'starter-dashboard' || source === 'builtin:starter-dashboard') {
      const next = new CanvasTexture(createMotionScreenArtwork());
      next.colorSpace = SRGBColorSpace;
      next.magFilter = LinearFilter;
      next.minFilter = LinearMipmapLinearFilter;
      next.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
      return next;
    }

    if (!mediaSource) return null;

    const next = new TextureLoader().load(mediaSource, undefined, undefined, () => setFailedSource(mediaSource));
    next.colorSpace = SRGBColorSpace;
    next.magFilter = LinearFilter;
    next.minFilter = LinearMipmapLinearFilter;
    next.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    return next;
  }, [gl, mediaSource]);

  useEffect(() => () => texture?.dispose(), [texture]);

  return (
    <mesh>
      <planeGeometry args={[width, height]} />
      {texture ? (
        <meshBasicMaterial map={loadFailed ? null : texture} color={loadFailed ? '#ff00aa' : '#ffffff'} toneMapped={false} />
      ) : (
        <meshStandardMaterial color="#202633" roughness={0.7} />
      )}
      {loadFailed && (
        <Html center distanceFactor={5}>
          <div className="min-w-40 rounded border border-fuchsia-400 bg-background/95 p-2 text-center text-xs shadow-lg">
            <p className="font-medium text-fuchsia-600">Missing: {(asset?.name ?? assetId) || 'image'}</p>
            {asset && <button type="button" className="mt-1 text-primary underline" onClick={() => void relinkScreenAsset(projectId, asset.id)}>Relink</button>}
          </div>
        </Html>
      )}
    </mesh>
  );
}

async function relinkScreenAsset(projectId: string, assetId: string): Promise<void> {
  const result = await window.electron.ipc.invoke<{
    assetId: string; path: string; hash: string; byteSize: number; mimeType: string; matches: boolean;
  } | null>('motion:relink-asset', { projectId, assetId });
  if (!result) return;
  const { matches: _matches, ...relink } = result;
  motionStore.commit('Relink Motion asset', [{ op: 'asset.relink', ...relink }]);
}

function createTitleArtwork(text: string, color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 240;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create the Motion title texture.');

  context.font = '650 168px ui-sans-serif, system-ui, sans-serif';
  context.textBaseline = 'middle';
  context.textAlign = 'center';
  context.fillStyle = color;
  context.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 40);
  return canvas;
}

function TitleRenderer({ node }: { node: MotionNode }) {
  const text = stringProp(node, 'text', 'Product title');
  const color = stringProp(node, 'color', '#ffffff');
  const fontSize = numberProp(node, 'fontSize', 0.3);
  const fontScaleRef = useRef<Group | null>(null);
  const texture = useMemo(() => {
    const next = new CanvasTexture(createTitleArtwork(text, color));
    next.colorSpace = SRGBColorSpace;
    next.minFilter = LinearMipmapLinearFilter;
    next.magFilter = LinearFilter;
    return next;
  }, [color, text]);

  useEffect(() => () => texture.dispose(), [texture]);

  const setFontScaleGroup = (group: Group | null) => {
    fontScaleRef.current = group;
    if (group) group.userData.motionBaseFontSize = fontSize;
  };

  return (
    <group ref={setFontScaleGroup}>
      <mesh>
        <planeGeometry args={[fontSize * 6, fontSize]} />
        <meshBasicMaterial map={texture} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

function AmbientLightRenderer({ node }: { node: MotionNode }) {
  return (
    <ambientLight
      intensity={numberProp(node, 'intensity', 1.2)}
      color={stringProp(node, 'color', '#ffffff')}
    />
  );
}

function DirectionalLightRenderer({ node }: { node: MotionNode }) {
  return (
    <directionalLight
      intensity={numberProp(node, 'intensity', 2.2)}
      color={stringProp(node, 'color', '#ffffff')}
      castShadow
      shadow-mapSize-width={1024}
      shadow-mapSize-height={1024}
    />
  );
}

function PointLightRenderer({ node }: { node: MotionNode }) {
  return (
    <pointLight
      intensity={numberProp(node, 'intensity', 2)}
      color={stringProp(node, 'color', '#6b8fff')}
    />
  );
}

function MissingRenderer({ node }: { node: MotionNode }) {
  return (
    <mesh userData={{ unresolvedNodeType: node.type }}>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshBasicMaterial color="#d946ef" wireframe />
    </mesh>
  );
}

registerMotionThreeRenderer('scene.group', GroupRenderer);
registerMotionThreeRenderer('camera.perspective', CameraRenderer);
registerMotionThreeRenderer('device.tablet', TabletRenderer);
registerMotionThreeRenderer('screen.image', ScreenRenderer);
registerMotionThreeRenderer('text.title', TitleRenderer);
registerMotionThreeRenderer('light.ambient', AmbientLightRenderer);
registerMotionThreeRenderer('light.directional', DirectionalLightRenderer);
registerMotionThreeRenderer('light.point', PointLightRenderer);

export { MissingRenderer };
