import {
  applyStudioCompositionOperation,
  addCompositionImageLayer,
  addCompositionVideoLayer,
  addStudioCompositionEffect,
  addStudioCompositionTextLayer,
  createStudioCompositionDocument,
  createStudioCompositionTemplate,
  instantiateStudioCompositionTemplate,
  parseStudioCompositionDocument,
  reorderStudioCompositionLayer,
  removeStudioCompositionEffect,
  removeCompositionLayer,
  setCompositionAspectRatio,
  updateStudioCompositionEffect,
  updateStudioCompositionLayer,
} from '../lib/studio/composition';
import {
  hitCompositionResizeHandle,
  resizeCompositionLayerLayout,
  translateCompositionLayerLayout,
} from '../lib/studio/composition-layout';
import { evaluateStudioCompositionLayerFrame } from '../lib/studio/composition-motion';
import { createStudioCompositionDocumentFromTake } from '../lib/studio/composition';
import {
  convertStudioCompositionToTracks,
  updateStudioCompositionFromTracks,
} from '../lib/studio/timeline/composition';
import { DEFAULT_STUDIO_STYLING } from '../lib/studio/styling';
import type { StudioTake } from '../lib/studio/types';

const takes = [
  {
    id: 'desktop',
    title: 'Desktop walkthrough',
    durationMs: 12000,
  },
  {
    id: 'mobile',
    title: 'Mobile walkthrough',
    durationMs: 9000,
  },
] as const;

