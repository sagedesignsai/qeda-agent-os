/**
 * Document v2 migration.
 *
 * The migration is a read normalization, so these tests assert structure,
 * idempotency, unknown-field preservation and that the input is never mutated.
 */

import {
  migrateTraceDocument,
  TRACE_DEFAULT_ANIMATION_ID,
  TRACE_DEFAULT_ARTBOARD_ID,
} from '@/lib/trace/migrate';
import {
  activeArtboard,
  animationOf,
  elementsInScene,
  programDurationOf,
  tracksOf,
} from '@/lib/trace/document';
import { TraceSchemaNewerError } from '@/lib/trace/schema';
import type {
  PropertyTrack,
  TraceDocument,
  TraceElement,
  TraceStageInput,
} from '@/lib/trace/types';

const PRIMITIVES = new Set([
  'group',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'path',
  'text',
  'image',
  'use',
]);

function keyframed(
  id: string,
  property: PropertyTrack['property'],
): PropertyTrack {
  return {
    id,
    property,
    label: property,
    keyframes: [
      { id: `${id}-k0`, timeMs: 0, value: 0, easing: 'linear' },
      { id: `${id}-k1`, timeMs: 1000, value: 1, easing: 'linear' },
    ],
  };
}

function element(
  id: string,
  overrides: Partial<TraceElement> = {},
): TraceElement {
  return {
    id,
    name: id,
    type: 'rect',
    visible: true,
    locked: false,
    sceneId: null,
    origin: { x: 0, y: 0 },
    attributes: {},
    tracks: [],
    parentId: null,
    childrenIds: [],
    ...overrides,
  };
}

function v1Project(): TraceStageInput {
  return {
    id: 'prj-1',
    name: 'Launch',
    width: 1280,
    height: 720,
    durationMs: 4000,
    fps: 30,
    elements: {
      'el-text': element('el-text', {
        type: 'text',
        attributes: { text: 'Hello', textPathTargetId: 'el-path' },
        tracks: [keyframed('t-text', 'pathProgress')],
      }),
      'el-path': element('el-path', {
        type: 'path',
        attributes: { d: 'M 0 0 L 10 10', motionPathData: 'M 0 0 L 10 10' },
        tracks: [keyframed('t-move', 'pathProgress')],
      }),
      'el-both': element('el-both', {
        type: 'path',
        attributes: {
          d: 'M 0 0 L 5 5',
          motionPathData: 'M 0 0 L 5 5',
          textPathTargetId: 'el-path',
        },
        tracks: [keyframed('t-both', 'pathProgress')],
      }),
      'el-opacity': element('el-opacity', {
        attributes: { x: 10, y: 20 },
        tracks: [keyframed('t-op', 'opacity')],
      }),
      'el-legacy': element('el-legacy', {
        type: 'counter' as never,
        attributes: { endVal: 20, startVal: 0 },
      }),
    },
    rootElementIds: ['el-text', 'el-path', 'el-both', 'el-opacity', 'el-legacy'],
    audioTracks: [],
    storyboard: {
      scenes: [{ id: 'scene-1', name: 'Scene 1', startMs: 0, durationMs: 4000 }],
      activeSceneId: 'scene-1',
      sourceRefs: [],
    },
  };
}

function migratedDocument(): TraceDocument {
  return migrateTraceDocument(v1Project()).project;
}

