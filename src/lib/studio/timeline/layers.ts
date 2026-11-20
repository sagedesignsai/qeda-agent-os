/**
 * lib/studio/timeline/layers.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The single source of truth for track ordering.
 *
 * INVARIANT
 * ─────────
 * Timeline row order *is* layer order. Index 0 is the topmost row and is
 * painted last; the last row is painted first. Within a track type, array
 * order is authoritative — there is deliberately no second ordering field
 * (no `zIndex`), because two representations always drift apart.
 *
 * Tracks are grouped into lanes in a fixed vertical order. Reordering only
 * moves a track among its own type, so a video lane can never be dragged into
 * the audio lane and vice versa.
 *
 * Every consumer — the store, the take↔timeline converter, and the frame
 * evaluator — calls these helpers rather than sorting locally.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { TimelineTrack, TrackType } from '../types';

/** Legacy single-recording video lane id. */
export const LEGACY_VIDEO_TRACK_ID = 'track-video';

/** Vertical lane order, top row first. */
export const TRACK_LANE_ORDER: readonly TrackType[] = [
  'effects',
  'captions',
  'transitions',
  'overlays',
  'video',
  'audio',
];

const LANE_RANK: Record<TrackType, number> = {
  effects: 0,
  captions: 1,
  transitions: 2,
  overlays: 3,
  video: 4,
  audio: 5,
};

/**
 * Compare two tracks for timeline row order.
 *
 * Within a lane, insertion order is preserved (Array#sort is stable). The one
 * exception is video: project video lanes sit above the legacy recording lane,
 * so the legacy lane sorts last within the video group.
 */
export function compareTracksForTimeline(
  a: TimelineTrack,
  b: TimelineTrack,
): number {
  const typeOrder = LANE_RANK[a.type] - LANE_RANK[b.type];
  if (typeOrder !== 0) return typeOrder;
  if (a.type === 'video') {
    return (
      Number(a.id === LEGACY_VIDEO_TRACK_ID) -
      Number(b.id === LEGACY_VIDEO_TRACK_ID)
    );
  }
  return 0;
}

/** Return a new array in canonical timeline row order (top row first). */
export function sortTracksForTimeline(
  tracks: readonly TimelineTrack[],
): TimelineTrack[] {
  return [...tracks].sort(compareTracksForTimeline);
}

/**
 * Tracks in paint order: bottom row first, top row last.
 *
 * This is what a compositor iterates. The evaluator exposes per-type lists, but
 * the video list it returns is already in this order.
 */
export function trackPaintOrder(
  tracks: readonly TimelineTrack[],
): TimelineTrack[] {
  return sortTracksForTimeline(tracks).reverse();
}

/**
 * Move a track up (`delta = -1`) or down (`delta = +1`) among tracks of the
 * same type. Returns `null` when the move is a no-op or would cross a lane.
 *
 * The returned array is already in canonical row order and is safe to assign
 * directly to store state.
 */
export function moveTrackWithinType(
  tracks: readonly TimelineTrack[],
  trackId: string,
  delta: number,
): TimelineTrack[] | null {
  if (!Number.isInteger(delta) || delta === 0) return null;

  const ordered = sortTracksForTimeline(tracks);
  const index = ordered.findIndex((track) => track.id === trackId);
  if (index === -1) return null;

  const type = ordered[index].type;
  const siblings = ordered.filter((track) => track.type === type);
  const position = siblings.findIndex((track) => track.id === trackId);
  const targetPosition = position + delta;
  if (targetPosition < 0 || targetPosition >= siblings.length) return null;

  const targetId = siblings[targetPosition].id;
  const targetIndex = ordered.findIndex((track) => track.id === targetId);
  if (targetIndex === -1) return null;

  const next = [...ordered];
  next[index] = ordered[targetIndex];
  next[targetIndex] = ordered[index];
  return next;
}

/** Index of a track in paint order (bottom = 0), or -1 when absent. */
export function paintIndexOf(
  tracks: readonly TimelineTrack[],
  trackId: string,
): number {
  return trackPaintOrder(tracks).findIndex((track) => track.id === trackId);
}
