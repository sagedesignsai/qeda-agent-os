/**
 * __tests__/terminal-session-persistence.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for Terminal Session Persistence:
 *   - Session creation with working directory (cwd)
 *   - Auto-session naming: Command + Folder (Branch)
 *   - Session listing and status updates
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { applyMigrations } from '../main/db/schema';
import {
  createTerminalSession,
  getTerminalSession,
  updateTerminalSession,
  listTerminalSessions,
  deleteTerminalSession,
} from '../main/db/terminal';

// Mock the DB client to use an in-memory SQLite database
let inMemoryDb: Database.Database;

jest.mock('../main/db/client', () => ({
  getDb: () => inMemoryDb,
}));

describe('terminal session persistence', () => {
  beforeEach(() => {
    inMemoryDb = new Database(':memory:');
    applyMigrations(inMemoryDb);
  });

  afterEach(() => {
    inMemoryDb.close();
  });

  it('persists a session with cwd and retrieves it correctly', () => {
    const session = createTerminalSession({
      title: 'next dev · frontend (main)',
      goal: 'next dev',
      cwd: '/home/dev/projects/frontend',
    });

    expect(session.id).toBeDefined();
    expect(session.title).toBe('next dev · frontend (main)');
    expect(session.goal).toBe('next dev');
    expect(session.cwd).toBe('/home/dev/projects/frontend');
    expect(session.status).toBe('idle');

    const fetched = getTerminalSession(session.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.title).toBe('next dev · frontend (main)');
    expect(fetched?.cwd).toBe('/home/dev/projects/frontend');
  });

  it('updates session status and cwd during active run', () => {
    const session = createTerminalSession({
      title: 'pnpm dev',
      cwd: '/workspace',
    });

    updateTerminalSession(session.id, {
      status: 'running',
      cwd: '/workspace/packages/app',
    });

    const updated = getTerminalSession(session.id);
    expect(updated?.status).toBe('running');
    expect(updated?.cwd).toBe('/workspace/packages/app');
  });

  it('lists sessions sorted by updated_at descending', () => {
    const s1 = createTerminalSession({ title: 'Session 1' });
    const s2 = createTerminalSession({ title: 'Session 2' });

    // Update s1 to make it newer
    updateTerminalSession(s1.id, { title: 'Session 1 Updated' });

    const list = listTerminalSessions();
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0].id).toBe(s1.id);
  });

  it('persists and updates session environment variables (env JSON)', () => {
    const session = createTerminalSession({
      title: 'Session with env',
      env: JSON.stringify({ PORT: '3000', NODE_ENV: 'development' }),
    });

    const fetched = getTerminalSession(session.id);
    expect(fetched?.env).toBeDefined();
    expect(JSON.parse(fetched!.env!)).toEqual({
      PORT: '3000',
      NODE_ENV: 'development',
    });

    updateTerminalSession(session.id, {
      env: JSON.stringify({
        PORT: '3000',
        NODE_ENV: 'production',
        API_KEY: 'secret-xyz',
      }),
    });

    const updated = getTerminalSession(session.id);
    expect(JSON.parse(updated!.env!)).toEqual({
      PORT: '3000',
      NODE_ENV: 'production',
      API_KEY: 'secret-xyz',
    });
  });

  it('hard-deletes a session cleanly', () => {
    const session = createTerminalSession({ title: 'To Delete' });
    expect(getTerminalSession(session.id)).not.toBeNull();

    deleteTerminalSession(session.id);
    expect(getTerminalSession(session.id)).toBeNull();
  });
});
