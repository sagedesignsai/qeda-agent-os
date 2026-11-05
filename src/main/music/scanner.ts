/**
 * main/music/scanner.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Walks a watched folder and indexes audio files.
 *
 * A scan is three cheap-to-expensive passes, so the library is usable long
 * before the slow one finishes:
 *
 *   1. **Discover** — walk the tree and `stat` every audio file. No tags are
 *      read. `total` grows live, which is what lets the UI say "found 4,120".
 *   2. **Reconcile** — compare each file's size and mtime with the index.
 *      Unchanged files are only "touched"; this is why a rescan of a big
 *      library takes seconds instead of minutes. New files are inserted
 *      immediately from their file name (`meta_pending = 1`) so they can be
 *      browsed, searched and played.
 *   3. **Enrich** — read tags with bounded concurrency and write them back in
 *      batches, in the order they arrive. The library fills in while it is open.
 *
 * Only a complete pass may mark files missing. A folder that cannot be read at
 * all (an unmounted drive, a permission error) is reported as an error and
 * leaves every existing row alone — treating it as a complete pass with zero
 * files would soft-delete the user's whole library. The same goes for a file
 * that cannot be `stat`ed for any reason other than "it is gone".
 *
 * A file whose *tags* cannot be read is different: it demonstrably exists, so
 * it is touched (not marked missing) and the pass stays authoritative. It keeps
 * its filename-only row and is retried on the next scan.
 *
 * Writes go through batched transactions. `better-sqlite3` is synchronous, so a
 * per-file upsert would fsync thousands of times during a first index.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setImmediate as nodeSetImmediate } from 'node:timers';
import {
  getFolderTrackStates,
  getMusicFolder,
  insertProvisionalTracks,
  markMissingTracks,
  refreshFolderTrackCount,
  removePendingTrack,
  touchTracks,
  upsertScannedTracks,
} from '../db/music-store.js';
import type { KnownTrack } from '../db/music-store.js';
import type { MusicScanProgress, ScannedTrack } from '../../lib/music/types.js';
import { isAudioFile, readTrackMetadata } from './metadata.js';
import { titleFromFilename } from './paths.js';

/**
 * Tag parsing is I/O-bound with a CPU tail. Scale with the machine, but cap it:
 * past ~12 readers a spinning disk or a network share gets slower, not faster.
 */
const PARSE_CONCURRENCY = Math.min(
  12,
  Math.max(4, os.availableParallelism?.() ?? 4),
);
const STAT_CONCURRENCY = 32;
const UPSERT_BATCH = 200;
const FLUSH_INTERVAL_MS = 1000;
/**
 * Progress is throttled by wall clock, not by file count: a fast SSD scan and a
 * cold network share should both send the renderer about four updates a second.
 */
const PROGRESS_INTERVAL_MS = 250;
/** How often the renderer is told to re-query the library mid-scan. */
const LIBRARY_CHANGE_INTERVAL_MS = 1500;
const SKIP_DIRECTORIES = new Set(['node_modules', '@eaDir', '$RECYCLE.BIN']);
/**
 * `.m4a`/`.m4b` hold AAC (playable) or ALAC (not). The codec is only known
 * after parsing, so these skip the filename-only row; otherwise every rescan of
 * an ALAC library would insert and delete the same rows.
 */
const AMBIGUOUS_CONTAINER = /\.(m4a|m4b)$/i;

export interface ScanOptions {
  signal?: AbortSignal;
  onProgress?: (progress: MusicScanProgress) => void;
  /** Rows were written; the renderer should re-query. Throttled. */
  onLibraryChange?: () => void;
}

export interface DiscoveredFile {
  path: string;
  size: number;
  /** Whole seconds, matching `music_tracks.mtime`. */
  mtime: number;
}

export interface WalkState {
  /** At least one directory or file could not be read, so this pass is not authoritative. */
  incomplete: boolean;
  skippedSymlinks: number;
}

export function shouldSkipEntry(name: string): boolean {
  return name.startsWith('.') || SKIP_DIRECTORIES.has(name);
}

