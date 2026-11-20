/**
 * __tests__/studio-keyframes.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for the Universal Keyframe System (`lib/studio/keyframes.ts`,
 * `evaluateEditorTimeline` speed integration, store helpers):
 *   - Easing evaluation (named GSAP easings + cubic-bezier strings)
 *   - `evaluateKeyframesAt` semantics (hold, linear interp, easing)
 *   - `evaluateClipKeyframeValues` (which properties a clip reports)
 *   - `staticSpeed` / `speedMultiplierAtMs` / `integratedSpeedAtMs` (time remap)
 *   - `evaluateEditorTimeline` consumes speed keyframes in sourceTimeMs
 *   - Store CRUD: add/update value/update time/remove + undo
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  easeAt,
  evaluateClipKeyframeValues,
  evaluateKeyframesAt,
  integratedSpeedAtMs,
  staticSpeed,
  speedMultiplierAtMs,
} from '@/lib/studio/keyframes';
import { evaluateEditorTimeline } from '@/lib/studio/timeline/evaluate';
import { timelineStore } from '@/hooks/use-timeline-store';
import type { StudioKeyframe, TimelineClip, TimelineTrack } from '@/lib/studio/types';

function kf(
  id: string,
  timeMs: number,
  property: string,
  value: number,
  easing: StudioKeyframe['easing'] = 'linear',
): StudioKeyframe {
  return { id, timeMs, property, value, easing };
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

function makeTrack(clips: TimelineClip[]): TimelineTrack {
  return {
    id: 'track-1',
    type: 'video',
    name: 'Video 1',
    locked: false,
    visible: true,
    clips,
  };
}

describe('easeAt', () => {
  it('passes through linear easings', () => {
    expect(easeAt('linear', 0)).toBe(0);
    expect(easeAt('linear', 0.5)).toBe(0.5);
    expect(easeAt('linear', 1)).toBe(1);
    expect(easeAt('none', 0.25)).toBe(0.25);
  });

  it('evaluates power2/power3 out/in at the midpoint', () => {
    expect(easeAt('power2.out', 0.5)).toBeCloseTo(0.75, 10);
    expect(easeAt('power2.in', 0.5)).toBeCloseTo(0.25, 10);
    expect(easeAt('power3.out', 0.5)).toBeCloseTo(0.875, 10);
    expect(easeAt('power3.in', 0.5)).toBeCloseTo(0.125, 10);
  });

  it('overshoots for back.out', () => {
    expect(easeAt('back.out', 0)).toBeCloseTo(0, 10);
    expect(easeAt('back.out', 1)).toBeCloseTo(1, 10);
    expect(easeAt('back.out', 0.5)).toBeGreaterThan(1);
  });

  it('starts and ends at 0 and 1 for sine easings', () => {
    expect(easeAt('sine.out', 0)).toBe(0);
    expect(easeAt('sine.out', 1)).toBe(1);
    expect(easeAt('sine.out', 0.5)).toBeCloseTo(Math.sin((Math.PI / 2) * 0.5), 10);
    expect(easeAt('sine.in', 0.5)).toBeCloseTo(1 - Math.cos((Math.PI / 2) * 0.5), 10);
  });

  it('supports cubic-bezier strings', () => {
    // Symmetric bezier → midpoint stays at 0.5
    expect(easeAt('cubic-bezier(0.5, 0, 0.5, 1)', 0.5)).toBeCloseTo(0.5, 5);
    // Identity bezier ≈ linear
    expect(easeAt('cubic-bezier(0, 0, 1, 1)', 0.25)).toBeCloseTo(0.25, 3);
    // Always-in-front curve: at 0.5 the bezier x-curve gives ~0.75
    expect(easeAt('cubic-bezier(0, 0.75, 0.25, 1)', 0.5)).toBeGreaterThan(0.5);
  });

  it('falls back to linear for unknown easings', () => {
    expect(easeAt('bogus-ease', 0.4)).toBe(0.4);
  });
});

describe('evaluateKeyframesAt', () => {
  const kfs = [
    kf('a', 0, 'opacity', 0),
    kf('b', 1000, 'opacity', 1),
  ];

  it('returns undefined when there are no keyframes for the property', () => {
    expect(evaluateKeyframesAt(kfs, 500, 'x', undefined)).toBeUndefined();
  });

  it('holds the first keyframe value before the first keyframe and the last after', () => {
    expect(evaluateKeyframesAt(kfs, -100, 'opacity', undefined)).toBe(0);
    expect(evaluateKeyframesAt(kfs, 2000, 'opacity', undefined)).toBe(1);
  });

  it('interpolates linearly between keyframes', () => {
    expect(evaluateKeyframesAt(kfs, 250, 'opacity', undefined)).toBeCloseTo(0.25, 10);
    expect(evaluateKeyframesAt(kfs, 750, 'opacity', undefined)).toBeCloseTo(0.75, 10);
    expect(evaluateKeyframesAt(kfs, 0, 'opacity', undefined)).toBe(0);
    expect(evaluateKeyframesAt(kfs, 1000, 'opacity', undefined)).toBe(1);
  });

  it('applies the keyframe easing when interpolating', () => {
    const eased = [
      kf('a', 0, 'x', 0, 'linear'),
      kf('b', 1000, 'x', 10, 'power2.out'),
    ];
    expect(evaluateKeyframesAt(eased, 500, 'x', undefined)).toBeCloseTo(
      10 * easeAt('power2.out', 0.5),
      10,
    );
  });

  it('handles multiple keyframes', () => {
    const multi = [
      kf('a', 0, 'v', 0),
      kf('b', 500, 'v', 10),
      kf('c', 1000, 'v', 30),
    ];
    expect(evaluateKeyframesAt(multi, 250, 'v', undefined)).toBeCloseTo(5, 10);
    // Mid of the second segment: 10 + (30-10) * 0.5
    expect(evaluateKeyframesAt(multi, 750, 'v', undefined)).toBeCloseTo(20, 10);
  });
});

describe('evaluateClipKeyframeValues', () => {
  it('returns nothing when the clip has no keyframes', () => {
    const values = evaluateClipKeyframeValues(makeClip(), 500);
    expect(Object.keys(values)).toHaveLength(0);
  });

  it('returns values for the keyframed properties at the clip-local time', () => {
    const clip = makeClip({
      payload: {
        keyframes: [
          kf('a', 0, 'x', 100),
          kf('b', 1000, 'x', 300),
          kf('c', 1000, 'opacity', 0.5),
        ],
      },
    });
    const values = evaluateClipKeyframeValues(clip, 500);
    expect(values.x).toBeCloseTo(200, 10);
    expect(values.opacity).toBeCloseTo(0.5, 10);
    expect(values.y).toBeUndefined();
    expect(values.scale).toBeUndefined();
  });

  it('excludes intensity on non-effect clips unless keyframed', () => {
    const clip = makeClip({
      payload: { keyframes: [kf('a', 0, 'intensity', 0.9)] },
    });
    expect(evaluateClipKeyframeValues(clip, 0).intensity).toBeCloseTo(0.9, 10);
  });
});

describe('speed (time remap)', () => {
  it('staticSpeed uses sourceDurationMs / durationMs', () => {
    const clip = makeClip({ sourceDurationMs: 2000, durationMs: 1000 });
    expect(staticSpeed(clip)).toBe(2);
  });

  it('staticSpeed falls back to payload.speed then 1', () => {
    expect(staticSpeed(makeClip({ sourceDurationMs: 0 }))).toBe(1);
    expect(staticSpeed(makeClip({ sourceDurationMs: 0, payload: { speed: 1.5 } }))).toBe(1.5);
  });

  it('integratedSpeedAtMs is identity for clips without speed keyframes', () => {
    const clip = makeClip({ sourceDurationMs: 2000, durationMs: 1000 });
    expect(integratedSpeedAtMs(clip, 500)).toBeCloseTo(1000, 5);
    expect(integratedSpeedAtMs(clip, 0)).toBe(0);
    expect(integratedSpeedAtMs(clip, 1000)).toBeCloseTo(2000, 5);
  });

  it('speedMultiplierAtMs returns static speed without keyframes', () => {
    expect(speedMultiplierAtMs(makeClip({ sourceDurationMs: 2000, durationMs: 1000 }), 0)).toBe(2);
  });

  it('integratedSpeedAtMs follows constant speed keyframes', () => {
    const clip = makeClip({
      sourceDurationMs: 0,
      payload: {
        keyframes: [
          kf('a', 0, 'speed', 2, 'linear'),
          kf('b', 1000, 'speed', 2, 'linear'),
        ],
      },
    });
    expect(speedMultiplierAtMs(clip, 500)).toBe(2);
    expect(integratedSpeedAtMs(clip, 500)).toBeCloseTo(1000, 5);
    expect(integratedSpeedAtMs(clip, 1000)).toBeCloseTo(2000, 5);
  });

  it('integratedSpeedAtMs integrates a speed ramp', () => {
    const clip = makeClip({
      durationMs: 1000,
      sourceDurationMs: 0,
      payload: {
        keyframes: [
          kf('a', 0, 'speed', 1, 'linear'),
          kf('b', 500, 'speed', 3, 'linear'),
          kf('c', 1000, 'speed', 3, 'linear'),
        ],
      },
    });
    // [0, 500]: avg speed 2 → +1000. [500, 1000]: speed 3 → +1500.
    expect(integratedSpeedAtMs(clip, 500)).toBeCloseTo(1000, 0);
    expect(integratedSpeedAtMs(clip, 1000)).toBeCloseTo(2500, 0);
    // Ramp [0,500]: speed 1→3 (avg 2), so ∫0^250 = 375.
    expect(integratedSpeedAtMs(clip, 250)).toBeCloseTo(375, 0);
    // Ramp ends at 500, then speed 3: ∫0^750 = 1000 + 750.
    expect(integratedSpeedAtMs(clip, 750)).toBeCloseTo(1750, 0);
  });

  it('evaluateEditorTimeline applies speed keyframes to sourceTimeMs', () => {
    const clip = makeClip({
      startMs: 0,
      durationMs: 1000,
      payload: {
        keyframes: [kf('a', 0, 'speed', 2, 'linear')],
      },
    });
    const frame = evaluateEditorTimeline([makeTrack([clip])], 500);
    const evaluated = frame.video.find((item) => item.clip.id === 'clip-1');
    expect(evaluated).toBeDefined();
    expect(evaluated!.sourceTimeMs).toBeCloseTo(1000, 5);
  });
});

describe('timelineStore keyframe CRUD', () => {
  beforeEach(() => {
    timelineStore.setTracksAndDuration([], 0, true);
  });

  const storedKeyframes = () =>
    timelineStore
      .getState()
      .tracks.flatMap((t) => t.clips)
      .find((c) => c.id === 'clip-1')?.payload?.keyframes ?? [];

  it('adds, updates, and removes keyframes with undo', () => {
    const clip = makeClip();
    timelineStore.setTracksAndDuration([makeTrack([clip])], 1000);

    expect(timelineStore.addClipKeyframe('clip-1', 'x', 100, 42)).toBe(true);
    let keyframes = storedKeyframes();
    expect(keyframes).toHaveLength(1);
    const id = keyframes[0].id;
    expect(keyframes[0]).toMatchObject({ property: 'x', timeMs: 100, value: 42 });

    // Adding again at the same time+property is a no-op.
    expect(timelineStore.addClipKeyframe('clip-1', 'x', 100, 99)).toBe(true);
    expect(storedKeyframes()).toHaveLength(1);

    // Update value; undo reverts it.
    timelineStore.updateClipKeyframeValue('clip-1', id, 55);
    expect(storedKeyframes()[0]).toMatchObject({ value: 55, timeMs: 100 });
    timelineStore.undo();
    expect(storedKeyframes()[0]).toMatchObject({ value: 42, timeMs: 100 });

    // Update time; undo reverts it.
    timelineStore.updateClipKeyframeTime('clip-1', id, 200);
    expect(storedKeyframes()[0]).toMatchObject({ value: 42, timeMs: 200 });
    timelineStore.undo();
    expect(storedKeyframes()[0]).toMatchObject({ value: 42, timeMs: 100 });

    // Remove.
    timelineStore.removeClipKeyframe('clip-1', id);
    expect(storedKeyframes()).toHaveLength(0);
  });

  it('addClipKeyframe clamps time to the clip duration', () => {
    const clip = makeClip({ durationMs: 500 });
    timelineStore.setTracksAndDuration([makeTrack([clip])], 1000);
    timelineStore.addClipKeyframe('clip-1', 'x', 99999, 1);
    expect(storedKeyframes()[0]?.timeMs).toBe(500);
  });
});
