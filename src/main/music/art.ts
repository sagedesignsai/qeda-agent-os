/**
 * main/music/art.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Album art, extracted on demand and cached on disk.
 *
 * Covers live inside audio tags, so serving one means reading the whole file.
 * The cache is keyed by track id *and* mtime: retagging a file changes its
 * mtime and therefore its cache name, which avoids a stale cover without an
 * explicit invalidation pass. Old entries are small and are cleaned up by the
 * OS cache story; correctness matters more than reclaiming a few megabytes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getMusicTrack } from '../db/music-store.js';
import { readArtwork } from './metadata.js';

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
};

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'image/avif': '.avif',
};

// Probe order covers practically every embedded cover; four stats is cheaper
// than storing a sidecar mime file for one image.
const PROBE_EXTS = ['.jpg', '.png', '.webp', '.gif', '.bmp', '.avif'];

function cacheDir(): string {
  return path.join(app.getPath('userData'), 'music-art');
}

function cacheBase(trackId: string, mtime: number): string {
  return path.join(cacheDir(), `${trackId}-${mtime}`);
}

export interface CachedArtwork {
  bytes: Uint8Array;
  mime: string;
}

export async function getTrackArtwork(
  trackId: string,
): Promise<CachedArtwork | null> {
  const track = getMusicTrack(trackId);
  if (!track) return null;

  const base = cacheBase(track.id, track.mtime);
  for (const ext of PROBE_EXTS) {
    try {
      const bytes = await fs.readFile(`${base}${ext}`);
      if (bytes.length > 0) {
        return { bytes, mime: MIME_BY_EXT[ext] ?? 'image/jpeg' };
      }
    } catch {
      /* not cached under this extension */
    }
  }

  const artwork = await readArtwork(track.path);
  if (!artwork) return null;

  const ext = EXT_BY_MIME[artwork.mime.toLowerCase()] ?? '.jpg';
  try {
    await fs.mkdir(cacheDir(), { recursive: true });
    await fs.writeFile(`${base}${ext}`, artwork.data);
  } catch (error) {
    // A failed cache write must not fail the request; the bytes are still good.
    console.warn('[music] could not cache artwork', trackId, error);
  }
  return { bytes: artwork.data, mime: artwork.mime };
}
