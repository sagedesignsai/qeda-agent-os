/**
 * main/music/metadata.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The only module that knows about `music-metadata`.
 *
 * Isolating it has two payoffs: the scanner stays about walking directories and
 * batching writes, and a future tag backend can be swapped without touching the
 * DB layer. It is also the place that decides which codecs are playable in
 * Chromium — a library full of ALAC files that silently fail on click is worse
 * than a scanner that declines to index them.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseFile } from 'music-metadata';
import type { ScannedTrack } from '../../lib/music/types.js';
import { titleFromFilename } from './paths.js';

/** Extensions Chromium can decode through `<audio>` in this build. */
const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.m4a',
  '.m4b',
  '.aac',
  '.flac',
  '.ogg',
  '.oga',
  '.opus',
  '.wav',
  '.webm',
]);

/** Containers/codecs that must not be indexed because playback would fail. */
const UNPLAYABLE = /alac|wma|monkey|ape|dsd|dsf|dff|wavpack|tta/i;

export function isAudioFile(filePath: string): boolean {
  return AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/**
 * Read one file's tags.
 *
 * Returns `null` only for a codec that is deliberately not indexed. A file that
 * cannot be read **throws**: the scanner must be able to tell "this file is
 * not music" from "this file is locked right now", because only the second
 * says nothing about whether the file still exists.
 *
 * `known` carries the size and mtime the walk already collected, which saves a
 * second `stat` per file on a first index.
 */
export async function readTrackMetadata(
  filePath: string,
  known?: { size: number; mtime: number },
): Promise<ScannedTrack | null> {
  const stats = known ? null : await fs.stat(filePath);
  // Covers are not read here on purpose. `has_art` has no consumer yet, and
  // decoding embedded art for every file is the dominant cost of a first
  // index; `readArtwork()` extracts one lazily when a cover is requested.
  const meta = await parseFile(filePath, {
    duration: true,
    skipCovers: true,
  });
  const codec = meta.format.codec ?? meta.format.container ?? null;
  if (codec && UNPLAYABLE.test(codec)) return null;

  return {
    path: filePath,
    title: meta.common.title?.trim() || titleFromFilename(filePath),
    artist: meta.common.artist?.trim() || null,
    album: meta.common.album?.trim() || null,
    album_artist: meta.common.albumartist?.trim() || null,
    genre: meta.common.genre?.[0]?.trim() || null,
    year: meta.common.year ?? null,
    track_no: meta.common.track?.no ?? null,
    disc_no: meta.common.disk?.no ?? null,
    duration_ms: Math.round((meta.format.duration ?? 0) * 1000),
    bitrate: meta.format.bitrate ? Math.round(meta.format.bitrate) : null,
    codec,
    size: known?.size ?? stats!.size,
    mtime: known?.mtime ?? Math.floor(stats!.mtimeMs / 1000),
    has_art: false,
  };
}

export interface Artwork {
  data: Uint8Array;
  mime: string;
}

/**
 * Extract the first embedded picture. Read lazily: walking a library must not
 * decode every cover into memory before the user has opened a single album.
 */
export async function readArtwork(filePath: string): Promise<Artwork | null> {
  try {
    const meta = await parseFile(filePath, {
      duration: false,
      skipCovers: false,
    });
    const picture = meta.common.picture?.[0];
    if (!picture || picture.data.length === 0) return null;
    return { data: picture.data, mime: picture.format || 'image/jpeg' };
  } catch {
    return null;
  }
}
