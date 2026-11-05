/**
 * db/music-store.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Persistence for the local music library.
 *
 * Two rules drive the shape of this file:
 *
 * 1. **A rescan never deletes a track.** Rows are soft-deleted via `missing_at`
 *    so a playlist does not silently empty because a drive was unplugged during
 *    a scan. The only path that removes a row is an explicit user action.
 * 2. **Playback state is one row.** `music_state` has a fixed id ('default');
 *    history is not useful for "resume where I left off" and a growing table
 *    would need pruning forever.
 *
 * All queries go through `getDb()` lazily, so the store works against the
 * in-memory test handle without importing Electron.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { getDb } from './client.js';
import { pathKeyFor } from '../music/paths.js';
import { normalizeSceneConfig } from '../../lib/music/scenes.js';
import type {
  AudioSceneConfig,
  LibrarySort,
  MusicFacets,
  MusicFolder,
  MusicLibraryQuery,
  MusicPlaylist,
  MusicScene,
  MusicStateRecord,
  MusicTrack,
  MusicTrackPage,
  RepeatMode,
  ScannedTrack,
} from '../../lib/music/types.js';

// ─── Folders ─────────────────────────────────────────────────────────────────

export function listMusicFolders(): MusicFolder[] {
  return getDb()
    .prepare(`SELECT * FROM music_folders ORDER BY added_at ASC`)
    .all() as MusicFolder[];
}

export function getMusicFolder(id: string): MusicFolder | null {
  return (
    (getDb().prepare(`SELECT * FROM music_folders WHERE id = ?`).get(id) as
      MusicFolder | undefined) ?? null
  );
}

export function addMusicFolder(folderPath: string): MusicFolder {
  const db = getDb();
  const resolved = path.resolve(folderPath);
  // Compare canonical keys, not raw strings: the same root selected through a
  // symlink, a trailing separator or (on macOS/Windows) different casing must
  // not become a second folder that indexes every track again.
  const key = pathKeyFor(resolved);
  const existing = (
    db.prepare(`SELECT * FROM music_folders`).all() as MusicFolder[]
  ).find((folder) => pathKeyFor(folder.path) === key);
  if (existing) return existing;

  const id = randomUUID();
  db.prepare(`INSERT INTO music_folders (id, path) VALUES (?, ?)`).run(
    id,
    resolved,
  );
  return getMusicFolder(id)!;
}

/**
 * Detach a folder's tracks (`folder_id` becomes NULL) and drop the folder.
 * Tracks survive so playlists keep working; the user can remove them from the
 * library explicitly if that is what they meant.
 */
export function removeMusicFolder(id: string): boolean {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE music_tracks SET folder_id = NULL WHERE folder_id = ?`,
    ).run(id);
    db.prepare(`DELETE FROM music_folders WHERE id = ?`).run(id);
  });
  tx();
  return true;
}

/**
 * Recount a folder's live tracks. `stamp` also records `last_scan_at`; pass
 * false for a partial pass (provisional rows, a cancelled scan, a watcher
 * batch) so "indexed N minutes ago" only ever reflects a finished scan.
 */
export function refreshFolderTrackCount(id: string, stamp = true): void {
  const db = getDb();
  db.prepare(
    `UPDATE music_folders
        SET track_count = (
          SELECT COUNT(*) FROM music_tracks
           WHERE folder_id = ? AND missing_at IS NULL
        )${stamp ? ',\n            last_scan_at = unixepoch()' : ''}
      WHERE id = ?`,
  ).run(id, id);
}

// ─── Tracks ──────────────────────────────────────────────────────────────────

export interface UpsertResult {
  id: string;
  added: boolean;
}

/**
 * Insert a new file or refresh an existing row. `scanStartedAt` is written to
 * `last_seen_at`, which is what lets the scanner mark everything it did *not*
 * see in this pass as missing without a giant `NOT IN` list.
 */
export function upsertScannedTrack(
  folderId: string,
  track: ScannedTrack,
  scanStartedAt: number,
): UpsertResult {
  const db = getDb();
  const key = pathKeyFor(track.path);
  const existing = db
    .prepare(`SELECT id FROM music_tracks WHERE path_key = ?`)
    .get(key) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE music_tracks
          SET folder_id = ?,
              path = ?,
              title = ?,
              artist = ?,
              album = ?,
              album_artist = ?,
              genre = ?,
              year = ?,
              track_no = ?,
              disc_no = ?,
              duration_ms = ?,
              bitrate = ?,
              codec = ?,
              size = ?,
              mtime = ?,
              last_seen_at = ?,
              missing_at = NULL,
              has_art = ?,
              meta_pending = 0
        WHERE id = ?`,
    ).run(
      folderId,
      track.path,
      track.title,
      track.artist,
      track.album,
      track.album_artist,
      track.genre,
      track.year,
      track.track_no,
      track.disc_no,
      track.duration_ms,
      track.bitrate,
      track.codec,
      track.size,
      track.mtime,
      scanStartedAt,
      track.has_art ? 1 : 0,
      existing.id,
    );
    return { id: existing.id, added: false };
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO music_tracks
       (id, folder_id, path, path_key, title, artist, album, album_artist,
        genre, year, track_no, disc_no, duration_ms, bitrate, codec, size,
        mtime, last_seen_at, has_art)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    folderId,
    track.path,
    key,
    track.title,
    track.artist,
    track.album,
    track.album_artist,
    track.genre,
    track.year,
    track.track_no,
    track.disc_no,
    track.duration_ms,
    track.bitrate,
    track.codec,
    track.size,
    track.mtime,
    scanStartedAt,
    track.has_art ? 1 : 0,
  );
  return { id, added: true };
}

