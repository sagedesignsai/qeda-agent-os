/**
 * lib/studio/editing/media.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Media-pool and recording-import operations.
 *
 * A `StudioMediaAsset` is source material; a `StudioClip` is a placement of that
 * material on a track. Importing a recording adds an asset, not a clip — the
 * caller decides where (and how many times) it plays.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { nanoid } from 'nanoid';
import type {
  StudioMediaAsset,
  StudioTake,
  StudioTrack,
  StudioTrackType,
} from '../types';
import { addClip, type AddClipInput } from './clips';
import { materializeProjectTracks } from './materialize';

export interface CreateMediaAssetInput {
  path: string;
  kind: StudioMediaAsset['kind'];
  name?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
}

export function createMediaAsset(
  input: CreateMediaAssetInput,
): StudioMediaAsset {
  const name =
    input.name?.trim() ||
    input.path.split(/[\\/]/).filter(Boolean).pop() ||
    'Media';
  return {
    id: `asset-${nanoid(8)}`,
    name,
    path: input.path,
    kind: input.kind,
    durationMs: Math.max(0, input.durationMs ?? 0),
    width: input.width,
    height: input.height,
    probe:
      input.width || input.height || input.durationMs
        ? {
            durationMs: Math.max(0, input.durationMs ?? 0),
            width: input.width ?? 0,
            height: input.height ?? 0,
            fps: 0,
            rotation: 0,
            hasAudio: input.hasAudio ?? input.kind !== 'image',
          }
        : null,
    addedAt: Date.now(),
  };
}

export interface ImportRecordingInput {
  videoPath: string;
  title?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
}

/**
 * Add a recording to the project's media pool.
 *
 * The asset is reusable: the same recording can be placed multiple times (an
 * intro, a callout, a replay) without duplicating the source file.
 */
export function importRecording(
  take: StudioTake,
  input: ImportRecordingInput,
): { take: StudioTake; asset?: StudioMediaAsset; error?: string } {
  if (!input.videoPath) return { take, error: 'videoPath is required' };

  const base = materializeProjectTracks(take);
  const asset = createMediaAsset({
    path: input.videoPath,
    kind: 'video',
    name: input.title,
    durationMs: input.durationMs ?? take.durationMs,
    width: input.width,
    height: input.height,
    hasAudio: input.hasAudio,
  });

  return {
    take: {
      ...base,
      mediaAssets: [...(base.mediaAssets ?? []), asset],
    },
    asset,
  };
}

/** True when a recording carries an audio stream worth adding to the timeline. */
export function detectAudioTrack(input: {
  audioPath?: string | null;
  hasAudio?: boolean;
}): boolean {
  if (typeof input.hasAudio === 'boolean') return input.hasAudio;
  return Boolean(input.audioPath);
}

function ensureTrack(
  take: StudioTake,
  type: StudioTrackType,
  name: string,
): { take: StudioTake; track: StudioTrack } {
  const tracks = [...(take.tracks ?? [])];
  const existing = tracks.find((track) => track.type === type);
  if (existing) return { take, track: existing };

  const track: StudioTrack = {
    id: `track-${type}-${nanoid(6)}`,
    name,
    type,
    locked: false,
    visible: true,
    muted: type === 'audio' ? false : undefined,
    clips: [],
  };
  return {
    take: { ...take, tracks: [...tracks, track] },
    track,
  };
}

/**
 * Ensure the project has a video lane and (optionally) an audio lane.
 *
 * Used by recording import so the first recording lands on a sane timeline
 * instead of forcing the caller to know the lane ids.
 */
export function autoCreateTracks(
  take: StudioTake,
  options: { withAudio?: boolean } = {},
): { take: StudioTake; videoTrackId: string; audioTrackId?: string } {
  const base = materializeProjectTracks(take);
  const video = ensureTrack(base, 'video', 'Video 1');
  if (!options.withAudio) {
    return { take: video.take, videoTrackId: video.track.id };
  }
  const audio = ensureTrack(video.take, 'audio', 'Audio 1');
  return {
    take: audio.take,
    videoTrackId: video.track.id,
    audioTrackId: audio.track.id,
  };
}

export interface AddClipFromAssetInput {
  assetId: string;
  trackId?: string;
  startMs?: number;
  sourceInMs?: number;
  durationMs?: number;
}

/**
 * Place a media-pool asset on the timeline.
 *
 * Defaults: start at 0, source at 0, play the asset's full duration. A video
 * asset with audio also gets a mirrored audio clip on the audio lane, because a
 * silent video track is almost never what the caller meant.
 */
export function addClipFromAsset(
  take: StudioTake,
  input: AddClipFromAssetInput,
): { take: StudioTake; clipId?: string; error?: string } {
  const assets = take.mediaAssets ?? [];
  const asset = assets.find((candidate) => candidate.id === input.assetId);
  if (!asset) return { take, error: `Media asset ${input.assetId} not found` };

  const durationMs = Math.max(
    1,
    input.durationMs ?? asset.durationMs ?? 1000,
  );
  const clipInput: AddClipInput = {
    trackId: input.trackId,
    clip: {
      id: `clip-${nanoid(8)}`,
      name: asset.name,
      itemType: asset.kind === 'audio' ? 'audio' : asset.kind === 'image' ? 'image' : 'video',
      startMs: Math.max(0, input.startMs ?? 0),
      durationMs,
      sourceInMs: Math.max(0, input.sourceInMs ?? 0),
      sourceDurationMs: durationMs,
      mediaAssetId: asset.id,
      payload: { mediaAssetId: asset.id },
    },
  };

  const placed = addClip(take, clipInput);
  if (placed.error) return { take, error: placed.error };
  return { take: placed.take, clipId: placed.clip?.id };
}
