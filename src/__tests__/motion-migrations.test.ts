import { createStarterMotionDocument } from '@/lib/motion/defaults';
import { migrateMotionDocument, parseMotionDocument, serializeMotionDocument } from '@/lib/motion/schema';
import { MOTION_SCHEMA_VERSION } from '@/lib/motion/types';

describe('Motion migration chain', () => {
  it('migrates a v3 project into the current single-scene format and is idempotent', () => {
    const v3 = { ...createStarterMotionDocument('2026-01-01T00:00:00.000Z'), schemaVersion: 3 } as unknown as Record<string, unknown>;
    const migrated = migrateMotionDocument(v3);
    expect(migrated.schemaVersion).toBe(MOTION_SCHEMA_VERSION);
    expect(migrated.revision).toBe(0);
    expect(migrated.activeSceneId).toBe('scene_main');
    expect(migrated.scenes).toHaveLength(1);
    expect(migrated).not.toHaveProperty('scene');
    expect(migrated).not.toHaveProperty('timeline');
    expect(migrateMotionDocument(migrated)).toEqual(migrated);

    const parsed = parseMotionDocument(v3);
    const serialized = JSON.parse(serializeMotionDocument(parsed)) as Record<string, unknown>;
    expect(serialized).not.toHaveProperty('scene');
    expect(serialized).not.toHaveProperty('timeline');
    expect((serialized.scenes as Array<{ nodes: Array<{ props: Record<string, unknown> }> }>)[0].nodes[2].props).toHaveProperty('assetId', 'builtin:starter-dashboard');
    const roundTrip = parseMotionDocument(serialized);
    expect(roundTrip.schemaVersion).toBe(MOTION_SCHEMA_VERSION);
    expect(serializeMotionDocument(roundTrip)).toBe(serializeMotionDocument(parseMotionDocument(v3)));
  });

  it('migrates a v2 document through the versioned chain', () => {
    const v2 = { ...createStarterMotionDocument('2026-01-01T00:00:00.000Z'), schemaVersion: 2 };
    const migrated = parseMotionDocument(v2);
    expect(migrated.schemaVersion).toBe(MOTION_SCHEMA_VERSION);
    expect(migrated.scenes).toHaveLength(1);
    expect(migrated.activeSceneId).toBe('scene_main');
  });

  it('drops transient legacy assets and screen references during migration', () => {
    const v3 = createStarterMotionDocument('2026-01-01T00:00:00.000Z');
    v3.schemaVersion = 3;
    v3.assets = [{ id: 'old-image', name: 'Temporary', kind: 'image', mimeType: 'image/png', frameCount: 1, fps: 30, uri: 'blob:https://example.test/temp' } as never];
    v3.scene.nodes = v3.scene.nodes.map((node) => node.id === 'screen_dashboard'
      ? { ...node, props: { ...node.props, source: 'blob:https://example.test/temp' } }
      : node);
    const migrated = parseMotionDocument(v3);
    expect(migrated.assets.some((asset) => asset.id === 'old-image')).toBe(false);
    const screen = migrated.scene.nodes.find((node) => node.id === 'screen_dashboard');
    expect(screen?.props.assetId).toBeUndefined();
    expect(screen?.props.missingAsset).toBe(true);
  });

  it('upgrades a v4 camera to the current rig defaults without changing its aim', () => {
    const v4 = {
      ...createStarterMotionDocument('2026-01-01T00:00:00.000Z'),
      schemaVersion: 4,
    } as unknown as Record<string, unknown>;
    const scenes = v4.scenes as Array<Record<string, unknown>>;
    scenes[0].nodes = (scenes[0].nodes as Array<Record<string, unknown>>).map((node) =>
      node.type === 'camera.perspective'
        ? { ...node, props: { fov: 50, near: 0.1, far: 200 } }
        : node,
    );
    // Pre-v5 documents could omit cameraId entirely.
    delete scenes[0].cameraId;

    const migrated = parseMotionDocument(v4);
    const camera = migrated.scene.nodes.find((node) => node.type === 'camera.perspective');
    expect(camera?.props).toMatchObject({
      fov: 50,
      far: 200,
      aim: 'origin',
      targetId: null,
      roll: 0,
      shake: 0,
      dofEnabled: false,
    });
    expect(migrated.scenes[0].cameraId).toBe('camera');
  });

  it('keeps a valid v4 cameraId instead of picking the first camera', () => {
    const v4 = {
      ...createStarterMotionDocument('2026-01-01T00:00:00.000Z'),
      schemaVersion: 4,
    } as unknown as Record<string, unknown>;
    const scenes = v4.scenes as Array<Record<string, unknown>>;
    const nodes = scenes[0].nodes as Array<Record<string, unknown>>;
    nodes.push({ ...nodes[0], id: 'camera_b', name: 'Camera B' });
    scenes[0].cameraId = 'camera_b';

    const migrated = parseMotionDocument(v4);
    expect(migrated.scenes[0].cameraId).toBe('camera_b');
  });

  it('rejects documents newer than the supported format', () => {
    const newer = { ...createStarterMotionDocument(), schemaVersion: MOTION_SCHEMA_VERSION + 1 };
    expect(() => parseMotionDocument(newer)).toThrow(/newer version/);
  });
});
