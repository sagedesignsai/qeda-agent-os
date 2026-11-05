/**
 * __tests__/music-watcher.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The realtime path against a real directory: a file dropped into a watched
 * folder is indexed, and one deleted is soft-deleted, with no scan running.
 *
 * Uses real `fs.watch`, so it polls for the outcome instead of sleeping for a
 * fixed time. Skipped where recursive watching is unavailable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { useTestDatabase } from '../main/db/client';
import { applyMigrations } from '../main/db/schema';
import {
  addMusicFolder,
  listMusicFolders,
  queryMusicTracks,
} from '../main/db/music-store';
import { readTrackMetadata } from '../main/music/metadata';
import { createMusicWatcher } from '../main/music/watcher';
import type { MusicWatcher } from '../main/music/watcher';
import type { ScannedTrack } from '../lib/music/types';

jest.mock('../main/music/metadata', () => ({
  isAudioFile: (filePath: string) => /\.(mp3|wav)$/i.test(filePath),
  readTrackMetadata: jest.fn(),
}));

const mockedReadMetadata = readTrackMetadata as jest.MockedFunction<
  typeof readTrackMetadata
>;

function metadataFor(filePath: string): ScannedTrack {
  return {
    path: filePath,
    title: path.basename(filePath, path.extname(filePath)),
    artist: 'Watcher Artist',
    album: null,
    album_artist: null,
    genre: null,
    year: null,
    track_no: null,
    disc_no: null,
    duration_ms: 1_000,
    bitrate: null,
    codec: 'MPEG',
    size: 1,
    mtime: 1,
    has_art: false,
  };
}

async function waitFor(check: () => boolean, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return check();
}

describe('music watcher', () => {
  let db: Database.Database;
  let root: string;
  let watcher: MusicWatcher;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db);
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'qeda-music-watch-'));
    mockedReadMetadata.mockImplementation(async (filePath: string) =>
      metadataFor(filePath),
    );
  });

  afterEach(async () => {
    watcher?.close();
    mockedReadMetadata.mockReset();
    useTestDatabase(null as unknown as Database.Database);
    db.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('indexes a new file and soft-deletes a removed one', async () => {
    const folder = addMusicFolder(root);
    const onChange = jest.fn();
    watcher = createMusicWatcher({
      listFolders: listMusicFolders,
      isScanning: () => false,
      onChange,
    });
    watcher.sync();

    const file = path.join(root, 'dropped.mp3');
    await fs.writeFile(file, 'x');
    // The settle window defers a file written moments ago, so back-date it.
    const past = new Date(Date.now() - 10_000);
    await fs.utimes(file, past, past);

    const indexed = await waitFor(
      () =>
        queryMusicTracks({ folderId: folder.id }).rows.some(
          (track) => track.artist === 'Watcher Artist',
        ),
    );
    expect(indexed).toBe(true);
    expect(onChange).toHaveBeenCalled();

    await fs.rm(file);
    const removed = await waitFor(
      () => queryMusicTracks({ folderId: folder.id }).total === 0,
    );
    expect(removed).toBe(true);
    expect(
      queryMusicTracks({ folderId: folder.id, includeMissing: true }).total,
    ).toBe(1);
  }, 30_000);
});
