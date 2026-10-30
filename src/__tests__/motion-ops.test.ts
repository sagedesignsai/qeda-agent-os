import { createStarterMotionDocument } from '@/lib/motion/defaults';
import {
  MotionOpError,
  applyMotionOp,
  applyMotionOps,
  batchRisk,
  listMotionOps,
  requiresApproval,
  collectNodeCascade,
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

  it('rejects added keys beyond the clip duration and accepts the endpoint', () => {
    const doc = createStarterMotionDocument(NOW);
    const base = { op: 'keyframe.add' as const, clipId: 'clip_title_in', channelId: 'chn_title_opacity', keyframeId: 'kf_endpoint', value: 0.5 };
    expect(() => applyMotionOp(doc, { ...base, time: 2.5 })).toThrow(MotionOpError);
    expect(() => applyMotionOp(doc, { ...base, time: 2.4 })).not.toThrow();
  });

  it('collects a removal cascade while preserving unscoped tracks', () => {
    const doc = createStarterMotionDocument(NOW);
    const result = collectNodeCascade(doc, 'product');
    expect(result.nodeIds).toEqual(expect.arrayContaining(['product', 'screen_dashboard']));
    expect(result.trackIds).toContain('trk_product');
    expect(result.cameraIds).toEqual([]);
    const next = applyMotionOp(doc, { op: 'scene.node.remove', nodeId: 'product' });
    expect(next.timeline.tracks.some((track) => track.id === 'trk_product')).toBe(false);
    expect(next.timeline.clips.every((clip) => clip.channels.every((channel) => channel.targetId !== 'product' && channel.targetId !== 'screen_dashboard'))).toBe(true);
  });

  it('clears the active camera reference when its node is removed', () => {
    const doc = createStarterMotionDocument(NOW);
    const next = applyMotionOp(doc, { op: 'scene.node.remove', nodeId: 'camera' });
    expect(next.scene.nodes.some((node) => node.id === 'camera')).toBe(false);
    expect(next.scenes.find((scene) => scene.id === next.activeSceneId)?.cameraId).toBeNull();
  });

  it('removes a scene through the shared node cascade and keeps the active scene valid', () => {
    const doc = createStarterMotionDocument(NOW);
    const sceneToDelete = { ...doc.scenes[0], id: 'scene_delete', name: 'Delete me' };
    const withScene = { ...doc, scenes: [...doc.scenes, sceneToDelete] };
    const next = applyMotionOp(withScene, { op: 'scene.remove', sceneId: 'scene_delete' });
    expect(next.scenes.map((scene) => scene.id)).toEqual(['scene_main']);
    expect(next.activeSceneId).toBe('scene_main');
    expect(() => applyMotionOp(next, { op: 'scene.remove', sceneId: 'scene_main' })).toThrow(/at least one scene/);
  });

  it('rejects transient URLs in asset metadata', () => {
    const doc = createStarterMotionDocument(NOW);
    expect(() => applyMotionOp(doc, {
      op: 'asset.add', id: 'asset_blob', name: 'blob', kind: 'image', mimeType: 'image/png', path: 'blob:https://example.test/id', hash: '', byteSize: 1, frameCount: 1, fps: 30, createdAt: NOW,
    })).toThrow(MotionOpError);
    expect(() => applyMotionOp(doc, {
      op: 'asset.add', id: 'asset_bad_sequence', name: 'bad sequence', kind: 'image-sequence', mimeType: 'image/png', path: 'assets/sequence', hash: '', byteSize: 1, frameCount: 1, fps: 30, createdAt: NOW,
    })).toThrow(/SEQUENCE_FRAME_COUNT/);
  });

  it.each([
    { kind: 'image', path: 'assets/image.png', frameCount: 2, fps: 30, code: 'IMAGE_FRAME_COUNT' },
    { kind: 'video', path: 'assets/video.mp4', code: 'VIDEO_METADATA_REQUIRED' },
    { kind: 'audio', path: 'assets/audio.wav', code: 'AUDIO_DURATION_REQUIRED' },
    { kind: 'font', path: 'assets/font.bin', code: 'FONT_FORMAT' },
    { kind: 'model', path: 'assets/model.obj', code: 'MODEL_FORMAT' },
    { kind: 'environment', path: 'assets/env.png', code: 'ENVIRONMENT_FORMAT' },
  ])('validates kind-specific asset fields for $kind', ({ kind, path, code, ...metadata }) => {
    const doc = createStarterMotionDocument(NOW);
    expect(() => applyMotionOp(doc, {
      op: 'asset.add', id: `asset_${kind}`, name: kind, kind, mimeType: 'application/octet-stream',
      path, hash: '', byteSize: 1, createdAt: NOW, ...metadata,
    } as never)).toThrow(code);
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
