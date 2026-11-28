/**
 * __tests__/motion-transitions.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shader transitions are document data: the sampler must hand the export window
 * the chosen program and progress, and the schema must reject a name with no
 * matching compositor program.
 */

import { createStarterMotionDocument } from '@/lib/motion/defaults';
import { parseMotionDocument, serializeMotionDocument } from '@/lib/motion/schema';
import { resolveMotionSequence, sampleMotionSequence } from '@/lib/motion/sequence';
import {
  MOTION_SHADER_TRANSITIONS,
  describeMotionTransition,
} from '@/lib/motion/transitions';
import type { MotionDocument } from '@/lib/motion/types';

const NOW = '2026-01-01T00:00:00.000Z';

function twoShotDocument(shader = 'sdf-iris'): MotionDocument {
  const doc = createStarterMotionDocument(NOW);
  const first = doc.scenes[0];
  const second = {
    ...first,
    id: 'scene_two',
    name: 'Second shot',
    cameraId: null,
    nodes: [],
    timeline: { ...first.timeline, tracks: [], clips: [] },
  };
  return {
    ...doc,
    scenes: [first, second],
    sequence: {
      duration: 9,
      items: [
        { id: 'shot_1', sceneId: first.id, start: 0, duration: 6 },
        {
          id: 'shot_2',
          sceneId: second.id,
          start: 5.5,
          duration: 3.5,
          transitionIn: { type: 'shader', shader: shader as never, duration: 0.5, accentColor: '#ff6b2b' },
        },
      ],
    },
  };
}

describe('shader sequence transitions', () => {
  it('samples the shader name and accent during the overlap', () => {
    const doc = twoShotDocument();
    const sequence = resolveMotionSequence(doc);
    const frame = sampleMotionSequence(doc, sequence, 5.75);
    expect(frame.transition).toMatchObject({
      type: 'shader',
      shader: 'sdf-iris',
      accentColor: '#ff6b2b',
    });
    expect(frame.transition?.progress).toBeCloseTo(0.5, 6);
  });

  it('defaults an unspecified shader to domain warp', () => {
    const doc = twoShotDocument('light-leak');
    const item = doc.sequence!.items[1];
    item.transitionIn = { type: 'shader', duration: 0.5 };
    const frame = sampleMotionSequence(doc, resolveMotionSequence(doc), 5.75);
    expect(frame.transition?.shader).toBe('domain-warp');
  });

  it('round-trips every registered shader through the schema', () => {
    for (const shader of MOTION_SHADER_TRANSITIONS) {
      const doc = twoShotDocument(shader.id);
      const parsed = parseMotionDocument(JSON.parse(serializeMotionDocument(doc)));
      expect(parsed.sequence?.items[1].transitionIn).toMatchObject({
        type: 'shader',
        shader: shader.id,
      });
    }
  });

  it('rejects an unknown shader name', () => {
    const doc = twoShotDocument('nope');
    expect(() => parseMotionDocument(JSON.parse(serializeMotionDocument(doc)))).toThrow();
  });

  it('labels transitions for the shot strip', () => {
    expect(describeMotionTransition('shader', 'whip-pan')).toBe('Whip pan');
    expect(describeMotionTransition('crossfade')).toBe('Fade');
    expect(describeMotionTransition('cut')).toBe('Cut');
  });
});