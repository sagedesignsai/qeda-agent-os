/**
 * components/motion/scene/studio-environment.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Procedural image-based lighting for the `studio` world.
 *
 * A product scene without an HDRI used to have no environment map, so chrome,
 * gold and glass reflected nothing but black. These rigs are tiny emissive
 * softboxes captured through PMREM: no asset download, deterministic output,
 * and the same rig lights the editor and the export window.
 */

import {
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Scene,
} from 'three';

import type { MotionStudioWorldVariant } from '@/lib/motion/types';

type Panel = {
  width: number;
  height: number;
  position: [number, number, number];
  color: string;
  power: number;
};

const SOFTBOX_PANELS: readonly Panel[] = [
  // Key strip, high and camera-left: the long highlight down a product edge.
  { width: 1.4, height: 7.5, position: [-4.2, 3.2, 4.8], color: '#ffffff', power: 4.2 },
  // Broad top fill.
  { width: 8, height: 2.6, position: [0, 5.2, 1], color: '#ffffff', power: 2.1 },
  // Warm rim from behind.
  { width: 1.2, height: 6, position: [4.2, 1.8, -4], color: '#ffe7d2', power: 3 },
  // Cool kicker on the opposite edge.
  { width: 0.8, height: 4.5, position: [4.8, 2.4, 3.2], color: '#cfe4ff', power: 1.5 },
  // Soft floor bounce.
  { width: 9, height: 6, position: [0, -3.4, 0.5], color: '#ffffff', power: 0.32 },
  // The panel behind the camera gives polished faces something to mirror.
  { width: 10, height: 5, position: [0, 1.4, 8.5], color: '#ffffff', power: 0.5 },
];

const DARK_PANELS: readonly Panel[] = [
  { width: 1, height: 6, position: [-4.4, 2.6, 4.2], color: '#bcd4ff', power: 3.4 },
  { width: 0.8, height: 5, position: [4.4, 1.4, -3.8], color: '#ffcf9e', power: 2.6 },
  { width: 4.5, height: 1.6, position: [0, 4.8, 0], color: '#ffffff', power: 0.9 },
  { width: 8, height: 5, position: [0, -3.2, 0.5], color: '#1a2230', power: 0.4 },
  { width: 8, height: 4, position: [0, 1, 8.4], color: '#2a3344', power: 0.5 },
];

function addPanel(scene: Scene, panel: Panel): void {
  const material = new MeshBasicMaterial({
    color: new Color(panel.color).multiplyScalar(panel.power),
    side: DoubleSide,
    toneMapped: false,
  });
  const mesh = new Mesh(new PlaneGeometry(panel.width, panel.height), material);
  mesh.position.set(...panel.position);
  mesh.lookAt(0, 0, 0);
  scene.add(mesh);
}

/**
 * Build the studio scene that PMREM captures. `room` is handled by the caller
 * because three's RoomEnvironment must be imported lazily in the renderer.
 */
export function createStudioScene(variant: Exclude<MotionStudioWorldVariant, 'room'>): Scene {
  const scene = new Scene();
  for (const panel of variant === 'dark' ? DARK_PANELS : SOFTBOX_PANELS) {
    addPanel(scene, panel);
  }
  return scene;
}

export function disposeStudioScene(scene: Scene): void {
  scene.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.isMesh) {
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material.dispose();
    }
  });
}