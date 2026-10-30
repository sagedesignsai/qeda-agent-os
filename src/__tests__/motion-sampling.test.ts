import { cubicBezierEase } from '@/lib/motion/easing';
import { sampleChannel, sampleKeyframes, sampleTimeline } from '@/lib/motion/sample';
import { channelKey, type MotionDocument, type MotionKeyframe } from '@/lib/motion/types';
import { DEFAULT_BRAND } from '@/lib/motion/defaults';

const linear = { type: 'linear' as const };

function key(
  id: string,
  time: number,
  value: number,
  easing: MotionKeyframe['easing'] = linear,
): MotionKeyframe {
  return { id, time, value, easing };
}

describe('keyframe sampling', () => {
  it('interpolates linearly between keys', () => {
    const keys = [key('a', 0, 0), key('b', 2, 10)];
    expect(sampleKeyframes(keys, 1)).toBeCloseTo(5, 6);
  });

  it('holds flat outside the keyframe range', () => {
    const keys = [key('a', 1, 4), key('b', 3, 8)];
    expect(sampleKeyframes(keys, 0)).toBe(4);
    expect(sampleKeyframes(keys, 99)).toBe(8);
  });

  it('honours step easing by holding the outgoing value', () => {
    const keys = [key('a', 0, 0, { type: 'step' }), key('b', 1, 10)];
    expect(sampleKeyframes(keys, 0.5)).toBe(0);
    expect(sampleKeyframes(keys, 1)).toBe(10);
  });

  it('solves cubic bezier easing symmetrically', () => {
    expect(cubicBezierEase(0.42, 0, 0.58, 1, 0.5)).toBeCloseTo(0.5, 4);
    expect(cubicBezierEase(0.42, 0, 1, 1, 0.25)).toBeLessThan(0.25);
  });

  it('finds the segment in a long channel without sorting', () => {
    const keys = Array.from({ length: 1000 }, (_, index) => key(`k${index}`, index, index * 2));
    expect(sampleKeyframes(keys, 500.5)).toBeCloseTo(1001, 6);
  });

  it('returns undefined for an empty channel', () => {
    expect(sampleKeyframes([], 1)).toBeUndefined();
  });
});

function documentWith(tracks: MotionDocument['timeline']['tracks']): MotionDocument {
  return {
    schemaVersion: 2,
    revision: 0,
    brand: DEFAULT_BRAND,
    scenes: [{ id: 'scene_main', name: 'Scene 1', nodes: [], timeline: { duration: 10, loop: { enabled: true, start: 0, end: 10 }, tracks, clips: [] }, cameraId: null }],
    activeSceneId: 'scene_main',
    assets: [],
    scene: { nodes: [] },
    meta: {
      id: 'doc',
      name: 'Test',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      output: { fps: 30, width: 1920, height: 1080 },
    },
    timeline: {
      duration: 10,
      loop: { enabled: true, start: 0, end: 10 },
      tracks,
      clips: [
        {
          id: 'clip',
          name: 'Clip',
          duration: 4,
          channels: [
            {
              id: 'channel',
              targetId: 'node',
              property: 'opacity',
              keyframes: [key('k0', 0, 0), key('k1', 4, 1)],
            },
          ],
        },
        {
          id: 'clip-late',
          name: 'Later',
          duration: 4,
          channels: [
            {
              id: 'channel-late',
              targetId: 'node',
              property: 'opacity',
              keyframes: [key('l0', 0, 5), key('l1', 4, 5)],
            },
          ],
        },
      ],
    },
  };
}

describe('timeline sampling', () => {
  const row = (id: string, placements: { id: string; clipId: string; start: number }[]) => ({
    id,
    name: id,
    targetId: null,
    muted: false,
    locked: false,
    placements,
  });

  it('offsets clip-local keys by the placement start', () => {
    const doc = documentWith([row('track', [{ id: 'p', clipId: 'clip', start: 2 }])]);
    expect(sampleTimeline(doc, 2).get(channelKey('node', 'opacity'))).toBeCloseTo(0, 6);
    expect(sampleTimeline(doc, 4).get(channelKey('node', 'opacity'))).toBeCloseTo(0.5, 6);
  });

  it('stops sampling past the clip end', () => {
    const doc = documentWith([row('track', [{ id: 'p', clipId: 'clip', start: 2 }])]);
    expect(sampleTimeline(doc, 6.5).get(channelKey('node', 'opacity'))).toBeUndefined();
  });

  it('lets a later placement win when two overlap', () => {
    const doc = documentWith([
      row('track', [
        { id: 'early', clipId: 'clip', start: 0 },
        { id: 'late', clipId: 'clip-late', start: 1 },
      ]),
    ]);
    expect(sampleTimeline(doc, 2).get(channelKey('node', 'opacity'))).toBe(5);
  });

  it('contributes nothing from muted tracks', () => {
    const doc = documentWith([
      { ...row('track', [{ id: 'p', clipId: 'clip', start: 0 }]), muted: true },
    ]);
    expect(sampleTimeline(doc, 2).size).toBe(0);
  });

  it('samples one channel directly', () => {
    const channel = {
      id: 'c',
      targetId: 'n',
      property: 'x',
      keyframes: [key('a', 0, 0), key('b', 2, 4)],
    };
    expect(sampleChannel(channel, 1)).toBeCloseTo(2, 6);
  });
});
