/**
 * __tests__/music-library.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The parts of the music feature that can be verified without an audio device:
 * queue arithmetic, crossfade curves, and the SQLite library.
 *
 * The library test is deliberately about *rescan semantics* — dedupe by path,
 * soft delete via `missing_at`, and playlist membership surviving a disappearing
 * file — because those are the failures that silently destroy a user's library.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import {
  clampIndex,
  moveItem,
  nextIndex,
  previousIndex,
  reconcileQueue,
  shuffleIds,
} from '../lib/music/queue';
import {
  equalPowerFade,
  fadeSeconds,
  shouldStartFade,
} from '../lib/music/crossfade';
import { emptySoundscape } from '../lib/music/scenes';
import { useTestDatabase } from '../main/db/client';
import { applyMigrations } from '../main/db/schema';
import {
  addMusicFolder,
  addTracksToPlaylist,
  createMusicPlaylist,
  deleteMusicScene,
  getMusicState,
  getMusicTracksByIds,
  listMusicFolders,
  listMusicScenes,
  listMusicPlaylists,
  listPlaylistTracks,
  markMissingTracks,
  musicFacets,
  queryMusicTracks,
  removeMusicFolder,
  removeTrackFromPlaylist,
  reorderPlaylist,
  saveMusicScene,
  saveMusicState,
  updateMusicPlaylist,
  upsertScannedTrack,
} from '../main/db/music-store';
import type { MusicStateRecord, ScannedTrack } from '../lib/music/types';

function track(
  overrides: Partial<ScannedTrack> & { path: string },
): ScannedTrack {
  return {
    title: overrides.path.split('/').pop() ?? 'track',
    artist: 'Aphex Twin',
    album: 'Selected Ambient Works',
    album_artist: 'Aphex Twin',
    genre: 'Ambient',
    year: 1992,
    track_no: 1,
    disc_no: 1,
    duration_ms: 300_000,
    bitrate: 320_000,
    codec: 'MPEG 1 Layer 3',
    size: 1024,
    mtime: 1_700_000_000,
    has_art: false,
    ...overrides,
  };
}

describe('music queue arithmetic', () => {
  it('clamps indexes and reports an empty queue', () => {
    expect(clampIndex(3, 0)).toBe(-1);
    expect(clampIndex(-1, 4)).toBe(0);
    expect(clampIndex(9, 4)).toBe(3);
  });

  it('advances, stops at the end, and wraps only when repeating', () => {
    const queue = { index: 1, repeat: 'off' as const, shuffle: false };
    expect(nextIndex(queue, 3)).toBe(2);
    expect(nextIndex({ ...queue, index: 2 }, 3)).toBeNull();
    expect(nextIndex({ ...queue, index: 2, repeat: 'all' }, 3)).toBe(0);
  });

  it('replays a repeated track on auto-advance but not on manual next', () => {
    const queue = { index: 0, repeat: 'one' as const, shuffle: false };
    expect(nextIndex(queue, 3, 'auto')).toBe(0);
    expect(nextIndex(queue, 3, 'manual')).toBe(1);
  });

  it('never picks the current index when shuffled', () => {
    const queue = { index: 1, repeat: 'off' as const, shuffle: true };
    for (const roll of [0, 0.25, 0.5, 0.99]) {
      const index = nextIndex(queue, 4, 'manual', () => roll);
      expect(index).not.toBe(1);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(4);
    }
  });

  it('previous wraps only when repeating', () => {
    expect(
      previousIndex({ index: 0, repeat: 'off', shuffle: false }, 3),
    ).toBeNull();
    expect(previousIndex({ index: 0, repeat: 'all', shuffle: false }, 3)).toBe(
      2,
    );
  });

  it('shuffles without mutating the input', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const shuffled = shuffleIds(ids, () => 0);
    expect(shuffled).toHaveLength(4);
    expect(new Set(shuffled)).toEqual(new Set(ids));
    expect(ids).toEqual(['a', 'b', 'c', 'd']);
  });

  it('moves an item and clamps an out-of-range destination', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 99)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 9, 0)).toEqual(['a', 'b', 'c']);
  });

  it('reconciles a queue around a still-existing current track', () => {
    const known = new Set(['a', 'c', 'd']);
    expect(reconcileQueue(['a', 'b', 'c'], known, 'c')).toEqual({
      ids: ['a', 'c'],
      index: 1,
    });
    // The current track is gone: fall back to the first surviving track.
    expect(reconcileQueue(['b', 'a'], known, 'b')).toEqual({
      ids: ['a'],
      index: 0,
    });
    expect(reconcileQueue(['b'], known, 'b')).toEqual({ ids: [], index: -1 });
  });
});

describe('crossfade curves', () => {
  it('equal-power endpoints are full-out and full-in', () => {
    expect(equalPowerFade(0)).toEqual({ out: 1, in: 0 });
    const end = equalPowerFade(1);
    expect(end.out).toBeCloseTo(0);
    expect(end.in).toBeCloseTo(1);
  });

  it('keeps constant power through the middle of the fade', () => {
    const mid = equalPowerFade(0.5);
    expect(mid.out ** 2 + mid.in ** 2).toBeCloseTo(1);
  });

  it('caps a fade at a third of a short track and disables it without a next', () => {
    expect(fadeSeconds(8, 12_000, true)).toBe(4);
    expect(fadeSeconds(8, 60_000, false)).toBe(0);
    expect(fadeSeconds(0, 60_000, true)).toBe(0);
  });

  it('starts the fade only inside the fade window', () => {
    expect(shouldStartFade(56_000, 60_000, 4)).toBe(true);
    expect(shouldStartFade(55_999, 60_000, 4)).toBe(false);
    expect(shouldStartFade(59_000, 60_000, 0)).toBe(false);
  });
});

describe('music library persistence', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db);
  });

  afterEach(() => {
    useTestDatabase(null as unknown as Database.Database);
    db.close();
  });

  it('adds a folder once and keeps its track count in sync', () => {
    const folder = addMusicFolder('/music/ambient');
    expect(addMusicFolder('/music/ambient').id).toBe(folder.id);
    // A trailing separator is the same root, not a second library.
    expect(addMusicFolder('/music/ambient/').id).toBe(folder.id);
    expect(listMusicFolders()).toHaveLength(1);
  });

  it('dedupes a rescan by canonical path instead of inserting twice', () => {
    const folder = addMusicFolder('/music/ambient');
    const first = upsertScannedTrack(
      folder.id,
      track({ path: '/music/ambient/a.mp3' }),
      100,
    );
    const second = upsertScannedTrack(
      folder.id,
      track({ path: '/music/ambient/a.mp3' }),
      200,
    );

    expect(first.added).toBe(true);
    expect(second).toEqual({ id: first.id, added: false });
    expect(queryMusicTracks().total).toBe(1);
  });

  it('soft-deletes a vanished file so playlists keep their membership', () => {
    const folder = addMusicFolder('/music/ambient');
    const kept = upsertScannedTrack(
      folder.id,
      track({ path: '/music/ambient/kept.mp3' }),
      100,
    );
    const gone = upsertScannedTrack(
      folder.id,
      track({ path: '/music/ambient/gone.mp3' }),
      100,
    );
    const playlist = createMusicPlaylist('Focus');
    addTracksToPlaylist(playlist.id, [kept.id, gone.id]);

    const missing = markMissingTracks(folder.id, 200);
    expect(missing).toBe(2);
    expect(queryMusicTracks().total).toBe(0);
    expect(queryMusicTracks({ includeMissing: true }).total).toBe(2);

    // Playlist rows survive: the user can still see what disappeared.
    expect(listPlaylistTracks(playlist.id)).toHaveLength(2);

    // A restored file clears the flag on the same row.
    upsertScannedTrack(
      folder.id,
      track({ path: '/music/ambient/gone.mp3' }),
      300,
    );
    expect(queryMusicTracks().total).toBe(1);
    expect(getMusicTracksByIds([gone.id])[0]?.missing_at).toBeNull();
  });

  it('filters by search, album and artist and builds facets', () => {
    const folder = addMusicFolder('/music/ambient');
    const a = upsertScannedTrack(
      folder.id,
      track({
        path: '/music/ambient/a.mp3',
        title: 'Xtal',
        album: 'SAW 85-92',
      }),
      100,
    );
    upsertScannedTrack(
      folder.id,
      track({
        path: '/music/ambient/b.mp3',
        title: 'Rhubarb',
        artist: 'Boards of Canada',
        album_artist: 'Boards of Canada',
        album: 'Music Has the Right',
      }),
      100,
    );

    expect(
      queryMusicTracks({ query: 'xtal' }).rows.map((row) => row.id),
    ).toEqual([a.id]);
    expect(queryMusicTracks({ artist: 'Aphex Twin' }).total).toBe(1);
    expect(queryMusicTracks({ album: 'Music Has the Right' }).total).toBe(1);

    const facets = musicFacets();
    expect(facets.artists.map((row) => row.name)).toEqual([
      'Aphex Twin',
      'Boards of Canada',
    ]);
    expect(facets.albums).toHaveLength(2);
  });

  it('removing a folder detaches its tracks without deleting them', () => {
    const folder = addMusicFolder('/music/ambient');
    const row = upsertScannedTrack(
      folder.id,
      track({ path: '/music/ambient/a.mp3' }),
      100,
    );
    removeMusicFolder(folder.id);

    expect(listMusicFolders()).toHaveLength(0);
    const orphan = getMusicTracksByIds([row.id])[0];
    expect(orphan?.folder_id).toBeNull();
  });

  it('playlists reject duplicates, reorder, and remove', () => {
    const folder = addMusicFolder('/music/ambient');
    const one = upsertScannedTrack(
      folder.id,
      track({ path: '/music/ambient/1.mp3' }),
      100,
    );
    const two = upsertScannedTrack(
      folder.id,
      track({ path: '/music/ambient/2.mp3' }),
      100,
    );
    const three = upsertScannedTrack(
      folder.id,
      track({ path: '/music/ambient/3.mp3' }),
      100,
    );

    const playlist = createMusicPlaylist('  Night drive  ');
    expect(playlist.name).toBe('Night drive');
    expect(
      updateMusicPlaylist(playlist.id, { description: 'slow' })?.description,
    ).toBe('slow');

    expect(addTracksToPlaylist(playlist.id, [one.id, two.id, three.id])).toBe(
      3,
    );
    expect(addTracksToPlaylist(playlist.id, [two.id])).toBe(0);

    reorderPlaylist(playlist.id, [three.id, one.id, two.id]);
    expect(listPlaylistTracks(playlist.id).map((row) => row.id)).toEqual([
      three.id,
      one.id,
      two.id,
    ]);

    expect(removeTrackFromPlaylist(playlist.id, one.id)).toBe(true);
    expect(listPlaylistTracks(playlist.id).map((row) => row.id)).toEqual([
      three.id,
      two.id,
    ]);
    expect(listMusicPlaylists()[0]?.track_count).toBe(2);
  });

  it('saves, updates and deletes user scenes', () => {
    const config = {
      soundscape: emptySoundscape(),
      music: { source: 'library' as const, shuffle: true },
      crossfadeSec: 5,
      duckDb: -8,
    };
    const created = saveMusicScene(undefined, 'Rain study', config);
    expect(listMusicScenes()).toHaveLength(1);

    const updated = saveMusicScene(created.id, 'Rain study v2', {
      ...config,
      crossfadeSec: 2,
    });
    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('Rain study v2');
    expect(updated.config.crossfadeSec).toBe(2);

    expect(deleteMusicScene(created.id)).toBe(true);
    expect(listMusicScenes()).toHaveLength(0);
  });

  it('round-trips the single resumable playback row', () => {
    expect(getMusicState()).toBeNull();

    const state: MusicStateRecord = {
      queue: ['a', 'b'],
      currentTrackId: 'b',
      positionMs: 12_345,
      volume: 0.4,
      muted: true,
      repeat: 'one',
      shuffle: true,
      crossfadeSec: 6,
      duckDb: -12,
      sceneId: 'rain-room',
      soundscape: emptySoundscape(),
    };
    saveMusicState(state);
    const loaded = getMusicState();

    expect(loaded).toEqual(state);

    saveMusicState({ ...state, positionMs: 99, volume: 0.9, muted: false });
    expect(getMusicState()?.positionMs).toBe(99);
    expect(getMusicState()?.volume).toBeCloseTo(0.9);
    expect(getMusicState()?.muted).toBe(false);
  });
});
