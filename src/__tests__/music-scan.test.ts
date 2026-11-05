/**
 * __tests__/music-scan.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Scanner safety, with the metadata adapter mocked.
 *
 * `music-metadata` is an ESM package that decodes real files; the scanner's job
 * is the walk, the batching and — most importantly — deciding when a pass is
 * authoritative enough to mark files missing. These tests use a temp directory
 * and a fake adapter so they check that decision, not tag parsing.
 *
 * The unreadable-folder case is a regression guard: swallowing a `readdir`
 * failure and treating the pass as complete soft-deleted an entire library the
 * first time a drive was unmounted mid-scan.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { useTestDatabase } from '../main/db/client';
import { applyMigrations } from '../main/db/schema';
import { addMusicFolder, queryMusicTracks } from '../main/db/music-store';
import { readTrackMetadata } from '../main/music/metadata';
import { scanMusicFolder } from '../main/music/scanner';
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
    artist: 'Test Artist',
    album: 'Test Album',
    album_artist: 'Test Artist',
    genre: null,
    year: null,
    track_no: null,
    disc_no: null,
    duration_ms: 1_000,
    bitrate: 128_000,
    codec: 'MPEG 1 Layer 3',
    size: 10,
    mtime: 1_700_000_000,
    has_art: false,
  };
}

describe('music scanner', () => {
  let db: Database.Database;
  let root: string;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db);
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'qeda-music-scan-'));
    mockedReadMetadata.mockImplementation(async (filePath: string) =>
      metadataFor(filePath),
    );
  });

  afterEach(async () => {
    mockedReadMetadata.mockReset();
    useTestDatabase(null as unknown as Database.Database);
    db.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('indexes playable files and ignores everything else', async () => {
    await fs.writeFile(path.join(root, 'one.mp3'), 'x');
    await fs.writeFile(path.join(root, 'two.wav'), 'x');
    await fs.writeFile(path.join(root, 'notes.txt'), 'x');
    const folder = addMusicFolder(root);

    const result = await scanMusicFolder(folder.id);

    expect(result.phase).toBe('done');
    expect(result.total).toBe(2);
    expect(result.scanned).toBe(2);
    expect(result.added).toBe(2);
    expect(queryMusicTracks({ folderId: folder.id }).total).toBe(2);
  });

  it('keeps track ids stable across a rescan', async () => {
    await fs.writeFile(path.join(root, 'one.mp3'), 'x');
    await fs.writeFile(path.join(root, 'two.mp3'), 'x');
    const folder = addMusicFolder(root);
    await scanMusicFolder(folder.id);

    const before = queryMusicTracks({ folderId: folder.id }).rows;
    const rescan = await scanMusicFolder(folder.id);
    const after = queryMusicTracks({ folderId: folder.id }).rows;

    expect(rescan.updated).toBe(2);
    expect(after.map((track) => track.id).sort()).toEqual(
      before.map((track) => track.id).sort(),
    );
  });

  it('soft-deletes a vanished file instead of removing the row', async () => {
    await fs.writeFile(path.join(root, 'kept.mp3'), 'x');
    await fs.writeFile(path.join(root, 'gone.mp3'), 'x');
    const folder = addMusicFolder(root);
    await scanMusicFolder(folder.id);

    await fs.rm(path.join(root, 'gone.mp3'));
    const rescan = await scanMusicFolder(folder.id);

    expect(rescan.phase).toBe('done');
    expect(rescan.missing).toBe(1);
    const rows = queryMusicTracks({
      folderId: folder.id,
      includeMissing: true,
    }).rows;
    expect(
      rows.find((track) => track.title === 'gone')?.missing_at,
    ).not.toBeNull();
    expect(rows.find((track) => track.title === 'kept')?.missing_at).toBeNull();
  });

  it('never marks anything missing when the folder cannot be read', async () => {
    await fs.writeFile(path.join(root, 'one.mp3'), 'x');
    const folder = addMusicFolder(root);
    await scanMusicFolder(folder.id);

    // Simulates an unmounted drive: the folder row still exists, the walk fails.
    await fs.rm(root, { recursive: true, force: true });
    const failed = await scanMusicFolder(folder.id);

    expect(failed.phase).toBe('error');
    expect(failed.error).toContain('Nothing was marked missing');
    expect(failed.missing).toBe(0);

    const rows = queryMusicTracks({
      folderId: folder.id,
      includeMissing: true,
    }).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].missing_at).toBeNull();
  });

  it('does not mark missing when the scan was cancelled', async () => {
    await fs.writeFile(path.join(root, 'one.mp3'), 'x');
    const folder = addMusicFolder(root);
    await scanMusicFolder(folder.id);

    const controller = new AbortController();
    controller.abort();
    const cancelled = await scanMusicFolder(folder.id, {
      signal: controller.signal,
    });

    expect(cancelled.phase).toBe('cancelled');
    expect(cancelled.missing).toBe(0);
  });
});
