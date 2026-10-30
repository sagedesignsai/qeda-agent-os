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

  it('sets a bounded work area and rejects collapsed ranges', () => {
    const doc = createStarterMotionDocument(NOW);
    const inPoint = applyMotionOp(doc, { op: 'timeline.setWorkArea', start: 1.25 });
    const bounded = applyMotionOp(inPoint, { op: 'timeline.setWorkArea', end: 4.5, enabled: true });
    expect(bounded.timeline.workArea).toEqual({ enabled: true, start: 1.25, end: 4.5 });
    expect(() => applyMotionOp(bounded, { op: 'timeline.setWorkArea', end: 1.25 })).toThrow(MotionOpError);
    expect(() => applyMotionOp(doc, { op: 'timeline.setWorkArea', start: 7 })).toThrow(MotionOpError);
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

  it('switches scenes and preserves an independent timeline and camera rig', () => {
    const doc = createStarterMotionDocument(NOW);
    const rigIds = Object.fromEntries(doc.scene.nodes.filter((node) => node.type.startsWith('camera.') || node.type.startsWith('light.')).map((node, index) => [node.id, `rig_${index}`]));
    const added = applyMotionOp(doc, { op: 'scene.add', sceneId: 'scene_blank', name: 'Blank', rigIdMap: rigIds });
    expect(added.scenes[1].nodes.map((node) => node.type)).toEqual(expect.arrayContaining(['camera.perspective', 'light.ambient', 'light.directional', 'light.point']));
    expect(added.scenes[1].timeline.tracks).toEqual([]);
    const switched = applyMotionOp(added, { op: 'document.setActiveScene', sceneId: 'scene_blank' });
    expect(switched.scene.nodes).toEqual(added.scenes[1].nodes);
    expect(switched.timeline.tracks).toEqual([]);
    expect(switched.timeline.duration).toBe(doc.timeline.duration);
  });

  it('duplicates a scene with a complete id map and can rename/reorder it', () => {
    const doc = createStarterMotionDocument(NOW);
    const source = doc.scenes[0];
    const ids = [
      ...source.nodes.map((node) => node.id),
      ...source.timeline.tracks.map((track) => track.id),
      ...source.timeline.tracks.flatMap((track) => track.placements.map((placement) => placement.id)),
      ...source.timeline.clips.map((clip) => clip.id),
      ...source.timeline.clips.flatMap((clip) => clip.channels.map((channel) => channel.id)),
      ...source.timeline.clips.flatMap((clip) => clip.channels.flatMap((channel) => channel.keyframes.map((key) => key.id))),
    ];
    const idMap = Object.fromEntries(ids.map((id, index) => [id, `copy_${index}`]));
    const duplicate = applyMotionOp(doc, { op: 'scene.duplicate', sceneId: 'scene_copy', name: 'Copy', idMap });
    expect(duplicate.scenes[1].nodes.map((node) => node.id)).not.toContain('product');
    expect(duplicate.scenes[1].timeline.tracks[1].placements[0].clipId).toBe(idMap.clip_product_spin);
    const renamed = applyMotionOp(duplicate, { op: 'scene.rename', sceneId: 'scene_copy', name: 'Final' });
    const reordered = applyMotionOp(renamed, { op: 'scene.reorder', sceneId: 'scene_copy', index: 0 });
    expect(reordered.scenes.map((scene) => scene.name)).toEqual(['Final', 'Scene 1']);
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

  it('trims placements without changing clip-local keys, then splits on the same source range', () => {
    const doc = createStarterMotionDocument(NOW);
    const trimmed = applyMotionOp(doc, { op: 'placement.trim', trackId: 'trk_product', placementId: 'plc_product', start: 0.5, trimIn: 1, duration: 2 });
    const placement = trimmed.timeline.tracks.find((track) => track.id === 'trk_product')?.placements[0];
    expect(placement).toMatchObject({ start: 0.5, trimIn: 1, duration: 2 });
    expect(findClip(trimmed, 'clip_product_spin')?.channels[0].keyframes).toEqual(findClip(doc, 'clip_product_spin')?.channels[0].keyframes);

    const split = applyMotionOp(trimmed, { op: 'placement.split', trackId: 'trk_product', placementId: 'plc_product', newPlacementId: 'plc_product_2', atTime: 1.25 });
    const placements = split.timeline.tracks.find((track) => track.id === 'trk_product')?.placements;
    expect(placements).toEqual([
      { id: 'plc_product', clipId: 'clip_product_spin', start: 0.5, trimIn: 1, duration: 0.75 },
      { id: 'plc_product_2', clipId: 'clip_product_spin', start: 1.25, trimIn: 1.75, duration: 1.25 },
    ]);
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
