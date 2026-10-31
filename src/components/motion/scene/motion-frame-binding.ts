/**
 * components/motion/scene/motion-frame-binding.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Applies one evaluated Motion frame to an existing Three.js graph. The editor's
 * live clock and the export renderer's fixed timestamps share this function so a
 * frame cannot look one way on screen and another way in the file.
 */

import { PerspectiveCamera } from 'three';
import type { Group, Material, Object3D } from 'three';

import { evaluateMotionFrame } from '@/lib/motion/evaluate';
import type { MotionDocument, MotionNode } from '@/lib/motion/types';

export type MotionCameraView = 'perspective' | 'front';

export function motionNumberProp(node: MotionNode, key: string, fallback: number): number {
  const value = node.props[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function applyOpacity(
  object: Object3D,
  inheritedOpacity: number,
  opacityById: Map<string, number>,
): void {
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

export function applyMotionFrame({
  doc,
  time,
  groups,
  scene,
  camera,
  viewMode,
  zoom,
  writeTransforms = true,
  cachedProjection,
}: {
  doc: MotionDocument;
  time: number;
  groups: Map<string, Group>;
  scene: Object3D;
  camera: unknown;
  viewMode: MotionCameraView;
  zoom: number;
  writeTransforms?: boolean;
  /** Editor memo so camera projection is only rebuilt when fov/near/far change. */
  cachedProjection?: { current: string | null };
}): void {
  const motionScene = doc.scenes.find((candidate) => candidate.id === doc.activeSceneId);
  const frame = evaluateMotionFrame(
    {
      id: doc.activeSceneId,
      nodes: doc.scene.nodes,
      timeline: doc.timeline,
      ...(motionScene ? { name: motionScene.name, cameraId: motionScene.cameraId } : {}),
    },
    time,
  );
  const opacityById = new Map<string, number>();

  for (const node of frame.nodes) {
    const group = groups.get(node.id);
    if (!group) continue;

    if (writeTransforms) {
      group.position.set(...node.transform.position);
      group.rotation.set(...node.transform.rotation);
      group.scale.set(...node.transform.scale);
    }
    group.visible = node.visible;
    opacityById.set(node.id, motionNumberProp(node, 'opacity', 1));
    applyFontSize(group, node);
    applyLightIntensity(group, node);
  }

  applyOpacity(scene, 1, opacityById);

  const cameraNode = frame.nodes.find((node) => node.type === 'camera.perspective');
  if (cameraNode && camera instanceof PerspectiveCamera) {
    const fov = motionNumberProp(cameraNode, 'fov', camera.fov);
    const near = motionNumberProp(cameraNode, 'near', camera.near);
    const far = motionNumberProp(cameraNode, 'far', camera.far);
    camera.fov = fov;
    camera.near = near;
    camera.far = far;
    const projection = `${fov}:${near}:${far}`;
    if (!cachedProjection || cachedProjection.current !== projection) {
      camera.updateProjectionMatrix();
      if (cachedProjection) cachedProjection.current = projection;
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
}
