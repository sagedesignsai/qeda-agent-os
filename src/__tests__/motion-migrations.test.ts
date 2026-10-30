import { createStarterMotionDocument } from '@/lib/motion/defaults';
import { migrateMotionDocument, parseMotionDocument, serializeMotionDocument } from '@/lib/motion/schema';

describe('Motion v4 migration', () => {
  it('migrates a v3 project into a single-scene v4 project and is idempotent', () => {
    const v3 = { ...createStarterMotionDocument('2026-01-01T00:00:00.000Z'), schemaVersion: 3 } as unknown as Record<string, unknown>;
    const migrated = migrateMotionDocument(v3);
    expect(migrated.schemaVersion).toBe(4);
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
    expect(roundTrip.schemaVersion).toBe(4);
    expect(serializeMotionDocument(roundTrip)).toBe(serializeMotionDocument(parseMotionDocument(v3)));
  });

  it('migrates a v2 document through the versioned chain', () => {
    const v2 = { ...createStarterMotionDocument('2026-01-01T00:00:00.000Z'), schemaVersion: 2 };
    const migrated = parseMotionDocument(v2);
    expect(migrated.schemaVersion).toBe(4);
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

  it('rejects versions newer than the supported v4 format', () => {
    const newer = { ...createStarterMotionDocument(), schemaVersion: 5 };
    expect(() => parseMotionDocument(newer)).toThrow(/newer version/);
  });
});
