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
  StudioCompositionTransitionType,
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
  /** Visual state for a clip participating in a cut-centered transition. */
  transition?: {
    id: string;
    type: StudioCompositionTransitionType;
    role: 'outgoing' | 'incoming';
    progress: number;
  };
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

function sourceRateForClip(clip: TimelineClip): number {
  if (clip.durationMs > 0 && clip.sourceDurationMs > 0) {
    return clip.sourceDurationMs / clip.durationMs;
  }
  const speed = clip.payload?.speed ?? 1;
  return Number.isFinite(speed) && speed > 0 ? speed : 1;
}

function evaluateTransitionParticipant(
  track: TimelineTrack,
  clip: TimelineClip,
  transitionClip: TimelineClip,
  role: 'outgoing' | 'incoming',
  timeMs: number,
): EvaluatedTimelineClip {
  const transitionDurationMs = Math.max(1, transitionClip.durationMs);
  const transitionLocalMs = Math.max(0, timeMs - transitionClip.startMs);
  const halfSpeedLocalMs = transitionLocalMs / 2;
  const sourceRate = sourceRateForClip(clip);
  const localTimeMs = role === 'outgoing'
    ? Math.min(clip.durationMs, clip.durationMs - transitionDurationMs / 2 + halfSpeedLocalMs)
    : Math.min(clip.durationMs, halfSpeedLocalMs);
  const sourceStartMs = role === 'outgoing'
    ? clip.sourceStartMs + Math.max(0, clip.sourceDurationMs - transitionDurationMs * sourceRate / 2)
    : clip.sourceStartMs;

  return {
    track,
    clip,
    itemType: resolveTimelineItemType(track.type, clip.itemType, clip.payload),
    localTimeMs,
    sourceTimeMs: sourceStartMs + halfSpeedLocalMs * sourceRate,
    transition: {
      id: transitionClip.id,
      type: transitionClip.payload?.transitionType ?? 'fade',
      role,
      progress: Math.max(0, Math.min(1, transitionLocalMs / transitionDurationMs)),
    },
  };
}

/** Resolve all visible track items at one composition-time position. */
export function evaluateEditorTimeline(
  tracks: readonly TimelineTrack[],
  timeMs: number,
): EditorTimelineFrame {
  const evaluated = new Map<TrackType, EvaluatedTimelineClip[]>();
  for (const type of TRACK_TYPES) evaluated.set(type, []);

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
  const transitions = evaluated.get('transitions') ?? [];
  const transitionParticipants = new Map<string, EvaluatedTimelineClip>();

  for (const transition of transitions) {
    if (transition.itemType !== 'transition') continue;
    const fromClipId = transition.clip.payload?.fromClipId;
    const toClipId = transition.clip.payload?.toClipId;
    if (!fromClipId || !toClipId) continue;

    const from = tracks
      .filter((track) => track.type === 'video' && track.visible)
      .map((track) => ({ track, clip: track.clips.find((clip) => clip.id === fromClipId) }))
      .find((entry) => entry.clip);
    const to = tracks
      .filter((track) => track.type === 'video' && track.visible)
      .map((track) => ({ track, clip: track.clips.find((clip) => clip.id === toClipId) }))
      .find((entry) => entry.clip);
    if (!from?.clip || !to?.clip) continue;
    const cutMs = from.clip.startMs + from.clip.durationMs;
    if (
      from.track.id !== to.track.id ||
      Math.abs(to.clip.startMs - cutMs) > 1 ||
      Math.abs(transition.clip.startMs + transition.clip.durationMs / 2 - cutMs) > 1
    ) continue;

    const type = transition.clip.payload?.transitionType ?? 'fade';
    transitionParticipants.set(
      fromClipId,
      evaluateTransitionParticipant(from.track, from.clip, transition.clip, 'outgoing', timeMs),
    );
    transitionParticipants.set(
      toClipId,
      evaluateTransitionParticipant(to.track, to.clip, transition.clip, 'incoming', timeMs),
    );
    // Preserve the normalized type when older stored payloads omit it.
    transitionParticipants.get(fromClipId)!.transition!.type = type;
    transitionParticipants.get(toClipId)!.transition!.type = type;
  }

  const videoWithTransitions = [
    ...video.filter((item) => !transitionParticipants.has(item.clip.id)),
    ...transitionParticipants.values(),
  ];
  const trackOrder = new Map<string, number>();
  tracks.forEach((track, index) => trackOrder.set(track.id, index));
  const videoInPaintOrder = videoWithTransitions.sort((a, b) => {
    const trackOrderDelta = (trackOrder.get(b.track.id) ?? 0) - (trackOrder.get(a.track.id) ?? 0);
    return trackOrderDelta || a.clip.startMs - b.clip.startMs;
  });

  return {
    video: videoInPaintOrder,
    audio: evaluated.get('audio') ?? [],
    effects: evaluated.get('effects') ?? [],
    transitions,
    captions: evaluated.get('captions') ?? [],
    overlays: evaluated.get('overlays') ?? [],
  };
}
