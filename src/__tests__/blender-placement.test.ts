/**
 * __tests__/blender-placement.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Regression test for the Blender placement pipeline: the generated GLB
 * was registered with an `asset.add` op whose MotionAsset fields were
 * wrapped in an `asset: {}` key. `asset.add` takes those fields flat, so
 * `id` arrived undefined and placement failed
 * (`asset.add: id — Invalid input: expected string, received undefined`)
 * even though generation itself succeeded.
 *
 * No Blender needed: exercises buildBlenderPlacementOps against the real
 * ops pipeline.
 */

import { applyMotionOps } from '../lib/motion/ops';
import { createStarterMotionDocument } from '../lib/motion/defaults';
import { buildBlenderPlacementOps } from '../main/tools/blender';

describe('buildBlenderPlacementOps', () => {
  it('emits a flat asset.add op that validates and places a model.gltf node', () => {
    const doc = createStarterMotionDocument('2026-01-01T00:00:00.000Z');
    // Shape of a staged asset record (see stageModelIntoProject):
    // bundle-relative path + real 64-char hex content hash.
    const ops = buildBlenderPlacementOps({
      assetId: 'asset_chair1',
      path: 'assets/asset_chair1/source.glb',
      nodeName: 'Modern Minimalist Chair',
      nodeId: 'chair',
      bytes: 1234,
      hash: 'a'.repeat(64),
      metadata: { brief: 'modern minimalist chair with wooden legs' },
    });

    const addOp = ops[0] as Record<string, unknown>;
    // The bug: fields were nested under `asset: {}`, leaving top-level
    // `id` undefined. They must be flat on the op.
    expect(addOp.op).toBe('asset.add');
    expect(addOp.asset).toBeUndefined();
    expect(addOp.id).toBe('asset_chair1');

    const next = applyMotionOps(doc, ops as never, { now: '2026-01-01T00:00:01.000Z' });

    const asset = next.assets.find((candidate) => candidate.id === 'asset_chair1');
    expect(asset).toMatchObject({
      id: 'asset_chair1',
      name: 'Modern Minimalist Chair',
      kind: 'model',
      path: 'assets/asset_chair1/source.glb',
      hash: 'a'.repeat(64),
      byteSize: 1234,
    });

    const node = next.scene.nodes.find((candidate) => candidate.id === 'chair');
    expect(node?.type).toBe('model.gltf');
    expect(node?.props.assetId).toBe('asset_chair1');
  });
});
