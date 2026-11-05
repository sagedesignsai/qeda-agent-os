/**
 * lib/music/media.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared contract for the `qeda-media://` hosts the music feature owns.
 *
 * The renderer never receives a filesystem path. Both hosts resolve an id
 * through `music_tracks` in the main process, which keeps the protocol from
 * becoming an arbitrary-file-read surface.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const QEDA_MEDIA_SCHEME = 'qeda-media';

/** Host for an indexed track's audio stream. */
export const MUSIC_MEDIA_HOST = 'music';

/** Host for a lazily extracted cover image. */
export const MUSIC_ART_HOST = 'music-art';

export function musicMediaUrl(trackId: string): string {
  return `${QEDA_MEDIA_SCHEME}://${MUSIC_MEDIA_HOST}/${encodeURIComponent(trackId)}`;
}

export function musicArtUrl(trackId: string): string {
  return `${QEDA_MEDIA_SCHEME}://${MUSIC_ART_HOST}/${encodeURIComponent(trackId)}`;
}
