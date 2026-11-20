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
 *   - The legacy `track-video` lane is the only source of cuts, and its clips are laid out
 *     contiguously: a cut is the *absence* of a source span, never a gap on the
 *     ruler. `extractCutsFromTracks` therefore reads `sourceStartMs` /
 *     `sourceDurationMs`, not timeline positions.
 *   - Overlays live on their own track so adding a picture-in-picture can never
 *     be mistaken for a silence gap.
 *   - The `effects` track holds both kinetic zooms and canvas effects; they are
 *     disambiguated by `payload.effectType` (absent ⇒ zoom).
 *   - Timeline rows are ordered top-to-bottom: effects, captions,
 *     transitions, overlays, video lanes, then audio. Video rows composite
 *     bottom-to-top so the highest visible lane draws over the lower lanes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  StudioCaption,
  StudioCaptionWord,
  StudioClip,
  StudioCut,
  StudioEffect,
  StudioMediaAsset,
  StudioOverlay,
  StudioTake,
  StudioTrack,
  StudioZoom,
  TimelineClip,
  TimelineTrack,
} from '../types';
import {
  effectTypeFromPayload,
  getStudioEffectDefinition,
} from '../effects/catalog';
import { migrateEffectsToClips } from '../effects/migrate';
import {
  compRangeFromSource,
  keptSegments,
  normalizeCuts,
  sourceRangeFromComp,
  type RippleCut,
} from './ripple';
import { resolveTimelineItemType } from './item-type';
import { sortTracksForTimeline } from './layers';

// Note: The 'effects' track now only contains zooms (kinetic zoom).
// Canvas effects (spotlight, neon, etc.) are now clip-attached via clip.payload.effects[].
// This track is preserved for backward compatibility but will eventually become 'zooms-track'.
const EFFECTS_TRACK_ID = 'track-effects';
const CAPTIONS_TRACK_ID = 'track-captions';
const VIDEO_TRACK_ID = 'track-video';
const AUDIO_TRACK_ID = 'track-audio';
const OVERLAYS_TRACK_ID = 'track-overlays';

/** Gap below which two adjacent source spans are treated as continuous. */
const CUT_GAP_TOLERANCE_MS = 50;

/**
 * Map measured caption word timings from source time onto a composition span.
 *
 * Word timings are authored against the source recording, so cutting dead air
 * would otherwise leave the karaoke highlight behind the audio. The output is
 * in composition time, the same base as the caption's `startMs`/`endMs`.
 */
function rebaseCaptionWords(
  caption: StudioCaption,
  compStartMs: number,
  compEndMs: number,
): StudioCaptionWord[] | undefined {
  if (!caption.words || caption.words.length === 0) return undefined;
  const sourceSpan = Math.max(1, caption.endMs - caption.startMs);
  const compSpan = Math.max(1, compEndMs - compStartMs);
  const scale = compSpan / sourceSpan;
  return caption.words.map((word) => ({
    word: word.word,
    startMs: compStartMs + Math.round((word.startMs - caption.startMs) * scale),
    endMs: compStartMs + Math.round((word.endMs - caption.startMs) * scale),
  }));
}

// ── Direction A: take → tracks ────────────────────────────────────────────────