describe('Studio composition scenes', () => {
  it('creates one full-canvas source for App spotlight', () => {
    const composition = createStudioCompositionDocument({
      sceneId: 'app-spotlight',
      takes: [...takes],
    });

    expect(composition.layers).toHaveLength(1);
    expect(composition.layers[0].sourceId).toBe('desktop');
    expect(composition.layers[0].layouts['16:9'].width).toBe(0.93);
    expect(composition.durationMs).toBe(12000);
  });

  it('lays desktop and mobile together and adapts their layout for portrait', () => {
    const composition = createStudioCompositionDocument({
      sceneId: 'desktop-mobile-comparison',
      takes: [...takes],
    });
    const [desktop, mobile] = composition.layers;

    expect(composition.layers).toHaveLength(2);
    expect(desktop.layouts['16:9'].x).toBeLessThan(mobile.layouts['16:9'].x);
    expect(desktop.layouts['9:16'].y).toBeLessThan(mobile.layouts['9:16'].y);
    expect(mobile.layouts['9:16'].fit).toBe('contain');
  });

  it('supports a comparison scene that starts with only one recording', () => {
    const composition = createStudioCompositionDocument({
      sceneId: 'desktop-mobile-comparison',
      takes: [takes[0]],
    });

    expect(composition.layers).toHaveLength(1);
    expect(composition.layers[0].sourceId).toBe(takes[0].id);
  });

  it('rejects reusing one recording for both comparison surfaces', () => {
    expect(() =>
      createStudioCompositionDocument({
        sceneId: 'desktop-mobile-comparison',
        takes: [takes[0], takes[0]],
      }),
    ).toThrow(/two different recordings/);
  });

  it('rejects a recording without a usable duration', () => {
    expect(() =>
      createStudioCompositionDocument({
        sceneId: 'app-spotlight',
        takes: [{ ...takes[0], durationMs: 0 }],
      }),
    ).toThrow(/no usable duration/);
  });

  it('validates layer additions, aspect changes, and removals', () => {
    const original = createStudioCompositionDocument({
      sceneId: 'app-spotlight',
      takes: [takes[0]],
    });
    const withImage = addCompositionImageLayer(original, {
      id: 'image-1',
      name: 'Product mark.png',
    });
    const withVideo = addCompositionVideoLayer(withImage, takes[1]);
    const portrait = setCompositionAspectRatio(withVideo, '9:16');
    const reduced = removeCompositionLayer(portrait, portrait.layers[1].id);

    expect(portrait.aspectRatio).toBe('9:16');
    expect(portrait.layers).toHaveLength(3);
    expect(reduced.layers).toHaveLength(2);
    expect(reduced.layers.map((layer) => layer.zIndex)).toEqual([0, 1]);
    expect(() =>
      parseStudioCompositionDocument({ ...reduced, version: 3 }),
    ).toThrow();
  });

  it('upgrades version-one documents to the current composition schema', () => {
    const versionOne = createStudioCompositionDocument({
      sceneId: 'app-spotlight',
      takes: [takes[0]],
    });
    const parsed = parseStudioCompositionDocument({
      ...versionOne,
      version: 1,
    });

    expect(parsed.version).toBe(2);
    expect(parsed.layers[0]).toMatchObject({
      kind: 'video',
      sourceId: takes[0].id,
      sourceInMs: 0,
    });
  });

  it('applies validated editor operations to the canonical document', () => {
    const document = createStudioCompositionDocument({
      sceneId: 'app-spotlight',
      takes: [takes[0]],
    });
    const layer = document.layers[0];
    const moved = applyStudioCompositionOperation(document, {
      type: 'layer.patch',
      layerId: layer.id,
      patch: { layout: { x: 0.05, y: 0.1 } },
    });
    const withEffect = applyStudioCompositionOperation(moved, {
      type: 'effect.add',
      effectType: 'vignette',
      startMs: 1000,
    });
    const withText = applyStudioCompositionOperation(withEffect, {
      type: 'layer.addText',
      text: 'Release headline',
    });

    expect(withText.layers[1]).toMatchObject({
      kind: 'text',
      text: 'Release headline',
      textAlign: 'center',
    });
    expect(withEffect.layers[0].layouts['16:9']).toMatchObject({
      x: 0.05,
      y: 0.1,
    });
    expect(withEffect.effects).toHaveLength(1);
    expect(() =>
      applyStudioCompositionOperation(document, {
        type: 'layer.patch',
        layerId: layer.id,
        patch: { opacity: 2 },
      }),
    ).toThrow();
  });

  it('keeps text layer styling when saving and instantiating templates', () => {
    const document = addStudioCompositionTextLayer(
      createStudioCompositionDocument({ sceneId: 'app-spotlight' }),
      'Launch headline',
    );
    const composition = {
      id: 'text-template-source',
      projectId: null,
      title: 'Text template source',
      document,
      createdAt: 1,
      updatedAt: 1,
    };
    const template = createStudioCompositionTemplate({
      id: 'text-template',
      title: 'Headline scene',
      composition,
      imageAssetPaths: {},
    });
    const instance = instantiateStudioCompositionTemplate(template, []);

    expect(instance.document.layers[0]).toMatchObject({
      kind: 'text',
      text: 'Launch headline',
      fontSize: 56,
      color: '#ffffff',
    });
  });

  it('moves layers one step forward or backward and protects the stack boundaries', () => {
    const composition = addCompositionVideoLayer(
      addCompositionImageLayer(
        createStudioCompositionDocument({
          sceneId: 'app-spotlight',
          takes: [takes[0]],
        }),
        { id: 'image-1', name: 'Logo' },
      ),
      takes[1],
    );
    const originalBackToFront = [...composition.layers].sort(
      (a, b) => a.zIndex - b.zIndex,
    );
    const backmost = originalBackToFront[0]!;
    const middle = originalBackToFront[1]!;
    const frontmost = originalBackToFront[2]!;

    expect(
      reorderStudioCompositionLayer(composition, backmost.id, 'backward'),
    ).toBe(composition);

    const movedForward = reorderStudioCompositionLayer(
      composition,
      backmost.id,
      'forward',
    );
    expect(
      [...movedForward.layers]
        .sort((a, b) => b.zIndex - a.zIndex)
        .map((layer) => layer.id),
    ).toEqual([frontmost.id, backmost.id, middle.id]);

    const movedBack = reorderStudioCompositionLayer(
      movedForward,
      backmost.id,
      'backward',
    );
    expect(
      [...movedBack.layers]
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((layer) => layer.id),
    ).toEqual(originalBackToFront.map((layer) => layer.id));
    expect(
      reorderStudioCompositionLayer(composition, frontmost.id, 'forward'),
    ).toBe(composition);
    expect(() =>
      reorderStudioCompositionLayer(composition, 'missing-layer', 'forward'),
    ).toThrow(/was not found/);
  });

  it('updates the active format layout and layer timing without changing other formats', () => {
    const original = setCompositionAspectRatio(
      createStudioCompositionDocument({
        sceneId: 'app-spotlight',
        takes: [takes[0]],
      }),
      '9:16',
    );
    const layer = original.layers[0];
    const updated = updateStudioCompositionLayer(original, layer.id, {
      layout: { x: 0.1, width: 0.8 },
      opacity: 0.7,
      endMs: 6000,
    });

    expect(updated.layers[0].layouts['9:16']).toMatchObject({
      x: 0.1,
      width: 0.8,
    });
    expect(updated.layers[0].layouts['16:9']).toEqual(layer.layouts['16:9']);
    expect(updated.layers[0]).toMatchObject({
      opacity: 0.7,
      endMs: 6000,
    });
    expect(() =>
      updateStudioCompositionLayer(original, layer.id, {
        layout: { x: 0.8, width: 0.5 },
      }),
    ).toThrow(/stay inside the canvas/);
  });
});

