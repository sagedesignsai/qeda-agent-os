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
 *   - Every persisted element is authored in **source** time. The timeline is
 *     projected into **composition** time through `timeline/ripple`, with cuts
 *     excised, so a clip's `startMs` is where it plays in the output and
 *     `sourceStartMs` is where it lives in the recording. Round-tripping goes
 *     back through the same mapping.
 *   - The `video` track is the only source of cuts, and its clips are laid out
 *     contiguously: a cut is the *absence* of a source span, never a gap on the
 *     ruler. `extractCutsFromTracks` therefore reads `sourceStartMs` /
 *     `sourceDurationMs`, not timeline positions.
 *   - Overlays live on their own track so adding a picture-in-picture can never
 *     be mistaken for a silence gap.
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
import {
  compRangeFromSource,
  keptSegments,
  normalizeCuts,
  sourceRangeFromComp,
  type RippleCut,
} from './ripple';

const EFFECTS_TRACK_ID = 'track-effects';
const CAPTIONS_TRACK_ID = 'track-captions';
const VIDEO_TRACK_ID = 'track-video';
const AUDIO_TRACK_ID = 'track-audio';
const OVERLAYS_TRACK_ID = 'track-overlays';

/** Gap below which two adjacent source spans are treated as continuous. */
const CUT_GAP_TOLERANCE_MS = 50;

// ── Direction A: take → tracks ────────────────────────────────────────────────

