/**
 * main/blender/glb-meta.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Minimal GLB structural metadata parser (pure TS, no dependencies).
 *
 * Parses the binary container (magic + version + JSON chunk) and computes
 * what the authored-asset validation gate needs without a full GLTF runtime:
 *   - total triangle count (TRIANGLES primitives; strip/fan/point/line modes
 *     are not counted and are never emitted by our export path)
 *   - mesh / node inventory counts
 *   - overall bounding box from POSITION accessor min/max (optional fields —
 *     bbox is null when absent)
 *
 * This closes the "renderer will fully validate later" gap at the gate: the
 * authored pipeline must know a mesh's scale and budget BEFORE the renderer
 * sees it. Structural validation still happens renderer-side
 * (gltf-structure.ts) as before — this gate only rejects cheap-to-detect
 * garbage early.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface GlbMeta {
  /** Total triangle count across TRIANGLES-mode primitives. */
  triangles: number;
  /** Whether every TRIANGLES primitive contributed a count. */
  trianglesKnown: boolean;
  /** Number of mesh definitions in the JSON chunk. */
  meshes: number;
  /** Number of nodes in the GLB scene graph. */
  nodes: number;
  /** Named nodes present in the JSON chunk (capped at 100). */
  partNames: string[];
  /** Overall POSITION accessor min/max (per-axis), or null if unknown. */
  bbox: { min: [number, number, number]; max: [number, number, number] } | null;
  gltfVersion: number;
}

const GLB_MAGIC = 0x46546c67; // 'glTF'
const JSON_CHUNK_TYPE = 0x4e4f534a; // 'JSON'
const MODE_TRIANGLES = 4;

interface GlbPrimitive {
  mode?: number;
  indices?: { count?: number };
  attributes?: Record<string, number>;
}

interface GlbJson {
  nodes?: Array<{ name?: string; mesh?: number }>;
  meshes?: Array<{ primitives?: GlbPrimitive[] }>;
  accessors?: Array<{ count?: number; min?: number[]; max?: number[] }>;
}

function countPrimitive(
  primitive: GlbPrimitive,
  accessors: GlbJson['accessors'],
  counters: { triangles: number; trianglesKnown: boolean },
): void {
  const mode = primitive.mode ?? MODE_TRIANGLES;
  if (mode !== MODE_TRIANGLES) return;

  if (primitive.indices?.count != null) {
    counters.triangles += Math.floor(primitive.indices.count / 3);
    return;
  }

  const positionAccessor = primitive.attributes?.POSITION;
  if (positionAccessor == null) {
    counters.trianglesKnown = false;
    return;
  }
  const accessor = accessors?.[positionAccessor];
  if (accessor?.count == null) {
    counters.trianglesKnown = false;
    return;
  }
  // Non-indexed primitives emit one vertex per triangle corner.
  counters.triangles += Math.floor(accessor.count / 3);
}

export function parseGlbMeta(buffer: Uint8Array): GlbMeta | null {
  try {
    if (buffer.byteLength < 20) return null;
    const view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    if (view.getUint32(0, true) !== GLB_MAGIC) return null;
    const gltfVersion = view.getUint32(4, true);
    const totalLength = view.getUint32(8, true);
    const chunkLength = view.getUint32(12, true);
    const chunkType = view.getUint32(16, true);
    if (chunkType !== JSON_CHUNK_TYPE) return null;
    if (totalLength > buffer.byteLength) return null;
    if (chunkLength === 0 || 20 + chunkLength > buffer.byteLength) return null;

    const jsonBytes = buffer.subarray(20, 20 + chunkLength);
    const json = JSON.parse(
      new TextDecoder('utf-8').decode(jsonBytes),
    ) as GlbJson;

    const meshes = json.meshes ?? [];
    const nodes = json.nodes ?? [];
    const accessors = json.accessors;

    const counters = { triangles: 0, trianglesKnown: true };
    const bboxMin: [number, number, number] = [Infinity, Infinity, Infinity];
    const bboxMax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    let bboxKnown = false;
    const positionAccessors = new Set<number>();

    for (const mesh of meshes) {
      for (const primitive of mesh.primitives ?? []) {
        countPrimitive(primitive, accessors, counters);
        const positionAccessor = primitive.attributes?.POSITION;
        if (positionAccessor != null) positionAccessors.add(positionAccessor);
      }
    }

    for (const accessorIndex of positionAccessors) {
      const accessor = accessors?.[accessorIndex];
      if (!accessor?.min || !accessor?.max) continue;
      bboxKnown = true;
      for (let axis = 0; axis < 3; axis += 1) {
        bboxMin[axis] = Math.min(bboxMin[axis], accessor.min[axis]);
        bboxMax[axis] = Math.max(bboxMax[axis], accessor.max[axis]);
      }
    }

    const partNames = nodes
      .map((node) => node.name ?? '')
      .filter((name) => name.length > 0)
      .slice(0, 100);

    return {
      triangles: counters.triangles,
      trianglesKnown: counters.trianglesKnown,
      meshes: meshes.length,
      nodes: nodes.length,
      partNames,
      bbox:
        bboxKnown && Number.isFinite(bboxMin[0]) && Number.isFinite(bboxMax[0])
          ? {
              min: [...bboxMin] as [number, number, number],
              max: [...bboxMax] as [number, number, number],
            }
          : null,
      gltfVersion,
    };
  } catch {
    return null;
  }
}

/** Convenience: overall dimensions from the parse result (or null). */
export function glbDimensions(meta: GlbMeta): {
  width: number;
  height: number;
  depth: number;
} | null {
  if (!meta.bbox) return null;
  const { min, max } = meta.bbox;
  return {
    width: Math.abs(max[0] - min[0]),
    height: Math.abs(max[1] - min[1]),
    depth: Math.abs(max[2] - min[2]),
  };
}