export function convertTakeToTracks(take: StudioTake): TimelineTrack[] {
  // Auto-migrate global effects to clip-attached effects (new system)
  // This is idempotent: marked by take.effectsMigratedAt and safe to re-run
  const migrationResult = migrateEffectsToClips(take);
  if (migrationResult.warnings.length > 0) {
    console.warn('Effects migration warnings:', migrationResult.warnings);
  }

  const sourceDuration = Math.max(0, take.durationMs);
  const cuts = normalizeCuts(take.cuts ?? [], sourceDuration);
  const zooms = take.zooms ?? [];
  const captions = take.captions ?? [];
  // NOTE: take.effects is no longer used—effects are now clip-attached (clip.payload.effects[])
  // The old take.effects field is kept for backward compat but ignored during conversion.
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
        itemType: 'effect',
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
        itemType: 'text',
        name: caption.text,
        startMs: span.startMs,
        durationMs: span.endMs - span.startMs,
        sourceStartMs: caption.startMs,
        sourceDurationMs: Math.max(0, caption.endMs - caption.startMs),
        color: '#14b8a6',
        payload: {
          text: caption.text,
          // Measured word timings must survive the take → track conversion;
          // dropping them silently downgraded karaoke to an even split.
          words: rebaseCaptionWords(caption, span.startMs, span.endMs),
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
        itemType: 'overlay',
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
      name: 'Effects',
      locked: false,
      visible: true,
      // NOTE: This track now only contains zooms (kinetic zoom).
      // Canvas effects (spotlight, neon, etc.) are now clip-attached via clip.payload.effects[].
      clips: zoomClips.sort((a, b) => a.startMs - b.startMs),
    },
    {
      id: CAPTIONS_TRACK_ID,
      type: 'captions',
      name: 'Text & Captions',
      locked: false,
      visible: true,
      clips: captionClips,
    },
    {
      id: VIDEO_TRACK_ID,
      type: 'video',
      name: 'Video 1',
      locked: false,
      visible: true,
      clips: videoClips,
    },
    {
      id: AUDIO_TRACK_ID,
      type: 'audio',
      name: 'Audio 1',
      locked: false,
      visible: true,
      muted: false,
      clips: audioClips,
    },
  ];

  // Keep empty legacy lanes out of the default timeline. They can be created
  // when the user adds a clip of that type, and hiding them gives the actual
  // edit room to breathe on short timelines.
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

  // Always keep the core tracks (effects, captions, video, audio) even when
  // empty, so the timeline structure is stable. Filter out optional tracks
  // like overlays that are only added when they have content.
  const coreTrackIds = new Set([
    EFFECTS_TRACK_ID,
    CAPTIONS_TRACK_ID,
    VIDEO_TRACK_ID,
    AUDIO_TRACK_ID,
  ]);
  return tracks.filter((track) => coreTrackIds.has(track.id) || track.clips.length > 0);
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
      itemType: 'video',
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
    itemType: 'audio',
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
  // Only the legacy recording lane maps source gaps to cuts. Independent video
  // tracks may have timeline gaps without changing the source recording.
  const videoTrack = tracks.find((track) => track.id === VIDEO_TRACK_ID);
  if (!videoTrack || videoTrack.clips.length === 0) return [];

  const sorted = videoTrack.clips
    .filter((clip) => !clip.payload?.mediaAssetId)
    .sort((a, b) => a.sourceStartMs - b.sourceStartMs);
  if (sorted.length === 0) return [];
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
  return tracks
    .filter((track) => track.type === 'effects')
    .flatMap((track) => track.clips)
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
  return tracks
    .filter((track) => track.type === 'captions')
    .flatMap((track) => track.clips)
    .map((clip) => {
      const span = roundSpan(clipSourceSpan(clip, cuts));
      // Composition word timings map back to source time so the round trip is
      // lossless (the legacy caption model is source-time addressed).
      const compSpan = Math.max(1, clip.durationMs);
      const sourceSpan = Math.max(1, span.endMs - span.startMs);
      const scale = sourceSpan / compSpan;
      const words = clip.payload?.words?.map((word) => ({
        word: word.word,
        startMs: span.startMs + Math.round((word.startMs - clip.startMs) * scale),
        endMs: span.startMs + Math.round((word.endMs - clip.startMs) * scale),
      }));
      return {
        id: clip.id,
        startMs: span.startMs,
        endMs: span.endMs,
        text: clip.payload?.text || clip.name,
        ...(words && words.length > 0 ? { words } : {}),
      };
    });
}

