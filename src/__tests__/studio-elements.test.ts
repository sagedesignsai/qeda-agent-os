/**
 * __tests__/studio-elements.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for the modular Studio elements system:
 *   - Effect catalog resolution and clip-payload discrimination
 *   - Caption word-timing derivation and karaoke highlight index
 *   - take↔timeline round-trip for effects and media overlays
 *   - SQLite persistence of effects/overlays + overlay source lookup
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { applyMigrations } from '../main/db/schema';
import { useTestDatabase } from '../main/db/client';
import {
  saveStudioTake,
  getStudioTake,
  getStudioOverlaySource,
} from '../main/db/studio-store';
import {
  convertTakeToTracks,
  extractEffectsFromTracks,
  extractOverlaysFromTracks,
  extractZoomsFromTracks,
  DEFAULT_STUDIO_STYLING,
  type StudioTake,
  type StudioZoom,
} from '../lib/studio-types';
import { computeCameraTarget } from '../lib/studio/render/camera';
import {
  STUDIO_EFFECTS,
  effectTypeFromPayload,
  resolveActiveStudioEffects,
} from '../lib/studio/effects/catalog';
import {
  resolveActiveWordIndex,
  resolveCaptionWordTimings,
} from '../lib/studio/captions/presets';

describe('effective catalog', () => {
  it('defines every canvas effect with sane defaults', () => {
    expect(STUDIO_EFFECTS.map((effect) => effect.type).sort()).toEqual([
      'chroma-key',
      'color-grade',
      'film-grain',
      'motion-blur',
      'neon-glow',
      'scanlines',
      'spotlight',
      'vignette',
    ]);
    for (const effect of STUDIO_EFFECTS) {
      expect(effect.defaultIntensity).toBeGreaterThan(0);
      expect(effect.defaultIntensity).toBeLessThanOrEqual(1);
      expect(effect.defaultDurationMs).toBeGreaterThan(0);
    }
  });

  it('resolves only effects covering the playhead', () => {
    const effects = [
      { id: 'a', type: 'spotlight' as const, startMs: 0, endMs: 1000, intensity: 0.5 },
      { id: 'b', type: 'vignette' as const, startMs: 2000, endMs: 4000, intensity: 0.5 },
    ];
    expect(resolveActiveStudioEffects(effects, 500).map((e) => e.id)).toEqual(['a']);
    expect(resolveActiveStudioEffects(effects, 3000).map((e) => e.id)).toEqual(['b']);
    expect(resolveActiveStudioEffects(effects, 1500)).toEqual([]);
  });

  it('treats only recognized effectTypes as effects (zoom is not one)', () => {
    expect(effectTypeFromPayload({ effectType: 'spotlight' })).toBe('spotlight');
    expect(effectTypeFromPayload({ effectType: 'zoom' })).toBeNull();
    expect(effectTypeFromPayload({ effectType: 'nonsense' })).toBeNull();
    expect(effectTypeFromPayload(undefined)).toBeNull();
  });
});

describe('caption resolvers', () => {
  it('derives evenly-weighted word timings when no words are present', () => {
    const words = resolveCaptionWordTimings({
      id: 'cap',
      startMs: 0,
      endMs: 1000,
      text: 'hello world',
    });
    expect(words).toHaveLength(2);
    expect(words[0].word).toBe('hello');
    expect(words[0].startMs).toBe(0);
    expect(words[words.length - 1].endMs).toBe(1000);
    // Contiguous coverage.
    expect(words[1].startMs).toBe(words[0].endMs);
  });

  it('prefers explicit word timings and tracks the active index', () => {
    const words = resolveCaptionWordTimings({
      id: 'cap',
      startMs: 0,
      endMs: 3000,
      text: 'a b',
      words: [
        { word: 'a', startMs: 100, endMs: 900 },
        { word: 'b', startMs: 1000, endMs: 2000 },
      ],
    });
    expect(words[0].startMs).toBe(100);
    expect(resolveActiveWordIndex(words, 50)).toBe(-1);
    expect(resolveActiveWordIndex(words, 500)).toBe(0);
    expect(resolveActiveWordIndex(words, 1500)).toBe(1);
    // Between words, the last spoken word stays highlighted.
    expect(resolveActiveWordIndex(words, 2500)).toBe(1);
  });
});

describe('take ↔ timeline round-trip for effects and overlays', () => {
  const baseTake: StudioTake = {
    id: 'take-elements',
    projectId: null,
    title: 'Elements Take',
    description: null,
    sourceType: 'screen',
    sourceName: 'Display',
    durationMs: 10000,
    videoPath: '/tmp/video.webm',
    audioPath: null,
    mouseEventsPath: null,
    cuts: [],
    zooms: [
      { id: 'zoom-1', startMs: 1000, endMs: 3000, targetX: 0.5, targetY: 0.5, scale: 1.8 },
    ],
    captions: [],
    effects: [
      { id: 'fx-1', type: 'spotlight', startMs: 500, endMs: 2500, intensity: 0.7 },
    ],
    overlays: [
      {
        id: 'ov-1',
        kind: 'image',
        srcPath: '/tmp/logo.png',
        startMs: 2000,
        endMs: 6000,
        x: 0.4,
        y: 0.6,
        widthPct: 0.3,
        opacity: 0.9,
        rotation: -5,
        cornerRadius: 8,
      },
    ],
    styling: DEFAULT_STUDIO_STYLING,
    socialKit: null,
    createdAt: 1,
    updatedAt: 2,
  };

  it('places zooms and effects on the effects track and overlays on their own', () => {
    const tracks = convertTakeToTracks(baseTake);
    expect(tracks.map((track) => track.type)).toEqual([
      'effects',
      'captions',
      'video',
      'audio',
      'overlays',
    ]);

    const effectsTrack = tracks[0];
    expect(effectsTrack.clips).toHaveLength(2);
    const overlayTrack = tracks.find((track) => track.type === 'overlays');
    expect(overlayTrack?.clips[0].payload?.srcPath).toBe('/tmp/logo.png');
    expect(overlayTrack?.clips[0].payload?.kind).toBe('image');
  });

  it('keeps four tracks when a take has no overlays', () => {
    const tracks = convertTakeToTracks({ ...baseTake, overlays: [] });
    expect(tracks).toHaveLength(4);
  });

  it('extracts effects and overlays back out, and never mistakes them for zooms', () => {
    const tracks = convertTakeToTracks(baseTake);

    const effects = extractEffectsFromTracks(tracks);
    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({ id: 'fx-1', type: 'spotlight', intensity: 0.7 });

    const overlays = extractOverlaysFromTracks(tracks);
    expect(overlays).toHaveLength(1);
    expect(overlays[0]).toMatchObject({ id: 'ov-1', kind: 'image', srcPath: '/tmp/logo.png' });

    const zooms = extractZoomsFromTracks(tracks);
    expect(zooms.map((zoom) => zoom.id)).toEqual(['zoom-1']);
    expect(zooms[0].scale).toBe(1.8);
  });
});

describe('kinetic zoom keyframes', () => {
  it('animates camera scale and pan from zoom keyframes', () => {
    const zoom: StudioZoom = {
      id: 'zoom-kf',
      startMs: 1000,
      endMs: 4000,
      scale: 1.5,
      targetX: 0.5,
      targetY: 0.5,
      keyframes: [
        { id: 'k1', property: 'zoomScale', timeMs: 0, value: 1, easing: 'linear' },
        { id: 'k2', property: 'zoomScale', timeMs: 3000, value: 3, easing: 'linear' },
        { id: 'k3', property: 'zoomTargetX', timeMs: 0, value: 0.2, easing: 'linear' },
        { id: 'k4', property: 'zoomTargetX', timeMs: 3000, value: 0.8, easing: 'linear' },
        { id: 'k5', property: 'zoomTargetY', timeMs: 0, value: 0.4, easing: 'linear' },
        { id: 'k6', property: 'zoomTargetY', timeMs: 3000, value: 0.6, easing: 'linear' },
      ],
    };

    const mid = computeCameraTarget({
      zooms: [zoom],
      timeMs: 2500,
      zoomIntensity: 1.5,
    });

    expect(mid.scale).toBeCloseTo(2);
    expect(mid.panX).toBeCloseTo(0.5);
    expect(mid.panY).toBeCloseTo(0.5);
  });

  it('falls back to the static zoom values without keyframes', () => {
    const camera = computeCameraTarget({
      zooms: [
        {
          id: 'zoom-static',
          startMs: 0,
          endMs: 2000,
          scale: 2,
          targetX: 0.25,
          targetY: 0.75,
        },
      ],
      timeMs: 1000,
      zoomIntensity: 1.5,
    });
    expect(camera.scale).toBeCloseTo(2);
    expect(camera.panX).toBeCloseTo(0.25);
    expect(camera.panY).toBeCloseTo(0.75);
  });
});

describe('studio element persistence', () => {
  let db: InstanceType<typeof Database>;

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

  it('saves and reloads effects and overlays', () => {
    saveStudioTake({
      id: 'persist-1',
      title: 'Persisted',
      videoPath: '/tmp/v.webm',
      durationMs: 5000,
      effects: [
        { id: 'fx-a', type: 'neon-glow', startMs: 0, endMs: 2000, intensity: 0.8 },
      ],
      overlays: [
        {
          id: 'ov-a',
          kind: 'image',
          srcPath: '/tmp/pic.png',
          startMs: 0,
          endMs: 3000,
          x: 0.5,
          y: 0.5,
          widthPct: 0.4,
          opacity: 1,
          rotation: 0,
          cornerRadius: 10,
        },
      ],
    });

    const take = getStudioTake('persist-1');
    expect(take?.effects).toHaveLength(1);
    expect(take?.effects?.[0].type).toBe('neon-glow');
    expect(take?.overlays).toHaveLength(1);
    expect(take?.overlays?.[0].srcPath).toBe('/tmp/pic.png');

    // Overlay source resolves by id, which is what the media scheme uses.
    expect(getStudioOverlaySource('ov-a')).toBe('/tmp/pic.png');
    expect(getStudioOverlaySource('missing')).toBeNull();
  });
});
