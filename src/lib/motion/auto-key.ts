/**
 * lib/motion/auto-key.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Turns inspector value changes into timeline ops when Auto-key is enabled.
 * New tracks/clips/channels are planned with caller-owned ids so the reducer
 * remains deterministic and the whole edit stays one undoable batch.
 */

import type { MotionOpRequest } from './ops';
import type { MotionDocument } from './types';

export type MotionAutoKeyChange = {
  nodeId: string;
  property: string;
  value: number;
};

export type MotionAutoKeyIds = {
  track: () => string;
  clip: () => string;
  placement: () => string;
  channel: () => string;
  keyframe: () => string;
};

export function createMotionAutoKeyOps(
  doc: MotionDocument,
  changes: readonly MotionAutoKeyChange[],
  sceneTime: number,
  ids: MotionAutoKeyIds,
): MotionOpRequest[] {
  if (!Number.isFinite(sceneTime) || sceneTime < 0) return [];
  const byNode = new Map<string, MotionAutoKeyChange[]>();
  for (const change of changes) {
    if (!Number.isFinite(change.value)) continue;
    const list = byNode.get(change.nodeId) ?? [];
    list.push(change);
    byNode.set(change.nodeId, list);
  }

  const ops: MotionOpRequest[] = [];
  for (const [nodeId, nodeChanges] of byNode) {
    const node = doc.scene.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) continue;
    let track = doc.timeline.tracks.find((candidate) => candidate.targetId === nodeId && !candidate.locked);
    if (!track) {
      const trackId = ids.track();
      ops.push({ op: 'track.add', trackId, name: `${node.name} animation`, targetId: nodeId });
      track = { id: trackId, name: `${node.name} animation`, targetId: nodeId, muted: false, locked: false, placements: [] };
    }

    let placement = track.placements.find((candidate) => {
      const clip = doc.timeline.clips.find((item) => item.id === candidate.clipId);
      const duration = candidate.duration ?? clip?.duration ?? 0;
      return sceneTime >= candidate.start - 1e-8 && sceneTime <= candidate.start + duration + 1e-8;
    });
    let clip = placement
      ? doc.timeline.clips.find((candidate) => candidate.id === placement?.clipId)
      : undefined;

    if (!placement || !clip) {
      const clipId = ids.clip();
      const placementId = ids.placement();
      const duration = Math.max(doc.timeline.duration, sceneTime, 1 / Math.max(1, doc.meta.output.fps));
      ops.push(
        { op: 'clip.create', clipId, name: `${node.name} animation`, duration },
        { op: 'placement.add', trackId: track.id, placementId, clipId, start: 0 },
      );
      clip = { id: clipId, name: `${node.name} animation`, duration, channels: [] };
      placement = { id: placementId, clipId, start: 0 };
    }

    const localTime = (placement.trimIn ?? 0) + sceneTime - placement.start;
    for (const change of nodeChanges) {
      let channel = clip.channels.find(
        (candidate) => candidate.targetId === nodeId && candidate.property === change.property,
      );
      if (!channel) {
        const channelId = ids.channel();
        ops.push({
          op: 'channel.add',
          clipId: clip.id,
          channelId,
          targetId: nodeId,
          property: change.property,
        });
        channel = { id: channelId, targetId: nodeId, property: change.property, keyframes: [] };
      }
      const existing = channel.keyframes.find((key) => Math.abs(key.time - localTime) < 1e-6);
      if (existing) {
        ops.push({
          op: 'keyframe.setValue',
          clipId: clip.id,
          channelId: channel.id,
          keyframeId: existing.id,
          value: change.value,
        });
      } else {
        ops.push({
          op: 'keyframe.add',
          clipId: clip.id,
          channelId: channel.id,
          keyframeId: ids.keyframe(),
          time: localTime,
          value: change.value,
        });
      }
    }
  }
  return ops;
}
