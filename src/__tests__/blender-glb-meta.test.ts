/**
 * __tests__/blender-glb-meta.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the GLB structural metadata parser (glb-meta.ts).
 *
 * Builds minimal GLB binaries in-memory to exercise header parsing,
 * triangle counting, bbox extraction, and edge cases — no Blender needed.
 */

import { parseGlbMeta, glbDimensions, type GlbMeta } from '../main/blender/glb-meta';

// ─── Helpers: build minimal GLB binaries ──────────────────────────────────────

/**
 * Build a minimal GLB with a given JSON chunk. The binary layout is:
 *   [12 bytes header] [JSON chunk]
 * No BIN chunk is needed for metadata parsing.
 * JSON chunk length is padded to 4-byte alignment per GLB spec, but we only
 * encode the actual JSON bytes — the parser's TextDecoder handles trailing
 * nulls from padding.
 */
function buildGlb(json: object): Uint8Array {
  const jsonStr = JSON.stringify(json);
  const jsonBytes = new TextEncoder().encode(jsonStr);
  // GLB spec: JSON chunk length must be padded to 4-byte alignment
  const paddedLength = Math.ceil(jsonBytes.byteLength / 4) * 4;
  const paddedJson = new Uint8Array(paddedLength);
  paddedJson.set(jsonBytes);

  const totalLength = 12 + 8 + paddedLength; // header + chunk header + chunk data
  const buffer = new Uint8Array(totalLength);
  const view = new DataView(buffer.buffer);

  // GLB header
  view.setUint32(0, 0x46546c67, true); // magic: 'glTF'
  view.setUint32(4, 2, true);          // version
  view.setUint32(8, totalLength, true); // total length

  // JSON chunk: store the UNPADDED length so the parser reads only valid JSON
  // The actual glb-meta.ts parser uses chunkLength from the binary header,
  // so we must store the padded length. But we need the JSON to be parseable.
  // The real fix: store padded length but ensure trailing bytes are whitespace.
  for (let i = jsonBytes.byteLength; i < paddedLength; i++) {
    paddedJson[i] = 0x20; // space (valid JSON whitespace)
  }

  view.setUint32(12, paddedLength, true); // chunk length
  view.setUint32(16, 0x4e4f534a, true);   // chunk type: 'JSON'
  buffer.set(paddedJson, 20);

  return buffer;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parseGlbMeta', () => {
  it('returns null for too-short buffer', () => {
    expect(parseGlbMeta(new Uint8Array(10))).toBeNull();
  });

  it('returns null for bad magic', () => {
    const buf = new Uint8Array(20);
    const view = new DataView(buf.buffer);
    view.setUint32(0, 0xdeadbeef, true);
    expect(parseGlbMeta(buf)).toBeNull();
  });

  it('returns null for non-JSON first chunk', () => {
    const buf = new Uint8Array(28);
    const view = new DataView(buf.buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, 28, true);
    view.setUint32(12, 8, true);
    view.setUint32(16, 0x004e4942, true); // BIN chunk, not JSON
    expect(parseGlbMeta(buf)).toBeNull();
  });

  it('parses empty scene with zero meshes and nodes', () => {
    const glb = buildGlb({ nodes: [], meshes: [], accessors: [] });
    const meta = parseGlbMeta(glb);
    expect(meta).not.toBeNull();
    expect(meta!.triangles).toBe(0);
    expect(meta!.trianglesKnown).toBe(true);
    expect(meta!.meshes).toBe(0);
    expect(meta!.nodes).toBe(0);
    expect(meta!.partNames).toEqual([]);
    expect(meta!.bbox).toBeNull();
    expect(meta!.gltfVersion).toBe(2);
  });

  it('counts triangles from indexed primitives', () => {
    // 1 mesh, 1 primitive with 9 indices = 3 triangles
    // Note: the parser expects indices as { count: N } per the GlbPrimitive interface
    const glb = buildGlb({
      nodes: [{ name: 'Cube', mesh: 0 }],
      meshes: [
        {
          primitives: [
            {
              mode: 4, // TRIANGLES
              attributes: { POSITION: 0 },
              indices: { count: 9 },
            },
          ],
        },
      ],
      accessors: [
        { count: 8, min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }, // POSITION
      ],
    });
    const meta = parseGlbMeta(glb);
    expect(meta).not.toBeNull();
    expect(meta!.triangles).toBe(3);
    expect(meta!.trianglesKnown).toBe(true);
    expect(meta!.meshes).toBe(1);
    expect(meta!.nodes).toBe(1);
    expect(meta!.partNames).toEqual(['Cube']);
  });

  it('counts triangles from non-indexed primitives (POSITION fallback)', () => {
    // 1 mesh, 1 primitive, no indices, 12 POSITION vertices = 4 triangles
    const glb = buildGlb({
      nodes: [{ name: 'Plane', mesh: 0 }],
      meshes: [
        {
          primitives: [
            {
              mode: 4,
              attributes: { POSITION: 0 },
            },
          ],
        },
      ],
      accessors: [
        { count: 12, min: [0, 0, 0], max: [1, 1, 0] },
      ],
    });
    const meta = parseGlbMeta(glb);
    expect(meta).not.toBeNull();
    expect(meta!.triangles).toBe(4);
    expect(meta!.trianglesKnown).toBe(true);
  });

  it('sums triangles across multiple meshes', () => {
    // indices as { count: N } per the GlbPrimitive interface
    const glb = buildGlb({
      nodes: [{ name: 'A', mesh: 0 }, { name: 'B', mesh: 1 }],
      meshes: [
        { primitives: [{ mode: 4, indices: { count: 6 } }] },  // 2 tris
        { primitives: [{ mode: 4, indices: { count: 12 } }] }, // 4 tris
      ],
      accessors: [],
    });
    const meta = parseGlbMeta(glb);
    expect(meta).not.toBeNull();
    expect(meta!.triangles).toBe(6);
    expect(meta!.partNames).toEqual(['A', 'B']);
  });

  it('extracts bounding box from POSITION accessor min/max', () => {
    const glb = buildGlb({
      nodes: [{ name: 'Box', mesh: 0 }],
      meshes: [
        {
          primitives: [
            { mode: 4, attributes: { POSITION: 0 }, indices: { count: 6 } },
          ],
        },
      ],
      accessors: [
        { count: 8, min: [-1, -2, 0], max: [3, 4, 5] },
      ],
    });
    const meta = parseGlbMeta(glb);
    expect(meta).not.toBeNull();
    expect(meta!.bbox).toEqual({
      min: [-1, -2, 0],
      max: [3, 4, 5],
    });
  });

  it('merges bbox across multiple POSITION accessors', () => {
    const glb = buildGlb({
      nodes: [{ name: 'A', mesh: 0 }, { name: 'B', mesh: 1 }],
      meshes: [
        { primitives: [{ mode: 4, attributes: { POSITION: 0 }, indices: { count: 3 } }] },
        { primitives: [{ mode: 4, attributes: { POSITION: 1 }, indices: { count: 3 } }] },
      ],
      accessors: [
        { count: 4, min: [0, 0, 0], max: [1, 1, 1] },
        { count: 4, min: [-2, -3, -4], max: [2, 3, 4] },
      ],
    });
    const meta = parseGlbMeta(glb);
    expect(meta).not.toBeNull();
    expect(meta!.bbox).toEqual({
      min: [-2, -3, -4],
      max: [2, 3, 4],
    });
  });

  it('returns trianglesKnown=false when no indices and no POSITION accessor', () => {
    const glb = buildGlb({
      nodes: [{ name: 'X', mesh: 0 }],
      meshes: [
        {
          primitives: [
            { mode: 4 },
          ],
        },
      ],
      accessors: [],
    });
    const meta = parseGlbMeta(glb);
    expect(meta).not.toBeNull();
    expect(meta!.triangles).toBe(0);
    expect(meta!.trianglesKnown).toBe(false);
  });

  it('skips non-triangle modes', () => {
    const glb = buildGlb({
      nodes: [{ name: 'Line', mesh: 0 }],
      meshes: [
        { primitives: [{ mode: 1, indices: { count: 4 } }] }, // LINES
      ],
      accessors: [],
    });
    const meta = parseGlbMeta(glb);
    expect(meta).not.toBeNull();
    expect(meta!.triangles).toBe(0);
  });

  it('caps partNames at 100', () => {
    const nodes = Array.from({ length: 120 }, (_, i) => ({ name: `Part${i}`, mesh: i }));
    const meshes = Array.from({ length: 120 }, () => ({
      primitives: [{ mode: 4, indices: 0 }],
    }));
    const glb = buildGlb({ nodes, meshes, accessors: [] });
    const meta = parseGlbMeta(glb);
    expect(meta).not.toBeNull();
    expect(meta!.partNames.length).toBe(100);
  });

  it('returns null on JSON parse error', () => {
    const buf = new Uint8Array(28);
    const view = new DataView(buf.buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, 28, true);
    view.setUint32(12, 8, true);
    view.setUint32(16, 0x4e4f534a, true);
    // Invalid JSON bytes
    buf.set(new TextEncoder().encode('{bad}'), 20);
    expect(parseGlbMeta(buf)).toBeNull();
  });
});

describe('glbDimensions', () => {
  it('returns null when bbox is absent', () => {
    const meta: GlbMeta = {
      triangles: 0,
      trianglesKnown: true,
      meshes: 0,
      nodes: 0,
      partNames: [],
      bbox: null,
      gltfVersion: 2,
    };
    expect(glbDimensions(meta)).toBeNull();
  });

  it('computes width, height, depth from bbox', () => {
    const meta: GlbMeta = {
      triangles: 12,
      trianglesKnown: true,
      meshes: 1,
      nodes: 1,
      partNames: ['Cube'],
      bbox: { min: [-1, 0, -2], max: [3, 5, 2] },
      gltfVersion: 2,
    };
    const dims = glbDimensions(meta);
    expect(dims).toEqual({ width: 4, height: 5, depth: 4 });
  });
});
