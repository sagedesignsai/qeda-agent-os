/**
 * __tests__/motion-render-plan.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Guards frame count and timestamps at exact and partial-frame range boundaries.
 */

import { motionRenderFrameCount, motionRenderFrames } from '@/main/motion/render-plan';

describe('Motion render frame plan', () => {
  it('plans exact integer-duration ranges without an extra frame', () => {
    expect(motionRenderFrameCount({ start: 0, end: 15 }, 30)).toBe(450);
    const frames = [...motionRenderFrames({ start: 0, end: 0.1 }, 30)];
    expect(frames).toHaveLength(3);
    expect(frames.at(-1)).toMatchObject({ index: 2, sceneTime: 2 / 30, timestamp: 2 / 30, duration: 1 / 30 });
  });

  it('keeps encoded time relative while scene time starts at the requested in point', () => {
    const frames = [...motionRenderFrames({ start: 1.25, end: 1.31 }, 24)];
    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({ index: 0, sceneTime: 1.25, timestamp: 0 });
    expect(frames[0].duration).toBeCloseTo(1 / 24);
    expect(frames[1]).toMatchObject({ index: 1, sceneTime: 1.25 + 1 / 24, timestamp: 1 / 24 });
    expect(frames[1].duration).toBeCloseTo(1.31 - (1.25 + 1 / 24));
    expect(frames.reduce((total, frame) => total + frame.duration, 0)).toBeCloseTo(0.06);
  });

  it('rejects invalid ranges and frame rates', () => {
    expect(() => motionRenderFrameCount({ start: 1, end: 1 }, 30)).toThrow('positive interval');
    expect(() => motionRenderFrameCount({ start: 0, end: 1 }, 0)).toThrow('positive integer');
  });
});
