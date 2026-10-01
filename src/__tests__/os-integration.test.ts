/**
 * __tests__/os-integration.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deep-link resolution — the pure part of the OS integration. Route mapping
 * must be strict: these URLs arrive from outside the app (browser, jump list,
 * other notes), so anything not matching the known route table is rejected
 * rather than fed to the router. The vellum-page:// branch runs against the
 * real workspace store on the standard in-memory database recipe.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { resolveDeepLinkPath } from '../main/os-integration';
import { applyMigrations } from '../main/db/schema';
import { useTestDatabase } from '../main/db/client';

jest.mock('electron-log', () => ({
  __esModule: true,
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

describe('resolveDeepLinkPath', () => {
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

  it.each([
    ['qeda://chat', '/chat'],
    ['qeda://tasks', '/tasks'],
    ['qeda://projects/proj-1', '/projects/proj-1'],
    // Singular alias: jump-list items are written as `qeda://project/<id>`.
    ['qeda://project/proj-1', '/projects/proj-1'],
    ['qeda://terminal/sess-9', '/terminal/sess-9'],
    ['qeda://workspace', '/workspace'],
  ])('maps %s to %s', (input, expected) => {
    expect(resolveDeepLinkPath(input)).toBe(expected);
  });

  it.each([
    ['not a url at all'],
    ['https://example.com/chat'],
    ['qeda://'],
    ['qeda://unknown-route'],
    ['qeda://chat/<script>'],
  ])('rejects %s', (input) => {
    expect(resolveDeepLinkPath(input)).toBeNull();
  });

  it('cannot be walked out of the app: dot segments are resolved by the URL parser, so traversal stays a known in-app route', () => {
    // WHATWG URL parsing collapses `../../etc` to `/etc` before the resolver
    // sees it — the result is `/chat/etc`, still within the route grammar.
    expect(resolveDeepLinkPath('qeda://chat/../../etc')).toBe('/chat/etc');
  });

  it('resolves vellum-page:// to the page route via the workspace store', () => {
    db.prepare(
      `INSERT INTO notebooks (id, title) VALUES ('nb-1', 'Notebook')`,
    ).run();
    db.prepare(
      `INSERT INTO pages (id, notebook_id, title) VALUES ('page-1', 'nb-1', 'Page')`,
    ).run();

    expect(resolveDeepLinkPath('vellum-page://page-1')).toBe(
      '/workspace/nb-1/page-1',
    );
  });

  it('rejects a vellum-page:// URI whose page no longer exists', () => {
    expect(resolveDeepLinkPath('vellum-page://missing')).toBeNull();
  });
});
