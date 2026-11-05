/**
 * __tests__/motion-template-models.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Template ↔ bundled-model binding: templates reference catalog GLBs by
 * `local:` id; main-process staging converts those references into real
 * project assets with a fit-baked transform, and retargets keyframes so the
 * animated rest pose matches the baked rest pose.
 */

import { createMotionTemplate } from '@/lib/motion/templates';
import { evaluateMotionFrame } from '@/lib/motion/evaluate';
import { parseMotionDocument } from '@/lib/motion/schema';
import type { MotionAsset } from '@/lib/motion/types';
import { findTemplateModelNodes, stageTemplateModels } from '@/main/motion/template-assets';
import type { MotionLocalModelEntry } from '@/main/motion/local-models';

const fakeCatalogEntry = (id: string): MotionLocalModelEntry => ({
  id,
  name: id.split('/').pop() ?? id,
  source: 'test',
  relativePath: `${id}.glb`,
  byteSize: 10,
  hasAnimations: false,
  animationCount: 0,
  animationNames: [],
  hasSkin: false,
  skinCount: 0,
  boneCount: 0,
  nodeCount: 1,
  nodeNames: [],
  meshCount: 1,
  materialCount: 1,
  materialNames: [],
  cameraCount: 0,
  textureCount: 0,
  // Center-pivoted 4-unit model: fit height 1 → scale 0.25, origin offset.
  boundsMin: [-0.5, -2, -0.5],
  boundsMax: [0.5, 2, 0.5],
});

const committedAsset: MotionAsset = {
  id: 'asset_model',
  name: 'model',
  kind: 'model',
  mimeType: 'model/gltf-binary',
  path: 'assets/asset_model/source.glb',
  hash: 'a'.repeat(64),
  byteSize: 1024,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function fakeStore() {
  return {
    stageAssets: async () => {
      recorder.stages.push(['stage']);
      return {
        items: [
          {
            importId: 'import_1',
            name: 'model',
            sourceName: 'model.glb',
            probeUrl: 'file:///staged/model.glb',
            kind: 'model' as const,
            mimeType: 'model/gltf-binary',
            byteSize: 1024,
            warnings: [],
          },
        ],
        errors: [],
      };
    },
    commitAssets: async () => ({ assets: [committedAsset], errors: [] }),
  };
}

const recorder = { stages: [] as string[][] };

describe('template model staging', () => {
  it('finds model nodes that reference bundled catalog models', () => {
    const doc = createMotionTemplate('game-showcase');
    const hits = findTemplateModelNodes(doc);
    expect(hits.map((h) => h.node.props.assetId)).toContain('local:khronos/CesiumMan');
    expect(hits.every((h) => h.node.type === 'model.gltf')).toBe(true);
  });

  it('stages, rewrites assetId, bakes the fit transform, and appends the asset record', async () => {
    recorder.stages.length = 0;
    const doc = createMotionTemplate('game-showcase');
    const result = await stageTemplateModels('proj_1', doc, fakeStore(), [fakeCatalogEntry('local:khronos/CesiumMan')]);

    expect(result.report.staged).toEqual(['local:khronos/CesiumMan']);
    expect(result.report.skipped).toEqual([]);

    const model = result.document.scenes[1].nodes.find((n) => n.id === 'model')!;
    expect(model.props.assetId).toBe('asset_model');
    expect(model.props.missingAsset).toBe(false);
    expect(model.props.fitHeight).toBeUndefined();
    expect(model.props.restBottom).toBeUndefined();

    // 1.5-unit target ÷ 4-unit model → scale 0.375; floor −2×0.375 = −0.75 below
    // origin → origin restY = restBottom − 0.25×(−2)... restBottom − scale·minY −
    // see fit math: (−0.5) − 0.375·(−2) = 0.25.
    expect(model.transform.scale[0]).toBeCloseTo(0.375, 10);
    expect(model.transform.position[1]).toBeCloseTo(0.25, 10);

    expect(result.document.assets.map((a) => a.id)).toContain('asset_model');
  });

  it('retargets the rise-in position keys so the end pose is the baked rest pose', async () => {
    recorder.stages.length = 0;
    const doc = createMotionTemplate('game-showcase');
    const result = await stageTemplateModels('proj_1', doc, fakeStore(), [fakeCatalogEntry('local:khronos/CesiumMan')]);
    const turntable = result.document.scenes[1];
    const rise = turntable.timeline.clips.find((c) => c.id === 's2_model_in')!;
    const y = rise.channels.find((c) => c.property === 'position.y')!;
    const [first, last] = y.keyframes;
    // Authored rest Y is 0; baked rest Y is 0.25, so keys shift by +0.25.
    expect(last.value).toBeCloseTo(0.25, 10);
    expect(first.value).toBeCloseTo(0.45, 10);
    // The spin channel is untouched.
    const spin = turntable.timeline.clips.find((c) => c.id === 's2_model')!;
    expect(spin.channels[0].property).toBe('rotation.y');
  });

  it('evaluates the staged scene without throwing and validates the document', async () => {
    recorder.stages.length = 0;
    const doc = createMotionTemplate('game-showcase');
    const result = await stageTemplateModels('proj_1', doc, fakeStore(), [fakeCatalogEntry('local:khronos/CesiumMan')]);
    expect(() => parseMotionDocument(JSON.parse(JSON.stringify(result.document)))).not.toThrow();
    const scene = result.document.scenes[1];
    for (const t of [0.05, 3, 5.95]) {
      const frame = evaluateMotionFrame(scene, t);
      const model = frame.nodes.find((n) => n.id === 'model')!;
      // Rest pose reached by the end of the spin+rise.
      expect(model.transform.rotation[1]).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps the placeholder look when the catalog model is missing and reports the skip', async () => {
    recorder.stages.length = 0;
    const doc = createMotionTemplate('game-showcase');
    const result = await stageTemplateModels('proj_1', doc, fakeStore(), [fakeCatalogEntry('local:khronos/Avocado')]);
    expect(result.report.staged).toEqual([]);
    expect(result.report.skipped[0].modelId).toBe('local:khronos/CesiumMan');
    const model = result.document.scenes[1].nodes.find((n) => n.id === 'model')!;
    expect(model.props.assetId).toBe('local:khronos/CesiumMan');
    // Scratch props survive so a later pass could still bake them.
    expect(model.props.fitHeight).toBe(1.5);
  });

  it('stage calls resolve with one path per unique referenced model', async () => {
    recorder.stages.length = 0;
    const doc = createMotionTemplate('mobile-app-trailer');
    const result = await stageTemplateModels('proj_1', doc, fakeStore(), [fakeCatalogEntry('local:khronos/CesiumMan')]);
    // No local models referenced in this template → nothing staged, doc intact.
    expect(recorder.stages).toHaveLength(0);
    expect(result.report.staged).toEqual([]);
  });
});