describe('Unified composition timeline projection', () => {
  it('projects editable text layers into the caption track and back', () => {
    const document = addStudioCompositionTextLayer(
      createStudioCompositionDocument({ sceneId: 'app-spotlight' }),
      'Product launch',
    );
    const composition = {
      id: 'text-timeline-composition',
      projectId: null,
      title: 'Text timeline',
      document,
      createdAt: 1,
      updatedAt: 1,
    };
    const tracks = convertStudioCompositionToTracks(composition);
    const captionTrack = tracks.find((track) => track.type === 'captions');

    expect(captionTrack?.clips[0].payload?.text).toBe('Product launch');
    const editedTracks = tracks.map((track) =>
      track.type === 'captions'
        ? {
            ...track,
            clips: track.clips.map((clip) => ({
              ...clip,
              name: 'Ship day',
              payload: { ...clip.payload, text: 'Ship day' },
            })),
          }
        : track,
    );
    const updated = updateStudioCompositionFromTracks(
      composition,
      editedTracks,
    );

    const hiddenTracks = editedTracks.map((track) =>
      track.type === 'captions'
        ? { ...track, visible: false, locked: true }
        : track,
    );
    const hiddenDocument = updateStudioCompositionFromTracks(
      composition,
      hiddenTracks,
    );

    expect(updated.layers[0]).toMatchObject({
      kind: 'text',
      name: 'Ship day',
      text: 'Ship day',
    });
    expect(hiddenDocument.layers[0]).toMatchObject({
      visible: false,
      locked: true,
    });
  });

  it('round-trips Take cuts, zooms, captions, effects, and overlays', () => {
    const take: StudioTake = {
      id: 'take-timeline',
      projectId: null,
      title: 'Timeline source',
      description: null,
      sourceType: 'window',
      sourceName: 'Desktop app',
      durationMs: 12000,
      videoPath: '/tmp/timeline.webm',
      audioPath: null,
      mouseEventsPath: null,
      cuts: [{ id: 'cut-source', startMs: 4000, endMs: 6000, reason: 'silence' }],
      zooms: [{
        id: 'zoom-source',
        startMs: 1000,
        endMs: 3000,
        targetX: 0.62,
        targetY: 0.41,
        scale: 1.7,
      }],
      captions: [{
        id: 'caption-source',
        startMs: 7000,
        endMs: 9000,
        text: 'A feature highlight',
        words: [{ word: 'feature', startMs: 7400, endMs: 7900 }],
      }],
      effects: [{
        id: 'effect-source',
        type: 'vignette',
        startMs: 1000,
        endMs: 3000,
        intensity: 0.4,
      }],
      overlays: [{
        id: 'overlay-source',
        kind: 'image',
        srcPath: '/tmp/logo.png',
        startMs: 500,
        endMs: 3500,
        x: 0.8,
        y: 0.2,
        widthPct: 0.2,
        opacity: 0.9,
        rotation: 0,
        cornerRadius: 8,
      }],
      styling: DEFAULT_STUDIO_STYLING,
      socialKit: null,
      createdAt: 1,
      updatedAt: 1,
    };
    const composition = {
      id: 'composition-timeline',
      projectId: null,
      title: 'Timeline source edit',
      document: createStudioCompositionDocumentFromTake(take),
      createdAt: 1,
      updatedAt: 1,
    };

    const tracks = convertStudioCompositionToTracks(composition);
    expect(tracks.map((track) => track.type)).toEqual(
      expect.arrayContaining(['video', 'audio', 'effects', 'captions', 'overlays']),
    );
    const updated = updateStudioCompositionFromTracks(composition, tracks);
    const presentation = updated.layers[0].takePresentation;

    expect(updated.durationMs).toBe(10000);
    expect(presentation?.cuts).toMatchObject([
      { startMs: 4000, endMs: 6000 },
    ]);
    expect(presentation?.zooms).toMatchObject([
      { id: 'zoom-source', startMs: 1000, endMs: 3000, scale: 1.7 },
    ]);
    expect(presentation?.captions).toMatchObject([
      {
        id: 'caption-source',
        startMs: 7000,
        endMs: 9000,
        words: [{ word: 'feature', startMs: 7400, endMs: 7900 }],
      },
    ]);
    expect(presentation?.effects).toMatchObject([
      { id: 'effect-source', type: 'vignette', intensity: 0.4 },
    ]);
    expect(presentation?.overlays).toMatchObject([
      { id: 'overlay-source', srcPath: '/tmp/logo.png', widthPct: 0.2 },
    ]);

    const mutedTracks = tracks.map((track) =>
      track.type === 'audio' ? { ...track, muted: true } : track,
    );
    expect(
      updateStudioCompositionFromTracks(composition, mutedTracks).audioSourceLayerId,
    ).toBeNull();
  });
});

