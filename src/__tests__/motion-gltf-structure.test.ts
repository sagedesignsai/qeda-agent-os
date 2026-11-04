/**
 * __tests__/motion-gltf-structure.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for the glTF structure parser, asset.update-metadata op, and dynamic
 * animatable part properties. Uses mock GLTF objects since the parser is pure
 * — no WebGL needed, just the scene graph traversal logic.
 */

import { parseGltfStructure } from '@/lib/motion/gltf-structure';
import { applyMotionOp, applyMotionOps } from '@/lib/motion/ops';
import { hasAnimatableProperty, applyNodeProperty, createMotionNode } from '@/lib/motion/node-registry';
import type { MotionDocument } from '@/lib/motion/types';

// Mock GLTF structure matching three.js types
function createMockGLTF(meshes: Array<{ name: string; materialName?: string; geometryUuid?: string }>) {
  const mockScene = {
    traverse: (callback: (child: unknown) => void) => {
      for (const mesh of meshes) {
        const material = mesh.materialName ? { name: mesh.materialName, type: 'MeshStandardMaterial' } : undefined;
        const geometry = mesh.geometryUuid ? { uuid: mesh.geometryUuid } : undefined;
        callback({
          isMesh: true,
          name: mesh.name,
          material,
          geometry,
        });
      }
    },
  };
  return { scene: mockScene as unknown as { traverse: (cb: (c: unknown) => void) => void } };
}

describe('parseGltfStructure', () => {
  it('extracts named meshes with materials', () => {
    const gltf = createMockGLTF([
      { name: 'TV_Screen', materialName: 'Screen_Material', geometryUuid: 'geo-1' },
      { name: 'TV_Body', materialName: 'Plastic_Black', geometryUuid: 'geo-2' },
      { name: 'TV_Stand', materialName: 'Metal_Silver', geometryUuid: 'geo-3' },
    ]);

    const result = parseGltfStructure(gltf as any);

    expect(result.parts).toHaveLength(3);
    expect(result.parts[0]).toEqual({
      name: 'TV_Screen',
      type: 'mesh',
      materialName: 'Screen_Material',
      geometryUuid: 'geo-1',
    });
    expect(result.parts[1]).toEqual({
      name: 'TV_Body',
      type: 'mesh',
      materialName: 'Plastic_Black',
      geometryUuid: 'geo-2',
    });
    expect(result.parts[2]).toEqual({
      name: 'TV_Stand',
      type: 'mesh',
      materialName: 'Metal_Silver',
      geometryUuid: 'geo-3',
    });
    expect(result.materials).toHaveLength(3);
    expect(result.materials.map((m) => m.name)).toEqual(['Screen_Material', 'Plastic_Black', 'Metal_Silver']);
  });

  it('handles unnamed meshes by generating Part names', () => {
    const gltf = createMockGLTF([
      { name: '', materialName: 'Mat1', geometryUuid: 'geo-1' },
      { name: '', materialName: 'Mat2', geometryUuid: 'geo-2' },
    ]);

    const result = parseGltfStructure(gltf as any);

    expect(result.parts[0].name).toBe('Part0');
    expect(result.parts[1].name).toBe('Part1');
  });

  it('handles meshes without materials', () => {
    const gltf = createMockGLTF([
      { name: 'Mesh1', geometryUuid: 'geo-1' },
      { name: 'Mesh2', geometryUuid: 'geo-2' },
    ]);

    const result = parseGltfStructure(gltf as any);

    expect(result.parts[0].materialName).toBeUndefined();
    expect(result.parts[1].materialName).toBeUndefined();
    expect(result.materials).toHaveLength(0);
  });

  it('deduplicates materials with the same name', () => {
    const gltf = createMockGLTF([
      { name: 'Part1', materialName: 'Shared_Material', geometryUuid: 'geo-1' },
      { name: 'Part2', materialName: 'Shared_Material', geometryUuid: 'geo-2' },
      { name: 'Part3', materialName: 'Shared_Material', geometryUuid: 'geo-3' },
    ]);

    const result = parseGltfStructure(gltf as any);

    expect(result.parts).toHaveLength(3);
    expect(result.materials).toHaveLength(1);
    expect(result.materials[0].name).toBe('Shared_Material');
  });

  it('returns empty arrays for empty scene', () => {
    const gltf = createMockGLTF([]);
    const result = parseGltfStructure(gltf as any);
    expect(result.parts).toHaveLength(0);
    expect(result.materials).toHaveLength(0);
  });

  it('collects unique materials across meshes', () => {
    const gltf = createMockGLTF([
      { name: 'Screen', materialName: 'Screen_Mat', geometryUuid: 'geo-1' },
      { name: 'Body', materialName: 'Body_Mat', geometryUuid: 'geo-2' },
      { name: 'Stand', materialName: 'Body_Mat', geometryUuid: 'geo-3' },
    ]);

    const result = parseGltfStructure(gltf as any);

    expect(result.materials).toHaveLength(2);
    expect(result.materials.map((m) => m.name)).toEqual(['Screen_Mat', 'Body_Mat']);
  });
});

