/**
 * lib/studio/timeline/convert.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The bridge between the persisted `StudioTake` model and the editor's
 * multi-track timeline projection.
 *
 * Direction A (convertTakeToTracks): build tracks for the timeline store.
 * Direction B (extract*FromTracks): derive model fields from edited tracks, so
 * a drag/trim/split round-trips back into the take on commit.
 *
 * Invariants:
 *   - The `video` track is the only source of cuts; overlays live on their own
 *     `overlays` track so adding a picture-in-picture can never be mistaken for
 *     a silence gap.
 *   - The `effects` track holds both kinetic zooms and canvas effects; they are
 *     disambiguated by `payload.effectType` (absent ⇒ zoom).
 *   - Track order is stable (effects, captions, video, audio[, overlays]) so
 *     existing consumers keep their indices.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  StudioCaption,
  StudioCut,
  StudioEffect,
  StudioOverlay,
  StudioTake,
  StudioZoom,
  TimelineClip,
  TimelineTrack,
} from '../types';
import {
  effectTypeFromPayload,
  getStudioEffectDefinition,
} from '../effects/catalog';

const EFFECTS_TRACK_ID = 'track-effects';
const CAPTIONS_TRACK_ID = 'track-captions';
const VIDEO_TRACK_ID = 'track-video';
const AUDIO_TRACK_ID = 'track-audio';
const OVERLAYS_TRACK_ID = 'track-overlays';

const MIN_TRACK_DURATION_MS = 4000;
const MIN_CLIP_MS = 500;
/** Gap below which two adjacent video clips are treated as continuous. */
const CUT_GAP_TOLERANCE_MS = 50;

// ── Direction A: take → tracks ────────────────────────────────────────────────

export function convertTakeToTracks(take: StudioTake): TimelineTrack[] {
  const duration = Math.max(take.durationMs, MIN_TRACK_DURATION_MS);
  const zooms = take.zooms ?? [];
  const captions = take.captions ?? [];
  const effects = take.effects ?? [];
  const overlays = take.overlays ?? [];

  const zoomClips: TimelineClip[] = zooms.map((zoom) => ({
    id: zoom.id,
    trackId: EFFECTS_TRACK_ID,
    name: `Zoom ${zoom.scale}x`,
    startMs: zoom.startMs,
    durationMs: Math.max(zoom.endMs - zoom.startMs, MIN_CLIP_MS),
    sourceStartMs: zoom.startMs,
    sourceDurationMs: zoom.endMs - zoom.startMs,
    color: '#8b5cf6',
    payload: {
      effectType: 'zoom',
      scale: zoom.scale,
      targetX: zoom.targetX,
      targetY: zoom.targetY,
    },
  }));

  const effectClips: TimelineClip[] = effects.map((effect) => {
    const definition = getStudioEffectDefinition(effect.type);
    return {
      id: effect.id,
      trackId: EFFECTS_TRACK_ID,
      name: definition?.label ?? effect.type,
      startMs: effect.startMs,
      durationMs: Math.max(effect.endMs - effect.startMs, MIN_CLIP_MS),
      sourceStartMs: effect.startMs,
      sourceDurationMs: effect.endMs - effect.startMs,
      color: definition?.accent ?? '#8b5cf6',
      payload: {
        effectType: effect.type,
        intensity: effect.intensity,
      },
    };
  });

  const captionClips: TimelineClip[] = captions.map((caption) => ({
    id: caption.id,
    trackId: CAPTIONS_TRACK_ID,
    name: caption.text,
    startMs: caption.startMs,
    durationMs: Math.max(caption.endMs - caption.startMs, MIN_CLIP_MS),
    sourceStartMs: caption.startMs,
    sourceDurationMs: caption.endMs - caption.startMs,
    color: '#14b8a6',
    payload: {
      text: caption.text,
    },
  }));

  const overlayClips: TimelineClip[] = overlays.map((overlay) => ({
    id: overlay.id,
    trackId: OVERLAYS_TRACK_ID,
    name:
      overlay.kind === 'image'
        ? 'Image Overlay'
        : 'Video Overlay',
    startMs: overlay.startMs,
    durationMs: Math.max(overlay.endMs - overlay.startMs, MIN_CLIP_MS),
    sourceStartMs: overlay.startMs,
    sourceDurationMs: overlay.endMs - overlay.startMs,
    color: overlay.kind === 'image' ? '#f59e0b' : '#0ea5e9',
    payload: {
      kind: overlay.kind,
      srcPath: overlay.srcPath,
      x: overlay.x,
      y: overlay.y,
      widthPct: overlay.widthPct,
      opacity: overlay.opacity,
      rotation: overlay.rotation,
      cornerRadius: overlay.cornerRadius,
    },
  }));

  const videoClips = buildVideoClips(take, duration);
  const audioClips = buildAudioClips(take, duration, videoClips);

  const tracks: TimelineTrack[] = [
    {
      id: EFFECTS_TRACK_ID,
      type: 'effects',
      name: 'Effects & Zooms',
      locked: false,
      visible: true,
      clips: [...zoomClips, ...effectClips].sort(
        (a, b) => a.startMs - b.startMs,
      ),
    },
    {
      id: CAPTIONS_TRACK_ID,
      type: 'captions',
      name: 'Subtitles & Text',
      locked: false,
      visible: true,
      clips: captionClips,
    },
    {
      id: VIDEO_TRACK_ID,
      type: 'video',
      name: 'Primary Video',
      locked: false,
      visible: true,
      clips: videoClips,
    },
    {
      id: AUDIO_TRACK_ID,
      type: 'audio',
      name: 'Audio Waveform',
      locked: false,
      visible: true,
      muted: false,
      clips: audioClips,
    },
  ];

  // Only present a track when it has content, so a take without overlays keeps
  // the historical four-track shape.
  if (overlayClips.length > 0) {
    tracks.push({
      id: OVERLAYS_TRACK_ID,
      type: 'overlays',
      name: 'Media Overlays',
      locked: false,
      visible: true,
      clips: overlayClips,
    });
  }

  return tracks;
}

