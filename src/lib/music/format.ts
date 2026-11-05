/**
 * lib/music/format.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Display helpers for the player. Kept separate from the components so the
 * library table, the dock and the queue all render a duration the same way.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatTotalDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0 min';
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

export function formatBitrate(bitrate: number | null): string | null {
  if (!bitrate || bitrate <= 0) return null;
  return `${Math.round(bitrate / 1000)} kbps`;
}

export function formatCodec(codec: string | null): string | null {
  if (!codec) return null;
  const clean = codec.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  // FLAC/MP3 are the only names worth showing; anything longer clutters a row.
  if (/flac/i.test(clean)) return 'FLAC';
  if (/mpeg.*layer\s*3|mp3/i.test(clean)) return 'MP3';
  if (/vorbis/i.test(clean)) return 'OGG';
  if (/opus/i.test(clean)) return 'OPUS';
  if (/aac/i.test(clean)) return 'AAC';
  return clean.length > 8 ? clean.slice(0, 8) : clean;
}

export function trackSubtitle(track: {
  artist: string | null;
  album: string | null;
}): string {
  if (track.artist && track.album) return `${track.artist} — ${track.album}`;
  return track.artist ?? track.album ?? 'Unknown artist';
}

/**
 * Deterministic hue for the artwork fallback. Using the track id means the same
 * track always gets the same colour, so the library does not flicker as rows
 * recycle.
 */
export function hueForId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}
