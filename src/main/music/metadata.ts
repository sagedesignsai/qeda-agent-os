/**
 * main/music/metadata.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The only module that knows about audio tag parsing (via `music-tag-native`).
 *
 * Isolating it has two payoffs: the scanner stays about walking directories and
 * batching writes, and a future tag backend can be swapped without touching the
 * DB layer. It is also the place that decides which codecs are playable in
 * Chromium — a library full of ALAC files that silently fail on click is worse
 * than a scanner that declines to index them.
 *
 * `music-tag-native` is a Rust-based native module (napi-rs + lofty) that
 * replaces the previous `music-metadata` (pure JS) for ~20-50x faster tag
 * parsing: ~50-100ms/file instead of ~2.5s/file.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { MusicTagger } from 'music-tag-native';
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

/** MP4-container extensions where the inner codec is ambiguous (AAC vs ALAC). */
const AMBIGUOUS_MP4 = new Set(['.m4a', '.m4b']);

/** Infer a codec string from file extension and audio quality. */
function inferCodec(ext: string, quality: string | null): string | null {
  switch (ext) {
    case '.mp3':
      return 'MPEG 1 Layer 3';
    case '.flac':
      return 'FLAC';
    case '.ogg':
    case '.oga':
      return 'Vorbis';
    case '.opus':
      return 'Opus';
    case '.m4a':
    case '.m4b':
    case '.aac':
      return quality === 'HiRes' ? 'ALAC' : 'AAC';
    case '.wav':
      return 'PCM';
    case '.webm':
      return 'Opus';
    default:
      return null;
  }
}

export function isAudioFile(filePath: string): boolean {
  return AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/**
 * Read one file's tags using the native Rust parser.
 *
 * Returns `null` only for a codec that is deliberately not indexed (ALAC in an
 * MP4 container). A file that cannot be read **throws**: the scanner must be
 * able to tell "this file is not music" from "this file is locked right now",
 * because only the second says nothing about whether the file still exists.
 *
 * `known` carries the size and mtime the walk already collected, which saves a
 * second `stat` per file on a first index.
 */
export async function readTrackMetadata(
  filePath: string,
  known?: { size: number; mtime: number },
): Promise<ScannedTrack | null> {
  const stats = known ? null : await fs.stat(filePath);
  const ext = path.extname(filePath).toLowerCase();

  const musicFile = new MusicTagger();
  try {
    musicFile.loadPath(filePath);

    // ALAC in an MP4 container is not playable in Chromium.
    // `music-tag-native` classifies ALAC as HiRes quality.
    if (AMBIGUOUS_MP4.has(ext) && musicFile.quality === 'HiRes') {
      return null;
    }

    const codec = inferCodec(ext, musicFile.quality);

    return {
      path: filePath,
      title: musicFile.title?.trim() || titleFromFilename(filePath),
      artist: musicFile.artist?.trim() || null,
      album: musicFile.album?.trim() || null,
      album_artist: musicFile.albumArtist?.trim() || null,
      genre: musicFile.genre?.trim() || null,
      year: musicFile.year ?? null,
      track_no: musicFile.trackNumber ?? null,
      disc_no: musicFile.discNumber ?? null,
      duration_ms: Math.round(musicFile.duration * 1000),
      bitrate: musicFile.bitRate ? Math.round(musicFile.bitRate * 1000) : null,
      codec,
      size: known?.size ?? stats!.size,
      mtime: known?.mtime ?? Math.floor(stats!.mtimeMs / 1000),
      has_art: false,
    };
  } finally {
    musicFile.dispose();
  }
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
  const musicFile = new MusicTagger();
  try {
    musicFile.loadPath(filePath);
    const pictures = musicFile.pictures;
    if (!pictures || pictures.length === 0) return null;
    const picture = pictures[0];
    if (picture.data.length === 0) return null;
    return { data: picture.data, mime: picture.mimeType || 'image/jpeg' };
  } catch {
    return null;
  } finally {
    musicFile.dispose();
  }
}
