/**
 * db/builder-sessions.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Persistence layer for the active Builder session.
 *
 * There is at most one active Builder session per app window, so we use a
 * singleton row with a fixed id ('active'). The row is upserted when a session
 * starts and deleted when it stops. On re-launch, reading this row tells the
 * handler which OpenCode session to attempt to reconnect to.
 *
 * The worktree path is stored so teardown can remove it correctly even after
 * an unexpected restart (best-effort: the worktree is in /tmp and will be
 * cleaned by the OS eventually, but we make a tidy attempt on next start).
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
  engine: 'local' | 'opencode';
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
