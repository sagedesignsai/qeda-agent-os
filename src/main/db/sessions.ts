/**
 * db/sessions.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD helpers for chat sessions and their messages.
 * All functions are synchronous (better-sqlite3 is sync by design).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { UIMessage } from 'ai';
import { randomUUID } from 'node:crypto';
import { getDb } from './client.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

export interface PersistedMessage {
  id: string;
  session_id: string;
  role: UIMessage['role'];
  parts_json: string;
  created_at: number;
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export function createSession(title = 'New Chat'): Session {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    'INSERT INTO sessions (id, title) VALUES (?, ?)',
  ).run(id, title);
  return db.prepare<[string], Session>('SELECT * FROM sessions WHERE id = ?').get(id)!;
}

export function listSessions(): Session[] {
  return getDb()
    .prepare<[], Session>(
      'SELECT * FROM sessions ORDER BY updated_at DESC',
    )
    .all();
}

export function getSession(id: string): Session | undefined {
  return getDb()
    .prepare<[string], Session>('SELECT * FROM sessions WHERE id = ?')
    .get(id);
}

export function updateSessionTitle(id: string, title: string): void {
  getDb()
    .prepare(
      'UPDATE sessions SET title = ?, updated_at = unixepoch() WHERE id = ?',
    )
    .run(title, id);
}

export function deleteSession(id: string): void {
  // CASCADE deletes messages automatically.
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

// ─── Messages ─────────────────────────────────────────────────────────────────

/**
 * Persist a UIMessage to the database.
 * Upserts so that partial streaming updates don't create duplicates.
 */
export function upsertMessage(sessionId: string, msg: UIMessage): void {
  getDb()
    .prepare(
      `INSERT INTO messages (id, session_id, role, parts_json)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET parts_json = excluded.parts_json`,
    )
    .run(msg.id, sessionId, msg.role, JSON.stringify(msg.parts));

  // Bump session timestamp.
  getDb()
    .prepare('UPDATE sessions SET updated_at = unixepoch() WHERE id = ?')
    .run(sessionId);
}

/**
 * Load all UIMessages for a session, ordered chronologically.
 */
export function loadMessages(sessionId: string): UIMessage[] {
  const rows = getDb()
    .prepare<[string], PersistedMessage>(
      'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC',
    )
    .all(sessionId);

  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    parts: JSON.parse(row.parts_json),
  }));
}

/** Delete all messages for a session (keeps session metadata). */
export function clearMessages(sessionId: string): void {
  getDb()
    .prepare('DELETE FROM messages WHERE session_id = ?')
    .run(sessionId);
}
