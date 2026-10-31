/**
 * __tests__/motion-auto-key.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Auto-key planning creates missing timeline entities deterministically and
 * writes values at the current scene time without changing base transforms.
 */

import { createMotionAutoKeyOps } from '@/lib/motion/auto-key';
import { createStarterMotionDocument } from '@/lib/motion/defaults';
import { applyMotionOps } from '@/lib/motion/ops';

function ids() {
  let next = 0;
  const mint = (kind: string) => `${kind}_${++next}`;
  return {
    track: () => mint('track'),
    clip: () => mint('clip'),
    placement: () => mint('placement'),
    channel: () => mint('channel'),
    keyframe: () => mint('key'),
  };
}

describe('createMotionAutoKeyOps', () => {
  it('creates a key on an existing clip at playhead time without changing base values', () => {
    const doc = createStarterMotionDocument('2026-01-01T00:00:00.000Z');
    const ops = createMotionAutoKeyOps(
      doc,
      [{ nodeId: 'product', property: 'position.x', value: 0.75 }],
      2,
      ids(),
    );
    const next = applyMotionOps(doc, ops);
    const clip = next.timeline.clips.find((item) => item.id === 'clip_product_spin');
    const channel = clip?.channels.find((item) => item.property === 'position.x');

    expect(channel?.keyframes.find((key) => key.time === 2)?.value).toBe(0.75);
    expect(next.scene.nodes.find((node) => node.id === 'product')?.transform.position[0]).toBe(0);
  });

  it('creates track, clip, placement, channel, and key when the node has no animation', () => {
    const doc = createStarterMotionDocument('2026-01-01T00:00:00.000Z');
    const ops = createMotionAutoKeyOps(
      doc,
      [{ nodeId: 'title', property: 'position.x', value: 4 }],
      2.5,
      ids(),
    );
    const next = applyMotionOps(doc, ops);
    const track = next.timeline.tracks.find((item) => item.targetId === 'title');
    const placement = track?.placements[0];
    const clip = next.timeline.clips.find((item) => item.id === placement?.clipId);
    const channel = clip?.channels.find((item) => item.property === 'position.x');

    expect(track).toBeDefined();
    expect(placement).toBeDefined();
    expect(channel?.keyframes).toMatchObject([{ time: 2.5, value: 4 }]);
  });

  it('updates the existing key at the playhead instead of creating a duplicate', () => {
    const doc = createStarterMotionDocument('2026-01-01T00:00:00.000Z');
    const ops = createMotionAutoKeyOps(
      doc,
      [{ nodeId: 'product', property: 'position.y', value: 3 }],
      1.4,
      ids(),
    );
    const next = applyMotionOps(doc, ops);
    const channel = next.timeline.clips
      .flatMap((clip) => clip.channels)
      .find((item) => item.property === 'position.y');
    expect(channel?.keyframes.filter((key) => key.time === 1.4)).toHaveLength(1);
    expect(channel?.keyframes.find((key) => key.time === 1.4)?.value).toBe(3);
  });
});
