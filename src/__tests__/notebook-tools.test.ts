/**
 * __tests__/notebook-tools.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The tree builder behind the agent's notebook-generation tools. Runs against
 * an in-memory SQLite database (like workspace-store.test.ts) — the agent tool
 * wrapper is a thin shell over `createPagesForNotebook`, which is what these
 * tests pin down.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { applyMigrations } from '../main/db/schema';
import { useTestDatabase } from '../main/db/client';
import {
  createNotebook,
  createPagesForNotebook,
  listPages,
} from '../main/db/workspace';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  useTestDatabase(db);
});

afterEach(() => {
  db.close();
});

describe('createPagesForNotebook', () => {
  it('builds an overview with nested section pages in one call', () => {
    const notebook = createNotebook('Godot 2.5D');

    const created = createPagesForNotebook(notebook.id, [
      {
        title: 'Overview',
        markdown: '# Overview\n\nSee [[Getting Started]] and [[Sources]].',
      },
      {
        title: 'Getting Started',
        markdown:
          '# Getting Started\n\nInstall Godot.\n\n```gdscript\nextends Node2D\n```',
        parentTitle: 'Overview',
      },
      {
        title: 'Sources',
        markdown: '# Sources\n\n- [Godot docs](https://docs.godotengine.org)',
        parentTitle: 'Overview',
      },
    ]);

    expect(created).toHaveLength(3);

    const pages = listPages(notebook.id);
    const overview = pages.find((p) => p.title === 'Overview')!;
    const gettingStarted = pages.find((p) => p.title === 'Getting Started')!;
    const sources = pages.find((p) => p.title === 'Sources')!;

    // Both section pages nest under the overview; the overview is top-level.
    expect(gettingStarted.parent_page).toBe(overview.id);
    expect(sources.parent_page).toBe(overview.id);
    expect(overview.parent_page).toBeNull();
  });

  it('preserves code fences as code blocks with their language', () => {
    const notebook = createNotebook('Code');
    const [overview, section] = createPagesForNotebook(notebook.id, [
      { title: 'Overview', markdown: '# Overview' },
      {
        title: 'Usage',
        markdown: 'Install it.\n\n```bash\nnpm install foo\n```',
        parentTitle: 'Overview',
      },
    ]);
    expect(overview).toBeDefined();

    const body = db
      .prepare<
        [string],
        { type: string; text: string; language: string | null }
      >(
        'SELECT type, text, language FROM blocks WHERE page_id = ? ORDER BY position',
      )
      .all(section.pageId);

    const code = body.find((b) => b.type === 'code');
    expect(code?.text).toContain('npm install foo');
    expect(code?.language).toBe('bash');
  });

  it('creates a backlink from an inline [[link]] on the overview to a section', () => {
    const notebook = createNotebook('Backlinks');
    const [index, chapter] = createPagesForNotebook(notebook.id, [
      { title: 'Index', markdown: '# Index\n\nRead [[Chapter One]].' },
      { title: 'Chapter One', markdown: '# Chapter One', parentTitle: 'Index' },
    ]);

    const edges = db
      .prepare<[string], { from_page: string; to_page: string }>(
        'SELECT from_page, to_page FROM backlinks WHERE to_page = ?',
      )
      .all(chapter.pageId);

    expect(edges.some((e) => e.from_page === index.pageId)).toBe(true);
  });

  it('can nest against a page that already exists in the notebook', () => {
    const notebook = createNotebook('Existing');
    const [index] = createPagesForNotebook(notebook.id, [
      { title: 'Index', markdown: '# Index' },
    ]);

    const created = createPagesForNotebook(notebook.id, [
      { title: 'Later', markdown: '# Later', parentTitle: 'Index' },
    ]);
    expect(created[0].parentPageId).toBe(index.pageId);
  });

  it('throws when the notebook does not exist', () => {
    expect(() =>
      createPagesForNotebook('does-not-exist', [{ title: 'A', markdown: 'A' }]),
    ).toThrow(/No notebook/);
  });
});
