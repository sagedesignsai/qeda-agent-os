/**
 * components/motion/scene/MotionSceneCanvas.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * R3F host for Motion's renderer-neutral document graph. It evaluates the
 * document at the shared playback clock and binds node transforms to Three.js.
 */

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Color, PerspectiveCamera } from 'three';
import type { Group, Material, Object3D } from 'three';

import {
  getMotionThreeRenderer,
  MissingRenderer,
} from '@/components/motion/scene/MotionNodeRenderers';
import { evaluateMotionFrame } from '@/lib/motion/evaluate';
import type { MotionDocument, MotionNode } from '@/lib/motion/types';
import type { PlaybackClock } from '@/lib/timeline/clock';

export type MotionCameraView = 'perspective' | 'front';
export type MotionStageColor = '#171a22' | '#39424f' | '#e1e4e9';

type MotionSceneCanvasProps = {
  doc: MotionDocument;
  clock: PlaybackClock;
  viewMode: MotionCameraView;
  stageColor: MotionStageColor;
  gridVisible: boolean;
  zoom: number;
};

function numberProp(node: MotionNode, key: string, fallback: number): number {
  const value = node.props[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function indexNodes(nodes: MotionNode[]): Map<string | null, MotionNode[]> {
  const children = new Map<string | null, MotionNode[]>();
  for (const node of nodes) {
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  return children;
}

function DocumentNode({
  node,
  childrenByParent,
  groups,
}: {
  node: MotionNode;
  childrenByParent: Map<string | null, MotionNode[]>;
  groups: Map<string, Group>;
}) {
  const Renderer = getMotionThreeRenderer(node.type) ?? MissingRenderer;
  const childNodes = childrenByParent.get(node.id) ?? [];

  return (
    <group
      ref={(group) => {
        if (group) {
          group.userData.motionNodeId = node.id;
          groups.set(node.id, group);
        } else {
          groups.delete(node.id);
        }
      }}
      name={node.name}
      position={node.transform.position}
      rotation={node.transform.rotation}
      scale={node.transform.scale}
      visible={node.visible}
    >
      <Renderer node={node} />
      {childNodes.map((child) => (
        <DocumentNode
          key={child.id}
          node={child}
          childrenByParent={childrenByParent}
          groups={groups}
        />
      ))}
    </group>
  );
}

function applyOpacity(object: Object3D, inheritedOpacity: number, opacityById: Map<string, number>) {
  const nodeId = object.userData.motionNodeId;
  const nodeOpacity = typeof nodeId === 'string' ? opacityById.get(nodeId) ?? 1 : 1;
  const opacity = inheritedOpacity * nodeOpacity;
  const mesh = object as Object3D & { material?: Material | Material[] };

  if (mesh.material) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const mutable = material as Material & {
        opacity: number;
        transparent: boolean;
        depthWrite: boolean;
        userData: Record<string, unknown>;
      };
      if (typeof mutable.opacity !== 'number') continue;
      const baseOpacity =
        typeof mutable.userData.motionBaseOpacity === 'number'
          ? mutable.userData.motionBaseOpacity
          : mutable.opacity;
      mutable.userData.motionBaseOpacity = baseOpacity;
      const transparent = baseOpacity * opacity < 1;
      if (mutable.transparent !== transparent) {
        mutable.transparent = transparent;
        mutable.depthWrite = !transparent;
        mutable.needsUpdate = true;
      }
      mutable.opacity = baseOpacity * opacity;
    }
  }

  for (const child of object.children) applyOpacity(child, opacity, opacityById);
}

function applyFontSize(object: Object3D, node: MotionNode): void {
  const size = node.props.fontSize;
  if (typeof size !== 'number' || !Number.isFinite(size)) return;
  object.traverse((child) => {
    const baseSize = child.userData.motionBaseFontSize;
    if (typeof baseSize === 'number' && baseSize > 0) {
      child.scale.setScalar(size / baseSize);
    }
  });
}

function applyLightIntensity(object: Object3D, node: MotionNode): void {
  const intensity = node.props.intensity;
  if (typeof intensity !== 'number' || !Number.isFinite(intensity)) return;
  object.traverse((child) => {
    const light = child as Object3D & { isLight?: boolean; intensity?: number };
    if (light.isLight && typeof light.intensity === 'number') {
      light.intensity = intensity;
    }
  });
}

function MotionFrameDriver({
  doc,
  clock,
  viewMode,
  zoom,
  groups,
}: {
  doc: MotionDocument;
  clock: PlaybackClock;
  viewMode: MotionCameraView;
  zoom: number;
  groups: Map<string, Group>;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const lastProjection = useRef<string | null>(null);

  useEffect(() => clock.subscribe(invalidate), [clock, invalidate]);

  useFrame(() => {
    const frame = evaluateMotionFrame(doc, clock.getTime());
    const opacityById = new Map<string, number>();

    for (const node of frame.nodes) {
      const group = groups.get(node.id);
      if (!group) continue;

      group.position.set(...node.transform.position);
      group.rotation.set(...node.transform.rotation);
      group.scale.set(...node.transform.scale);
      group.visible = node.visible;
      opacityById.set(node.id, numberProp(node, 'opacity', 1));
      applyFontSize(group, node);
      applyLightIntensity(group, node);
    }

    applyOpacity(scene, 1, opacityById);

    const cameraNode = frame.nodes.find((node) => node.type === 'camera.perspective');
    if (cameraNode && camera instanceof PerspectiveCamera) {
      const fov = numberProp(cameraNode, 'fov', camera.fov);
      const near = numberProp(cameraNode, 'near', camera.near);
      const far = numberProp(cameraNode, 'far', camera.far);
      camera.fov = fov;
      camera.near = near;
      camera.far = far;
      const projection = `${fov}:${near}:${far}`;
      if (lastProjection.current !== projection) {
        camera.updateProjectionMatrix();
        lastProjection.current = projection;
      }

      if (viewMode === 'front') {
        camera.position.set(0, 0, 6.1 / zoom);
        camera.lookAt(0, 0, 0);
      } else {
        camera.position.set(
          cameraNode.transform.position[0] / zoom,
          cameraNode.transform.position[1] / zoom,
          cameraNode.transform.position[2] / zoom,
        );
        camera.lookAt(0, 0, 0);
        camera.rotateX(cameraNode.transform.rotation[0]);
        camera.rotateY(cameraNode.transform.rotation[1]);
        camera.rotateZ(cameraNode.transform.rotation[2]);
      }
    }
  });

  return null;
}

function DocumentScene({
  doc,
  clock,
  viewMode,
  zoom,
}: {
  doc: MotionDocument;
  clock: PlaybackClock;
  viewMode: MotionCameraView;
  zoom: number;
}) {
  const groups = useMemo(() => new Map<string, Group>(), []);
  const childrenByParent = useMemo(() => indexNodes(doc.scene.nodes), [doc.scene.nodes]);
  const rootNodes = childrenByParent.get(null) ?? [];

  return (
    <>
      <mesh position={[0, -1.55, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[18, 18]} />
        <meshStandardMaterial color="#1a1e27" roughness={0.82} metalness={0.08} />
      </mesh>

      {rootNodes.map((node) => (
        <DocumentNode
          key={node.id}
          node={node}
          childrenByParent={childrenByParent}
          groups={groups}
        />
      ))}

      <MotionFrameDriver
        doc={doc}
        clock={clock}
        viewMode={viewMode}
        zoom={zoom}
        groups={groups}
      />
    </>
  );
}

export function MotionSceneCanvas({
  doc,
  clock,
  viewMode,
  stageColor,
  gridVisible,
  zoom,
}: MotionSceneCanvasProps) {
  return (
    <Canvas
      aria-label="Three-dimensional Motion document scene"
      camera={{ position: [3.7, 2.7, 5.1], fov: 34, near: 0.1, far: 60 }}
      dpr={[1, 1.75]}
      frameloop="demand"
      shadows
      gl={{ antialias: true, alpha: false }}
      fallback={
        <div
          role="status"
          className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground"
        >
          WebGL is unavailable. Enable hardware acceleration to preview the scene.
        </div>
      }
      onCreated={({ gl }) => {
        gl.outputColorSpace = SRGBColorSpace;
      }}
    >
      <color attach="background" args={[stageColor]} />
      {gridVisible && (
        <gridHelper
          args={[16, 32, new Color('#50596b'), new Color('#353c49')]}
          position={[0, -1.54, 0]}
        />
      )}
      <DocumentScene doc={doc} clock={clock} viewMode={viewMode} zoom={zoom} />
    </Canvas>
  );
}
