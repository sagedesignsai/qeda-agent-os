import { createStarterMotionDocument } from '@/lib/motion/defaults';
import {
  MotionOpError,
  applyMotionOp,
  applyMotionOps,
  batchRisk,
  listMotionOps,
  requiresApproval,
} from '@/lib/motion/ops';
import { isKeyframesSorted } from '@/lib/motion/sample';
import { findClip } from '@/lib/motion/types';

const NOW = '2026-01-01T00:00:00.000Z';

describe('motion op registry', () => {
  it('exposes a closed, describe-able contract', () => {
    const ops = listMotionOps();
    expect(ops.length).toBeGreaterThan(10);
    expect(ops.every((op) => op.summary.length > 0)).toBe(true);
    // A generic document setter would launder destructive edits into any tier.
    expect(ops.some((op) => /^document\.(set|replace|apply)$/.test(op.id))).toBe(false);
  });

  it('rejects unknown ops and invalid params', () => {
    const doc = createStarterMotionDocument(NOW);
    expect(() => applyMotionOp(doc, { op: 'nope.nope' } as never)).toThrow(MotionOpError);
    expect(() =>
      applyMotionOp(doc, { op: 'track.add', trackId: '', name: '' } as never),
    ).toThrow(MotionOpError);
  });

  it('keeps channel keyframes sorted on add', () => {
    const doc = createStarterMotionDocument(NOW);
    const withLate = applyMotionOp(doc, {
      op: 'keyframe.add',
      clipId: 'clip_product_spin',
      channelId: 'chn_product_spin',
      keyframeId: 'kf_late',
      time: 2.5,
      value: 1,
    });
    const withEarly = applyMotionOp(withLate, {
      op: 'keyframe.add',
      clipId: 'clip_product_spin',
      channelId: 'chn_product_spin',
      keyframeId: 'kf_early',
      time: 1.5,
      value: 1,
    });
    const channel = findClip(withEarly, 'clip_product_spin')?.channels.find(
      (candidate) => candidate.id === 'chn_product_spin',
    );
    expect(channel?.keyframes.map((key) => key.time)).toEqual([0, 1.5, 2.5, 4.5]);
    expect(isKeyframesSorted(channel?.keyframes ?? [])).toBe(true);
  });

  it('clamps a moved keyframe inside its clip', () => {
    const doc = createStarterMotionDocument(NOW);
    const moved = applyMotionOp(doc, {
      op: 'keyframe.move',
      clipId: 'clip_title_in',
      channelId: 'chn_title_opacity',
      keyframeId: 'kf_title_opacity_1',
      time: 99,
    });
    const keyframe = findClip(moved, 'clip_title_in')
      ?.channels.find((channel) => channel.id === 'chn_title_opacity')
      ?.keyframes.find((candidate) => candidate.id === 'kf_title_opacity_1');
    expect(keyframe?.time).toBe(2.4);
  });

  it('moves a placement between tracks', () => {
    const doc = createStarterMotionDocument(NOW);
    const moved = applyMotionOp(doc, {
      op: 'placement.move',
      trackId: 'trk_title',
      placementId: 'plc_title',
      start: 1.5,
      toTrackId: 'trk_product',
    });
    expect(moved.timeline.tracks.find((track) => track.id === 'trk_title')?.placements).toHaveLength(0);
    const destination = moved.timeline.tracks.find((track) => track.id === 'trk_product');
    expect(destination?.placements.map((placement) => placement.id)).toContain('plc_title');
    expect(destination?.placements.find((p) => p.id === 'plc_title')?.start).toBe(1.5);
  });

  it('removes the placements that reference a deleted clip', () => {
    const doc = createStarterMotionDocument(NOW);
    const next = applyMotionOp(doc, { op: 'clip.remove', clipId: 'clip_product_spin' });
    expect(next.timeline.clips.some((clip) => clip.id === 'clip_product_spin')).toBe(false);
    expect(
      next.timeline.tracks.every((track) =>
        track.placements.every((placement) => placement.clipId !== 'clip_product_spin'),
      ),
    ).toBe(true);
  });

  it('classifies risk and gates destructive batches', () => {
    const safe = { op: 'track.add', trackId: 'trk_new', name: 'New' } as const;
    const destructive = { op: 'track.remove', trackId: 'trk_title' } as const;

    expect(batchRisk([safe])).toBe('safe');
    expect(batchRisk([safe, destructive])).toBe('destructive');
    expect(requiresApproval([safe])).toBe(false);
    expect(requiresApproval([safe, destructive])).toBe(true);
  });

  it('applies a batch atomically in order and stamps updatedAt once', () => {
    const doc = createStarterMotionDocument(NOW);
    const next = applyMotionOps(
      doc,
      [
        { op: 'clip.create', clipId: 'clip_new', name: 'New', duration: 2 },
        { op: 'placement.add', trackId: 'trk_title', placementId: 'plc_new', clipId: 'clip_new', start: 2 },
      ],
      { now: '2026-02-02T00:00:00.000Z' },
    );
    expect(next.meta.updatedAt).toBe('2026-02-02T00:00:00.000Z');
    expect(next.timeline.tracks.find((track) => track.id === 'trk_title')?.placements).toHaveLength(2);
  });

  it('leaves the document untouched when an op is a no-op', () => {
    const doc = createStarterMotionDocument(NOW);
    const next = applyMotionOp(doc, {
      op: 'keyframe.setValue',
      clipId: 'clip_title_in',
      channelId: 'chn_title_opacity',
      keyframeId: 'kf_title_opacity_1',
      value: 1,
    });
    expect(next).toBe(doc);
  });
});
