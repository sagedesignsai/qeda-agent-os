/**
 * lib/studio/editing/clips.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure clip operations over a `StudioTake`'s tracks.
 *
 * Time model (see `StudioClip`):
 *   - `startMs` / `durationMs` are composition time.
 *   - `sourceInMs` is the offset into the referenced media asset.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { nanoid } from 'nanoid';
import type { StudioClip, StudioTake, StudioTrack } from '../types';
import {
  materializeProjectTracks,
  stripLegacyElement,
} from './materialize';

export interface FoundClip {
  track: StudioTrack;
  clip: StudioClip;
  clipIndex: number;
  trackIndex: number;
}

export function findClip(take: StudioTake, clipId: string): FoundClip | null {
  const tracks = take.tracks ?? [];
  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
    const track = tracks[trackIndex];
    const clipIndex = track.clips.findIndex((clip) => clip.id === clipId);
    if (clipIndex !== -1) {
      return { track, clip: track.clips[clipIndex], clipIndex, trackIndex };
    }
  }
  return null;
}

export function listClips(take: StudioTake): StudioClip[] {
  return (take.tracks ?? []).flatMap((track) => track.clips);
}

function replaceClip(
  take: StudioTake,
  found: FoundClip,
  nextClip: StudioClip,
): StudioTake {
  const tracks = [...(take.tracks ?? [])];
  const nextClips = [...found.track.clips];
  nextClips[found.clipIndex] = nextClip;
  tracks[found.trackIndex] = { ...found.track, clips: nextClips };
  return { ...take, tracks };
}

export interface AddClipInput {
  trackId?: string;
  clip: Omit<StudioClip, 'trackId'> & { trackId?: string };
}

/**
 * Insert a clip into a track.
 *
 * When `trackId` is omitted the first track of the clip's `itemType` is used;
 * when there is no matching track a new one is created, so an agent can say
 * "add this video" without first managing lanes.
 */
export function addClip(
  take: StudioTake,
  input: AddClipInput,
): { take: StudioTake; clip?: StudioClip; error?: string } {
  const base = materializeProjectTracks(take);
  const clipInput = input.clip;

  if (!(clipInput.durationMs > 0)) {
    return { take, error: 'Clip durationMs must be greater than 0' };
  }
  if (clipInput.startMs < 0) {
    return { take, error: 'Clip startMs must be >= 0' };
  }

  const requestedTrackId = input.trackId ?? clipInput.trackId;
  let tracks = [...(base.tracks ?? [])];
  let trackIndex = requestedTrackId
    ? tracks.findIndex((track) => track.id === requestedTrackId)
    : -1;

  if (requestedTrackId && trackIndex === -1) {
    return { take, error: `Track ${requestedTrackId} not found` };
  }

  if (trackIndex === -1) {
    const desiredType = trackTypeForClip(clipInput);
    trackIndex = tracks.findIndex((track) => track.type === desiredType);
    if (trackIndex === -1) {
      const id = `track-${desiredType}-${nanoid(6)}`;
      tracks = [
        ...tracks,
        {
          id,
          name: `${desiredType.charAt(0).toUpperCase()}${desiredType.slice(1)} 1`,
          type: desiredType,
          locked: false,
          visible: true,
          clips: [],
        },
      ];
      trackIndex = tracks.length - 1;
    }
  }

  const track = tracks[trackIndex];
  if (track.locked) {
    return { take, error: `Track ${track.id} is locked` };
  }

  const clip: StudioClip = {
    ...clipInput,
    id: clipInput.id || `clip-${nanoid(8)}`,
    trackId: track.id,
    sourceInMs: Math.max(0, clipInput.sourceInMs ?? 0),
    sourceDurationMs:
      clipInput.sourceDurationMs ??
      Math.max(0, clipInput.durationMs * (clipInput.speed ?? 1)),
  };

  if (track.clips.some((existing) => existing.id === clip.id)) {
    return { take, error: `Clip ${clip.id} already exists` };
  }

  tracks[trackIndex] = {
    ...track,
    clips: [...track.clips, clip].sort((a, b) => a.startMs - b.startMs),
  };

  return { take: { ...base, tracks }, clip };
}

function trackTypeForClip(clip: Omit<StudioClip, 'trackId'>): StudioTrack['type'] {
  switch (clip.itemType) {
    case 'audio':
      return 'audio';
    case 'text':
      return 'captions';
    case 'effect':
      return 'effects';
    case 'transition':
      return 'transitions';
    case 'overlay':
      return 'overlays';
    default:
      return 'video';
  }
}

export function removeClip(
  take: StudioTake,
  clipId: string,
): { take: StudioTake; removed: boolean } {
  const found = findClip(take, clipId);
  if (!found) return { take, removed: false };

  const tracks = [...(take.tracks ?? [])];
  tracks[found.trackIndex] = {
    ...found.track,
    clips: found.track.clips.filter((clip) => clip.id !== clipId),
  };
  return { take: stripLegacyElement({ ...take, tracks }, clipId), removed: true };
}