export function extractEffectsFromTracks(
  tracks: TimelineTrack[],
  cuts: readonly RippleCut[] = [],
): StudioEffect[] {
  const effects: StudioEffect[] = [];
  for (const clip of tracks.filter((track) => track.type === 'effects').flatMap((track) => track.clips)) {
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
  const overlays: StudioOverlay[] = [];
  for (const clip of tracks.filter((track) => track.type === 'overlays').flatMap((track) => track.clips)) {
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

// ── Multi-track project conversion ────────────────────────────────────────────

/**
 * Convert a stored `StudioClip` (multi-track model) into a `TimelineClip`
 * compatible with the existing timeline store.
 *
 * The timeline store still uses `TimelineClip` with `sourceStartMs` /
 * `sourceDurationMs` semantics, so we map:
 *   - `sourceInMs` → `sourceStartMs`
 *   - `durationMs` → `sourceDurationMs`
 */
export function studioClipToTimelineClip(
  clip: StudioClip,
  asset: StudioMediaAsset | undefined,
  trackType: TimelineTrack['type'],
): TimelineClip {
  const sourceSpeed = clip.speed ?? clip.payload?.speed ?? 1;
  const speed = Number.isFinite(sourceSpeed) && sourceSpeed > 0 ? sourceSpeed : 1;
  // Older clips stored only timeline duration and speed. Materialize their
  // selected source range once so later trim/split operations stay frame-aware.
  const sourceDurationMs = asset?.kind === 'image'
    ? 0
    : clip.sourceDurationMs ?? clip.durationMs * speed;

  return {
    id: clip.id,
    trackId: clip.trackId,
    itemType: resolveTimelineItemType(
      trackType,
      clip.itemType,
      clip.payload,
      asset?.kind,
    ),
    name: clip.name,
    startMs: clip.startMs,
    durationMs: clip.durationMs,
    sourceStartMs: clip.sourceInMs,
    sourceDurationMs,
    color: clip.color,
    payload: {
      ...clip.payload,
      speed: clip.speed,
      volume: clip.volume,
      opacity: clip.opacity,
      // Per-clip visual properties
      transform: clip.transform,
      enterAnimation: clip.enterAnimation,
      exitAnimation: clip.exitAnimation,
      deviceFrame: clip.deviceFrame,
      mediaAssetId: clip.mediaAssetId,
    },
  };
}

/**
 * Build `TimelineTrack[]` from persisted project tracks and media assets.
 *
 * If the take has no persisted track field, returns `null` so legacy fields
 * can be projected into editable lanes.
 *
 * Track types and payloads round-trip without a privileged source lane.
 */
export function convertProjectToTracks(
  take: StudioTake,
): TimelineTrack[] | null {
  const tracks = take.tracks;
  const assets = take.mediaAssets ?? [];
  const assetMap = new Map<string, StudioMediaAsset>();
  for (const asset of assets) {
    assetMap.set(asset.id, asset);
  }

  // Empty project — no tracks at all — is valid; return empty array.
  if (tracks === undefined) return null;

  const timelineTracks: TimelineTrack[] = [];

  for (const track of tracks) {
    const trackType = track.type;
    const clips: TimelineClip[] = track.clips.map((clip) =>
      studioClipToTimelineClip(
        { ...clip, trackId: track.id },
        clip.mediaAssetId ? assetMap.get(clip.mediaAssetId) : undefined,
        trackType,
      ),
    );

    timelineTracks.push({
      id: track.id,
      type: trackType,
      name: track.name,
      locked: track.locked,
      visible: track.visible,
      muted: track.muted,
      clips,
    });
  }

  return timelineTracks;
}

/**
 * Convert `TimelineTrack[]` back to `StudioTrack[]` for the multi-track model.
 *
 * This is the reverse of `convertProjectToTracks()`: it reads every timeline
 * clip's properties — including the new visual properties (transform,
 * enter/exit animations, device frame) stored in `payload` — and maps them
 * back to `StudioClip` fields so edits survive a reload.
 *
 * Returns `null` when the tracks array is empty, signaling the caller to
 * fall back to the legacy extract functions.
 */
export function extractClipsFromTracks(
  tracks: TimelineTrack[],
): { tracks: StudioTrack[] } | null {
  if (tracks.length === 0) return null;

  const studioTracks: StudioTrack[] = [];

  for (const track of tracks) {
    // Legacy video/audio lanes can also receive imported media. Persist those
    // independent placements as ordinary project tracks while leaving the
    // source recording and legacy effect fields on their compatibility path.
    const isLegacyTrack = track.id.startsWith('track-');
    let sourceTrack = track;
    if (isLegacyTrack) {
      if (track.type !== 'video' && track.type !== 'audio') continue;
      const importedClips = track.clips.filter((clip) => clip.payload?.mediaAssetId);
      if (importedClips.length === 0) continue;
      sourceTrack = {
        ...track,
        id: `layer-imported-${track.type}-${track.id}`,
        name: `${track.type === 'video' ? 'Video' : 'Audio'} media`,
        clips: importedClips.map((clip) => ({
          ...clip,
          trackId: `layer-imported-${track.type}-${track.id}`,
        })),
      };
    }

    const clips: StudioClip[] = sourceTrack.clips.map((clip) => {
      const payload = clip.payload;
      return {
        id: clip.id,
        trackId: clip.trackId,
        itemType: resolveTimelineItemType(track.type, clip.itemType, payload),
        name: clip.name,
        startMs: clip.startMs,
        durationMs: clip.durationMs,
        sourceInMs: clip.sourceStartMs,
        sourceDurationMs: clip.sourceDurationMs,
        mediaAssetId: payload?.mediaAssetId,
        speed:
          payload?.speed ??
          (clip.durationMs > 0
            ? clip.sourceDurationMs / clip.durationMs
            : 1),
        volume: payload?.volume ?? 1,
        opacity: payload?.opacity,
        color: clip.color,
        // Per-clip visual properties from payload
        transform: payload?.transform,
        enterAnimation: payload?.enterAnimation,
        exitAnimation: payload?.exitAnimation,
        deviceFrame: payload?.deviceFrame,
        payload,
      };
    });

    studioTracks.push({
      id: sourceTrack.id,
      type: sourceTrack.type,
      name: sourceTrack.name,
      clips,
      locked: track.locked ?? false,
      visible: track.visible ?? true,
      muted: track.muted ?? false,
    });
  }

  // If all tracks were legacy tracks, fall back to the legacy extract path
  if (studioTracks.length === 0) return null;

  return { tracks: studioTracks };
}

/**
 * Combine persisted tracks with legacy take-derived clips during migration.
 *
 * Callers should use this instead of `convertTakeToTracks` directly so that
 * both blank projects (empty tracks) and legacy takes work transparently.
 */
export function convertTakeToTimeline(take: StudioTake): TimelineTrack[] {
  const legacyTracks = convertTakeToTracks(take);
  const multiTrack = convertProjectToTracks(take);
  if (multiTrack === null) return legacyTracks;
  const persistedClipIds = new Set(multiTrack.flatMap((track) => track.clips.map((clip) => clip.id)));
  const uniqueLegacyTracks = legacyTracks
    .map((track) => ({
      ...track,
      clips: track.clips.filter((clip) => !persistedClipIds.has(clip.id)),
    }))
    .filter((track) => track.clips.length > 0);
  const orderedTracks = sortTracksForTimeline([
    ...uniqueLegacyTracks,
    ...multiTrack,
  ]);
  return orderedTracks;
}
