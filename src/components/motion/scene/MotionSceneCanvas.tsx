/**
 * components/motion/scene/MotionSceneCanvas.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * R3F host for Motion's renderer-neutral document graph. It evaluates the
 * document at the shared playback clock and binds node transforms to Three.js.
 */

import { useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { TransformControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Color, SRGBColorSpace } from 'three';
import type { Group } from 'three';

import {
  getMotionThreeRenderer,
  MissingRenderer,
} from '@/components/motion/scene/MotionNodeRenderers';
import {
  applyMotionFrame,
  motionNumberProp,
  type MotionCameraView,
} from '@/components/motion/scene/motion-frame-binding';
import type { MotionDocument, MotionNode } from '@/lib/motion/types';
import type { PlaybackClock } from '@/lib/timeline/clock';

export type { MotionCameraView } from '@/components/motion/scene/motion-frame-binding';
export type MotionStageColor = string;

type MotionSceneCanvasProps = {
  doc: MotionDocument;
  clock: PlaybackClock;
  viewMode: MotionCameraView;
  stageColor: MotionStageColor;
  gridVisible: boolean;
  zoom: number;
  selectedNodeId?: string;
  onSelectNode?: (nodeId: string) => void;
  onTransformNode?: (nodeId: string, transform: MotionNode['transform']) => void;
  /** Export renders without the editor floor; the document's own nodes remain. */
  showEditorStage?: boolean;
  dpr?: number;
  preserveDrawingBuffer?: boolean;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
};

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
  selectedNodeId,
  onSelectNode,
  onTransformNode,
  transformingRef,
}: {
  node: MotionNode;
  childrenByParent: Map<string | null, MotionNode[]>;
  groups: Map<string, Group>;
  selectedNodeId?: string;
  onSelectNode?: (nodeId: string) => void;
  onTransformNode?: (nodeId: string, transform: MotionNode['transform']) => void;
  transformingRef: MutableRefObject<boolean>;
}) {
  const Renderer = getMotionThreeRenderer(node.type) ?? MissingRenderer;
  const childNodes = childrenByParent.get(node.id) ?? [];

  const group = (
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
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelectNode?.(node.id);
      }}
    >
      <Renderer node={node} />
      {childNodes.map((child) => (
        <DocumentNode
          key={child.id}
          node={child}
          childrenByParent={childrenByParent}
          groups={groups}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
          onTransformNode={onTransformNode}
          transformingRef={transformingRef}
        />
      ))}
    </group>
  );
  if (selectedNodeId !== node.id || node.locked || node.type.startsWith('camera.')) return group;
  return (
    <TransformControls
      mode="translate"
      onMouseDown={() => { transformingRef.current = true; }}
      onMouseUp={() => {
        transformingRef.current = false;
        const object = groups.get(node.id);
        if (!object) return;
        onTransformNode?.(node.id, {
          position: [object.position.x, object.position.y, object.position.z],
          rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
          scale: [object.scale.x, object.scale.y, object.scale.z],
        });
      }}
    >
      {group}
    </TransformControls>
  );
}

function MotionFrameDriver({
  doc,
  clock,
  viewMode,
  zoom,
  groups,
  transformingRef,
}: {
  doc: MotionDocument;
  clock: PlaybackClock;
  viewMode: MotionCameraView;
  zoom: number;
  groups: Map<string, Group>;
  transformingRef: MutableRefObject<boolean>;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const lastProjection = useRef<string | null>(null);

  useEffect(() => clock.subscribe(invalidate), [clock, invalidate]);

  useFrame(() => {
    applyMotionFrame({
      doc,
      time: clock.getTime(),
      groups,
      scene,
      camera,
      viewMode,
      zoom,
      writeTransforms: !transformingRef.current,
      cachedProjection: lastProjection,
    });
  });

  return null;
}

function DocumentScene({
  doc,
  clock,
  viewMode,
  zoom,
  selectedNodeId,
  onSelectNode,
  onTransformNode,
  showEditorStage = true,
}: {
  doc: MotionDocument;
  clock: PlaybackClock;
  viewMode: MotionCameraView;
  zoom: number;
  selectedNodeId?: string;
  onSelectNode?: (nodeId: string) => void;
  onTransformNode?: (nodeId: string, transform: MotionNode['transform']) => void;
  showEditorStage?: boolean;
}) {
  const groups = useMemo(() => new Map<string, Group>(), []);
  const transformingRef = useRef(false);
  const childrenByParent = useMemo(() => indexNodes(doc.scene.nodes), [doc.scene.nodes]);
  const rootNodes = childrenByParent.get(null) ?? [];

  return (
    <>
      {showEditorStage && (
        <mesh position={[0, -1.55, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[18, 18]} />
          <meshStandardMaterial color="#1a1e27" roughness={0.82} metalness={0.08} />
        </mesh>
      )}

      {rootNodes.map((node) => (
        <DocumentNode
          key={node.id}
          node={node}
          childrenByParent={childrenByParent}
          groups={groups}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
          onTransformNode={onTransformNode}
          transformingRef={transformingRef}
        />
      ))}

      <MotionFrameDriver
        doc={doc}
        clock={clock}
        viewMode={viewMode}
        zoom={zoom}
        groups={groups}
        transformingRef={transformingRef}
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
  selectedNodeId,
  onSelectNode,
  onTransformNode,
  showEditorStage = true,
  dpr = 1.75,
  preserveDrawingBuffer = false,
  onCanvasReady,
}: MotionSceneCanvasProps) {
  return (
    <Canvas
      aria-label="Three-dimensional Motion document scene"
      camera={{ position: [3.7, 2.7, 5.1], fov: 34, near: 0.1, far: 60 }}
      dpr={dpr}
      frameloop="demand"
      shadows
      gl={{ antialias: true, alpha: false, preserveDrawingBuffer }}
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
        onCanvasReady?.(gl.domElement);
      }}
    >
      <color attach="background" args={[stageColor]} />
      {gridVisible && (
        <gridHelper
          args={[16, 32, new Color('#50596b'), new Color('#353c49')]}
          position={[0, -1.54, 0]}
        />
      )}
      <DocumentScene doc={doc} clock={clock} viewMode={viewMode} zoom={zoom} selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} onTransformNode={onTransformNode} showEditorStage={showEditorStage} />
    </Canvas>
  );
}
