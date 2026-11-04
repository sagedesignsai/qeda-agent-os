/**
 * db/builder-sessions.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Persistence layer for Builder sessions: the active singleton row and the
 * session history table.
 *
 * The active row (`id = 'active'`) is kept for backward compatibility but is
 * deprecated in favor of the history table. New sessions are archived to
 * `builder_session_history` before the active row is replaced or deleted.
 *
 * The worktree path is stored so teardown can remove it correctly even after
 * an unexpected restart.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getDb } from './client.js';

export interface BuilderSessionRecord {
  opencode_session_id: string;
  title: string;
  repo_directory: string;
  worktree_path: string | null;
  workspace_name: string;
  branch: string | null;
  engine: 'local' | 'opencode' | 'opencode-sandbox';
  /** Serialized ModelMessage[] for a Local Builder session. */
  messages_json?: string | null;
  /** Serialized BuilderSessionEvent[] tail for re-attach after a restart. */
  events_json?: string | null;
  created_at: number;
}

/**
 * Return the persisted active Builder session, or null when none exists.
 * Called on startup and on `builder:session-state` re-attach.
 */
export function getActiveBuilderSession(): BuilderSessionRecord | null {
  try {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT opencode_session_id, title, repo_directory, worktree_path,
                workspace_name, branch, engine, messages_json, events_json,
                created_at
           FROM builder_sessions
          WHERE id = 'active'
          LIMIT 1`,
      )
      .get() as BuilderSessionRecord | undefined;
    return row ?? null;
  } catch {
    // Table absent in test databases that skip migrations — treat as no session.
    return null;
  }
}

/**
 * Persist (or replace) the active Builder session.
 * Called immediately after a session is created and bound to a workspace.
 */
export function saveActiveBuilderSession(record: BuilderSessionRecord): void {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO builder_sessions
         (id, opencode_session_id, title, repo_directory, worktree_path,
          workspace_name, branch, engine, messages_json, events_json,
          created_at)
       VALUES ('active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         opencode_session_id = excluded.opencode_session_id,
         title               = excluded.title,
         repo_directory      = excluded.repo_directory,
         worktree_path       = excluded.worktree_path,
         workspace_name      = excluded.workspace_name,
         branch              = excluded.branch,
         engine              = excluded.engine,
         messages_json       = excluded.messages_json,
         events_json         = excluded.events_json,
         created_at          = excluded.created_at`,
    ).run(
      record.opencode_session_id,
      record.title,
      record.repo_directory,
      record.worktree_path ?? null,
      record.workspace_name,
      record.branch ?? null,
      record.engine,
      record.messages_json ?? null,
      record.events_json ?? null,
      record.created_at,
    );
  } catch {
    // Non-fatal: persistence is best-effort; the session still runs.
  }
}

/**
 * Persist the Local Builder conversation and/or the re-attachable event tail.
 *
 * `undefined` means "leave this field alone"; use `'[]'` to clear. The handler
 * writes the event tail on status changes so a restart does not re-open a
 * session with an empty activity feed.
 */
export function saveActiveBuilderSessionContext({
  messagesJson,
  eventsJson,
}: {
  messagesJson?: string;
  eventsJson?: string;
}): void {
  if (messagesJson === undefined && eventsJson === undefined) return;
  try {
    const db = getDb();
    db.prepare(
      `UPDATE builder_sessions
          SET messages_json = COALESCE(?, messages_json),
              events_json   = COALESCE(?, events_json)
        WHERE id = 'active'`,
    ).run(messagesJson ?? null, eventsJson ?? null);
  } catch {
    // Non-fatal: the live session is still authoritative.
  }
}

/**
 * Delete the persisted active Builder session.
 * Called when the user stops a session or the handler tears down.
 */
export function deleteActiveBuilderSession(): void {
  try {
    const db = getDb();
    db.prepare(`DELETE FROM builder_sessions WHERE id = 'active'`).run();
  } catch {
    // Best-effort.
  }
}

// ─── Session history ──────────────────────────────────────────────────────────

