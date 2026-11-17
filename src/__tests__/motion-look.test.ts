/**
 * __tests__/motion-look.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The look pipeline is data: node selection, fixed order, parameter clamping and
 * placement-aware animation. All of it must hold without a renderer.
 */

import { createMotionNode } from '@/lib/motion/node-registry';
import {
  describeLookStack,
  isMotionLookNode,
  lookKindOf,
  lookStackKey,
  readLookParams,
  resolveLookStack,
} from '@/lib/motion/look';
import type { MotionClip, MotionNode, MotionScene } from '@/lib/motion/types';

function node(type: string, id: string, props: Record<string, unknown> = {}): MotionNode {
  const created = createMotionNode(type, id);
  return { ...created, props: { ...created.props, ...props } };
}

function scene(nodes: MotionNode[], clips: MotionClip[] = []): MotionScene {
  return {
    id: 'scene_main',
    name: 'Scene 1',
    cameraId: 'camera',
    nodes,
    timeline: {
      duration: 4,
      workArea: { enabled: false, start: 0, end: 4 },
      playMode: 'once',
      tracks: clips.length
        ? [{ id: 'track_fx', name: 'Look', targetId: nodes[0].id, muted: false, locked: false, placements: [{ id: 'plc_fx', clipId: clips[0].id, start: 0 }] }]
        : [],
      clips,
      audio: [],
    },
  };
}

describe('look pipeline', () => {
  it('recognises look node types and nothing else', () => {
    expect(lookKindOf('fx.bloom')).toBe('bloom');
    expect(lookKindOf('fx.letterbox')).toBe('letterbox');
    expect(lookKindOf('geometry.box')).toBeNull();
    expect(isMotionLookNode('fx.grain')).toBe(true);
    expect(isMotionLookNode('camera.perspective')).toBe(false);
  });

  it('clamps every parameter so a hand-edited document cannot produce NaNs', () => {
    expect(readLookParams('bloom', { intensity: 99, threshold: -1, smoothing: Number.NaN }).props)
      .toEqual({ intensity: 5, threshold: 0, smoothing: 0.3 });
    expect(readLookParams('letterbox', { aspect: 99, opacity: -4 }).props)
      .toEqual({ aspect: 3.5, opacity: 0 });
    expect(readLookParams('chroma', { offset: 1 }).props)
      .toEqual({ offset: 0.01, radial: true, modulationOffset: 0.15 });
    expect(readLookParams('grade', {}).props).toEqual({
      exposure: 0,
      contrast: 0,
      saturation: 0,
      temperature: 0,
      tint: 0,
    });
  });

  it('returns the stack in fixed pipeline order regardless of node order', () => {
    const stack = resolveLookStack(
      scene([
        node('fx.grain', 'grain'),
        node('fx.letterbox', 'bars'),
        node('fx.bloom', 'bloom'),
        node('fx.vignette', 'vignette'),
        node('fx.grade', 'grade'),
        node('fx.chroma', 'chroma'),
      ]),
      0,
    );
    expect(stack.map((look) => look.kind)).toEqual([
      'bloom',
      'grade',
      'chroma',
      'vignette',
      'grain',
      'letterbox',
    ]);
    expect(describeLookStack(stack)).toBe('Bloom · Grade · Chroma · Vignette · Grain · Letterbox');
  });

  it('skips hidden nodes and returns an empty stack for effect-free scenes', () => {
    const hidden = { ...node('fx.bloom', 'bloom'), visible: false };
    expect(resolveLookStack(scene([hidden, node('geometry.box', 'box')]), 0)).toEqual([]);
    expect(describeLookStack([])).toBe('No look');
  });

  it('applies animated values only from active placements', () => {
    const bloom = node('fx.bloom', 'bloom', { intensity: 0.4 });
    const clip: MotionClip = {
      id: 'clip_look',
      name: 'Look ramp',
      duration: 2,
      channels: [
        {
          id: 'chn_intensity',
          targetId: 'bloom',
          property: 'intensity',
          keyframes: [
            { id: 'kf_a', time: 0, value: 0, easing: { type: 'linear' } },
            { id: 'kf_b', time: 2, value: 4, easing: { type: 'linear' } },
          ],
        },
      ],
    };
    const animated = scene([bloom], [clip]);
    expect(resolveLookStack(animated, 1)[0].params.props.intensity).toBeCloseTo(2, 5);
    expect(resolveLookStack(animated, 3)[0].params.props.intensity).toBe(0.4);
  });

  it('keeps a stable structure key while parameters animate', () => {
    const bloom = node('fx.bloom', 'bloom');
    const grade = node('fx.grade', 'grade');
    const base = scene([bloom, grade]);
    const key = lookStackKey(resolveLookStack(base, 0));
    const animated = scene([{ ...bloom, props: { ...bloom.props, intensity: 3 } }, grade]);
    expect(lookStackKey(resolveLookStack(animated, 0))).toBe(key);
    expect(lookStackKey(resolveLookStack(scene([bloom]), 0))).not.toBe(key);
  });
});