describe('Studio composition transform geometry', () => {
  it('moves and resizes layers within the canvas bounds', () => {
    const layout = {
      x: 0.2,
      y: 0.2,
      width: 0.4,
      height: 0.4,
      fit: 'cover' as const,
      cornerRadius: 8,
    };

    expect(hitCompositionResizeHandle(layout, 0.6, 0.6)).toBe('se');
    expect(translateCompositionLayerLayout(layout, 1, 1)).toMatchObject({
      x: 0.6,
      y: 0.6,
    });
    const resized = resizeCompositionLayerLayout(layout, 'se', 1, 1);
    expect(resized.x + resized.width).toBeLessThanOrEqual(1);
    expect(resized.y + resized.height).toBeLessThanOrEqual(1);
    expect(resized.width).toBeGreaterThanOrEqual(0.04);
    expect(resized.height).toBeGreaterThanOrEqual(0.04);
  });
});

describe('Studio composition motion', () => {
  it('evaluates fade and slide transitions at layer-local times', () => {
    const composition = createStudioCompositionDocument({
      sceneId: 'app-spotlight',
      takes: [takes[0]],
    });
    const layer = composition.layers[0];
    const fading = updateStudioCompositionLayer(composition, layer.id, {
      transitionIn: { type: 'fade', durationMs: 1000 },
      transitionOut: { type: 'fade', durationMs: 1000 },
    }).layers[0];

    expect(evaluateStudioCompositionLayerFrame(fading, '16:9', 0).opacity).toBe(
      0,
    );
    expect(
      evaluateStudioCompositionLayerFrame(fading, '16:9', 500).opacity,
    ).toBeCloseTo(0.5);
    expect(
      evaluateStudioCompositionLayerFrame(fading, '16:9', 12000).opacity,
    ).toBe(0);

    const sliding = updateStudioCompositionLayer(composition, layer.id, {
      transitionIn: { type: 'slide-left', durationMs: 1000 },
    }).layers[0];
    const startFrame = evaluateStudioCompositionLayerFrame(sliding, '16:9', 0);
    const settledFrame = evaluateStudioCompositionLayerFrame(
      sliding,
      '16:9',
      1000,
    );
    expect(startFrame.layout.x).toBeCloseTo(
      layer.layouts['16:9'].x - layer.layouts['16:9'].width,
    );
    expect(settledFrame.layout.x).toBeCloseTo(layer.layouts['16:9'].x);
  });

  it('defaults motion fields when parsing an existing composition document', () => {
    const composition = createStudioCompositionDocument({
      sceneId: 'app-spotlight',
      takes: [takes[0]],
    });
    const legacyLayer = Object.fromEntries(
      Object.entries(composition.layers[0]).filter(
        ([key]) => key !== 'transitionIn' && key !== 'transitionOut',
      ),
    );
    const parsed = parseStudioCompositionDocument({
      ...composition,
      layers: [legacyLayer],
    });

    expect(parsed.layers[0].transitionIn).toEqual({
      type: 'none',
      durationMs: 0,
    });
    expect(parsed.layers[0].transitionOut).toEqual({
      type: 'none',
      durationMs: 0,
    });
  });
});

describe('Studio composition canvas effects', () => {
  it('adds catalog effects at the playhead, bounds duration, and edits/removes them', () => {
    const composition = createStudioCompositionDocument({
      sceneId: 'app-spotlight',
      takes: [takes[0]],
    });
    const withEffect = addStudioCompositionEffect(
      composition,
      'vignette',
      11000,
    );
    const effect = withEffect.effects?.[0];
    expect(effect).toMatchObject({
      type: 'vignette',
      startMs: 11000,
      endMs: 12000,
      intensity: 0.55,
    });

    const updated = updateStudioCompositionEffect(withEffect, effect!.id, {
      intensity: 0.8,
      endMs: 11500,
    });
    expect(updated.effects?.[0]).toMatchObject({
      intensity: 0.8,
      endMs: 11500,
    });
    expect(() =>
      updateStudioCompositionEffect(withEffect, effect!.id, { endMs: 13000 }),
    ).toThrow(/fit inside the composition duration/);
    expect(removeStudioCompositionEffect(updated, effect!.id).effects).toEqual(
      [],
    );
    expect(() =>
      removeStudioCompositionEffect(updated, 'missing-effect'),
    ).toThrow(/was not found/);
  });

  it('defaults the effects collection for older composition documents', () => {
    const composition = createStudioCompositionDocument({
      sceneId: 'app-spotlight',
      takes: [takes[0]],
    });
    const legacyDocument = { ...composition, effects: undefined };
    expect(parseStudioCompositionDocument(legacyDocument).effects).toEqual([]);
  });
});
