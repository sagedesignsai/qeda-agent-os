/**
 * db/terminal.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD helpers for terminal_sessions and terminal_blocks.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { nanoid } from 'nanoid';
import { getDb } from './client.js';

// ─── Domain types ─────────────────────────────────────────────────────────────

export type TerminalSessionStatus = 'idle' | 'running' | 'done' | 'error';

export interface TerminalSession {
  id: string;
  title: string;
  goal: string;
  status: TerminalSessionStatus;
  created_at: number;
  updated_at: number;
}

export type TerminalBlockStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'error'
  | 'skipped';

export interface TerminalBlock {
  id: string;
  session_id: string;
  position: number;
  command: string;
  output: string;
  exit_code: number | null;
  status: TerminalBlockStatus;
  agent_thought: string;
  explanation: string;
  duration_ms?: number | null;
  created_at: number;
  updated_at: number;
}

// ─── Session CRUD ─────────────────────────────────────────────────────────────

/** Return all sessions, newest first. */
export function listTerminalSessions(): TerminalSession[] {
  return getDb()
    .prepare(`SELECT * FROM terminal_sessions ORDER BY updated_at DESC`)
    .all() as TerminalSession[];
}

/** Fetch a single session by id, or null when not found. */
export function getTerminalSession(id: string): TerminalSession | null {
  return (
    (getDb()
      .prepare(`SELECT * FROM terminal_sessions WHERE id = ?`)
      .get(id) as TerminalSession | undefined) ?? null
  );
}

/** Create a new terminal session. */
export function createTerminalSession(opts: {
  title?: string;
  goal?: string;
}): TerminalSession {
  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);
  getDb()
    .prepare(
      `INSERT INTO terminal_sessions (id, title, goal, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, opts.title ?? 'New Session', opts.goal ?? '', now, now);
  return getTerminalSession(id)!;
}

/** Update a session's title, goal or status. */
export function updateTerminalSession(
  id: string,
  patch: Partial<Pick<TerminalSession, 'title' | 'goal' | 'status'>>,
): void {
  const now = Math.floor(Date.now() / 1000);
  const sets: string[] = ['updated_at = ?'];
  const values: unknown[] = [now];

  if (patch.title  !== undefined) { sets.push('title = ?');  values.push(patch.title); }
  if (patch.goal   !== undefined) { sets.push('goal = ?');   values.push(patch.goal); }
  if (patch.status !== undefined) { sets.push('status = ?'); values.push(patch.status); }

  values.push(id);
  getDb()
    .prepare(`UPDATE terminal_sessions SET ${sets.join(', ')} WHERE id = ?`)
    .run(...values);
}

/** Hard-delete a session and cascade-delete its blocks. */
export function deleteTerminalSession(id: string): void {
  getDb().prepare(`DELETE FROM terminal_sessions WHERE id = ?`).run(id);
}

// ─── Block CRUD ───────────────────────────────────────────────────────────────

/** Fetch a single block by id, or null when not found. */
export function getBlock(id: string): TerminalBlock | null {
  return (
    (getDb()
      .prepare(`SELECT * FROM terminal_blocks WHERE id = ?`)
      .get(id) as TerminalBlock | undefined) ?? null
  );
}

/** Return all blocks for a session in position order. */
export function getSessionBlocks(sessionId: string): TerminalBlock[] {
  return getDb()
    .prepare(
      `SELECT * FROM terminal_blocks WHERE session_id = ? ORDER BY position ASC`,
    )
    .all(sessionId) as TerminalBlock[];
}

/** Append a new block to a session. Returns the saved block. */
export function appendBlock(opts: {
  sessionId: string;
  command: string;
  agentThought?: string;
}): TerminalBlock {
  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);

  const maxPos = (
    getDb()
      .prepare(
        `SELECT COALESCE(MAX(position), -1) AS m FROM terminal_blocks WHERE session_id = ?`,
      )
      .get(opts.sessionId) as { m: number }
  ).m;

  getDb()
    .prepare(
      `INSERT INTO terminal_blocks
         (id, session_id, position, command, agent_thought, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
    .run(
      id,
      opts.sessionId,
      maxPos + 1,
      opts.command,
      opts.agentThought ?? '',
      now,
      now,
    );

  return getDb()
    .prepare(`SELECT * FROM terminal_blocks WHERE id = ?`)
    .get(id) as TerminalBlock;
}

/** Patch a block's status, output, exit_code, explanation, command, and/or duration. */
export function updateBlock(
  id: string,
  patch: Partial<
    Pick<
      TerminalBlock,
      'status' | 'output' | 'exit_code' | 'explanation' | 'command' | 'duration_ms'
    >
  >,
): void {
  const now = Math.floor(Date.now() / 1000);
  const sets: string[] = ['updated_at = ?'];
  const values: unknown[] = [now];

  if (patch.status !== undefined) {
    sets.push('status = ?');
    values.push(patch.status);
  }
  if (patch.output !== undefined) {
    sets.push('output = ?');
    values.push(patch.output);
  }
  if (patch.exit_code !== undefined) {
    sets.push('exit_code = ?');
    values.push(patch.exit_code);
  }
  if (patch.explanation !== undefined) {
    sets.push('explanation = ?');
    values.push(patch.explanation);
  }
  if (patch.command !== undefined) {
    sets.push('command = ?');
    values.push(patch.command);
  }
  if (patch.duration_ms !== undefined) {
    sets.push('duration_ms = ?');
    values.push(patch.duration_ms);
  }

  values.push(id);
  getDb()
    .prepare(`UPDATE terminal_blocks SET ${sets.join(', ')} WHERE id = ?`)
    .run(...values);
}