function segmentTitle(title: string, index: number): string {
  return `${title} [${index}]`;
}

function buildVideoClips(take: StudioTake, duration: number): TimelineClip[] {
  const cuts = take.cuts ?? [];

  if (cuts.length === 0) {
    return [
      {
        id: `${take.id}-video-0`,
        trackId: VIDEO_TRACK_ID,
        name: take.title,
        startMs: 0,
        durationMs: duration,
        sourceStartMs: 0,
        sourceDurationMs: duration,
        color: '#334155',
      },
    ];
  }

  const sortedCuts = [...cuts].sort((a, b) => a.startMs - b.startMs);
  const clips: TimelineClip[] = [];
  let currentMs = 0;
  let clipIndex = 0;

  for (const cut of sortedCuts) {
    if (cut.startMs > currentMs) {
      clips.push(
        videoClipSegment(take, clipIndex++, currentMs, cut.startMs - currentMs),
      );
    }
    currentMs = cut.endMs;
  }

  if (currentMs < duration) {
    clips.push(
      videoClipSegment(take, clipIndex++, currentMs, duration - currentMs),
    );
  }

  return clips;
}

function videoClipSegment(
  take: StudioTake,
  index: number,
  startMs: number,
  durationMs: number,
): TimelineClip {
  return {
    id: `${take.id}-video-${index}`,
    trackId: VIDEO_TRACK_ID,
    name: index === 0 ? take.title : segmentTitle(take.title, index),
    startMs,
    durationMs,
    sourceStartMs: startMs,
    sourceDurationMs: durationMs,
    color: '#334155',
  };
}

function buildAudioClips(
  take: StudioTake,
  duration: number,
  videoClips: TimelineClip[],
): TimelineClip[] {
  const source = videoClips.length > 0 ? videoClips : buildVideoClips(take, duration);
  return source.map((clip, index) => ({
    id: `${take.id}-audio-${index}`,
    trackId: AUDIO_TRACK_ID,
    name: 'Microphone & System Audio',
    startMs: clip.startMs,
    durationMs: clip.durationMs,
    sourceStartMs: clip.sourceStartMs,
    sourceDurationMs: clip.sourceDurationMs,
    color: '#0284c7',
    payload: { volume: 1.0 },
  }));
}

// ── Direction B: tracks → model ───────────────────────────────────────────────

