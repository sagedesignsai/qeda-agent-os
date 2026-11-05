/**
 * db/soundlab-store.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SQLite CRUD for SoundLab Entrainment Studio sessions and tracks.
 *
 * Sessions are stored in `soundlab_sessions`; each session's tracks live in
 * `soundlab_tracks` with four JSON columns (config, patterns, clips,
 * automation) so the complex nested structure is fully round-tripped without
 * schema churn. A transaction is used on every save to keep session + tracks
 * atomic.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getDb } from './client.js';
import type {
  SoundLabSession,
  SoundLabSessionWithTracks,
  SoundLabTrack,
  SoundLabTrackConfig,
  SoundLabPattern,
  SoundLabClip,
  SoundLabAutomationLane,
  SoundLabTrackType,
  BrainwaveBand,
} from '../../lib/soundlab-types.js';

// ── Row shapes ────────────────────────────────────────────────────────────────

interface SessionRow {
  id: string;
  project_id: string | null;
  title: string;
  bpm: number;
  key_signature: string;
  target_band: string;
  duration_beats: number;
  loop_enabled: number;
  loop_start_beat: number;
  loop_end_beat: number;
  created_at: number;
  updated_at: number;
}

interface TrackRow {
  id: string;
  session_id: string;
  type: string;
  name: string;
  sort_order: number;
  muted: number;
  solo: number;
  volume: number;
  pan: number;
  color: string;
  config_json: string;
  patterns_json: string;
  clips_json: string;
  automation_json: string;
}

// ── JSON helpers ──────────────────────────────────────────────────────────────

function parseJson<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function rowToSession(row: SessionRow): SoundLabSession {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    bpm: row.bpm,
    keySignature: row.key_signature,
    targetBand: row.target_band as BrainwaveBand,
    durationBeats: row.duration_beats,
    loopEnabled: row.loop_enabled === 1,
    loopStartBeat: row.loop_start_beat,
    loopEndBeat: row.loop_end_beat,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToTrack(row: TrackRow): SoundLabTrack {
  return {
    id: row.id,
    sessionId: row.session_id,
    type: row.type as SoundLabTrackType,
    name: row.name,
    sortOrder: row.sort_order,
    muted: row.muted === 1,
    solo: row.solo === 1,
    volume: row.volume,
    pan: row.pan,
    color: row.color,
    config: parseJson<SoundLabTrackConfig>(row.config_json, {}),
    patterns: parseJson<SoundLabPattern[]>(row.patterns_json, []),
    clips: parseJson<SoundLabClip[]>(row.clips_json, []),
    automation: parseJson<SoundLabAutomationLane[]>(row.automation_json, []),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * List sessions, newest first. Optionally filter to a specific project (pass
 * `null` explicitly to list sessions with no project).
 */
export function listSoundLabSessions(
  opts?: { projectId?: string | null },
): SoundLabSession[] {
  const db = getDb();

  if (opts?.projectId !== undefined) {
    const rows = db
      .prepare<[string | null], SessionRow>(
        `SELECT * FROM soundlab_sessions
          WHERE project_id IS ?
          ORDER BY updated_at DESC`,
      )
      .all(opts.projectId);
    return rows.map(rowToSession);
  }

  const rows = db
    .prepare<[], SessionRow>(
      `SELECT * FROM soundlab_sessions ORDER BY updated_at DESC`,
    )
    .all();
  return rows.map(rowToSession);
}

/** Fetch a full session with its tracks, or null when not found. */
export function getSoundLabSession(
  id: string,
): SoundLabSessionWithTracks | null {
  const db = getDb();

  const sessionRow = db
    .prepare<[string], SessionRow>(
      `SELECT * FROM soundlab_sessions WHERE id = ?`,
    )
    .get(id);

  if (!sessionRow) return null;

  const trackRows = db
    .prepare<[string], TrackRow>(
      `SELECT * FROM soundlab_tracks
        WHERE session_id = ?
        ORDER BY sort_order ASC`,
    )
    .all(id);

  return {
    ...rowToSession(sessionRow),
    tracks: trackRows.map(rowToTrack),
  };
}

/**
 * Upsert a full session with all its tracks in a single transaction.
 * Existing tracks for this session are deleted and reinserted so sort_order
 * and removals are handled without a complex diff.
 */
export function saveSoundLabSession(data: SoundLabSessionWithTracks): void {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const upsertSession = db.prepare<
    [
      string, string | null, string, number, string, string,
      number, number, number, number, number, number,
    ]
  >(
    `INSERT INTO soundlab_sessions
       (id, project_id, title, bpm, key_signature, target_band,
        duration_beats, loop_enabled, loop_start_beat, loop_end_beat,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       project_id      = excluded.project_id,
       title           = excluded.title,
       bpm             = excluded.bpm,
       key_signature   = excluded.key_signature,
       target_band     = excluded.target_band,
       duration_beats  = excluded.duration_beats,
       loop_enabled    = excluded.loop_enabled,
       loop_start_beat = excluded.loop_start_beat,
       loop_end_beat   = excluded.loop_end_beat,
       updated_at      = excluded.updated_at`,
  );

  const deleteTracks = db.prepare<[string]>(
    `DELETE FROM soundlab_tracks WHERE session_id = ?`,
  );

  const insertTrack = db.prepare<
    [
      string, string, string, string, number,
      number, number, number, number, string,
      string, string, string, string,
    ]
  >(
    `INSERT INTO soundlab_tracks
       (id, session_id, type, name, sort_order,
        muted, solo, volume, pan, color,
        config_json, patterns_json, clips_json, automation_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  db.transaction(() => {
    upsertSession.run(
      data.id,
      data.projectId,
      data.title,
      data.bpm,
      data.keySignature,
      data.targetBand,
      data.durationBeats,
      data.loopEnabled ? 1 : 0,
      data.loopStartBeat,
      data.loopEndBeat,
      data.createdAt ?? now,
      now,
    );

    deleteTracks.run(data.id);

    for (const track of data.tracks) {
      insertTrack.run(
        track.id,
        data.id,
        track.type,
        track.name,
        track.sortOrder,
        track.muted ? 1 : 0,
        track.solo ? 1 : 0,
        track.volume,
        track.pan,
        track.color,
        JSON.stringify(track.config),
        JSON.stringify(track.patterns),
        JSON.stringify(track.clips),
        JSON.stringify(track.automation),
      );
    }
  })();
}

/** Hard-delete a session; tracks cascade via FK. Returns true if a row was deleted. */
export function deleteSoundLabSession(id: string): boolean {
  const result = getDb()
    .prepare<[string]>(`DELETE FROM soundlab_sessions WHERE id = ?`)
    .run(id);
  return result.changes > 0;
}