export interface BuilderSessionHistoryRecord {
  id: string;
  opencode_session_id: string;
  title: string;
  repo_directory: string;
  worktree_path: string | null;
  workspace_name: string;
  branch: string | null;
  engine: 'local' | 'opencode' | 'opencode-sandbox';
  status: 'active' | 'detached' | 'discarded' | 'orphaned';
  created_at: number;
  ended_at: number | null;
}

/** Return recent sessions ordered by created_at descending. */
export function listBuilderSessionHistory(
  limit = 50,
): BuilderSessionHistoryRecord[] {
  try {
    const db = getDb();
    return db
      .prepare(
        `SELECT id, opencode_session_id, title, repo_directory, worktree_path,
                workspace_name, branch, engine, status, created_at, ended_at
           FROM builder_session_history
          ORDER BY created_at DESC
          LIMIT ?`,
      )
      .all(limit) as BuilderSessionHistoryRecord[];
  } catch {
    return [];
  }
}

/** Save (or replace) a session history row. */
export function saveBuilderSessionToHistory(
  record: BuilderSessionHistoryRecord,
): void {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO builder_session_history
         (id, opencode_session_id, title, repo_directory, worktree_path,
          workspace_name, branch, engine, status, created_at, ended_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         opencode_session_id = excluded.opencode_session_id,
         title               = excluded.title,
         repo_directory      = excluded.repo_directory,
         worktree_path       = excluded.worktree_path,
         workspace_name      = excluded.workspace_name,
         branch              = excluded.branch,
         engine              = excluded.engine,
         status              = excluded.status,
         created_at          = excluded.created_at,
         ended_at            = excluded.ended_at`,
    ).run(
      record.id,
      record.opencode_session_id,
      record.title,
      record.repo_directory,
      record.worktree_path ?? null,
      record.workspace_name,
      record.branch ?? null,
      record.engine,
      record.status,
      record.created_at,
      record.ended_at ?? null,
    );
  } catch {
    // Non-fatal: history is best-effort.
  }
}

/** Delete a session history row by id. */
export function deleteBuilderSessionHistory(id: string): boolean {
  try {
    const db = getDb();
    const info = db
      .prepare(`DELETE FROM builder_session_history WHERE id = ?`)
      .run(id);
    const changes = (info as { changes?: number }).changes ?? 0;
    return changes > 0;
  } catch {
    return false;
  }
}

/** Get a single session history row by id. */
export function getBuilderSessionHistory(
  id: string,
): BuilderSessionHistoryRecord | null {
  try {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT id, opencode_session_id, title, repo_directory, worktree_path,
                workspace_name, branch, engine, status, created_at, ended_at
           FROM builder_session_history
          WHERE id = ?
          LIMIT 1`,
      )
      .get(id) as BuilderSessionHistoryRecord | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

/**
 * Copy the active singleton row to history with the given status, then delete
 * the active row. Used before `stopActive` or `detachActive` so the session
 * is not lost.
 */
export function archiveActiveSession(
  status: 'detached' | 'discarded',
): void {
  try {
    const db = getDb();
    const active = db
      .prepare(
        `SELECT opencode_session_id, title, repo_directory, worktree_path,
                workspace_name, branch, engine, created_at
           FROM builder_sessions
          WHERE id = 'active'
          LIMIT 1`,
      )
      .get() as BuilderSessionRecord | undefined;
    if (!active) return;

    const historyId =
      active.opencode_session_id.startsWith('local-')
        ? active.opencode_session_id
        : `hist-${Date.now().toString(36)}-${active.opencode_session_id.slice(0, 8)}`;

    db.prepare(
      `INSERT OR REPLACE INTO builder_session_history
         (id, opencode_session_id, title, repo_directory, worktree_path,
          workspace_name, branch, engine, status, created_at, ended_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      historyId,
      active.opencode_session_id,
      active.title,
      active.repo_directory,
      active.worktree_path ?? null,
      active.workspace_name,
      active.branch ?? null,
      active.engine,
      status,
      active.created_at,
      null,
    );
    db.prepare(`DELETE FROM builder_sessions WHERE id = 'active'`).run();
  } catch {
    // Best-effort: the active row is still deleted by the caller.
  }
}