export async function statAudioFile(
  full: string,
  state: WalkState,
): Promise<DiscoveredFile | null> {
  try {
    const stats = await fs.stat(full);
    if (!stats.isFile()) return null;
    return {
      path: full,
      size: stats.size,
      mtime: Math.floor(stats.mtimeMs / 1000),
    };
  } catch (error) {
    // A file that vanished between listing and stat is simply gone; anything
    // else (EACCES, EIO, a dropped share) says nothing about whether it exists.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      state.incomplete = true;
      console.warn('[music] cannot stat file', full, error);
    }
    return null;
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

export async function walkAudioFiles(
  root: string,
  signal: AbortSignal | undefined,
  files: DiscoveredFile[],
  seen: Set<string>,
  state: WalkState,
  onFound?: () => void,
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

  const directories: string[] = [];
  const candidates: string[] = [];
  for (const entry of entries) {
    if (shouldSkipEntry(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      directories.push(full);
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
        candidates.push(full);
      }
    }
  }

  // `stat` is what makes incremental scans possible, and it parallelises well:
  // it is a metadata read, not a file read.
  const stats = await parsePool(candidates, STAT_CONCURRENCY, (full) =>
    signal?.aborted ? Promise.resolve(null) : statAudioFile(full, state),
  );
  for (const file of stats) {
    if (file) files.push(file);
  }
  if (candidates.length > 0) onFound?.();

  for (const directory of directories) {
    if (signal?.aborted) return;
    await walkAudioFiles(directory, signal, files, seen, state, onFound);
  }
}

interface IndexRun {
  folderId: string;
  scanStartedAt: number;
  signal?: AbortSignal;
  progress: MusicScanProgress;
  emit: (force?: boolean) => void;
  notifyChange: (force?: boolean) => void;
}

const yieldToEventLoop = () =>
  new Promise<void>((resolve) => nodeSetImmediate(resolve));

/**
 * Passes 2 and 3. Shared by the full scan and the realtime watcher, so a file
 * that appears while the app is open goes through exactly the same decisions as
 * one found by a scan.
 */
async function indexFiles(
  run: IndexRun,
  files: DiscoveredFile[],
  known: Map<string, KnownTrack>,
): Promise<void> {
  const { folderId, scanStartedAt, signal, progress } = run;

  const unchangedIds: string[] = [];
  const toParse: DiscoveredFile[] = [];
  const fresh: DiscoveredFile[] = [];
  for (const file of files) {
    const row = known.get(file.path);
    if (!row) {
      toParse.push(file);
      if (!AMBIGUOUS_CONTAINER.test(file.path)) fresh.push(file);
    } else if (
      row.size === file.size &&
      row.mtime === file.mtime &&
      !row.meta_pending
    ) {
      unchangedIds.push(row.id);
    } else {
      toParse.push(file);
    }
  }

  touchTracks(unchangedIds, scanStartedAt);
  progress.unchanged = (progress.unchanged ?? 0) + unchangedIds.length;
  progress.scanned += unchangedIds.length;
  run.emit(true);

  // New files become browsable right away, before a single tag is read.
  const newPaths = new Set<string>();
  for (let offset = 0; offset < fresh.length; offset += UPSERT_BATCH) {
    if (signal?.aborted) return;
    const inserted = insertProvisionalTracks(
      folderId,
      fresh.slice(offset, offset + UPSERT_BATCH).map((file) => ({
        path: file.path,
        title: titleFromFilename(file.path),
        size: file.size,
        mtime: file.mtime,
      })),
      scanStartedAt,
    );
    for (const insertedPath of inserted) newPaths.add(insertedPath);
    progress.added += inserted.length;
    run.emit();
    run.notifyChange();
    // The inserts are synchronous; give IPC and the window a turn between batches.
    await yieldToEventLoop();
  }
  run.notifyChange(true);

  const buffer: ScannedTrack[] = [];
  const failedIds: string[] = [];
  let lastFlushAt = Date.now();
  const flush = () => {
    if (buffer.length === 0) return;
    const batch = buffer.splice(0, buffer.length);
    upsertScannedTracks(folderId, batch, scanStartedAt);
    // A provisional row filled in is not an "update" — it was already counted as added.
    progress.updated += batch.filter((track) => !newPaths.has(track.path)).length;
    lastFlushAt = Date.now();
    run.notifyChange();
  };

  await parsePool(toParse, PARSE_CONCURRENCY, async (file) => {
    if (signal?.aborted) return;
    try {
      const metadata = await readTrackMetadata(file.path, {
        size: file.size,
        mtime: file.mtime,
      });
      if (metadata) {
        // The walk's stat is the source of truth for change detection; storing
        // anything else would make the next scan see every file as changed.
        buffer.push({ ...metadata, size: file.size, mtime: file.mtime });
      } else if (newPaths.has(file.path) || known.get(file.path)?.meta_pending) {
        // Unplayable codec behind a provisional row: it must not stay listed.
        removePendingTrack(file.path);
        if (newPaths.delete(file.path)) progress.added -= 1;
      }
    } catch (error) {
      progress.failed = (progress.failed ?? 0) + 1;
      console.warn('[music] metadata read failed', file.path, error);
      const row = known.get(file.path);
      if (row) failedIds.push(row.id);
    }
    progress.scanned += 1;
    if (
      buffer.length >= UPSERT_BATCH ||
      Date.now() - lastFlushAt >= FLUSH_INTERVAL_MS
    ) {
      flush();
    }
    run.emit();
  });

  // Flush even when cancelled: tags already read are real work worth keeping.
  flush();
  touchTracks(failedIds, scanStartedAt);
}

function createNotifier(callback?: () => void) {
  let lastAt = 0;
  return (force = false) => {
    if (!callback) return;
    const now = Date.now();
    if (!force && now - lastAt < LIBRARY_CHANGE_INTERVAL_MS) return;
    lastAt = now;
    callback();
  };
}

export async function scanMusicFolder(
  folderId: string,
  options: ScanOptions = {},
): Promise<MusicScanProgress> {
  const folder = getMusicFolder(folderId);
  const progress: MusicScanProgress = {
    folderId,
    phase: 'scanning',
    stage: 'discovering',
    scanned: 0,
    total: 0,
    added: 0,
    updated: 0,
    missing: 0,
    unchanged: 0,
    failed: 0,
    skippedLinks: 0,
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
  const files: DiscoveredFile[] = [];
  emit(true);
  await walkAudioFiles(
    folder.path,
    options.signal,
    files,
    new Set(),
    walk,
    () => {
      progress.total = files.length;
      emit();
    },
  );
  progress.total = files.length;
  progress.skippedLinks = walk.skippedSymlinks;

  if (options.signal?.aborted) {
    return { ...progress, phase: 'cancelled' };
  }

  progress.stage = 'indexing';
  emit(true);

  await indexFiles(
    {
      folderId,
      scanStartedAt,
      signal: options.signal,
      progress,
      emit,
      notifyChange: createNotifier(options.onLibraryChange),
    },
    files,
    getFolderTrackStates(folderId),
  );

  if (options.signal?.aborted) {
    refreshFolderTrackCount(folderId, false);
    return { ...progress, phase: 'cancelled' };
  }

  if (walk.skippedSymlinks > 0) {
    console.warn(
      `[music] skipped ${walk.skippedSymlinks} symlink(s) while scanning`,
      folder.path,
    );
  }

  if (walk.incomplete) {
    // Files that were readable are already indexed; the missing pass is the
    // only thing skipped, because this walk cannot prove anything disappeared.
    refreshFolderTrackCount(folderId);
    progress.phase = 'error';
    progress.error =
      'Some folders could not be read. Nothing was marked missing.';
    emit(true);
    return progress;
  }

  progress.missing = markMissingTracks(folderId, scanStartedAt);
  refreshFolderTrackCount(folderId);
  progress.phase = 'done';
  emit(true);
  return progress;
}

/**
 * Index a handful of files the watcher saw change. Never marks anything
 * missing: a few events cannot prove what else is gone.
 */
export async function indexChangedFiles(
  folderId: string,
  files: DiscoveredFile[],
  options: Pick<ScanOptions, 'signal' | 'onLibraryChange'> = {},
): Promise<MusicScanProgress> {
  const progress: MusicScanProgress = {
    folderId,
    phase: 'scanning',
    stage: 'indexing',
    scanned: 0,
    total: files.length,
    added: 0,
    updated: 0,
    missing: 0,
    unchanged: 0,
    failed: 0,
  };
  await indexFiles(
    {
      folderId,
      scanStartedAt: Math.floor(Date.now() / 1000),
      signal: options.signal,
      progress,
      emit: () => undefined,
      notifyChange: createNotifier(options.onLibraryChange),
    },
    files,
    getFolderTrackStates(folderId),
  );
  refreshFolderTrackCount(folderId, false);
  progress.phase = options.signal?.aborted ? 'cancelled' : 'done';
  return progress;
}
