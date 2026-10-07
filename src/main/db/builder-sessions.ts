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
                workspace_name, branch, created_at
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
          workspace_name, branch, created_at)
       VALUES ('active', ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         opencode_session_id = excluded.opencode_session_id,
         title               = excluded.title,
         repo_directory      = excluded.repo_directory,
         worktree_path       = excluded.worktree_path,
         workspace_name      = excluded.workspace_name,
         branch              = excluded.branch,
         created_at          = excluded.created_at`,
    ).run(
      record.opencode_session_id,
      record.title,
      record.repo_directory,
      record.worktree_path ?? null,
      record.workspace_name,
      record.branch ?? null,
      record.created_at,
    );
  } catch {
    // Non-fatal: persistence is best-effort; the session still runs.
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
