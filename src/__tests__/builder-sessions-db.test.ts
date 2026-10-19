/**
 * __tests__/builder-sessions-db.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests persistence and engine metadata ('local' | 'opencode') for the active
 * Builder session.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { useTestDatabase } from '../main/db/client';
import { applyMigrations } from '../main/db/schema';
import {
  saveActiveBuilderSession,
  saveActiveBuilderSessionContext,
  getActiveBuilderSession,
  deleteActiveBuilderSession,
} from '../main/db/builder-sessions';

describe('builder_sessions database persistence', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db);
  });

  afterEach(() => {
    useTestDatabase(null as unknown as Database.Database);
    db.close();
  });

  it('returns null when no active session has been saved', () => {
    expect(getActiveBuilderSession()).toBeNull();
  });

  it('saves and restores an active session with local engine', () => {
    const now = Date.now();
    saveActiveBuilderSession({
      opencode_session_id: 'local-session-123',
      title: 'Local Builder Test',
      repo_directory: '/data/projects/my-app',
      worktree_path: '/tmp/worktree-abc',
      workspace_name: 'my-app',
      branch: 'feature/mcp',
      engine: 'local',
      created_at: now,
    });

    const active = getActiveBuilderSession();
    expect(active).not.toBeNull();
    expect(active?.opencode_session_id).toBe('local-session-123');
    expect(active?.title).toBe('Local Builder Test');
    expect(active?.engine).toBe('local');
    expect(active?.repo_directory).toBe('/data/projects/my-app');
    expect(active?.branch).toBe('feature/mcp');
  });

  it('saves and restores an active session with opencode engine', () => {
    const now = Date.now();
    saveActiveBuilderSession({
      opencode_session_id: 'opencode-session-456',
      title: 'OpenCode Session',
      repo_directory: '/data/projects/legacy-app',
      worktree_path: null,
      workspace_name: 'legacy-app',
      branch: null,
      engine: 'opencode',
      created_at: now,
    });

    const active = getActiveBuilderSession();
    expect(active).not.toBeNull();
    expect(active?.opencode_session_id).toBe('opencode-session-456');
    expect(active?.engine).toBe('opencode');
  });

  it('updates the singleton row when saveActiveBuilderSession is called again', () => {
    saveActiveBuilderSession({
      opencode_session_id: 'first-id',
      title: 'First',
      repo_directory: '/repo',
      worktree_path: null,
      workspace_name: 'test',
      branch: 'main',
      engine: 'opencode',
      created_at: 1000,
    });

    saveActiveBuilderSession({
      opencode_session_id: 'second-id',
      title: 'Second',
      repo_directory: '/repo',
      worktree_path: null,
      workspace_name: 'test',
      branch: 'main',
      engine: 'local',
      created_at: 2000,
    });

    const active = getActiveBuilderSession();
    expect(active?.opencode_session_id).toBe('second-id');
    expect(active?.title).toBe('Second');
    expect(active?.engine).toBe('local');
  });

  it('deletes the active session on deleteActiveBuilderSession', () => {
    saveActiveBuilderSession({
      opencode_session_id: 'temp-session',
      title: 'Temp',
      repo_directory: '/repo',
      worktree_path: null,
      workspace_name: 'test',
      branch: null,
      engine: 'local',
      created_at: Date.now(),
    });

    expect(getActiveBuilderSession()).not.toBeNull();
    deleteActiveBuilderSession();
    expect(getActiveBuilderSession()).toBeNull();
  });

  it('persists the local context without clobbering the other column', () => {
    saveActiveBuilderSession({
      opencode_session_id: 'local-durable',
      title: 'Durable',
      repo_directory: '/repo',
      worktree_path: '/repo/.qeda-worktree',
      workspace_name: 'repo',
      branch: 'main',
      engine: 'local',
      messages_json: '[]',
      events_json: '[]',
      created_at: Date.now(),
    });

    saveActiveBuilderSessionContext({
      messagesJson: '[{"role":"user","content":"add tests"}]',
    });
    let active = getActiveBuilderSession();
    expect(active?.messages_json).toContain('add tests');
    expect(active?.events_json).toBe('[]');

    // eventsJson only: messages must survive the COALESCE.
    saveActiveBuilderSessionContext({
      eventsJson: '[{"type":"status","status":"idle"}]',
    });
    active = getActiveBuilderSession();
    expect(active?.messages_json).toContain('add tests');
    expect(active?.events_json).toContain('idle');

    // A fresh session at the same row must not inherit the old conversation.
    saveActiveBuilderSession({
      opencode_session_id: 'local-2',
      title: 'Second',
      repo_directory: '/repo',
      worktree_path: null,
      workspace_name: 'repo',
      branch: 'main',
      engine: 'local',
      created_at: Date.now(),
    });
    active = getActiveBuilderSession();
    expect(active?.messages_json).toBeNull();
    expect(active?.events_json).toBeNull();
  });

  it('applies the ALTER TABLE back-fill to old tables lacking the engine column', () => {
    // Fresh in-memory DB without running applyMigrations
    const legacyDb = new Database(':memory:');
    // Create the old schema table without engine column
    legacyDb.exec(`
      CREATE TABLE builder_sessions (
        id                  TEXT PRIMARY KEY NOT NULL DEFAULT 'active',
        opencode_session_id TEXT NOT NULL,
        title               TEXT NOT NULL,
        repo_directory      TEXT NOT NULL,
        worktree_path       TEXT,
        workspace_name      TEXT NOT NULL,
        branch              TEXT,
        created_at          INTEGER NOT NULL
      );
      INSERT INTO builder_sessions (id, opencode_session_id, title, repo_directory, workspace_name, created_at)
      VALUES ('active', 'legacy-sess', 'Legacy', '/dir', 'legacy', 12345);
    `);

    // Run applyMigrations on this legacy DB
    applyMigrations(legacyDb);

    useTestDatabase(legacyDb);
    const restored = getActiveBuilderSession();
    expect(restored).not.toBeNull();
    expect(restored?.opencode_session_id).toBe('legacy-sess');
    // Default backfill column value is 'opencode'
    expect(restored?.engine).toBe('opencode');

    legacyDb.close();
  });
});