export function extractZoomsFromTracks(tracks: TimelineTrack[]): StudioZoom[] {
  const effectsTrack = tracks.find((track) => track.type === 'effects');
  if (!effectsTrack) return [];

  return effectsTrack.clips
    .filter((clip) => {
      // Zoom clips carry scale/target geometry and no canvas effect type, so
      // `effectTypeFromPayload` returns null for them; real FX resolve to a
      // StudioEffectType and are filtered out here.
      return effectTypeFromPayload(clip.payload) === null;
    })
    .map((clip) => ({
      id: clip.id,
      startMs: Math.round(clip.startMs),
      endMs: Math.round(clip.startMs + clip.durationMs),
      scale: numberOr(clip.payload?.scale, 1.5),
      targetX: numberOr(clip.payload?.targetX, 0.5),
      targetY: numberOr(clip.payload?.targetY, 0.5),
    }));
}

export function extractCaptionsFromTracks(
  tracks: TimelineTrack[],
): StudioCaption[] {
  const captionsTrack = tracks.find((track) => track.type === 'captions');
  if (!captionsTrack) return [];

  return captionsTrack.clips.map((clip) => ({
    id: clip.id,
    startMs: Math.round(clip.startMs),
    endMs: Math.round(clip.startMs + clip.durationMs),
    text: clip.payload?.text || clip.name,
  }));
}

export function extractEffectsFromTracks(tracks: TimelineTrack[]): StudioEffect[] {
  const effectsTrack = tracks.find((track) => track.type === 'effects');
  if (!effectsTrack) return [];

  const effects: StudioEffect[] = [];
  for (const clip of effectsTrack.clips) {
    const type = effectTypeFromPayload(clip.payload);
    if (!type) continue;
    effects.push({
      id: clip.id,
      type,
      startMs: Math.round(clip.startMs),
      endMs: Math.round(clip.startMs + clip.durationMs),
      intensity: numberOr(clip.payload?.intensity, 0.6),
    });
  }
  return effects;
}

export function extractOverlaysFromTracks(
  tracks: TimelineTrack[],
): StudioOverlay[] {
  const overlaysTrack = tracks.find((track) => track.type === 'overlays');
  if (!overlaysTrack) return [];

  const overlays: StudioOverlay[] = [];
  for (const clip of overlaysTrack.clips) {
    const srcPath = clip.payload?.srcPath || clip.payload?.filePath;
    if (!srcPath) continue;
    overlays.push({
      id: clip.id,
      kind: clip.payload?.kind === 'image' ? 'image' : 'video',
      srcPath,
      startMs: Math.round(clip.startMs),
      endMs: Math.round(clip.startMs + clip.durationMs),
      x: numberOr(clip.payload?.x, 0.5),
      y: numberOr(clip.payload?.y, 0.5),
      widthPct: numberOr(clip.payload?.widthPct, 0.42),
      opacity: numberOr(clip.payload?.opacity, 1),
      rotation: numberOr(clip.payload?.rotation, 0),
      cornerRadius: numberOr(clip.payload?.cornerRadius, 12),
    });
  }
  return overlays;
}

export function extractCutsFromTracks(
  tracks: TimelineTrack[],
  totalDurationMs: number,
): StudioCut[] {
  const videoTrack = tracks.find((track) => track.type === 'video');
  if (!videoTrack || videoTrack.clips.length === 0) return [];

  const sorted = [...videoTrack.clips].sort((a, b) => a.startMs - b.startMs);
  const cuts: StudioCut[] = [];
  let currentMs = 0;

  for (const clip of sorted) {
    if (clip.startMs > currentMs + CUT_GAP_TOLERANCE_MS) {
      cuts.push({
        id: `cut-${Math.round(currentMs)}-${Math.round(clip.startMs)}`,
        startMs: Math.round(currentMs),
        endMs: Math.round(clip.startMs),
        reason: 'manual',
      });
    }
    currentMs = clip.startMs + clip.durationMs;
  }

  if (totalDurationMs > currentMs + CUT_GAP_TOLERANCE_MS) {
    cuts.push({
      id: `cut-${Math.round(currentMs)}-${Math.round(totalDurationMs)}`,
      startMs: Math.round(currentMs),
      endMs: Math.round(totalDurationMs),
      reason: 'manual',
    });
  }

  return cuts;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