/**
 * Upsert a batch inside one transaction. The scanner calls this with 200 rows at
 * a time so a first index is not one fsync per file.
 */
export function upsertScannedTracks(
  folderId: string,
  tracks: ScannedTrack[],
  scanStartedAt: number,
): { added: number; updated: number } {
  const db = getDb();
  let added = 0;
  let updated = 0;
  const tx = db.transaction(() => {
    for (const track of tracks) {
      const result = upsertScannedTrack(folderId, track, scanStartedAt);
      if (result.added) added += 1;
      else updated += 1;
    }
  });
  tx();
  return { added, updated };
}

// ─── Incremental indexing ────────────────────────────────────────────────────

/** What the index already knows about a file, keyed by its walked path. */
export interface KnownTrack {
  id: string;
  size: number;
  mtime: number;
  meta_pending: number;
}

/**
 * Every row of a folder (missing ones included, so a returning file is
 * recognised). Keyed by `path` rather than `path_key`: the walk produces the
 * same path strings it stored last time, which spares a synchronous `realpath`
 * per file just to decide that nothing changed.
 */
export function getFolderTrackStates(
  folderId: string,
): Map<string, KnownTrack> {
  const rows = getDb()
    .prepare(
      `SELECT id, path, size, mtime, meta_pending
         FROM music_tracks WHERE folder_id = ?`,
    )
    .all(folderId) as (KnownTrack & { path: string })[];
  return new Map(rows.map(({ path: rowPath, ...state }) => [rowPath, state]));
}

const ID_CHUNK = 500;

/** Mark files as seen in this pass without rewriting their metadata. */
export function touchTracks(ids: string[], scanStartedAt: number): void {
  if (ids.length === 0) return;
  const db = getDb();
  const tx = db.transaction(() => {
    for (let offset = 0; offset < ids.length; offset += ID_CHUNK) {
      const chunk = ids.slice(offset, offset + ID_CHUNK);
      db.prepare(
        `UPDATE music_tracks
            SET last_seen_at = ?, missing_at = NULL
          WHERE id IN (${chunk.map(() => '?').join(',')})`,
      ).run(scanStartedAt, ...chunk);
    }
  });
  tx();
}

export interface ProvisionalTrack {
  path: string;
  title: string;
  size: number;
  mtime: number;
}

/**
 * Insert files that have not been parsed yet, so they are playable and
 * searchable by filename while tags are still being read. A file whose
 * `path_key` is already indexed is only re-seen, never overwritten.
 * Returns the paths that were genuinely new.
 */