export function convertTakeToTracks(take: StudioTake): TimelineTrack[] {
  const sourceDuration = Math.max(0, take.durationMs);
  const cuts = normalizeCuts(take.cuts ?? [], sourceDuration);
  const zooms = take.zooms ?? [];
  const captions = take.captions ?? [];
  const effects = take.effects ?? [];
  const overlays = take.overlays ?? [];

  const zoomClips = zooms.flatMap((zoom): TimelineClip[] => {
    const span = compRangeFromSource(
      { startMs: zoom.startMs, endMs: zoom.endMs },
      cuts,
    );
    if (!span) return [];
    return [
      {
        id: zoom.id,
        trackId: EFFECTS_TRACK_ID,
        name: `Zoom ${zoom.scale}x`,
        startMs: span.startMs,
        durationMs: span.endMs - span.startMs,
        sourceStartMs: zoom.startMs,
        sourceDurationMs: Math.max(0, zoom.endMs - zoom.startMs),
        color: '#8b5cf6',
        payload: {
          effectType: 'zoom',
          scale: zoom.scale,
          targetX: zoom.targetX,
          targetY: zoom.targetY,
        },
      },
    ];
  });

  const effectClips = effects.flatMap((effect): TimelineClip[] => {
    const span = compRangeFromSource(
      { startMs: effect.startMs, endMs: effect.endMs },
      cuts,
    );
    if (!span) return [];
    const definition = getStudioEffectDefinition(effect.type);
    return [
      {
        id: effect.id,
        trackId: EFFECTS_TRACK_ID,
        name: definition?.label ?? effect.type,
        startMs: span.startMs,
        durationMs: span.endMs - span.startMs,
        sourceStartMs: effect.startMs,
        sourceDurationMs: Math.max(0, effect.endMs - effect.startMs),
        color: definition?.accent ?? '#8b5cf6',
        payload: {
          effectType: effect.type,
          intensity: effect.intensity,
        },
      },
    ];
  });

  const captionClips = captions.flatMap((caption): TimelineClip[] => {
    const span = compRangeFromSource(
      { startMs: caption.startMs, endMs: caption.endMs },
      cuts,
    );
    if (!span) return [];
    return [
      {
        id: caption.id,
        trackId: CAPTIONS_TRACK_ID,
        name: caption.text,
        startMs: span.startMs,
        durationMs: span.endMs - span.startMs,
        sourceStartMs: caption.startMs,
        sourceDurationMs: Math.max(0, caption.endMs - caption.startMs),
        color: '#14b8a6',
        payload: {
          text: caption.text,
        },
      },
    ];
  });

  const overlayClips = overlays.flatMap((overlay): TimelineClip[] => {
    const span = compRangeFromSource(
      { startMs: overlay.startMs, endMs: overlay.endMs },
      cuts,
    );
    if (!span) return [];
    return [
      {
        id: overlay.id,
        trackId: OVERLAYS_TRACK_ID,
        name: overlay.kind === 'image' ? 'Image Overlay' : 'Video Overlay',
        startMs: span.startMs,
        durationMs: span.endMs - span.startMs,
        sourceStartMs: overlay.startMs,
        sourceDurationMs: Math.max(0, overlay.endMs - overlay.startMs),
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
      },
    ];
  });

  const videoClips = buildVideoClips(take, sourceDuration, cuts);
  const audioClips = buildAudioClips(take, videoClips);

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

/**
 * Lay the surviving source spans out back-to-back in composition time.
 *
 * Contiguity is the point: a cut is expressed as a jump in `sourceStartMs`
 * between neighbouring clips, so the ruler shows the length the viewer will
 * actually get instead of a gap that nothing honours.
 */
function buildVideoClips(
  take: StudioTake,
  sourceDurationMs: number,
  cuts: readonly RippleCut[],
): TimelineClip[] {
  const segments = keptSegments(sourceDurationMs, cuts);
  const clips: TimelineClip[] = [];
  let compCursor = 0;

  for (const [index, segment] of segments.entries()) {
    const durationMs = segment.endMs - segment.startMs;
    if (durationMs <= 0) continue;
    clips.push({
      id: `${take.id}-video-${index}`,
      trackId: VIDEO_TRACK_ID,
      name: index === 0 ? take.title : segmentTitle(take.title, index),
      startMs: compCursor,
      durationMs,
      sourceStartMs: segment.startMs,
      sourceDurationMs: durationMs,
      color: '#334155',
    });
    compCursor += durationMs;
  }

  return clips;
}

function buildAudioClips(
  take: StudioTake,
  videoClips: TimelineClip[],
): TimelineClip[] {
  return videoClips.map((clip, index) => ({
    id: `${take.id}-audio-${index}`,
    trackId: AUDIO_TRACK_ID,
    name: 'Microphone',
    startMs: clip.startMs,
    durationMs: clip.durationMs,
    sourceStartMs: clip.sourceStartMs,
    sourceDurationMs: clip.sourceDurationMs,
    color: '#0284c7',
    payload: { volume: 1.0 },
  }));
}

// ── Direction B: tracks → model ───────────────────────────────────────────────

/**
 * Project comp-time clips back onto the source axis they came from.
 *
 * A clip carries `sourceStartMs` for reference, but the timeline position is
 * authoritative after a move, so the mapping always starts from `startMs` plus
 * the current cut list.
 */
function clipSourceSpan(
  clip: TimelineClip,
  cuts: readonly RippleCut[],
): { startMs: number; endMs: number } {
  return sourceRangeFromComp(
    { startMs: clip.startMs, endMs: clip.startMs + clip.durationMs },
    cuts,
  );
}

function roundSpan(span: { startMs: number; endMs: number }) {
  return {
    startMs: Math.round(span.startMs),
    endMs: Math.round(span.endMs),
  };
}

/**
 * Derive the cut list from the video track.
 *
 * Only source spans matter: clips are contiguous on the ruler, so a gap here
 * would mean two adjacent clips disagree about which part of the recording they
 * show. That happens when a clip is deleted or an edge is trimmed inwards — the
 * missing source range *is* the cut.
 */
export function extractCutsFromTracks(
  tracks: TimelineTrack[],
  sourceDurationMs: number,
): StudioCut[] {
  const videoTrack = tracks.find((track) => track.type === 'video');
  if (!videoTrack || videoTrack.clips.length === 0) return [];

  const sorted = [...videoTrack.clips].sort(
    (a, b) => a.sourceStartMs - b.sourceStartMs,
  );
  const cuts: StudioCut[] = [];
  let cursor = 0;

  for (const clip of sorted) {
    const start = Math.max(0, clip.sourceStartMs);
    if (start > cursor + CUT_GAP_TOLERANCE_MS) {
      cuts.push({
        id: `cut-${Math.round(cursor)}-${Math.round(start)}`,
        startMs: Math.round(cursor),
        endMs: Math.round(start),
        reason: 'manual',
      });
    }
    cursor = Math.max(
      cursor,
      start + Math.max(0, clip.sourceDurationMs || clip.durationMs),
    );
  }

  if (sourceDurationMs > cursor + CUT_GAP_TOLERANCE_MS) {
    cuts.push({
      id: `cut-${Math.round(cursor)}-${Math.round(sourceDurationMs)}`,
      startMs: Math.round(cursor),
      endMs: Math.round(sourceDurationMs),
      reason: 'manual',
    });
  }

  return normalizeCuts(cuts, sourceDurationMs);
}

export function extractZoomsFromTracks(
  tracks: TimelineTrack[],
  cuts: readonly RippleCut[] = [],
): StudioZoom[] {
  const effectsTrack = tracks.find((track) => track.type === 'effects');
  if (!effectsTrack) return [];

  return effectsTrack.clips
    .filter((clip) => {
      // Zoom clips carry scale/target geometry and no canvas effect type, so
      // `effectTypeFromPayload` returns null for them; real FX resolve to a
      // StudioEffectType and are filtered out here.
      return effectTypeFromPayload(clip.payload) === null;
    })
    .map((clip) => {
      const span = roundSpan(clipSourceSpan(clip, cuts));
      return {
        id: clip.id,
        startMs: span.startMs,
        endMs: span.endMs,
        scale: numberOr(clip.payload?.scale, 1.5),
        targetX: numberOr(clip.payload?.targetX, 0.5),
        targetY: numberOr(clip.payload?.targetY, 0.5),
      };
    });
}

export function extractCaptionsFromTracks(
  tracks: TimelineTrack[],
  cuts: readonly RippleCut[] = [],
): StudioCaption[] {
  const captionsTrack = tracks.find((track) => track.type === 'captions');
  if (!captionsTrack) return [];

  return captionsTrack.clips.map((clip) => {
    const span = roundSpan(clipSourceSpan(clip, cuts));
    return {
      id: clip.id,
      startMs: span.startMs,
      endMs: span.endMs,
      text: clip.payload?.text || clip.name,
    };
  });
}

export function extractEffectsFromTracks(
  tracks: TimelineTrack[],
  cuts: readonly RippleCut[] = [],
): StudioEffect[] {
  const effectsTrack = tracks.find((track) => track.type === 'effects');
  if (!effectsTrack) return [];

  const effects: StudioEffect[] = [];
  for (const clip of effectsTrack.clips) {
    const type = effectTypeFromPayload(clip.payload);
    if (!type) continue;
    const span = roundSpan(clipSourceSpan(clip, cuts));
    effects.push({
      id: clip.id,
      type,
      startMs: span.startMs,
      endMs: span.endMs,
      intensity: numberOr(clip.payload?.intensity, 0.6),
    });
  }
  return effects;
}

export function extractOverlaysFromTracks(
  tracks: TimelineTrack[],
  cuts: readonly RippleCut[] = [],
): StudioOverlay[] {
  const overlaysTrack = tracks.find((track) => track.type === 'overlays');
  if (!overlaysTrack) return [];

  const overlays: StudioOverlay[] = [];
  for (const clip of overlaysTrack.clips) {
    const srcPath = clip.payload?.srcPath || clip.payload?.filePath;
    if (!srcPath) continue;
    const span = roundSpan(clipSourceSpan(clip, cuts));
    overlays.push({
      id: clip.id,
      kind: clip.payload?.kind === 'image' ? 'image' : 'video',
      srcPath,
      startMs: span.startMs,
      endMs: span.endMs,
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

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
