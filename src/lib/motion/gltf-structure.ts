/**
 * lib/motion/gltf-structure.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure glTF structure parser. Extracts named parts (meshes) and materials from
 * a loaded GLTF object so the model node can expose its internal structure for
 * surface bindings and per-part animation.
 *
 * Adapted from gltfjsx's traversal logic but returns structured metadata instead
 * of generating JSX code. Runs in the renderer (WebGL context) but the function
 * itself is pure — no side effects, no state.
 */

import type { Object3D } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type GltfPart = {
  name: string;
  type: 'mesh' | 'instancedMesh' | 'primitive';
  materialName?: string;
  geometryUuid?: string;
};

export type GltfMaterial = {
  name: string;
  type: string;
};

export type GltfAssetMetadata = {
  parts: GltfPart[];
  materials: GltfMaterial[];
};

// ── Parser ───────────────────────────────────────────────────────────────────

/**
 * Traverse a loaded GLTF scene graph and extract parts (meshes) and materials.
 * Filters out empty groups and bones. Returns structured metadata that can be
 * stored in `asset.metadata` and shared across nodes using the same model.
 */
export function parseGltfStructure(gltf: GLTF): GltfAssetMetadata {
  const parts: GltfPart[] = [];
  const materialMap = new Map<string, GltfMaterial>();

  gltf.scene.traverse((child) => {
    // Handle meshes
    if ((child as Object3D & { isMesh?: boolean }).isMesh) {
      const mesh = child as Object3D & {
        name: string;
        material?: unknown;
        geometry?: { uuid?: string };
      };

      const partName = mesh.name || `Part${parts.length}`;
      const materialName = getMaterialName(mesh.material);
      const geometryUuid = mesh.geometry?.uuid;

      parts.push({
        name: partName,
        type: 'mesh',
        materialName,
        geometryUuid,
      });

      // Collect material info
      collectMaterials(mesh.material, materialMap);
    }

    // Handle instanced meshes
    if ((child as Object3D & { isInstancedMesh?: boolean }).isInstancedMesh) {
      const instanced = child as Object3D & {
        name: string;
        material?: unknown;
        geometry?: { uuid?: string };
      };

      const partName = instanced.name || `Part${parts.length}`;
      const materialName = getMaterialName(instanced.material);

      parts.push({
        name: partName,
        type: 'instancedMesh',
        materialName,
        geometryUuid: instanced.geometry?.uuid,
      });

      collectMaterials(instanced.material, materialMap);
    }
  });

  return {
    parts,
    materials: [...materialMap.values()],
  };
}

function getMaterialName(material: unknown): string | undefined {
  if (!material) return undefined;
  if (Array.isArray(material)) {
    // Multi-material mesh: return the first named material
    const named = (material as Array<{ name?: string }>).find(
      (m) => m && typeof m === 'object' && 'name' in m && (m as { name: string }).name,
    );
    return named ? (named as { name: string }).name : undefined;
  }
  if (typeof material === 'object' && 'name' in material) {
    const name = (material as { name: string }).name;
    return name || undefined;
  }
  return undefined;
}

function collectMaterials(material: unknown, materialMap: Map<string, GltfMaterial>): void {
  const materials = Array.isArray(material) ? material : [material];
  for (const mat of materials) {
    if (!mat || typeof mat !== 'object') continue;
    const matObj = mat as { name?: string; type?: string; constructor?: { name?: string } };
    const name = matObj.name || '';
    // Skip unnamed materials that would create duplicates
    if (!name) continue;
    if (materialMap.has(name)) continue;

    // Determine material type from constructor name
    const type =
      matObj.type ||
      (matObj.constructor && matObj.constructor.name) ||
      'Material';

    materialMap.set(name, { name, type });
  }
}
