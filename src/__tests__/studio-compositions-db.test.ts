import Database from 'better-sqlite3';
import { applyMigrations } from '../main/db/schema';
import { useTestDatabase } from '../main/db/client';
import {
  deleteStudioComposition,
  deleteStudioCompositionTemplate,
  createStudioCompositionFromTemplate,
  getStudioComposition,
  getStudioCompositionTemplate,
  getStudioCompositionImagePath,
  importStudioCompositionImageAsset,
  listStudioCompositions,
  listStudioCompositionTemplates,
  saveStudioComposition,
  saveStudioCompositionAsTemplate,
} from '../main/db/studio-compositions';
import { getStudioTake, saveStudioTake } from '../main/db/studio-store';
import {
  addStudioCompositionEffect,
  createStudioCompositionDocument,
  updateStudioCompositionLayer,
} from '../lib/studio/composition';

describe('Studio composition persistence', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db);
  });

  afterEach(() => {
    // @ts-expect-error reset test db
    useTestDatabase(null);
    db.close();
  });

  it('saves validated composition documents separately from takes', () => {
    const saved = saveStudioComposition({
      id: 'composition-1',
      title: 'Desktop app spotlight',
      document: createStudioCompositionDocument({
        sceneId: 'app-spotlight',
        takes: [{ id: 'take-1', title: 'Feature tour', durationMs: 12000 }],
      }),
    });

    expect(saved.document.layers[0].sourceId).toBe('take-1');
    expect(getStudioComposition('composition-1')?.title).toBe(
      'Desktop app spotlight',
    );
    expect(listStudioCompositions()[0]).toMatchObject({
      id: 'composition-1',
      layerCount: 1,
      sceneId: 'app-spotlight',
      aspectRatio: '16:9',
    });
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM studio_takes').get(),
    ).toEqual({
      count: 0,
    });
  });

  it('persists image assets and composition layers atomically', () => {
    saveStudioComposition({
      id: 'composition-image',
      title: 'Image layers',
      document: createStudioCompositionDocument({
        sceneId: 'app-spotlight',
        takes: [{ id: 'take-2', title: 'Feature tour', durationMs: 8000 }],
      }),
    });

    importStudioCompositionImageAsset({
      id: 'asset-1',
      compositionId: 'composition-image',
      name: 'Logo.png',
      path: '/tmp/logo.png',
    });

    const composition = getStudioComposition('composition-image');
    expect(composition?.document.layers).toHaveLength(2);
    expect(composition?.document.layers[1]).toMatchObject({
      kind: 'image',
      sourceId: 'asset-1',
    });
    expect(getStudioCompositionImagePath('asset-1')).toBe('/tmp/logo.png');
  });

  it('cascades composition assets without deleting source media', () => {
    saveStudioTake({
      id: 'take-kept',
      title: 'Kept source',
      videoPath: '/tmp/kept.webm',
      durationMs: 5000,
    });
    saveStudioComposition({
      id: 'composition-delete',
      title: 'Disposable composition',
      document: createStudioCompositionDocument({
        sceneId: 'app-spotlight',
        takes: [{ id: 'take-kept', title: 'Kept source', durationMs: 5000 }],
      }),
    });
    importStudioCompositionImageAsset({
      id: 'asset-delete',
      compositionId: 'composition-delete',
      name: 'Temporary.png',
      path: '/tmp/temporary.png',
    });

    expect(deleteStudioComposition('composition-delete')).toBe(true);
    expect(getStudioCompositionImagePath('asset-delete')).toBeNull();
    expect(getStudioTake('take-kept')?.videoPath).toBe('/tmp/kept.webm');
  });

  it('saves and instantiates reusable layouts without retaining source take IDs', () => {
    saveStudioTake({
      id: 'template-source-take',
      title: 'Source recording',
      videoPath: '/tmp/source.webm',
      durationMs: 8000,
    });
    const composition = saveStudioComposition({
      id: 'template-source-composition',
      title: 'Layer arrangement',
      document: createStudioCompositionDocument({
        sceneId: 'app-spotlight',
        takes: [
          {
            id: 'template-source-take',
            title: 'Source recording',
            durationMs: 8000,
          },
        ],
      }),
    });
    importStudioCompositionImageAsset({
      id: 'template-logo',
      compositionId: composition.id,
      name: 'Logo.png',
      path: '/tmp/logo.png',
    });
    const updated = getStudioComposition(composition.id)!;
    const withMotion = updateStudioCompositionLayer(
      updated.document,
      updated.document.layers[0].id,
      {
        transitionIn: { type: 'fade', durationMs: 600 },
        sourceInMs: 350,
      },
    );
    const withEffect = addStudioCompositionEffect(withMotion, 'scanlines', 1000);
    saveStudioComposition({
      id: updated.id,
      title: updated.title,
      document: withEffect,
    });

    const template = saveStudioCompositionAsTemplate({
      id: 'template-1',
      title: 'Product reveal',
      compositionId: composition.id,
    });
    expect(template.layers[0]).not.toHaveProperty('sourceId');
    expect(template.layers[0].transitionIn).toEqual({
      type: 'fade',
      durationMs: 600,
    });
    expect(template.layers[0]).toMatchObject({
      kind: 'video',
      sourceInMs: 350,
    });
    expect(template.layers[1]).toMatchObject({
      kind: 'image',
      assetPath: '/tmp/logo.png',
    });
    expect(template.effects).toHaveLength(1);
    expect(template.effects[0]).toMatchObject({
      type: 'scanlines',
      startMs: 1000,
    });
    expect(listStudioCompositionTemplates()).toMatchObject([
      {
        id: 'template-1',
        title: 'Product reveal',
        videoLayers: [
          {
            id: composition.document.layers[0].id,
            name: 'Source recording',
          },
        ],
        imageLayerCount: 1,
      },
    ]);
    expect(() =>
      createStudioCompositionFromTemplate({
        id: 'template-missing-source',
        title: 'Missing source',
        templateId: template.id,
        sourceTakeIds: [],
        getTake: getStudioTake,
      }),
    ).toThrow(/needs 1 recording/);

    const created = createStudioCompositionFromTemplate({
      id: 'template-instance',
      title: 'Product reveal for launch',
      templateId: template.id,
      sourceTakeIds: ['template-source-take'],
      getTake: getStudioTake,
    });
    expect(created.document.layers[0]).toMatchObject({
      kind: 'video',
      sourceId: 'template-source-take',
      sourceInMs: 350,
      transitionIn: { type: 'fade', durationMs: 600 },
    });
    expect(created.document.effects).toHaveLength(1);
    expect(
      getStudioCompositionImagePath(created.document.layers[1].sourceId),
    ).toBe('/tmp/logo.png');
    expect(getStudioCompositionTemplate(template.id)).not.toBeNull();
    expect(deleteStudioCompositionTemplate(template.id)).toBe(true);
    expect(listStudioCompositionTemplates()).toHaveLength(0);
    expect(getStudioComposition('template-instance')).not.toBeNull();
    expect(
      getStudioCompositionImagePath(created.document.layers[1].sourceId),
    ).toBe('/tmp/logo.png');
  });
});
