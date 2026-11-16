import { createStarterMotionDocument } from '@/lib/motion/defaults';
import {
  MOTION_ENVIRONMENT_PRESETS,
  activeEnvironmentPreset,
  buildEnvironmentPresetOps,
  resolveSceneWorld,
} from '@/lib/motion/environment';
import { preflightMotionExport } from '@/lib/motion/export/preflight';
import { getMotionNodeType } from '@/lib/motion/node-registry';
import { applyMotionOp } from '@/lib/motion/ops';
import type { MotionAsset, MotionDocument } from '@/lib/motion/types';

const NOW = '2026-01-01T00:00:00.000Z';

function makeIdFactory() {
  let index = 0;
  return () => `scene_env_${++index}`;
}

function applyOps(doc: MotionDocument, ops: ReturnType<typeof buildEnvironmentPresetOps>) {
  return ops.reduce((current, op) => applyMotionOp(current, op), doc);
}

function withWorld(doc: MotionDocument, background: NonNullable<MotionDocument['scenes'][number]['background']>) {
  const sceneId = doc.activeSceneId;
  return {
    ...doc,
    scenes: doc.scenes.map((scene) =>
      scene.id === sceneId ? { ...scene, background } : scene,
    ),
  };
}

const HDR_ASSET: MotionAsset = {
  id: 'asset_studio_hdr',
  name: 'Studio HDRI',
  kind: 'environment',
  mimeType: 'image/vnd.radiance',
  path: 'assets/asset_studio_hdr/source.hdr',
  hash: '',
  byteSize: 2048,
  createdAt: NOW,
};

describe('scene world resolution', () => {
  it('returns null when the scene declares no world', () => {
    const doc = createStarterMotionDocument(NOW);
    expect(resolveSceneWorld(doc.scenes[0], doc.assets, doc.meta.id)).toBeNull();
  });

  it('resolves a colour and transparency', () => {
    const doc = createStarterMotionDocument(NOW);
    expect(
      resolveSceneWorld(
        { ...doc.scenes[0], background: { type: 'color', color: '#101820' } },
        doc.assets,
        'prj_demo',
      ),
    ).toEqual({ kind: 'color', color: '#101820' });
    expect(
      resolveSceneWorld(
        { ...doc.scenes[0], background: { type: 'transparent' } },
        doc.assets,
        'prj_demo',
      ),
    ).toEqual({ kind: 'transparent' });
  });

  it('addresses an HDRI through the project it is staged in', () => {
    const doc = createStarterMotionDocument(NOW);
    const world = resolveSceneWorld(
      {
        ...doc.scenes[0],
        background: {
          type: 'environment',
          assetId: HDR_ASSET.id,
          intensity: 1.4,
          blur: 0.2,
          rotation: 0.5,
        },
      },
      [HDR_ASSET],
      'prj_demo',
    );
    expect(world).toEqual({
      kind: 'environment',
      assetId: HDR_ASSET.id,
      url: 'qeda-media://motion/prj_demo/asset_studio_hdr',
      format: 'hdr',
      intensity: 1.4,
      blur: 0.2,
      rotation: 0.5,
    });
  });

  it('reports an environment whose asset is gone instead of pretending it loaded', () => {
    const doc = createStarterMotionDocument(NOW);
    expect(
      resolveSceneWorld(
        {
          ...doc.scenes[0],
          background: { type: 'environment', assetId: 'asset_missing' },
        },
        doc.assets,
        'prj_demo',
      ),
    ).toEqual({ kind: 'unresolved-environment', assetId: 'asset_missing' });
  });

  it('round-trips an environment rotation through the op', () => {
    const doc = createStarterMotionDocument(NOW);
    const next = applyMotionOp(doc, {
      op: 'scene.setBackground',
      sceneId: doc.activeSceneId,
      background: {
        type: 'environment',
        assetId: HDR_ASSET.id,
        rotation: 0.75,
      },
    });
    expect(
      next.scenes.find((scene) => scene.id === next.activeSceneId)?.background,
    ).toEqual({ type: 'environment', assetId: HDR_ASSET.id, rotation: 0.75 });
  });
});

