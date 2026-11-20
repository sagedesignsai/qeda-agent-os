/**
 * __tests__/studio-keyframes-ui.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for the canvas keyframe UI metadata (`lib/studio/timeline/keyframes-ui.ts`):
 * property rows per track type, ranges, hit-testing against diamond geometry,
 * and defaults for double-click adds.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  defaultAddKeyframePropertyForTrack,
  findClipKeyframeDiamond,
  keyframeUiInfoFor,
  keyframeUiRowProperties,
  staticValueForProperty,
} from '@/lib/studio/timeline/keyframes-ui';
import type { TimelineClip, TimelineTrack } from '@/lib/studio/types';

function makeTrack(type: TimelineTrack['type']): TimelineTrack {
  return {
    id: 'track-1',
    type,
    name: 'Track 1',
    locked: false,
    visible: true,
    clips: [],
  };
}

function makeClip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: 'clip-1',
    trackId: 'track-1',
    name: 'Clip 1',
    startMs: 0,
    durationMs: 1000,
    sourceStartMs: 0,
    sourceDurationMs: 1000,
    ...overrides,
  };
}

// Geometry used across the hit-test cases: trackHeight=48, rulerHeight=28,
// scrollY=0 → trackY=28, clipY=32, clipH=40 → diamond center row = 52,
// effect row = 58. zoomPxPerMs=0.08 → 1000ms = 80px.
const CLIP_X = 0;
const CLIP_Y = 32;
const CLIP_H = 40;
const ZOOM = 0.08;
const CENTER_Y = CLIP_Y + CLIP_H / 2;

describe('keyframeUiInfoFor', () => {
  it('exposes ranges, suffix, and drag sensitivity for every property', () => {
    for (const property of ['x', 'y', 'scale', 'rotation', 'opacity', 'speed', 'intensity']) {
      const info = keyframeUiInfoFor(property);
      expect(info).toBeDefined();
      expect(info!.property).toBe(property);
      expect(info!.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(info!.min).toBeLessThan(info!.max);
    }
    expect(keyframeUiInfoFor('x')).toMatchObject({ min: -2000, max: 2000, suffix: 'px' });
    expect(keyframeUiInfoFor('opacity')).toMatchObject({ min: 0, max: 1, suffix: '%' });
    expect(keyframeUiInfoFor('speed')).toMatchObject({ min: 0.05, max: 20, suffix: 'x' });
  });

  it('returns undefined for unknown properties', () => {
    expect(keyframeUiInfoFor('nope')).toBeUndefined();
  });
});

describe('keyframeUiRowProperties', () => {
  it('lists canvas keyframe properties per track type', () => {
    expect(keyframeUiRowProperties('video')).toEqual(
      expect.arrayContaining(['x', 'y', 'scale', 'rotation', 'speed', 'opacity']),
    );
    expect(keyframeUiRowProperties('audio')).toEqual(['speed']);
    expect(keyframeUiRowProperties('effects')).toEqual(['intensity']);
    expect(keyframeUiRowProperties('captions')).toEqual([]);
  });
});

describe('defaultAddKeyframePropertyForTrack', () => {
  it('picks sensible add properties', () => {
    expect(defaultAddKeyframePropertyForTrack('video')).toBe('x');
    expect(defaultAddKeyframePropertyForTrack('audio')).toBe('speed');
    expect(defaultAddKeyframePropertyForTrack('effects')).toBe('intensity');
    expect(defaultAddKeyframePropertyForTrack('captions')).toBeNull();
  });
});

describe('staticValueForProperty', () => {
  it('reads static fallbacks from the clip', () => {
    const clip = makeClip({
      sourceDurationMs: 1500,
      payload: {
        transform: { position: { x: 12, y: 34 }, scale: { x: 1.5, y: 1.5 }, rotation: 20 },
        opacity: 0.7,
        speed: 1.5,
        intensity: 0.4,
      },
    });
    expect(staticValueForProperty(clip, 'x')).toBe(12);
    expect(staticValueForProperty(clip, 'y')).toBe(34);
    expect(staticValueForProperty(clip, 'scale')).toBe(1.5);
    expect(staticValueForProperty(clip, 'rotation')).toBe(20);
    expect(staticValueForProperty(clip, 'opacity')).toBe(0.7);
    expect(staticValueForProperty(clip, 'speed')).toBe(1.5);
    expect(staticValueForProperty(clip, 'intensity')).toBe(0.4);
  });

  it('falls back to defaults', () => {
    const clip = makeClip();
    expect(staticValueForProperty(clip, 'x')).toBe(0);
    expect(staticValueForProperty(clip, 'scale')).toBe(1);
    expect(staticValueForProperty(clip, 'speed')).toBe(1);
    expect(staticValueForProperty(clip, 'intensity')).toBe(0.6);
  });
});

describe('findClipKeyframeDiamond', () => {
  const clip = makeClip({
    payload: {
      keyframes: [
        { id: 'k1', timeMs: 500, property: 'x', value: 100, easing: 'linear' },
        { id: 'k2', timeMs: 500, property: 'speed', value: 2, easing: 'linear' },
        { id: 'k3', timeMs: 800, property: 'y', value: 50, easing: 'linear' },
      ],
    },
  });

  it('finds the diamond under the pointer (same time, different properties)', () => {
    const hit = findClipKeyframeDiamond(
      makeTrack('video'),
      clip,
      CLIP_X,
      CLIP_Y,
      CLIP_H,
      40, // 500ms → cx = 40 (CLIP_X + 500 * 0.08)
      CENTER_Y, // transform row
      ZOOM,
    );
    expect(hit).toBeDefined();
    expect(['x', 'y']).toContain(hit!.property);
  });

  it('distinguishes the transform row from the effect row at the same time', () => {
    // x diamond at (40, 52); speed diamond at (40, 58).
    const hitSpeed = findClipKeyframeDiamond(
      makeTrack('video'),
      clip,
      CLIP_X,
      CLIP_Y,
      CLIP_H,
      40,
      CENTER_Y + 6,
      ZOOM,
    );
    expect(hitSpeed?.property).toBe('speed');

    const hitX = findClipKeyframeDiamond(
      makeTrack('video'),
      clip,
      CLIP_X,
      CLIP_Y,
      CLIP_H,
      40,
      CENTER_Y,
      ZOOM,
    );
    expect(hitX?.property).toBe('x');
  });

  it('returns null when no diamond is near the pointer', () => {
    const miss = findClipKeyframeDiamond(
      makeTrack('video'),
      clip,
      CLIP_X,
      CLIP_Y,
      CLIP_H,
      40,
      CENTER_Y + 40, // far below the rows
      ZOOM,
    );
    expect(miss).toBeNull();
  });

  it('returns null for track types without keyframe rows', () => {
    const captionsClip = makeClip({
      payload: { keyframes: [{ id: 'k1', timeMs: 0, property: 'x', value: 1, easing: 'linear' }] },
    });
    expect(
      findClipKeyframeDiamond(makeTrack('captions'), captionsClip, CLIP_X, CLIP_Y, CLIP_H, 0, CENTER_Y, ZOOM),
    ).toBeNull();
  });

  it('prefers the closest diamond when multiple overlap', () => {
    const stacked = makeClip({
      payload: {
        keyframes: [
          { id: 'k1', timeMs: 100, property: 'x', value: 1, easing: 'linear' },
          { id: 'k2', timeMs: 200, property: 'x', value: 2, easing: 'linear' },
        ],
      },
    });
    // cx(100ms) = 8, cx(200ms) = 16; pointer between, nearest is the closer one.
    const hit = findClipKeyframeDiamond(
      makeTrack('video'),
      stacked,
      CLIP_X,
      CLIP_Y,
      CLIP_H,
      11, // |11-8| = 3 < |11-16| = 5
      CENTER_Y,
      ZOOM,
    );
    expect(hit?.keyframe.id).toBe('k1');
  });
});
