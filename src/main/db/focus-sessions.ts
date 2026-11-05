/**
 * db/focus-sessions.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Persistence for completed focus phases (`focus_sessions`) plus the derived
 * stats the Today view uses for its progress strip.
 *
 * A session is recorded when a pomodoro/flow phase ends — whether it ran to
 * completion (`completed = 1`) or was abandoned early. Streaks only count
 * completed work phases.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { nanoid } from 'nanoid';
import { getDb } from './client.js';

// ─── Domain types ─────────────────────────────────────────────────────────────

export type FocusKind = 'work' | 'break';

export interface FocusSession {
  id: string;
  task_id: string | null;
  kind: FocusKind;
  /** Planned length of the phase, seconds. */
  planned_sec: number;
  /** Wall-clock time actually spent, seconds. */
  actual_sec: number;
  /** 1 when the phase ran to the end without being abandoned. */
  completed: 0 | 1;
  started_at: number;
  ended_at: number | null;
  created_at: number;
}

/** One distinct track heard during a focus session, in first-play order. */
export interface FocusSessionTrack {
  session_id: string;
  track_id: string;
  position: number;
}

export interface FocusStats {
  /** Completed work phases that started today. */
  todayWorkSessions: number;
  /** Seconds of focus (completed *or* abandoned work phases) accrued today. */
  todayFocusSec: number;
  totalWorkSessions: number;
  totalFocusSec: number;
  /** Consecutive days (ending today, or yesterday if today is still empty). */
  streakDays: number;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Local-time `YYYY-MM-DD` key for a unix-seconds timestamp. */
export function dayKey(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Start-of-day (local) in unix seconds, for a timestamp. */
export function startOfDay(epochSec: number): number {
  const d = new Date(epochSec * 1000);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

// ─── Reads ────────────────────────────────────────────────────────────────────

/** Sessions whose `started_at` falls in `[from, to)`. */
export function listFocusSessions(opts?: {
  from?: number;
  to?: number;
}): FocusSession[] {
  const where: string[] = [];
  const values: unknown[] = [];
  if (opts?.from !== undefined) {
    where.push('started_at >= ?');
    values.push(opts.from);
  }
  if (opts?.to !== undefined) {
    where.push('started_at < ?');
    values.push(opts.to);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDb()
    .prepare(`SELECT * FROM focus_sessions ${clause} ORDER BY started_at DESC`)
    .all(...values) as FocusSession[];
}

/** Tracks recorded for a session, in first-play order. */
export function listFocusSessionTracks(
  sessionId: string,
): FocusSessionTrack[] {
  return getDb()
    .prepare(
      `SELECT session_id, track_id, position
         FROM focus_session_tracks
        WHERE session_id = ?
        ORDER BY position`,
    )
    .all(sessionId) as FocusSessionTrack[];
}

/**
 * Aggregate focus stats. `now` is injectable so tests stay deterministic.
 */
export function getFocusStats(
  now: number = Math.floor(Date.now() / 1000),
): FocusStats {
  const db = getDb();

  const todayStart = startOfDay(now);
  const todayTotals = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN kind = 'work' AND completed = 1 THEN 1 ELSE 0 END), 0) AS sessions,
         COALESCE(SUM(CASE WHEN kind = 'work' THEN actual_sec ELSE 0 END), 0)          AS focus_sec
       FROM focus_sessions
      WHERE started_at >= ? AND started_at < ?`,
    )
    .get(todayStart, todayStart + 86_400) as {
    sessions: number;
    focus_sec: number;
  };

  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN kind = 'work' AND completed = 1 THEN 1 ELSE 0 END), 0) AS sessions,
         COALESCE(SUM(CASE WHEN kind = 'work' THEN actual_sec ELSE 0 END), 0)          AS focus_sec
       FROM focus_sessions`,
    )
    .get() as { sessions: number; focus_sec: number };

  return {
    todayWorkSessions: todayTotals.sessions,
    todayFocusSec: todayTotals.focus_sec,
    totalWorkSessions: totals.sessions,
    totalFocusSec: totals.focus_sec,
    streakDays: computeStreak(now),
  };
}

/**
 * Count consecutive days with at least one *completed* work session. The day
 * currently in progress does not break a streak that ran through yesterday, so
 * a fresh morning still shows yesterday's count until today's first session.
 */
function computeStreak(now: number): number {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT started_at FROM focus_sessions
        WHERE kind = 'work' AND completed = 1
        ORDER BY started_at DESC`,
    )
    .all() as Array<{ started_at: number }>;

  if (rows.length === 0) return 0;

  const days = new Set(rows.map((r) => dayKey(r.started_at)));

  const cursor = new Date(startOfDay(now) * 1000);
  if (!days.has(dayKey(now))) {
    // No session yet today — anchor on yesterday so an unstarted day is neutral.
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (days.has(dayKey(Math.floor(cursor.getTime() / 1000)))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// ─── Writes ───────────────────────────────────────────────────────────────────

/** Record a finished focus phase. Returns the saved row. */
export function createFocusSession(opts: {
  task_id?: string | null;
  kind?: FocusKind;
  planned_sec?: number;
  actual_sec?: number;
  completed?: boolean;
  started_at?: number;
  ended_at?: number | null;
  /** Distinct ids of tracks heard during the phase, in first-play order. */
  track_ids?: readonly string[];
}): FocusSession {
  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);
  const startedAt = opts.started_at ?? now;
  const trackIds = [...new Set(opts.track_ids ?? [])].filter(
    (trackId) => trackId.length > 0,
  );
  const db = getDb();

  // The session and its listening history are one fact; a failure while
  // linking tracks must not leave a half-recorded session behind.
  const write = db.transaction(() => {
    db.prepare(
      `INSERT INTO focus_sessions
         (id, task_id, kind, planned_sec, actual_sec, completed, started_at, ended_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      opts.task_id ?? null,
      opts.kind ?? 'work',
      opts.planned_sec ?? 0,
      opts.actual_sec ?? 0,
      opts.completed === false ? 0 : 1,
      startedAt,
      opts.ended_at ?? now,
    );

    // Selecting from the library skips ids that no longer exist instead of
    // failing the whole session on a foreign-key violation. Tracks are soft
    // deleted by rescans, so this only guards against stale queued ids.
    const link = db.prepare(
      `INSERT OR IGNORE INTO focus_session_tracks (session_id, track_id, position)
       SELECT ?, id, ? FROM music_tracks WHERE id = ?`,
    );
    trackIds.forEach((trackId, position) => link.run(id, position, trackId));
  });
  write();

  return db
    .prepare(`SELECT * FROM focus_sessions WHERE id = ?`)
    .get(id) as FocusSession;
}
