/**
 * __tests__/terminal-blocks.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Terminal block persistence: CRUD, the `duration_ms` column, and the upgrade
 * path for databases created before that column existed.
 *
 * The upgrade path is the interesting one. `CREATE TABLE IF NOT EXISTS` is a
 * no-op against an existing table, so a database created by an older build
 * would silently lack `duration_ms` and every insert naming it would throw.
 * `applyMigrations` therefore ALTERs it in — and this suite proves that against
 * a table built from the *old* DDL rather than the current one.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { applyMigrations } from '../main/db/schema';
import { useTestDatabase } from '../main/db/client';
import {
  createTerminalSession,
  getTerminalSession,
  listTerminalSessions,
  updateTerminalSession,
  deleteTerminalSession,
  appendBlock,
  getBlock,
  getSessionBlocks,
  updateBlock,
} from '../main/db/terminal';

/** The pre-`duration_ms` shape of terminal_blocks. */
const LEGACY_BLOCKS_DDL = `
CREATE TABLE IF NOT EXISTS terminal_blocks (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES terminal_sessions(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  command       TEXT NOT NULL DEFAULT '',
  output        TEXT NOT NULL DEFAULT '',
  exit_code     INTEGER,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending','running','done','error','skipped')),
  agent_thought TEXT NOT NULL DEFAULT '',
  explanation   TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
`;

function columnsOf(db: Database.Database, table: string): string[] {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => (c as { name: string }).name);
}

describe('terminal block store', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db);
  });

  afterEach(() => db.close());

  describe('session CRUD', () => {
    it('creates, reads and lists sessions', () => {
      const created = createTerminalSession({ title: 'Deploy check' });
      expect(created.id).toBeTruthy();
      expect(created.title).toBe('Deploy check');
      expect(created.status).toBe('idle');

      expect(getTerminalSession(created.id)?.title).toBe('Deploy check');
      expect(listTerminalSessions().map((s) => s.id)).toContain(created.id);
    });

    it('returns null for an unknown session', () => {
      expect(getTerminalSession('nope')).toBeNull();
    });

    it('patches only the fields provided', () => {
      const s = createTerminalSession({ title: 'Before', goal: 'keep me' });
      updateTerminalSession(s.id, { title: 'After' });

      const after = getTerminalSession(s.id);
      expect(after?.title).toBe('After');
      expect(after?.goal).toBe('keep me');
      expect(after?.status).toBe('idle');
    });
  });

  describe('block CRUD', () => {
    it('appends blocks with increasing positions', () => {
      const s = createTerminalSession({ title: 'S' });
      const a = appendBlock({ sessionId: s.id, command: 'ls' });
      const b = appendBlock({ sessionId: s.id, command: 'pwd' });

      expect(a.position).toBe(0);
      expect(b.position).toBe(1);
      expect(a.status).toBe('pending');
      expect(getSessionBlocks(s.id).map((x) => x.command)).toEqual([
        'ls',
        'pwd',
      ]);
    });

    it('getBlock returns one block or null', () => {
      const s = createTerminalSession({ title: 'S' });
      const block = appendBlock({ sessionId: s.id, command: 'whoami' });

      expect(getBlock(block.id)?.command).toBe('whoami');
      expect(getBlock('missing')).toBeNull();
    });

    it('persists duration_ms on update', () => {
      const s = createTerminalSession({ title: 'S' });
      const block = appendBlock({ sessionId: s.id, command: 'sleep 1' });

      updateBlock(block.id, {
        status: 'done',
        output: 'ok',
        exit_code: 0,
        duration_ms: 1234,
      });

      const stored = getBlock(block.id);
      expect(stored?.duration_ms).toBe(1234);
      expect(stored?.status).toBe('done');
      expect(stored?.exit_code).toBe(0);
    });

    it('leaves duration_ms untouched when not patched', () => {
      const s = createTerminalSession({ title: 'S' });
      const block = appendBlock({ sessionId: s.id, command: 'x' });
      updateBlock(block.id, { duration_ms: 500 });
      updateBlock(block.id, { output: 'later' });

      expect(getBlock(block.id)?.duration_ms).toBe(500);
    });

    it('cascade-deletes blocks with their session', () => {
      const s = createTerminalSession({ title: 'S' });
      appendBlock({ sessionId: s.id, command: 'ls' });

      deleteTerminalSession(s.id);
      expect(getSessionBlocks(s.id)).toEqual([]);
    });
  });

  describe('duration_ms upgrade on a legacy database', () => {
    let legacy: Database.Database;

    beforeEach(() => {
      legacy = new Database(':memory:');
      legacy.pragma('foreign_keys = ON');
      // Minimal prerequisite, then the OLD blocks table with no duration_ms.
      legacy.exec(`
        CREATE TABLE IF NOT EXISTS terminal_sessions (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL DEFAULT 'New Session',
          goal TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'idle',
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
      `);
      legacy.exec(LEGACY_BLOCKS_DDL);
    });

    afterEach(() => legacy.close());

    it('starts without the column — the premise of this test', () => {
      expect(columnsOf(legacy, 'terminal_blocks')).not.toContain('duration_ms');
    });

    it('adds duration_ms when migrations run', () => {
      applyMigrations(legacy);
      expect(columnsOf(legacy, 'terminal_blocks')).toContain('duration_ms');
    });

    it('is idempotent across repeated runs', () => {
      applyMigrations(legacy);
      applyMigrations(legacy);
      applyMigrations(legacy);

      const cols = columnsOf(legacy, 'terminal_blocks');
      // A non-guarded ALTER would either throw or duplicate the column.
      expect(cols.filter((c) => c === 'duration_ms')).toHaveLength(1);
    });

    it('preserves existing rows and backfills duration_ms as null', () => {
      legacy
        .prepare(
          `INSERT INTO terminal_sessions (id, title) VALUES ('s1', 'Legacy')`,
        )
        .run();
      legacy
        .prepare(
          `INSERT INTO terminal_blocks (id, session_id, position, command, output, status)
           VALUES ('b1', 's1', 0, 'echo hi', 'hi', 'done')`,
        )
        .run();

      applyMigrations(legacy);

      const row = legacy
        .prepare(
          'SELECT command, output, duration_ms FROM terminal_blocks WHERE id = ?',
        )
        .get('b1') as {
        command: string;
        output: string;
        duration_ms: number | null;
      };

      expect(row.command).toBe('echo hi');
      expect(row.output).toBe('hi');
      expect(row.duration_ms).toBeNull();
    });

    it('accepts a duration write after the upgrade', () => {
      applyMigrations(legacy);
      legacy
        .prepare(`INSERT INTO terminal_sessions (id, title) VALUES ('s2', 'S')`)
        .run();
      legacy
        .prepare(
          `INSERT INTO terminal_blocks (id, session_id, position, command, status, duration_ms)
           VALUES ('b2', 's2', 0, 'ls', 'done', 42)`,
        )
        .run();

      const row = legacy
        .prepare('SELECT duration_ms FROM terminal_blocks WHERE id = ?')
        .get('b2') as { duration_ms: number };
      expect(row.duration_ms).toBe(42);
    });
  });
});