describe('environment presets', () => {
  it('only references registered node types', () => {
    for (const preset of MOTION_ENVIRONMENT_PRESETS) {
      for (const node of preset.nodes) {
        expect(getMotionNodeType(node.type)).toBeDefined();
      }
    }
  });

  it('applies a preset and records which one is active', () => {
    const doc = createStarterMotionDocument(NOW);
    const preset = MOTION_ENVIRONMENT_PRESETS[0];
    const next = applyOps(doc, buildEnvironmentPresetOps(doc, preset.id, makeIdFactory()));

    expect(next.scene.nodes.length).toBeGreaterThan(doc.scene.nodes.length);
    expect(activeEnvironmentPreset(next.scenes.find((scene) => scene.id === next.activeSceneId))).toBe(
      preset.id,
    );
    expect(
      next.scenes.find((scene) => scene.id === next.activeSceneId)?.background,
    ).toEqual(preset.background);

    // The rig is a single group, so it edits as one unit in the scene panel.
    const group = next.scene.nodes.find(
      (node) => node.type === 'scene.group' && node.props.environmentPreset === preset.id,
    );
    expect(group).toBeDefined();
    const managed = next.scene.nodes.filter(
      (node) => node.props.environmentSlot && node.id !== group?.id,
    );
    expect(managed.length).toBe(preset.nodes.length);
    expect(managed.every((node) => node.parentId === group?.id)).toBe(true);
  });

  it('re-applying a preset updates the rig instead of stacking a second one', () => {
    const doc = createStarterMotionDocument(NOW);
    const preset = MOTION_ENVIRONMENT_PRESETS[1];
    const once = applyOps(doc, buildEnvironmentPresetOps(doc, preset.id, makeIdFactory()));
    const twice = applyOps(once, buildEnvironmentPresetOps(once, preset.id, makeIdFactory()));

    expect(twice.scene.nodes.length).toBe(once.scene.nodes.length);
    expect(
      twice.scene.nodes.filter((node) => node.props.environmentSlot).length,
    ).toBe(once.scene.nodes.filter((node) => node.props.environmentSlot).length);
  });

  it('ignores a preset request while another one is active', () => {
    const doc = createStarterMotionDocument(NOW);
    const first = MOTION_ENVIRONMENT_PRESETS[0];
    const second = MOTION_ENVIRONMENT_PRESETS[2];
    const withFirst = applyOps(doc, buildEnvironmentPresetOps(doc, first.id, makeIdFactory()));
    const withSecond = applyOps(
      withFirst,
      buildEnvironmentPresetOps(withFirst, second.id, makeIdFactory()),
    );
    expect(
      activeEnvironmentPreset(withSecond.scenes.find((scene) => scene.id === withSecond.activeSceneId)),
    ).toBe(second.id);
  });
});

describe('export preflight covers the scene world', () => {
  it('blocks an environment background whose asset is not in the bundle', () => {
    const doc = withWorld(createStarterMotionDocument(NOW), {
      type: 'environment',
      assetId: HDR_ASSET.id,
    });
    const issues = preflightMotionExport(doc).filter((issue) =>
      issue.code.startsWith('MOTION_WORLD'),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      severity: 'blocking',
      code: 'MOTION_WORLD_ASSET_MISSING',
      assetId: HDR_ASSET.id,
    });
  });

  it('accepts a bundled HDR environment', () => {
    const doc = withWorld(createStarterMotionDocument(NOW), {
      type: 'environment',
      assetId: HDR_ASSET.id,
    });
    const withAsset = { ...doc, assets: [...doc.assets, HDR_ASSET] };
    expect(
      preflightMotionExport(withAsset).filter((issue) =>
        issue.code.startsWith('MOTION_WORLD'),
      ),
    ).toHaveLength(0);
  });

  it('blocks a non-HDR environment asset', () => {
    const doc = withWorld(createStarterMotionDocument(NOW), {
      type: 'environment',
      assetId: HDR_ASSET.id,
    });
    const withPng = {
      ...doc,
      assets: [
        ...doc.assets,
        { ...HDR_ASSET, path: 'assets/asset_studio_hdr/source.png', mimeType: 'image/png' },
      ],
    };
    const issues = preflightMotionExport(withPng).filter((issue) =>
      issue.code.startsWith('MOTION_WORLD'),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('MOTION_WORLD_FORMAT_UNSUPPORTED');
  });
});