export interface MoveClipInput {
  trackId?: string;
  startMs?: number;
}

/**
 * Move a clip in time and/or to another track of a compatible type.
 *
 * Cross-type moves are rejected: dropping a video clip on the audio lane would
 * silently change how it renders, and the timeline UI already enforces lanes.
 */
export function moveClip(
  take: StudioTake,
  clipId: string,
  input: MoveClipInput,
): { take: StudioTake; clip?: StudioClip; error?: string } {
  const found = findClip(take, clipId);
  if (!found) return { take, error: `Clip ${clipId} not found` };

  const startMs = input.startMs ?? found.clip.startMs;
  if (startMs < 0) return { take, error: 'startMs must be >= 0' };

  const tracks = [...(take.tracks ?? [])];

  if (input.trackId && input.trackId !== found.track.id) {
    const targetIndex = tracks.findIndex((track) => track.id === input.trackId);
    if (targetIndex === -1) {
      return { take, error: `Track ${input.trackId} not found` };
    }
    const target = tracks[targetIndex];
    if (target.locked) return { take, error: `Track ${target.id} is locked` };
    if (target.type !== found.track.type) {
      return {
        take,
        error: `Cannot move a ${found.clip.itemType ?? found.track.type} clip onto a ${target.type} track`,
      };
    }

    const moved: StudioClip = { ...found.clip, trackId: target.id, startMs };
    tracks[found.trackIndex] = {
      ...found.track,
      clips: found.track.clips.filter((clip) => clip.id !== clipId),
    };
    tracks[targetIndex] = {
      ...target,
      clips: [...target.clips, moved].sort((a, b) => a.startMs - b.startMs),
    };
    return { take: { ...take, tracks }, clip: moved };
  }

  const moved: StudioClip = { ...found.clip, startMs };
  return { take: replaceClip(take, found, moved), clip: moved };
}

export function updateClip(
  take: StudioTake,
  clipId: string,
  patch: Partial<StudioClip>,
): { take: StudioTake; clip?: StudioClip; error?: string } {
  const found = findClip(take, clipId);
  if (!found) return { take, error: `Clip ${clipId} not found` };

  const next: StudioClip = {
    ...found.clip,
    ...patch,
    id: found.clip.id,
    trackId: found.clip.trackId,
  };
  if (!(next.durationMs > 0)) {
    return { take, error: 'Clip durationMs must be greater than 0' };
  }
  return { take: replaceClip(take, found, next), clip: next };
}

export interface ClipPropertiesPatch {
  speed?: number;
  volume?: number;
  opacity?: number;
  transform?: StudioClip['transform'];
  enterAnimation?: StudioClip['enterAnimation'];
  exitAnimation?: StudioClip['exitAnimation'];
  deviceFrame?: StudioClip['deviceFrame'];
  blendMode?: string;
}

/** Patch the visual/playback properties of a clip in one call. */
export function setClipProperties(
  take: StudioTake,
  clipId: string,
  patch: ClipPropertiesPatch,
): { take: StudioTake; clip?: StudioClip; error?: string } {
  const found = findClip(take, clipId);
  if (!found) return { take, error: `Clip ${clipId} not found` };

  if (patch.speed !== undefined && !(patch.speed > 0)) {
    return { take, error: 'speed must be greater than 0' };
  }
  if (patch.volume !== undefined && (patch.volume < 0 || patch.volume > 2)) {
    return { take, error: 'volume must be between 0 and 2' };
  }
  if (patch.opacity !== undefined && (patch.opacity < 0 || patch.opacity > 1)) {
    return { take, error: 'opacity must be between 0 and 1' };
  }

  const payload = {
    ...found.clip.payload,
    ...(patch.blendMode !== undefined ? { blendMode: patch.blendMode } : {}),
  };

  const next: StudioClip = {
    ...found.clip,
    ...(patch.speed !== undefined ? { speed: patch.speed } : {}),
    ...(patch.volume !== undefined ? { volume: patch.volume } : {}),
    ...(patch.opacity !== undefined ? { opacity: patch.opacity } : {}),
    ...(patch.transform !== undefined ? { transform: patch.transform } : {}),
    ...(patch.enterAnimation !== undefined
      ? { enterAnimation: patch.enterAnimation }
      : {}),
    ...(patch.exitAnimation !== undefined
      ? { exitAnimation: patch.exitAnimation }
      : {}),
    ...(patch.deviceFrame !== undefined
      ? { deviceFrame: patch.deviceFrame }
      : {}),
    payload,
  };

  return { take: replaceClip(take, found, next), clip: next };
}

/** Total project length implied by the timeline (0 when empty). */
export function projectDurationMs(take: StudioTake): number {
  let max = 0;
  for (const clip of listClips(take)) {
    max = Math.max(max, clip.startMs + clip.durationMs);
  }
  return max;
}
