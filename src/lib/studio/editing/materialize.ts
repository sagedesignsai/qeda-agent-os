/**
 * lib/studio/editing/materialize.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Convert a legacy single-recording take into the multi-track project model.
 *
 * A recording take stores its edit as top-level arrays (`cuts`, `zooms`,
 * `captions`, `effects`, `overlays`) and projects them on read. The moment an
 * agent edits a *clip* we need those elements to exist as real clips, so this
 * module performs the one-time projection and stores it in `take.tracks`.
 *
 * The projection is lossless:
 *   - clip ids are preserved, so `convertTakeToTimeline` de-duplicates the legacy
 *     projection instead of showing everything twice;
 *   - timed effects become effect-lane clips (never silently dropped);
 *   - `take.effects` is cleared, because on a multi-track project the legacy
 *     field is ignored and leaving it set would be misleading.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { StudioClip, StudioTake, StudioTrack } from '../types';
import { convertTakeToTracks } from '../timeline/convert';

function toStudioClip(
  clip: ReturnType<typeof convertTakeToTracks>[number]['clips'][number],
  trackId: string,
): StudioClip {
  return {
    id: clip.id,
    trackId,
    itemType: clip.itemType,
    name: clip.name,
    startMs: clip.startMs,
    durationMs: clip.durationMs,
    sourceInMs: clip.sourceStartMs,
    sourceDurationMs: clip.sourceDurationMs,
    color: clip.color,
    transform: clip.payload?.transform,
    enterAnimation: clip.payload?.enterAnimation,
    exitAnimation: clip.payload?.exitAnimation,
    deviceFrame: clip.payload?.deviceFrame,
    payload: clip.payload,
  };
}

/** True when the take already uses the persisted track model. */
export function isProjectTake(take: StudioTake): boolean {
  return take.tracks !== undefined;
}

/**
 * Drop a legacy element that has just been deleted from the timeline.
 *
 * Legacy arrays stay on a materialized take (overlays are still served from
 * `overlays_json`), but the timeline projection de-duplicates only ids that are
 * still present as clips. Without this, deleting a projected zoom/caption/
 * overlay would make it reappear on the next load.
 */
export function stripLegacyElement(take: StudioTake, id: string): StudioTake {
  return {
    ...take,
    captions: take.captions.filter((caption) => caption.id !== id),
    zooms: take.zooms.filter((zoom) => zoom.id !== id),
    overlays: (take.overlays ?? []).filter((overlay) => overlay.id !== id),
    effects: (take.effects ?? []).filter((effect) => effect.id !== id),
  };
}

/**
 * Return a take with `tracks` populated.
 *
 * Idempotent: a take that already has tracks is returned unchanged. Callers
 * should persist the result, because materialization is what makes subsequent
 * clip edits survive a reload.
 */
export function materializeProjectTracks(take: StudioTake): StudioTake {
  if (take.tracks !== undefined) return take;

  const timelineTracks = convertTakeToTracks(take);
  const tracks: StudioTrack[] = timelineTracks.map((track) => ({
    id: track.id,
    name: track.name,
    type: track.type,
    locked: track.locked,
    visible: track.visible,
    muted: track.muted ?? false,
    clips: track.clips.map((clip) => toStudioClip(clip, track.id)),
  }));

  return {
    ...take,
    tracks,
    // Effects now live on the effects lane; the legacy field is ignored for
    // multi-track projects.
    effects: [],
  };
}
