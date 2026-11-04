/**
 * __tests__/motion-model-ops.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for 3D model node ops: missingAsset flag clearing, asset reference
 * validation, and auto-binding on import.
 */

import { createEmptyMotionDocument } from '@/lib/motion/defaults';
import { applyMotionOp, MotionOpError } from '@/lib/motion/ops';
import { createMotionNode } from '@/lib/motion/node-registry';
import type { MotionAsset } from '@/lib/motion/types';

function makeModelAsset(overrides?: Partial<MotionAsset>): MotionAsset {
  return {
    id: 'model_tv_01',
    name: 'Television 01',
    kind: 'model',
    mimeType: 'model/gltf-binary',
    path: 'assets/models/tv.glb',
    hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    byteSize: 1024,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Model node ops', () => {
  let doc: ReturnType<typeof createEmptyMotionDocument>;

  beforeEach(() => {
    doc = createEmptyMotionDocument({ now: '2026-01-01T00:00:00.000Z' });
  });

  describe('scene.node.add clears missingAsset', () => {
    it('clears missingAsset when created with a valid assetId', () => {
      const asset = makeModelAsset();
      doc = applyMotionOp(doc, { op: 'asset.add', ...asset });

      doc = applyMotionOp(doc, {
        op: 'scene.node.add',
        nodeId: 'model1',
        type: 'model.gltf',
        props: { assetId: 'model_tv_01' },
      });

      const node = doc.scene.nodes.find((n) => n.id === 'model1');
      expect(node?.props.assetId).toBe('model_tv_01');
      expect(node?.props.missingAsset).toBe(false);
    });

    it('keeps missingAsset when created without assetId', () => {
      doc = applyMotionOp(doc, { op: 'scene.node.add', nodeId: 'model1', type: 'model.gltf' });

      const node = doc.scene.nodes.find((n) => n.id === 'model1');
      expect(node?.props.missingAsset).toBe(true);
      expect(node?.props.assetId).toBe('missing:model');
    });
  });

  describe('scene.node.update clears missingAsset', () => {
    it('clears missingAsset when assetId is set to a valid value', () => {
      const modelNode = createMotionNode('model.gltf', 'model1');
      expect(modelNode.props.missingAsset).toBe(true);

      doc = applyMotionOp(doc, { op: 'scene.node.add', nodeId: 'model1', type: 'model.gltf' });

      doc = applyMotionOp(doc, {
        op: 'scene.node.update',
        nodeId: 'model1',
        props: { assetId: 'model_tv_01' },
      });

      const node = doc.scene.nodes.find((n) => n.id === 'model1');
      expect(node?.props.missingAsset).toBe(false);
      expect(node?.props.assetId).toBe('model_tv_01');
    });

    it('does not clear missingAsset when assetId is a missing placeholder', () => {
      doc = applyMotionOp(doc, { op: 'scene.node.add', nodeId: 'model1', type: 'model.gltf' });

      doc = applyMotionOp(doc, {
        op: 'scene.node.update',
        nodeId: 'model1',
        props: { assetId: 'missing:model' },
      });

      const node = doc.scene.nodes.find((n) => n.id === 'model1');
      expect(node?.props.missingAsset).toBe(true);
    });
  });

  describe('validateNodeAssetReference for model.gltf', () => {
    it('allows model nodes with missingAsset: true', () => {
      expect(() => {
        doc = applyMotionOp(doc, { op: 'scene.node.add', nodeId: 'model1', type: 'model.gltf' });
      }).not.toThrow();
    });

    it('allows model nodes with missing:* assetId and missingAsset: true', () => {
      expect(() => {
        doc = applyMotionOp(doc, {
          op: 'scene.node.add',
          nodeId: 'model1',
          type: 'model.gltf',
          props: { assetId: 'missing:model', missingAsset: true },
        });
      }).not.toThrow();
    });

    it('throws when assetId references non-existent asset and missingAsset is false', () => {
      doc = applyMotionOp(doc, { op: 'scene.node.add', nodeId: 'model1', type: 'model.gltf' });

      // First add a real asset so the document has one
      const asset = makeModelAsset();
      doc = applyMotionOp(doc, { op: 'asset.add', ...asset });

      // Then set assetId to a non-existent value and clear missingAsset
      expect(() => {
        doc = applyMotionOp(doc, {
          op: 'scene.node.update',
          nodeId: 'model1',
          props: { assetId: 'nonexistent_model', missingAsset: false },
        });
      }).toThrow(MotionOpError);
    });

    it('allows model nodes when assetId matches an existing asset', () => {
      doc = applyMotionOp(doc, { op: 'scene.node.add', nodeId: 'model1', type: 'model.gltf' });
      const asset = makeModelAsset();
      doc = applyMotionOp(doc, { op: 'asset.add', ...asset });

      expect(() => {
        doc = applyMotionOp(doc, {
          op: 'scene.node.update',
          nodeId: 'model1',
          props: { assetId: 'model_tv_01' },
        });
      }).not.toThrow();

      const node = doc.scene.nodes.find((n) => n.id === 'model1');
      expect(node?.props.assetId).toBe('model_tv_01');
      expect(node?.props.missingAsset).toBe(false);
    });
  });

  describe('asset.add auto-binding', () => {
    it('auto-binds model asset to a single missing-asset model node', () => {
      doc = applyMotionOp(doc, { op: 'scene.node.add', nodeId: 'model1', type: 'model.gltf' });

      const asset = makeModelAsset();
      doc = applyMotionOp(doc, { op: 'asset.add', ...asset });

      const node = doc.scene.nodes.find((n) => n.id === 'model1');
      expect(node?.props.assetId).toBe('model_tv_01');
      expect(node?.props.missingAsset).toBe(false);
    });

    it('does NOT auto-bind when multiple missing-asset nodes exist', () => {
      doc = applyMotionOp(doc, { op: 'scene.node.add', nodeId: 'model1', type: 'model.gltf' });
      doc = applyMotionOp(doc, { op: 'scene.node.add', nodeId: 'model2', type: 'model.gltf' });

      const asset = makeModelAsset();
      doc = applyMotionOp(doc, { op: 'asset.add', ...asset });

      const node1 = doc.scene.nodes.find((n) => n.id === 'model1');
      const node2 = doc.scene.nodes.find((n) => n.id === 'model2');
      expect(node1?.props.missingAsset).toBe(true);
      expect(node2?.props.missingAsset).toBe(true);
      expect(node1?.props.assetId).toBe('missing:model');
      expect(node2?.props.assetId).toBe('missing:model');
    });

    it('does NOT auto-bind non-model assets', () => {
      doc = applyMotionOp(doc, { op: 'scene.node.add', nodeId: 'model1', type: 'model.gltf' });

      const imageAsset = {
        id: 'img_01',
        name: 'Background',
        kind: 'image' as const,
        mimeType: 'image/png',
        path: 'assets/images/bg.png',
        hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        byteSize: 512,
        frameCount: 1,
        fps: 30,
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      doc = applyMotionOp(doc, { op: 'asset.add', ...imageAsset });

      const node = doc.scene.nodes.find((n) => n.id === 'model1');
      expect(node?.props.missingAsset).toBe(true);
      expect(node?.props.assetId).toBe('missing:model');
    });

    it('auto-binds when no missing-asset nodes exist, does nothing', () => {
      doc = applyMotionOp(doc, { op: 'scene.node.add', nodeId: 'model1', type: 'model.gltf' });
      // Pre-bind the node so it's not missing
      const asset1 = makeModelAsset({ id: 'model_existing', name: 'Existing' });
      doc = applyMotionOp(doc, { op: 'asset.add', ...asset1 });
      doc = applyMotionOp(doc, {
        op: 'scene.node.update',
        nodeId: 'model1',
        props: { assetId: 'model_existing' },
      });

      // Import a new model — no missing nodes, so nothing should change
      const asset2 = makeModelAsset({ id: 'model_new', name: 'New Model' });
      doc = applyMotionOp(doc, { op: 'asset.add', ...asset2 });

      const node = doc.scene.nodes.find((n) => n.id === 'model1');
      expect(node?.props.assetId).toBe('model_existing');
      expect(node?.props.missingAsset).toBe(false);
    });
  });

  describe('batch ops: asset.add followed by scene.node.update', () => {
    it('clears missingAsset in a batch when binding via Inspector flow', () => {
      doc = applyMotionOp(doc, { op: 'scene.node.add', nodeId: 'model1', type: 'model.gltf' });
      const asset = makeModelAsset();
      doc = applyMotionOp(doc, { op: 'asset.add', ...asset });

      // Simulate Inspector binding flow
      doc = applyMotionOp(doc, {
        op: 'scene.node.update',
        nodeId: 'model1',
        props: { assetId: 'model_tv_01' },
      });

      const node = doc.scene.nodes.find((n) => n.id === 'model1');
      expect(node?.props.assetId).toBe('model_tv_01');
      expect(node?.props.missingAsset).toBe(false);
    });
  });
});