export function insertProvisionalTracks(
  folderId: string,
  tracks: ProvisionalTrack[],
  scanStartedAt: number,
): string[] {
  const db = getDb();
  const inserted: string[] = [];
  const find = db.prepare(`SELECT id FROM music_tracks WHERE path_key = ?`);
  const reseen = db.prepare(
    `UPDATE music_tracks
        SET folder_id = ?, path = ?, last_seen_at = ?, missing_at = NULL
      WHERE id = ?`,
  );
  const insert = db.prepare(
    `INSERT INTO music_tracks
       (id, folder_id, path, path_key, title, size, mtime, last_seen_at,
        meta_pending)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
  );
  const tx = db.transaction(() => {
    for (const track of tracks) {
      const key = pathKeyFor(track.path);
      const existing = find.get(key) as { id: string } | undefined;
      if (existing) {
        reseen.run(folderId, track.path, scanStartedAt, existing.id);
        continue;
      }
      insert.run(
        randomUUID(),
        folderId,
        track.path,
        key,
        track.title,
        track.size,
        track.mtime,
        scanStartedAt,
      );
      inserted.push(track.path);
    }
  });
  tx();
  return inserted;
}

/**
 * Drop a provisional row whose file turned out to be unplayable. Rows that
 * were fully indexed are left alone: they are soft-deleted by the missing pass
 * instead, because a playlist may reference them.
 */
export function removePendingTrack(filePath: string): void {
  getDb()
    .prepare(`DELETE FROM music_tracks WHERE path_key = ? AND meta_pending = 1`)
    .run(pathKeyFor(filePath));
}

/**
 * Soft-delete a file, or everything under a directory, that a watcher saw
 * disappear. Matches on `path` because the path no longer resolves.
 */
export function markPathMissing(folderId: string, targetPath: string): number {
  const escaped = targetPath.replace(/[!%_]/g, (char) => `!${char}`);
  const result = getDb()
    .prepare(
      `UPDATE music_tracks
          SET missing_at = unixepoch()
        WHERE folder_id = ?
          AND missing_at IS NULL
          AND (path = ? OR path LIKE ? ESCAPE '!')`,
    )
    .run(folderId, targetPath, `${escaped}${path.sep}%`);
  return result.changes;
}

/**
 * Mark every row in `folderId` that this pass did not touch as missing.
 * Restored files come back through `upsertScannedTrack`, which clears the flag.
 */
export function markMissingTracks(
  folderId: string,
  scanStartedAt: number,
): number {
  const result = getDb()
    .prepare(
      `UPDATE music_tracks
          SET missing_at = unixepoch()
        WHERE folder_id = ?
          AND last_seen_at < ?
          AND missing_at IS NULL`,
    )
    .run(folderId, scanStartedAt);
  return result.changes;
}

export function getMusicTrack(id: string): MusicTrack | null {
  return (
    (getDb().prepare(`SELECT * FROM music_tracks WHERE id = ?`).get(id) as
      MusicTrack | undefined) ?? null
  );
}

/** Fetch tracks in the caller's order (queue order must survive a round trip). */
export function getMusicTracksByIds(ids: string[]): MusicTrack[] {
  if (ids.length === 0) return [];
  const rows = getDb()
    .prepare(
      `SELECT * FROM music_tracks WHERE id IN (${ids.map(() => '?').join(',')})`,
    )
    .all(...ids) as MusicTrack[];
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is MusicTrack => Boolean(row));
}

const SORT_SQL: Record<LibrarySort, string> = {
  title: 'title COLLATE NOCASE',
  artist:
    "COALESCE(NULLIF(album_artist, ''), artist) COLLATE NOCASE, album COLLATE NOCASE, disc_no, track_no",
  album: 'album COLLATE NOCASE, disc_no, track_no',
  added: 'added_at',
  duration: 'duration_ms',
};

function queryClause(query: MusicLibraryQuery): {
  where: string;
  values: unknown[];
} {
  const where: string[] = [];
  const values: unknown[] = [];
  if (!query.includeMissing) where.push('missing_at IS NULL');
  if (query.folderId) {
    where.push('folder_id = ?');
    values.push(query.folderId);
  }
  if (query.artist) {
    where.push('artist = ? COLLATE NOCASE');
    values.push(query.artist);
  }
  if (query.album) {
    where.push('album = ? COLLATE NOCASE');
    values.push(query.album);
  }
  const term = query.query?.trim();
  if (term) {
    const like = `%${term.replace(/[%_]/g, '')}%`;
    where.push(
      `(title LIKE ? COLLATE NOCASE
        OR artist LIKE ? COLLATE NOCASE
        OR album LIKE ? COLLATE NOCASE
        OR album_artist LIKE ? COLLATE NOCASE)`,
    );
    values.push(like, like, like, like);
  }
  return {
    where: where.length ? `WHERE ${where.join(' AND ')}` : '',
    values,
  };
}

export function queryMusicTracks(
  query: MusicLibraryQuery = {},
): MusicTrackPage {
  const db = getDb();
  const { where, values } = queryClause(query);
  const total = (
    db
      .prepare(`SELECT COUNT(*) AS count FROM music_tracks ${where}`)
      .get(...values) as { count: number }
  ).count;

  const column = SORT_SQL[query.sort ?? 'artist'] ?? SORT_SQL.artist;
  const direction = query.direction === 'desc' ? 'DESC' : 'ASC';
  const limit = Math.min(500, Math.max(1, query.limit ?? 200));
  const offset = Math.max(0, query.offset ?? 0);

  const rows = db
    .prepare(
      `SELECT * FROM music_tracks ${where}
        ORDER BY ${column} ${direction}
        LIMIT ? OFFSET ?`,
    )
    .all(...values, limit, offset) as MusicTrack[];

  return { rows, total };
}

export function musicFacets(folderId?: string | null): MusicFacets {
  const db = getDb();
  const filter = folderId ? 'AND folder_id = ?' : '';
  const values = folderId ? [folderId] : [];

  const artists = db
    .prepare(
      `SELECT artist AS name, COUNT(*) AS count
         FROM music_tracks
        WHERE missing_at IS NULL
          AND artist IS NOT NULL AND artist <> '' ${filter}
        GROUP BY artist COLLATE NOCASE
        ORDER BY name COLLATE NOCASE`,
    )
    .all(...values) as { name: string; count: number }[];

  const albums = db
    .prepare(
      `SELECT album AS name,
              COALESCE(NULLIF(album_artist, ''), artist) AS artist,
              COUNT(*) AS count
         FROM music_tracks
        WHERE missing_at IS NULL
          AND album IS NOT NULL AND album <> '' ${filter}
        GROUP BY album COLLATE NOCASE, COALESCE(NULLIF(album_artist, ''), artist) COLLATE NOCASE
        ORDER BY name COLLATE NOCASE`,
    )
    .all(...values) as { name: string; artist: string | null; count: number }[];

  return { artists, albums };
}

// ─── Playlists ───────────────────────────────────────────────────────────────

const PLAYLIST_SELECT = `
  SELECT p.*,
         (SELECT COUNT(*) FROM music_playlist_tracks t
           WHERE t.playlist_id = p.id) AS track_count
    FROM music_playlists p`;

export function listMusicPlaylists(): MusicPlaylist[] {
  return getDb()
    .prepare(`${PLAYLIST_SELECT} ORDER BY p.sort_order ASC, p.created_at ASC`)
    .all() as MusicPlaylist[];
}

export function getMusicPlaylist(id: string): MusicPlaylist | null {
  return (
    (getDb().prepare(`${PLAYLIST_SELECT} WHERE p.id = ?`).get(id) as
      MusicPlaylist | undefined) ?? null
  );
}

export function createMusicPlaylist(
  name: string,
  description = '',
): MusicPlaylist {
  const db = getDb();
  const id = randomUUID();
  const order = (
    db
      .prepare(
        `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM music_playlists`,
      )
      .get() as { next: number }
  ).next;
  db.prepare(
    `INSERT INTO music_playlists (id, name, description, sort_order)
     VALUES (?, ?, ?, ?)`,
  ).run(id, name.trim() || 'New playlist', description, order);
  return getMusicPlaylist(id)!;
}

export function updateMusicPlaylist(
  id: string,
  patch: { name?: string; description?: string },
): MusicPlaylist | null {
  const db = getDb();
  const current = getMusicPlaylist(id);
  if (!current) return null;
  db.prepare(
    `UPDATE music_playlists
        SET name = ?, description = ?, updated_at = unixepoch()
      WHERE id = ?`,
  ).run(
    patch.name ?? current.name,
    patch.description ?? current.description,
    id,
  );
  return getMusicPlaylist(id);
}

export function deleteMusicPlaylist(id: string): boolean {
  return (
    getDb().prepare(`DELETE FROM music_playlists WHERE id = ?`).run(id)
      .changes > 0
  );
}

export function listPlaylistTracks(playlistId: string): MusicTrack[] {
  return getDb()
    .prepare(
      `SELECT tr.*
         FROM music_playlist_tracks pt
         JOIN music_tracks tr ON tr.id = pt.track_id
        WHERE pt.playlist_id = ?
        ORDER BY pt.sort_order ASC, pt.added_at ASC`,
    )
    .all(playlistId) as MusicTrack[];
}

export function addTracksToPlaylist(
  playlistId: string,
  trackIds: string[],
): number {
  if (trackIds.length === 0) return 0;
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO music_playlist_tracks
       (playlist_id, track_id, sort_order)
     VALUES (?, ?, ?)`,
  );
  const next = db.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
       FROM music_playlist_tracks WHERE playlist_id = ?`,
  );
  let added = 0;
  const tx = db.transaction(() => {
    let order = (next.get(playlistId) as { next: number }).next;
    for (const trackId of trackIds) {
      const result = insert.run(playlistId, trackId, order);
      if (result.changes > 0) {
        added += 1;
        order += 1;
      }
    }
    db.prepare(
      `UPDATE music_playlists SET updated_at = unixepoch() WHERE id = ?`,
    ).run(playlistId);
  });
  tx();
  return added;
}

export function removeTrackFromPlaylist(
  playlistId: string,
  trackId: string,
): boolean {
  const db = getDb();
  const changed =
    db
      .prepare(
        `DELETE FROM music_playlist_tracks WHERE playlist_id = ? AND track_id = ?`,
      )
      .run(playlistId, trackId).changes > 0;
  if (changed) renumberPlaylist(playlistId);
  return changed;
}

export function reorderPlaylist(
  playlistId: string,
  orderedIds: string[],
): void {
  const db = getDb();
  const update = db.prepare(
    `UPDATE music_playlist_tracks SET sort_order = ?
      WHERE playlist_id = ? AND track_id = ?`,
  );
  const tx = db.transaction(() => {
    orderedIds.forEach((trackId, index) => {
      update.run(index, playlistId, trackId);
    });
    db.prepare(
      `UPDATE music_playlists SET updated_at = unixepoch() WHERE id = ?`,
    ).run(playlistId);
  });
  tx();
}

function renumberPlaylist(playlistId: string): void {
  const db = getDb();
  const ids = db
    .prepare(
      `SELECT track_id FROM music_playlist_tracks
        WHERE playlist_id = ? ORDER BY sort_order ASC, added_at ASC`,
    )
    .all(playlistId) as { track_id: string }[];
  const update = db.prepare(
    `UPDATE music_playlist_tracks SET sort_order = ?
      WHERE playlist_id = ? AND track_id = ?`,
  );
  const tx = db.transaction(() => {
    ids.forEach((row, index) => update.run(index, playlistId, row.track_id));
  });
  tx();
}

// ─── Scenes ──────────────────────────────────────────────────────────────────

function rowToScene(row: {
  id: string;
  name: string;
  config_json: string;
  created_at: number;
  updated_at: number;
}): MusicScene {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.config_json);
  } catch {
    parsed = null;
  }
  return {
    id: row.id,
    name: row.name,
    config: normalizeSceneConfig(parsed),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function listMusicScenes(): MusicScene[] {
  const rows = getDb()
    .prepare(`SELECT * FROM music_scenes ORDER BY updated_at DESC`)
    .all() as {
    id: string;
    name: string;
    config_json: string;
    created_at: number;
    updated_at: number;
  }[];
  return rows.map(rowToScene);
}

export function saveMusicScene(
  id: string | undefined,
  name: string,
  config: AudioSceneConfig,
): MusicScene {
  const db = getDb();
  const json = JSON.stringify(config);
  if (id) {
    const exists = db
      .prepare(`SELECT id FROM music_scenes WHERE id = ?`)
      .get(id) as { id: string } | undefined;
    if (exists) {
      db.prepare(
        `UPDATE music_scenes
            SET name = ?, config_json = ?, updated_at = unixepoch()
          WHERE id = ?`,
      ).run(name, json, id);
      const row = db
        .prepare(`SELECT * FROM music_scenes WHERE id = ?`)
        .get(id) as Parameters<typeof rowToScene>[0];
      return rowToScene(row);
    }
  }
  const newId = id ?? randomUUID();
  db.prepare(
    `INSERT INTO music_scenes (id, name, config_json) VALUES (?, ?, ?)`,
  ).run(newId, name, json);
  const row = db
    .prepare(`SELECT * FROM music_scenes WHERE id = ?`)
    .get(newId) as Parameters<typeof rowToScene>[0];
  return rowToScene(row);
}

export function deleteMusicScene(id: string): boolean {
  return (
    getDb().prepare(`DELETE FROM music_scenes WHERE id = ?`).run(id).changes > 0
  );
}

// ─── Resumable playback state ────────────────────────────────────────────────

interface StateRow {
  queue_json: string;
  current_track_id: string | null;
  position_ms: number;
  volume: number;
  muted: number;
  repeat_mode: RepeatMode;
  shuffle: number;
  crossfade_sec: number;
  duck_db: number;
  scene_id: string;
  soundscape_json: string;
}

export function getMusicState(): MusicStateRecord | null {
  const row = getDb()
    .prepare(`SELECT * FROM music_state WHERE id = 'default'`)
    .get() as StateRow | undefined;
  if (!row) return null;
  let queue: string[] = [];
  try {
    const parsed = JSON.parse(row.queue_json) as unknown;
    if (Array.isArray(parsed))
      queue = parsed.filter((id) => typeof id === 'string');
  } catch {
    queue = [];
  }
  let soundscape: MusicStateRecord['soundscape'];
  try {
    soundscape = JSON.parse(
      row.soundscape_json,
    ) as MusicStateRecord['soundscape'];
  } catch {
    soundscape = null;
  }
  return {
    queue,
    currentTrackId: row.current_track_id,
    positionMs: row.position_ms,
    volume: row.volume,
    muted: Boolean(row.muted),
    repeat: row.repeat_mode,
    shuffle: Boolean(row.shuffle),
    crossfadeSec: row.crossfade_sec,
    duckDb: row.duck_db,
    sceneId: row.scene_id,
    soundscape,
  };
}

export function saveMusicState(state: MusicStateRecord): void {
  getDb()
    .prepare(
      `INSERT INTO music_state
         (id, queue_json, current_track_id, position_ms, volume, muted,
          repeat_mode, shuffle, crossfade_sec, duck_db, scene_id,
          soundscape_json, updated_at)
       VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
       ON CONFLICT(id) DO UPDATE SET
         queue_json = excluded.queue_json,
         current_track_id = excluded.current_track_id,
         position_ms = excluded.position_ms,
         volume = excluded.volume,
         muted = excluded.muted,
         repeat_mode = excluded.repeat_mode,
         shuffle = excluded.shuffle,
         crossfade_sec = excluded.crossfade_sec,
         duck_db = excluded.duck_db,
         scene_id = excluded.scene_id,
         soundscape_json = excluded.soundscape_json,
         updated_at = unixepoch()`,
    )
    .run(
      JSON.stringify(state.queue ?? []),
      state.currentTrackId,
      Math.max(0, Math.round(state.positionMs ?? 0)),
      Math.min(1, Math.max(0, state.volume ?? 0.8)),
      state.muted ? 1 : 0,
      state.repeat ?? 'off',
      state.shuffle ? 1 : 0,
      Math.max(0, Math.min(12, state.crossfadeSec ?? 4)),
      Math.max(-30, Math.min(0, state.duckDb ?? -9)),
      state.sceneId || 'deep-work',
      JSON.stringify(state.soundscape ?? {}),
    );
}
