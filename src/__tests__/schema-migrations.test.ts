/**
 * __tests__/schema-migrations.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Upgrade behaviour for databases written by an earlier build.
 *
 * The regression these lock down is a bootstrap DEADLOCK, not a missing
 * column. `CREATE_CHUNKS` used to create `idx_chunks_project` inline. On a
 * database whose `chunks` table predates `project_id`, `CREATE TABLE IF NOT
 * EXISTS` is a no-op, so that index statement threw "no such column" inside the
 * migration loop and aborted every statement after it — including the ALTER
 * TABLE that would have added the very column the index wanted. The migration
 * therefore failed the same way on every launch, forever, and silently: the
 * database kept `tasks.project_id` but never gained `chunks.project_id`,
 * `builder_sessions.engine`, or `code_projects`.
 *
 * These tests build the legacy shape by hand and assert the upgrade completes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { applyMigrations } from '../main/db/schema';

/** A `chunks` table exactly as it shipped before project scope existed. */
function createLegacyDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status      TEXT NOT NULL DEFAULT 'active',
      color       TEXT NOT NULL DEFAULT '',
      icon        TEXT NOT NULL DEFAULT 'folder',
      deadline    INTEGER,
      repo_path   TEXT,
      notebook_id TEXT,
      sort_order  REAL NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE chunks (
      id          TEXT PRIMARY KEY,
      file_path   TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content     TEXT NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
  return db;
}

const columnsOf = (db: Database.Database, table: string): string[] =>
  db
    .prepare<[], { name: string }>(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => c.name);

const hasTable = (db: Database.Database, name: string): boolean =>
  Boolean(
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(name),
  );

describe('applyMigrations on a pre-project-scope database', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createLegacyDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it('completes instead of deadlocking on the missing chunks column', () => {
    // Before the fix this threw "no such column: project_id" and left the
    // database permanently half-migrated.
    expect(() => applyMigrations(db)).not.toThrow();

    expect(columnsOf(db, 'chunks')).toContain('project_id');
    expect(hasTable(db, 'code_projects')).toBe(true);
  });

  it('back-fills every later column that the aborted loop had skipped', () => {
    applyMigrations(db);

    // Each of these sat AFTER the throwing statement, so all of them were
    // silently skipped on every launch until the deadlock was fixed.
    expect(columnsOf(db, 'chunks')).toContain('code_project_id');
    expect(columnsOf(db, 'builder_sessions')).toContain('engine');
    expect(columnsOf(db, 'notebooks')).toContain('project_id');
    expect(columnsOf(db, 'pages')).toContain('project_id');
    expect(columnsOf(db, 'research_runs')).toContain('project_id');
  });

  it('creates the indexes that used to be declared inline', () => {
    applyMigrations(db);

    const indexes = db
      .prepare<[], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'",
      )
      .all()
      .map((row) => row.name);

    expect(indexes).toContain('idx_chunks_file');
    expect(indexes).toContain('idx_chunks_project');
    expect(indexes).toContain('idx_code_projects_project');
  });

  it('is idempotent across repeated launches', () => {
    applyMigrations(db);
    const first = columnsOf(db, 'chunks');
    expect(() => applyMigrations(db)).not.toThrow();
    expect(columnsOf(db, 'chunks')).toEqual(first);
  });

  it('still migrates a fresh database from nothing', () => {
    const fresh = new Database(':memory:');
    try {
      expect(() => applyMigrations(fresh)).not.toThrow();
      expect(hasTable(fresh, 'code_projects')).toBe(true);
      expect(columnsOf(fresh, 'chunks')).toContain('code_project_id');
    } finally {
      fresh.close();
    }
  });
});