describe('Trace document v2 migration', () => {
  it('wraps a v1 document in one artboard and one animation', () => {
    const document = migratedDocument();
    const artboard = document.artboards[TRACE_DEFAULT_ARTBOARD_ID];

    expect(document.schemaVersion).toBe(2);
    expect(document.artboardOrder).toEqual([TRACE_DEFAULT_ARTBOARD_ID]);
    expect(document.activeArtboardId).toBe(TRACE_DEFAULT_ARTBOARD_ID);
    expect(artboard).toBeDefined();
    expect(artboard.defaultAnimationId).toBe(TRACE_DEFAULT_ANIMATION_ID);
    expect(artboard.animations.map((animation) => animation.id)).toEqual([
      TRACE_DEFAULT_ANIMATION_ID,
    ]);
    expect(artboard.animations[0].durationMs).toBe(4000);

    // The v1 root fields are gone; identity, size and fps are preserved.
    expect(
      (document as unknown as TraceStageInput).elements,
    ).toBeUndefined();
    expect(document.id).toBe('prj-1');
    expect(document.width).toBe(1280);
    expect(document.height).toBe(720);
    expect(document.fps).toBe(30);
  });

  it('expands legacy compound elements before the artboard split', () => {
    const document = migratedDocument();
    const artboard = document.artboards[TRACE_DEFAULT_ARTBOARD_ID];
    const legacy = artboard.elements['el-legacy'];

    expect(legacy.type).toBe('group');
    expect(legacy.childrenIds?.length).toBeGreaterThan(0);
    for (const item of Object.values(artboard.elements)) {
      expect(PRIMITIVES.has(item.type)).toBe(true);
    }
  });

  it('tags every track with the animation that owns it', () => {
    const document = migratedDocument();
    const artboard = document.artboards[TRACE_DEFAULT_ARTBOARD_ID];

    for (const item of Object.values(artboard.elements)) {
      for (const track of item.tracks) {
        expect(track.animationId).toBe(TRACE_DEFAULT_ANIMATION_ID);
      }
    }
  });

  it('splits the overloaded pathProgress property', () => {
    const document = migratedDocument();
    const artboard = document.artboards[TRACE_DEFAULT_ARTBOARD_ID];

    const motionOnly = artboard.elements['el-path'];
    expect(motionOnly.tracks.map((track) => track.property)).toEqual([
      'motionPathProgress',
    ]);
    expect(motionOnly.tracks[0].id).toBe('t-move');

    const textOnly = artboard.elements['el-text'];
    expect(textOnly.tracks.map((track) => track.property)).toEqual([
      'pathProgress',
    ]);

    const both = artboard.elements['el-both'];
    expect(both.tracks.map((track) => track.property)).toEqual([
      'pathProgress',
      'motionPathProgress',
    ]);
    expect(both.tracks[1].id).toBe('t-both__motion');
    expect(both.tracks[1].keyframes).toHaveLength(2);
  });

  it('is idempotent and reports whether anything changed', () => {
    const once = migrateTraceDocument(v1Project());
    expect(once.changed).toBe(true);
    expect(once.from).toBe(1);

    const twice = migrateTraceDocument(once.project);
    expect(twice.changed).toBe(false);
    expect(twice.from).toBe(2);
    expect(twice.project).toBe(once.project);
  });

  it('survives a JSON round trip without another migration', () => {
    const document = migratedDocument();
    const roundTripped = JSON.parse(JSON.stringify(document)) as TraceDocument;
    const again = migrateTraceDocument(roundTripped);

    expect(again.changed).toBe(false);
    expect(again.project).toEqual(roundTripped);
  });

  it('preserves unknown document fields from a newer minor version', () => {
    const input = { ...v1Project(), futureFlag: { keep: true } };
    const document = migrateTraceDocument(input).project;

    expect(
      (document as unknown as Record<string, unknown>).futureFlag,
    ).toEqual({ keep: true });
  });

  it('does not mutate the input document', () => {
    const input = v1Project();
    const before = JSON.stringify(input);

    migrateTraceDocument(input);

    expect(JSON.stringify(input)).toBe(before);
  });

  it('refuses a document from a newer schema', () => {
    const future = { ...v1Project(), schemaVersion: 3 };

    expect(() => migrateTraceDocument(future)).toThrow(TraceSchemaNewerError);
    try {
      migrateTraceDocument(future);
    } catch (error) {
      expect((error as TraceSchemaNewerError).code).toBe('TRACE_SCHEMA_NEWER');
    }
  });

  it('repairs a v2 document whose tracks lost their animation id', () => {
    const document = migratedDocument();
    const artboard = document.artboards[TRACE_DEFAULT_ARTBOARD_ID];
    const opacity = artboard.elements['el-opacity'];
    const broken: TraceDocument = {
      ...document,
      artboards: {
        [artboard.id]: {
          ...artboard,
          elements: {
            ...artboard.elements,
            'el-opacity': {
              ...opacity,
              tracks: opacity.tracks.map((track) => ({
                ...track,
                animationId: undefined,
              })),
            },
          },
        },
      },
    };

    const repair = migrateTraceDocument(broken);

    expect(repair.changed).toBe(true);
    expect(repair.project).not.toBe(broken);
    expect(
      repair.project.artboards[artboard.id].elements['el-opacity'].tracks[0]
        .animationId,
    ).toBe(TRACE_DEFAULT_ANIMATION_ID);
  });
});

describe('Trace document v2 helpers', () => {
  it('reports program duration from the longest animation', () => {
    expect(programDurationOf(migratedDocument())).toBe(4000);
  });

  it('resolves the active artboard and animation', () => {
    const document = migratedDocument();
    const artboard = activeArtboard(document);

    expect(artboard).not.toBeNull();
    if (!artboard) throw new Error('Expected an artboard');

    expect(artboard.id).toBe(TRACE_DEFAULT_ARTBOARD_ID);
    expect(animationOf(artboard, TRACE_DEFAULT_ANIMATION_ID)?.name).toBe(
      'Animation 1',
    );
  });

  it('filters tracks by animation', () => {
    const document = migratedDocument();
    const artboard = document.artboards[TRACE_DEFAULT_ARTBOARD_ID];

    expect(
      tracksOf(artboard.elements['el-opacity'], TRACE_DEFAULT_ANIMATION_ID),
    ).toHaveLength(1);
    expect(
      tracksOf(artboard.elements['el-opacity'], 'missing-animation'),
    ).toHaveLength(0);
  });

  it('keeps scene-less elements when filtering by scene', () => {
    const document = migratedDocument();
    const scoped = elementsInScene(document, 'scene-1');
    const all = elementsInScene(document);

    expect(scoped.length).toBeGreaterThan(0);
    expect(all.length).toBeGreaterThanOrEqual(scoped.length);
  });
});