describe('asset.update-metadata op', () => {
  function createEmptyDoc(): MotionDocument {
    return {
      schemaVersion: 4,
      revision: 0,
      meta: { id: 'prj-test', name: 'Test', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', output: { fps: 30, width: 1920, height: 1080 } },
      brand: { name: 'Test', colors: { primary: '#000', secondary: '#000', accent: '#000', background: '#000', foreground: '#fff', muted: '#888' }, fonts: { heading: { family: 'sans-serif' }, body: { family: 'sans-serif' } }, safeArea: { top: 0, bottom: 0, left: 0, right: 0 }, cornerRadius: 8, defaults: { easing: { type: 'linear' }, duration: 1 } },
      assets: [],
      scenes: [{ id: 'scene-1', name: 'Scene', nodes: [], timeline: { duration: 5, tracks: [], clips: [] }, cameraId: null }],
      activeSceneId: 'scene-1',
      scene: { nodes: [] },
      timeline: { duration: 5, loop: { enabled: false, start: 0, end: 5 }, tracks: [], clips: [] },
    };
  }

  it('updates asset metadata', () => {
    let doc = createEmptyDoc();
    doc = applyMotionOp(doc, {
      op: 'asset.add',
      id: 'model-1',
      name: 'TV',
      kind: 'model',
      mimeType: 'model/gltf-binary',
      path: 'assets/tv.glb',
      hash: 'a'.repeat(64),
      byteSize: 1024,
      createdAt: '2026-01-01T00:00:00Z',
    });

    doc = applyMotionOp(doc, {
      op: 'asset.update-metadata',
      assetId: 'model-1',
      metadata: { parts: [{ name: 'Screen', type: 'mesh' }], materials: [{ name: 'Mat1', type: 'MeshStandardMaterial' }] },
    });

    const asset = doc.assets.find((a) => a.id === 'model-1');
    expect(asset?.metadata).toEqual({
      parts: [{ name: 'Screen', type: 'mesh' }],
      materials: [{ name: 'Mat1', type: 'MeshStandardMaterial' }],
    });
  });

  it('merges metadata fields', () => {
    let doc = createEmptyDoc();
    doc = applyMotionOp(doc, {
      op: 'asset.add',
      id: 'model-1',
      name: 'TV',
      kind: 'model',
      mimeType: 'model/gltf-binary',
      path: 'assets/tv.glb',
      hash: 'a'.repeat(64),
      byteSize: 1024,
      createdAt: '2026-01-01T00:00:00Z',
      metadata: { parts: [{ name: 'Screen', type: 'mesh' }] },
    });

    doc = applyMotionOp(doc, {
      op: 'asset.update-metadata',
      assetId: 'model-1',
      metadata: { materials: [{ name: 'Mat1', type: 'MeshStandardMaterial' }] },
    });

    const asset = doc.assets.find((a) => a.id === 'model-1');
    expect(asset?.metadata).toEqual({
      parts: [{ name: 'Screen', type: 'mesh' }],
      materials: [{ name: 'Mat1', type: 'MeshStandardMaterial' }],
    });
  });

  it('throws for non-existent asset', () => {
    const doc = createEmptyDoc();
    expect(() => applyMotionOp(doc, { op: 'asset.update-metadata', assetId: 'missing', metadata: {} })).toThrow('Asset "missing" does not exist');
  });
});

describe('dynamic animatable part properties', () => {
  it('recognizes partOverrides.*.opacity as animatable', () => {
    expect(hasAnimatableProperty('model.gltf', 'partOverrides.Screen.opacity')).toBe(true);
  });

  it('recognizes partOverrides.*.position.x as animatable', () => {
    expect(hasAnimatableProperty('model.gltf', 'partOverrides.Screen.position.x')).toBe(true);
  });

  it('recognizes partOverrides.*.rotation.y as animatable', () => {
    expect(hasAnimatableProperty('model.gltf', 'partOverrides.Screen.rotation.y')).toBe(true);
  });

  it('recognizes partOverrides.*.scale.z as animatable', () => {
    expect(hasAnimatableProperty('model.gltf', 'partOverrides.Screen.scale.z')).toBe(true);
  });

  it('does not recognize invalid part properties', () => {
    expect(hasAnimatableProperty('model.gltf', 'partOverrides.Screen.invalid')).toBe(false);
  });

  it('does not recognize part properties on non-model types', () => {
    expect(hasAnimatableProperty('screen.image', 'partOverrides.Screen.opacity')).toBe(false);
  });

  it('applies part override opacity', () => {
    const node = createMotionNode('model.gltf', 'model-1');
    const updated = applyNodeProperty(node, 'partOverrides.Screen.opacity', 0.5);
    expect(updated.props.partOverrides).toEqual({ Screen: { opacity: 0.5 } });
  });

  it('applies part override position.x', () => {
    const node = createMotionNode('model.gltf', 'model-1');
    const updated = applyNodeProperty(node, 'partOverrides.Screen.position.x', 1.5);
    expect(updated.props.partOverrides).toEqual({ Screen: { position: [1.5, 0, 0] } });
  });

  it('merges with existing part overrides', () => {
    const node = createMotionNode('model.gltf', 'model-1');
    let updated = applyNodeProperty(node, 'partOverrides.Screen.opacity', 0.5);
    updated = applyNodeProperty(updated, 'partOverrides.Screen.position.x', 2.0);
    expect(updated.props.partOverrides).toEqual({
      Screen: { opacity: 0.5, position: [2.0, 0, 0] },
    });
  });
});
