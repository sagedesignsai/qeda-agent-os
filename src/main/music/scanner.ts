/**
 * main/music/scanner.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Walks a watched folder and indexes audio files.
 *
 * The walk is deliberately two-phase: collect every path first, then parse with
 * bounded concurrency. Knowing `total` up front is what makes a progress bar
 * honest, and parsing is I/O-bound enough that four readers saturate a disk
 * without making the UI feel unresponsive.
 *
 * A cancelled or failed scan never marks anything missing — only a complete pass
 * can know that a file disappeared. That includes a folder that cannot be read
 * at all (an unmounted drive, a permission error): a partial walk is reported as
 * an error and leaves every existing row alone. Treating it as a complete pass
 * with zero files would soft-delete the user's whole library.
 *
 * Writes go through 200-row transactions. `better-sqlite3` is synchronous, so a
 * per-file upsert would fsync thousands of times during a first index.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  getMusicFolder,
  markMissingTracks,
  refreshFolderTrackCount,
  upsertScannedTracks,
} from '../db/music-store.js';
import type { MusicScanProgress, ScannedTrack } from '../../lib/music/types.js';
import { isAudioFile, readTrackMetadata } from './metadata.js';

const PARSE_CONCURRENCY = 4;
const UPSERT_BATCH = 200;
/**
 * Progress is throttled by wall clock, not by file count: a fast SSD scan and a
 * cold network share should both send the renderer about four updates a second.
 */
const PROGRESS_INTERVAL_MS = 250;
const SKIP_DIRECTORIES = new Set(['node_modules', '@eaDir', '$RECYCLE.BIN']);

export interface ScanOptions {
  signal?: AbortSignal;
  onProgress?: (progress: MusicScanProgress) => void;
}

interface WalkState {
  /** At least one directory could not be read, so this pass is not authoritative. */
  incomplete: boolean;
  skippedSymlinks: number;
}

async function collectAudioFiles(
  root: string,
  signal: AbortSignal | undefined,
  files: string[],
  seen: Set<string>,
  state: WalkState,
): Promise<void> {
  if (signal?.aborted) return;
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    state.incomplete = true;
    console.warn('[music] cannot read folder', root, error);
    return;
  }
  for (const entry of entries) {
    if (signal?.aborted) return;
    if (entry.name.startsWith('.') || SKIP_DIRECTORIES.has(entry.name))
      continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await collectAudioFiles(full, signal, files, seen, state);
    } else if (entry.isSymbolicLink()) {
      // Skipping is deliberate (following links can cycle), but silent skipping
      // looks like a library of zero tracks. Count it so the scan can say so.
      state.skippedSymlinks += 1;
    } else if (entry.isFile() && isAudioFile(entry.name)) {
      // Case-insensitive filesystems can surface the same file twice through
      // different paths; `path_key` would dedupe the row, but skipping here
      // keeps the progress total honest.
      if (!seen.has(full)) {
        seen.add(full);
        files.push(full);
      }
    }
  }
}

async function parsePool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      for (;;) {
        const index = cursor++;
        if (index >= items.length) return;
        results[index] = await worker(items[index]);
      }
    },
  );
  await Promise.all(runners);
  return results;
}

export async function scanMusicFolder(
  folderId: string,
  options: ScanOptions = {},
): Promise<MusicScanProgress> {
  const folder = getMusicFolder(folderId);
  const progress: MusicScanProgress = {
    folderId,
    phase: 'scanning',
    scanned: 0,
    total: 0,
    added: 0,
    updated: 0,
    missing: 0,
  };
  if (!folder) {
    return {
      ...progress,
      phase: 'error',
      error: 'Folder is no longer watched',
    };
  }

  // `last_seen_at` and `missing_at` are second-granular. Without forcing the
  // start marker past the previous scan's end, two scans inside the same second
  // would share a timestamp and a file deleted between them would never be
  // flagged. The marker must be strictly newer than every row it will judge.
  const now = Math.floor(Date.now() / 1000);
  const scanStartedAt = Math.max(now, (folder.last_scan_at ?? 0) + 1);

  let lastEmitAt = 0;
  const emit = (force = false) => {
    if (!options.onProgress) return;
    const time = Date.now();
    if (!force && time - lastEmitAt < PROGRESS_INTERVAL_MS) return;
    lastEmitAt = time;
    options.onProgress({ ...progress });
  };

  const walk: WalkState = { incomplete: false, skippedSymlinks: 0 };
  const files: string[] = [];
  await collectAudioFiles(folder.path, options.signal, files, new Set(), walk);
  progress.total = files.length;
  emit(true);

  if (options.signal?.aborted) {
    return { ...progress, phase: 'cancelled' };
  }

  const parsed = await parsePool(files, PARSE_CONCURRENCY, async (filePath) => {
    if (options.signal?.aborted) return null;
    const metadata = await readTrackMetadata(filePath);
    progress.scanned += 1;
    emit();
    return metadata;
  });

  if (options.signal?.aborted) {
    return { ...progress, phase: 'cancelled' };
  }

  for (let offset = 0; offset < parsed.length; offset += UPSERT_BATCH) {
    if (options.signal?.aborted) {
      return { ...progress, phase: 'cancelled' };
    }
    const batch = parsed
      .slice(offset, offset + UPSERT_BATCH)
      .filter((entry): entry is ScannedTrack => entry !== null);
    if (batch.length === 0) continue;
    const result = upsertScannedTracks(folderId, batch, scanStartedAt);
    progress.added += result.added;
    progress.updated += result.updated;
    emit();
  }

  refreshFolderTrackCount(folderId);

  if (walk.skippedSymlinks > 0) {
    console.warn(
      `[music] skipped ${walk.skippedSymlinks} symlink(s) while scanning`,
      folder.path,
    );
  }

  if (walk.incomplete) {
    // Files that were readable are already indexed; the missing pass is the
    // only thing skipped, because this walk cannot prove anything disappeared.
    progress.phase = 'error';
    progress.error =
      'Some folders could not be read. Nothing was marked missing.';
    emit(true);
    return progress;
  }

  progress.missing = markMissingTracks(folderId, scanStartedAt);
  progress.phase = 'done';
  emit(true);
  return progress;
}
