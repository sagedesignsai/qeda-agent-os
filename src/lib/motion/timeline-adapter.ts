/**
 * lib/motion/timeline-adapter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Projects a Motion document into the neutral timeline model, and translates
 * selections back. The timeline kit stays entirely unaware of clips, tracks and
 * keyframes; Motion stays unaware of pixel geometry.
 *
 * Id composition matters here: a clip can be placed more than once, so a raw
 * keyframe id is **not** unique in the timeline. Item ids are placement ids and
 * key ids are `placement::channel::keyframe`, which makes every canvas target
 * unambiguous and reversible.
 */

import type {
  TimelineItem,
  TimelineModel,
  TimelineSelection,
  TimelineTone,
} from '@/lib/timeline/types';

import type { MotionClipPlacement, MotionDocument, MotionSelection, MotionTrack } from './types';

const TONES: TimelineTone[] = ['primary', 'accent', 'info', 'warn'];
const KEY_SEPARATOR = '::';

export type MotionKeyRef = { placementId: string; channelId: string; keyframeId: string };

export function motionKeyId(
  placementId: string,
  channelId: string,
  keyframeId: string,
): string {
  return [placementId, channelId, keyframeId].join(KEY_SEPARATOR);
}

export function parseMotionKeyId(keyId: string): MotionKeyRef | null {
  const parts = keyId.split(KEY_SEPARATOR);
  if (parts.length !== 3) return null;
  const [placementId, channelId, keyframeId] = parts;
  return { placementId, channelId, keyframeId };
}

export function toTimelineModel(doc: MotionDocument): TimelineModel {
  const clipsById = new Map(doc.timeline.clips.map((clip) => [clip.id, clip]));
  const items: TimelineItem[] = [];

  for (let rowIndex = 0; rowIndex < doc.timeline.tracks.length; rowIndex += 1) {
    const track = doc.timeline.tracks[rowIndex];
    const tone = TONES[rowIndex % TONES.length];
    for (const placement of track.placements) {
      const clip = clipsById.get(placement.clipId);
      if (!clip) continue;
      items.push({
        id: placement.id,
        rowId: track.id,
        label: clip.name,
        start: placement.start,
        duration: clip.duration,
        tone,
        locked: track.locked,
        dimmed: track.muted,
        channels: clip.channels.map((channel) => ({
          id: channel.id,
          label: channel.property,
          keys: channel.keyframes.map((keyframe) => ({
            id: motionKeyId(placement.id, channel.id, keyframe.id),
            channelId: channel.id,
            time: placement.start + keyframe.time,
          })),
        })),
      });
    }
  }

  return {
    duration: doc.timeline.duration,
    fps: doc.meta.output.fps,
    loop: doc.timeline.loop.enabled
      ? { start: doc.timeline.loop.start, end: doc.timeline.loop.end }
      : null,
    rows: doc.timeline.tracks.map((track) => ({
      id: track.id,
      name: track.name,
      muted: track.muted,
      locked: track.locked,
    })),
    items,
  };
}

export function findPlacement(
  doc: MotionDocument,
  placementId: string,
): { track: MotionTrack; placement: MotionClipPlacement } | undefined {
  for (const track of doc.timeline.tracks) {
    const placement = track.placements.find((candidate) => candidate.id === placementId);
    if (placement) return { track, placement };
  }
  return undefined;
}

/** Neutral timeline selection → Motion selection. */
export function timelineSelectionToMotion(
  doc: MotionDocument,
  selection: TimelineSelection,
): MotionSelection {
  if (!selection) return null;

  const keyRef = selection.keyId ? parseMotionKeyId(selection.keyId) : null;
  if (keyRef) {
    const found = findPlacement(doc, keyRef.placementId);
    if (found) {
      return {
        kind: 'keyframe',
        trackId: found.track.id,
        placementId: keyRef.placementId,
        clipId: found.placement.clipId,
        channelId: keyRef.channelId,
        keyframeId: keyRef.keyframeId,
      };
    }
  }

  const placementId = selection.itemId ?? selection.keyId?.split(KEY_SEPARATOR)[0];
  if (placementId) {
    const found = findPlacement(doc, placementId);
    if (found) {
      return { kind: 'placement', trackId: found.track.id, placementId };
    }
  }

  if (selection.rowId) return { kind: 'track', trackId: selection.rowId };
  return null;
}

/** Motion selection → neutral timeline selection. */
export function motionSelectionToTimeline(selection: MotionSelection): TimelineSelection {
  if (!selection) return null;
  if (selection.kind === 'keyframe') {
    return {
      rowId: selection.trackId,
      itemId: selection.placementId,
      keyId: motionKeyId(selection.placementId, selection.channelId, selection.keyframeId),
    };
  }
  if (selection.kind === 'placement') {
    return { rowId: selection.trackId, itemId: selection.placementId };
  }
  return { rowId: selection.trackId };
}

/** Resolve a timeline key id back to the clip-local keyframe it came from. */
export function resolveKeyTarget(
  doc: MotionDocument,
  keyId: string,
): {
  trackId: string;
  placementId: string;
  clipId: string;
  channelId: string;
  keyframeId: string;
  clipDuration: number;
} | null {
  const ref = parseMotionKeyId(keyId);
  if (!ref) return null;
  const found = findPlacement(doc, ref.placementId);
  if (!found) return null;
  const clip = doc.timeline.clips.find((candidate) => candidate.id === found.placement.clipId);
  if (!clip) return null;
  return {
    trackId: found.track.id,
    placementId: ref.placementId,
    clipId: clip.id,
    channelId: ref.channelId,
    keyframeId: ref.keyframeId,
    clipDuration: clip.duration,
  };
}
