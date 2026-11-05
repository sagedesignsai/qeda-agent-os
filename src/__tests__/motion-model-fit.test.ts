/**
 * __tests__/motion-model-fit.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure math for folding bundled models into Motion stage units: fitting a
 * model's catalog bounds to a target footprint and retargeting its animated
 * keyframes so the rest pose survives the bake.
 */

import { computeModelFit, retargetModelChannels, type ModelBounds } from '@/lib/motion/model-fit';
import { EASING_PRESETS } from '@/lib/motion/easing';
import type { MotionClip } from '@/lib/motion/types';

const LINEAR = EASING_PRESETS.linear.value;

/** 4 units tall, floor at model-space −2, like a center-pivoted asset. */
const BOUNDS: ModelBounds = {
  min: [-0.5, -2, -0.5],
  max: [0.5, 2, 0.5],
};

const keys = (values: number[]) => values.map((value, i) => ({ id: `kf_${i}`, time: i, value, easing: LINEAR }));

const riseOnHero = (): MotionClip => ({
  id: 'rise',
  name: 'Rise in',
  duration: 5,
  channels: [
    {
      id: 'chn_o',
      targetId: 'hero',
      property: 'opacity',
      keyframes: keys([0, 1]),
    },
    {
      id: 'chn_y',
      targetId: 'hero',
      property: 'position.y',
      keyframes: keys([0.3, 0]),
    },
  ],
});

const popOnHero = (): MotionClip => ({
  id: 'pop',
  name: 'Pop in',
  duration: 5,
  channels: [
    { id: 'chn_sx', targetId: 'hero', property: 'scale.x', keyframes: keys([0.72, 1]) },
    { id: 'chn_sy', targetId: 'hero', property: 'scale.y', keyframes: keys([0.72, 1]) },
  ],
});

describe('motion model fit', () => {
  it('scales the bounding box to the target height and lifts the floor to restBottom', () => {
    // 4-unit model → fitHeight 1 = scale 0.25; floor at −2×0.25 = −0.5 below
    // the node origin, so the node must sit at restBottom + 0.5.
    const fit = computeModelFit(BOUNDS, 1, -1);
    expect(fit.scale).toBeCloseTo(0.25, 10);
    expect(fit.positionY).toBeCloseTo(-0.5, 10);
  });

  it('handles ground-pivoted models (minY ≈ 0) by placing the origin at restBottom', () => {
    const fit = computeModelFit({ min: [0, 0, 0], max: [0, 1.5, 0] }, 1.5, -0.5);
    expect(fit.scale).toBe(1);
    expect(fit.positionY).toBeCloseTo(-0.5, 10);
  });

  it('refuses degenerate bounds', () => {
    expect(() => computeModelFit(BOUNDS, 0, -1)).toThrow('positive');
    expect(() => computeModelFit({ min: [0, 1, 0], max: [-1, 1, 0] }, 1, -1)).toThrow('zero height');
  });

  it('shifts position.y keys and multiplies scale keys, leaving other channels alone', () => {
    const retargeted = retargetModelChannels([riseOnHero(), popOnHero()], 'hero', -0.5, 0.25);

    const opacity = retargeted[0].channels.find((c) => c.property === 'opacity')!;
    expect(opacity.keyframes.map((k) => k.value)).toEqual([0, 1]);

    const y = retargeted[0].channels.find((c) => c.property === 'position.y')!;
    // Authored rest [0.3 → 0] shifts by −0.5 → final key equals the baked rest Y.
    expect(y.keyframes.map((k) => k.value)).toEqual([-0.2, -0.5]);

    const sx = retargeted[1].channels.find((c) => c.property === 'scale.x')!;
    expect(sx.keyframes.map((k) => k.value)).toEqual([0.18, 0.25]);
    const sy = retargeted[1].channels.find((c) => c.property === 'scale.y')!;
    expect(sy.keyframes.map((k) => k.value)).toEqual([0.18, 0.25]);
  });

  it('ignores channels on other targets and returns the clips untouched when nothing fits', () => {
    const clips = [riseOnHero()];
    expect(retargetModelChannels(clips, 'other', -1, 0.5)).toBe(clips);
  });

  it('keeps keyframe ids and times intact through the retarget', () => {
    const retargeted = retargetModelChannels([popOnHero()], 'hero', 0, 2);
    const original = popOnHero();
    expect(retargeted[0].channels.map((c) => c.id)).toEqual(original.channels.map((c) => c.id));
    expect(retargeted[0].channels[0].keyframes.map((k) => k.time)).toEqual(original.channels[0].keyframes.map((k) => k.time));
  });
});
