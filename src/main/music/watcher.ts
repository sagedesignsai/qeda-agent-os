/**
 * main/music/watcher.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Keeps the index current while the app is open.
 *
 * Each watched folder gets one recursive `fs.watch`. Events are only *hints*:
 * they are collected, debounced, and then every named path is re-examined on
 * disk. The watcher never trusts an event's type, because the platforms
 * disagree about it (a rename and a delete can look identical, and an atomic
 * save is a delete followed by a create).
 *
 * Events can also be dropped — network shares, removable drives, inotify
 * limits. That is why the owner still runs a periodic incremental scan; this
 * module is the fast path, the scan is the source of truth. If a watch cannot
 * be opened at all (recursive watching is unavailable on some platforms) the
 * folder is simply left to that scan.
 *
 * Paths whose mtime is only moments old are deferred: a file still being
 * copied would otherwise be parsed half-written.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { promises as fs, watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import path from 'node:path';
import { markPathMissing } from '../db/music-store.js';
import type { MusicFolder } from '../../lib/music/types.js';
import { isAudioFile } from './metadata.js';
import {
  indexChangedFiles,
  shouldSkipEntry,
  walkAudioFiles,
} from './scanner.js';
import type { DiscoveredFile, WalkState } from './scanner.js';

const DEBOUNCE_MS = 750;
const BUSY_RETRY_MS = 2000;
/** A file modified this recently may still be mid-write. */
const SETTLE_MS = 1500;

export interface MusicWatcherDeps {
  listFolders: () => MusicFolder[];
  /** A full scan owns the folder; the watcher stands down until it ends. */
  isScanning: (folderId: string) => boolean;
  /** Rows changed; the renderer should re-query. */
  onChange: () => void;
}

export interface MusicWatcher {
  /** Open watches for new folders and close those that were removed. */
  sync: () => void;
  close: () => void;
}

interface WatchEntry {
  folderId: string;
  root: string;
  watcher: FSWatcher;
  pending: Set<string>;
  timer: NodeJS.Timeout | null;
  running: boolean;
}

export function createMusicWatcher(deps: MusicWatcherDeps): MusicWatcher {
  const entries = new Map<string, WatchEntry>();

  function schedule(entry: WatchEntry, delay = DEBOUNCE_MS): void {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => void drain(entry), delay);
    // Optional call: the jsdom test environment's timers have no `unref`.
    entry.timer.unref?.();
  }

  async function drain(entry: WatchEntry): Promise<void> {
    entry.timer = null;
    if (entries.get(entry.folderId) !== entry) return;
    if (entry.running || deps.isScanning(entry.folderId)) {
      schedule(entry, BUSY_RETRY_MS);
      return;
    }
    const paths = [...entry.pending];
    entry.pending.clear();
    if (paths.length === 0) return;

    entry.running = true;
    try {
      await processPaths(entry, paths);
    } catch (error) {
      console.warn('[music] watcher batch failed', entry.root, error);
    } finally {
      entry.running = false;
      if (entry.pending.size > 0) schedule(entry);
    }
  }

  async function processPaths(
    entry: WatchEntry,
    paths: string[],
  ): Promise<void> {
    const state: WalkState = { incomplete: false, skippedSymlinks: 0 };
    const files: DiscoveredFile[] = [];
    const seen = new Set<string>();
    let removed = 0;

    for (const target of paths) {
      let stats;
      try {
        stats = await fs.lstat(target);
      } catch (error) {
        // Gone — a file, or a whole directory of them. Anything other than
        // ENOENT (a dropped share) proves nothing, so it is left alone.
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          removed += markPathMissing(entry.folderId, target);
        }
        continue;
      }

      if (stats.isDirectory()) {
        await walkAudioFiles(target, undefined, files, seen, state);
      } else if (stats.isFile() && isAudioFile(target) && !seen.has(target)) {
        if (Date.now() - stats.mtimeMs < SETTLE_MS) {
          entry.pending.add(target);
          continue;
        }
        seen.add(target);
        files.push({
          path: target,
          size: stats.size,
          mtime: Math.floor(stats.mtimeMs / 1000),
        });
      }
    }

    if (files.length > 0) {
      await indexChangedFiles(entry.folderId, files, {
        onLibraryChange: deps.onChange,
      });
    }
    if (files.length > 0 || removed > 0) deps.onChange();
  }

  function open(folder: MusicFolder): void {
    try {
      const pending = new Set<string>();
      const watcher = watch(
        folder.path,
        { recursive: true, persistent: false },
        (_event, filename) => {
          if (!filename) return;
          const relative = filename.toString();
          if (relative.split(path.sep).some(shouldSkipEntry)) return;
          const entry = entries.get(folder.id);
          if (!entry) return;
          entry.pending.add(path.join(folder.path, relative));
          schedule(entry);
        },
      );
      const entry: WatchEntry = {
        folderId: folder.id,
        root: folder.path,
        watcher,
        pending,
        timer: null,
        running: false,
      };
      watcher.on('error', (error) => {
        console.warn('[music] watcher stopped', folder.path, error);
        closeEntry(entry);
        entries.delete(folder.id);
      });
      entries.set(folder.id, entry);
    } catch (error) {
      console.warn('[music] cannot watch folder', folder.path, error);
    }
  }

  function closeEntry(entry: WatchEntry): void {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    entry.pending.clear();
    try {
      entry.watcher.close();
    } catch {
      /* already closed */
    }
  }

  return {
    sync() {
      const folders = deps.listFolders();
      const wanted = new Map(folders.map((folder) => [folder.id, folder]));
      for (const [id, entry] of entries) {
        if (wanted.get(id)?.path !== entry.root) {
          closeEntry(entry);
          entries.delete(id);
        }
      }
      for (const folder of folders) {
        if (!entries.has(folder.id)) open(folder);
      }
    },
    close() {
      for (const entry of entries.values()) closeEntry(entry);
      entries.clear();
    },
  };
}
