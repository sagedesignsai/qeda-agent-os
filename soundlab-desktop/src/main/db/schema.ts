/**
 * db/schema.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * DDL for SoundLab — only the two tables needed by the DAW.
 *
 * Statements are idempotent so they can be applied on every launch.
 * Exposed as data (not side effects) so tests can apply them to an
 * in-memory database without booting Electron.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const CREATE_SOUNDLAB_SESSIONS = `
CREATE TABLE IF NOT EXISTS soundlab_sessions (
  id              TEXT PRIMARY KEY,
  project_id      TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title           TEXT NOT NULL DEFAULT 'Untitled Session',
  bpm             INTEGER NOT NULL DEFAULT 120,
  key_signature   TEXT NOT NULL DEFAULT 'C',
  target_band     TEXT NOT NULL DEFAULT 'alpha',
  duration_beats  INTEGER NOT NULL DEFAULT 64,
  loop_enabled    INTEGER NOT NULL DEFAULT 0,
  loop_start_beat REAL NOT NULL DEFAULT 0,
  loop_end_beat   REAL NOT NULL DEFAULT 32,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_soundlab_sessions_project ON soundlab_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_soundlab_sessions_updated ON soundlab_sessions(updated_at DESC);
`;

export const CREATE_SOUNDLAB_TRACKS = `
CREATE TABLE IF NOT EXISTS soundlab_tracks (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES soundlab_sessions(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK(type IN ('instrument','entrainment','noise','drums')),
  name            TEXT NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  muted           INTEGER NOT NULL DEFAULT 0,
  solo            INTEGER NOT NULL DEFAULT 0,
  volume          REAL NOT NULL DEFAULT 0.8,
  pan             REAL NOT NULL DEFAULT 0.0,
  color           TEXT NOT NULL DEFAULT '#6366f1',
  config_json     TEXT NOT NULL DEFAULT '{}',
  patterns_json   TEXT NOT NULL DEFAULT '[]',
  clips_json      TEXT NOT NULL DEFAULT '[]',
  automation_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_soundlab_tracks_session ON soundlab_tracks(session_id, sort_order ASC);
`;

/** All DDL statements in creation order. */
export const MIGRATION_STATEMENTS = [
  CREATE_SOUNDLAB_SESSIONS,
  CREATE_SOUNDLAB_TRACKS,
];

/**
 * Apply all DDL to a fresh or existing database.
 * Safe to call repeatedly — every statement uses IF NOT EXISTS.
 */
export function applyMigrations(db: ReturnType<typeof require('better-sqlite3')>): void {
  for (const sql of MIGRATION_STATEMENTS) {
    db.exec(sql);
  }
}
