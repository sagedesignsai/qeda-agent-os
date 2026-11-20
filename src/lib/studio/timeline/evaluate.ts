/**
 * Editor timeline evaluation.
 *
 * This is the time-domain boundary between editable track data and renderers:
 * given a playhead position it resolves active items, their track, and their
 * clip-local/source times. Canvas preview and export can consume this same
 * result without reimplementing timeline visibility or timing rules.
 */

import type {
  TimelineClip,
  TimelineItemType,
  TimelineTrack,
  TrackType,
} from '../types';
import { resolveTimelineItemType } from './item-type';

export interface EvaluatedTimelineClip {
  track: TimelineTrack;
  clip: TimelineClip;
  itemType: TimelineItemType;
  /** Time since the clip's timeline start. */
  localTimeMs: number;
  /** Source-media time after applying the clip playback speed. */
  sourceTimeMs: number;
}

export interface EditorTimelineFrame {
  /** Video clips in paint order: bottom track first, top track last. */
  video: EvaluatedTimelineClip[];
  audio: EvaluatedTimelineClip[];
  effects: EvaluatedTimelineClip[];
  transitions: EvaluatedTimelineClip[];
  captions: EvaluatedTimelineClip[];
  overlays: EvaluatedTimelineClip[];
}

const TRACK_TYPES: TrackType[] = [
  'video',
  'audio',
  'effects',
  'transitions',
  'captions',
  'overlays',
];

function evaluateClip(
  track: TimelineTrack,
  clip: TimelineClip,
  timeMs: number,
): EvaluatedTimelineClip | null {
  const durationMs = Math.max(0, clip.durationMs);
  const startMs = clip.startMs;
  const endMs = startMs + durationMs;

  // Timeline ranges are half-open. At a cut point the outgoing clip has ended
  // and the incoming clip is active, avoiding a one-frame overlap at the edge.
  if (durationMs <= 0 || timeMs < startMs || timeMs >= endMs) return null;

  const localTimeMs = timeMs - startMs;
  const rawSpeed = clip.payload?.speed ?? 1;
  const sourceRate =
    clip.sourceDurationMs > 0 && durationMs > 0
      ? clip.sourceDurationMs / durationMs
      : Number.isFinite(rawSpeed) && rawSpeed > 0
        ? rawSpeed
        : 1;

  return {
    track,
    clip,
    itemType: resolveTimelineItemType(track.type, clip.itemType, clip.payload),
    localTimeMs,
    sourceTimeMs: clip.sourceStartMs + localTimeMs * sourceRate,
  };
}

/** Resolve all visible track items at one composition-time position. */
export function evaluateEditorTimeline(
  tracks: readonly TimelineTrack[],
  timeMs: number,
): EditorTimelineFrame {
  const evaluated = new Map<TrackType, EvaluatedTimelineClip[]>(
    TRACK_TYPES.map((type) => [type, []]),
  );

  for (const track of tracks) {
    if (!track.visible) continue;
    const activeItems = evaluated.get(track.type);
    if (!activeItems) continue;

    for (const clip of track.clips) {
      const item = evaluateClip(track, clip, timeMs);
      if (item) activeItems.push(item);
    }
  }

  // Track rows are ordered top-to-bottom in the timeline UI. Composite video
  // from the bottom row upward so the visually highest track paints last.
  const video = evaluated.get('video') ?? [];
  const bottomToTopTrackOrder = [
    ...new Set(video.map((item) => item.track.id)),
  ].reverse();
  const videoInPaintOrder = bottomToTopTrackOrder.flatMap((trackId) =>
    video.filter((item) => item.track.id === trackId),
  );

  return {
    video: videoInPaintOrder,
    audio: evaluated.get('audio') ?? [],
    effects: evaluated.get('effects') ?? [],
    transitions: evaluated.get('transitions') ?? [],
    captions: evaluated.get('captions') ?? [],
    overlays: evaluated.get('overlays') ?? [],
  };
}
