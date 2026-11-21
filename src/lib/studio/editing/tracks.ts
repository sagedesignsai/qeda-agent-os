/**
 * lib/studio/editing/tracks.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure track operations over a `StudioTake`.
 *
 * Every function returns a NEW take (or a result carrying one) and never mutates
 * its input, so a tool can persist a result or discard it on validation error.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { nanoid } from 'nanoid';
import type { StudioTake, StudioTrack, StudioTrackType } from '../types';
import {
  materializeProjectTracks,
  stripLegacyElement,
} from './materialize';

const TRACK_TYPES: readonly StudioTrackType[] = [
  'video',
  'audio',
  'effects',
  'transitions',
  'captions',
  'overlays',
];

export function isStudioTrackType(value: unknown): value is StudioTrackType {
  return typeof value === 'string' && TRACK_TYPES.includes(value as StudioTrackType);
}

export function listTracks(take: StudioTake): StudioTrack[] {
  return take.tracks ?? [];
}

export function getTrack(take: StudioTake, trackId: string): StudioTrack | undefined {
  return take.tracks?.find((track) => track.id === trackId);
}

export function findTrackByType(
  take: StudioTake,
  type: StudioTrackType,
): StudioTrack | undefined {
  return take.tracks?.find((track) => track.type === type);
}

/** Create a track, materializing the project model first when necessary. */
export function createTrack(
  take: StudioTake,
  input: { name?: string; type: StudioTrackType },
): { take: StudioTake; track: StudioTrack } {
  const base = materializeProjectTracks(take);
  const id = `track-${input.type}-${nanoid(6)}`;
  const track: StudioTrack = {
    id,
    name:
      input.name?.trim() ||
      `${input.type.charAt(0).toUpperCase()}${input.type.slice(1)} ${countOfType(base, input.type) + 1}`,
    type: input.type,
    locked: false,
    visible: true,
    muted: input.type === 'audio' ? false : undefined,
    clips: [],
  };
  return {
    take: { ...base, tracks: [...(base.tracks ?? []), track] },
    track,
  };
}

function countOfType(take: StudioTake, type: StudioTrackType): number {
  return (take.tracks ?? []).filter((track) => track.type === type).length;
}

export function deleteTrack(
  take: StudioTake,
  trackId: string,
): { take: StudioTake; removed: boolean } {
  const tracks = take.tracks ?? [];
  const removedTrack = tracks.find((track) => track.id === trackId);
  const next = tracks.filter((track) => track.id !== trackId);
  if (next.length === tracks.length) return { take, removed: false };

  let stripped: StudioTake = { ...take, tracks: next };
  for (const clip of removedTrack?.clips ?? []) {
    stripped = stripLegacyElement(stripped, clip.id);
  }
  return { take: stripped, removed: true };
}

export function updateTrack(
  take: StudioTake,
  trackId: string,
  patch: Partial<Pick<StudioTrack, 'name' | 'locked' | 'visible' | 'muted'>>,
): { take: StudioTake; track?: StudioTrack; error?: string } {
  const tracks = take.tracks ?? [];
  const index = tracks.findIndex((track) => track.id === trackId);
  if (index === -1) return { take, error: `Track ${trackId} not found` };

  const updated: StudioTrack = {
    ...tracks[index],
    ...patch,
    // `id`, `type` and `clips` are structural; a track update cannot change them.
    id: tracks[index].id,
    type: tracks[index].type,
    clips: tracks[index].clips,
  };
  const next = [...tracks];
  next[index] = updated;
  return { take: { ...take, tracks: next }, track: updated };
}

/**
 * Reorder tracks to exactly `trackIds`.
 *
 * The array must be a permutation of the existing ids: a partial list would
 * either lose tracks or leave the caller guessing where they went, so a mismatch
 * is rejected instead of partially applied.
 */
export function reorderTracks(
  take: StudioTake,
  trackIds: readonly string[],
): { take: StudioTake; error?: string } {
  const tracks = take.tracks ?? [];
  const existing = new Set(tracks.map((track) => track.id));
  const requested = new Set(trackIds);

  if (requested.size !== trackIds.length) {
    return { take, error: 'trackIds contains duplicate ids' };
  }
  if (requested.size !== existing.size) {
    return {
      take,
      error: `trackIds must list all ${existing.size} tracks (received ${requested.size})`,
    };
  }
  for (const id of trackIds) {
    if (!existing.has(id)) return { take, error: `Unknown track id: ${id}` };
  }

  const byId = new Map(tracks.map((track) => [track.id, track]));
  return {
    take: {
      ...take,
      tracks: trackIds.map((id) => byId.get(id)!),
    },
  };
}
