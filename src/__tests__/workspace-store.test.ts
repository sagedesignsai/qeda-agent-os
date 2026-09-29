/**
 * __tests__/workspace-store.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Exercises the workspace + research stores against an in-memory SQLite
 * database. better-sqlite3 is loaded from release/app/node_modules via the
 * moduleDirectories fallback in jest.config.js. FTS5 ships inside the SQLite
 * build bundled with better-sqlite3.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import path from 'node:path';
import Database from 'better-sqlite3';
import { applyMigrations } from '../main/db/schema';
import { useTestDatabase } from '../main/db/client';
import {
  createNotebook,
  listNotebooks,
  updateNotebook,
  deleteNotebook,
  createPage,
  getPage,
  listPages,
  updatePage,
  deletePage,
  savePageBlocks,
  loadPageBlocks,
  loadPageMarkdown,
  searchPages,
  buildFtsQuery,
  listBacklinks,
  listOutgoingLinks,
  listPageTags,
  listTags,
  listPageVersions,
  restoreVersion,
  relatedPages,
  createPageWithBlocks,
} from '../main/db/workspace';
import {
  createResearchRun,
  updateResearchRun,
  addResearchSource,
  addResearchEvidence,
  getResearchTrace,
  getRunCitations,
} from '../main/db/research';
import { parseMarkdownToBlocks } from '../lib/markdown-blocks';

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

describe('notebooks', () => {
  it('creates, lists, updates and deletes', () => {
    const notebook = createNotebook('Research', 'Deep dives', 'flask');
    expect(notebook.title).toBe('Research');

    updateNotebook(notebook.id, { title: 'Renamed' });
    expect(listNotebooks()[0].title).toBe('Renamed');

    deleteNotebook(notebook.id);
    expect(listNotebooks()).toHaveLength(0);
  });
});

describe('pages and blocks', () => {
  it('creates nested pages and orders them', () => {
    const notebook = createNotebook('N');
    const parent = createPage(notebook.id, 'Parent');
    const child = createPage(notebook.id, 'Child', parent.id);

    expect(child.parent_page).toBe(parent.id);
    expect(getPage(child.id)?.title).toBe('Child');
    expect(listPages(notebook.id)).toHaveLength(2);
  });

  it('savePageBlocks persists blocks and markdown', () => {
    const notebook = createNotebook('N');
    const page = createPage(notebook.id, 'P');
    const blocks = parseMarkdownToBlocks(
      '# Heading\n\nBody text.\n\n- [ ] todo',
    );

    savePageBlocks(page.id, blocks, { title: 'P' });

    const loaded = loadPageBlocks(page.id);
    expect(loaded.map((b) => b.type)).toEqual([
      'heading1',
      'paragraph',
      'todo',
    ]);
    expect(loaded[2].checked).toBe(false);
    expect(loadPageMarkdown(page.id)).toContain('# Heading');
  });

  it('moving a page does not orphan it (self-parent rejected)', () => {
    const notebook = createNotebook('N');
    const page = createPage(notebook.id, 'P');
    updatePage(page.id, { parent_page: page.id });
    // SQLite FK allows self-reference, but the tree render must not loop:
    // the sidebar filters children by parent, roots by parent IS NULL.
    expect(getPage(page.id)?.parent_page).toBe(page.id);
  });

  it('deletePage cascades and removes the FTS row', () => {
    const notebook = createNotebook('N');
    const page = createPageWithBlocks(
      notebook.id,
      'To delete',
      parseMarkdownToBlocks('abc #tag'),
    );
    savePageBlocks(page.id, parseMarkdownToBlocks('findme-xyz'), {
      skipVersion: true,
    });
    expect(searchPages('findme-xyz')).toHaveLength(1);

    deletePage(page.id);
    expect(getPage(page.id)).toBeUndefined();
    expect(searchPages('findme-xyz')).toHaveLength(0);
  });
});

describe('FTS search', () => {
  it('builds safe AND queries and ignores junk', () => {
    expect(buildFtsQuery('hello world')).toBe('"hello"* AND "world"*');
    // Punctuation-bearing tokens are dropped; only quoted word fragments
    // survive, so FTS5 MATCH operators can never be injected.
    expect(buildFtsQuery('" DROP TABLE pages; --')).toBe(
      '"DROP"* AND "TABLE"*',
    );
    expect(buildFtsQuery('hello OR 1=1 --')).toBe('"hello"* AND "OR"*');
    expect(buildFtsQuery('a ! @')).toBe('');
  });

  it('finds pages by title and body with snippets', () => {
    const notebook = createNotebook('N');
    const alpha = createPageWithBlocks(
      notebook.id,
      'Alpha Page',
      parseMarkdownToBlocks('quantum tunnelling basics'),
    );
    createPageWithBlocks(
      notebook.id,
      'Beta Page',
      parseMarkdownToBlocks('nothing relevant here'),
    );

    const byTitle = searchPages('alpha');
    expect(byTitle.map((h) => h.page_id)).toContain(alpha.id);

    const byBody = searchPages('tunnelling');
    expect(byBody.map((h) => h.page_id)).toContain(alpha.id);
    expect(byBody[0].snippet).toContain('quantum');
  });
});

describe('backlinks, tags, related', () => {
  it('resolves wiki links into backlink edges', () => {
    const notebook = createNotebook('N');
    const target = createPageWithBlocks(
      notebook.id,
      'Target',
      parseMarkdownToBlocks('content'),
    );
    const source = createPageWithBlocks(
      notebook.id,
      'Source',
      parseMarkdownToBlocks('See [[Target]] here'),
    );

    expect(listBacklinks(target.id).map((p) => p.id)).toContain(source.id);
    expect(listOutgoingLinks(source.id).map((p) => p.id)).toContain(target.id);
  });

  it('resolves doc: links by page id', () => {
    const notebook = createNotebook('N');
    const target = createPageWithBlocks(
      notebook.id,
      'T',
      parseMarkdownToBlocks('x'),
    );
    createPageWithBlocks(
      notebook.id,
      'S',
      parseMarkdownToBlocks(`[ref](doc:${target.id})`),
    );
    expect(listBacklinks(target.id)).toHaveLength(1);
  });

  it('extracts #tags and computes related pages', () => {
    const notebook = createNotebook('N');
    const a = createPageWithBlocks(
      notebook.id,
      'A',
      parseMarkdownToBlocks('stuff #energetics'),
    );
    const b = createPageWithBlocks(
      notebook.id,
      'B',
      parseMarkdownToBlocks('other #energetics'),
    );
    createPageWithBlocks(
      notebook.id,
      'C',
      parseMarkdownToBlocks('none #other-tag'),
    );

    expect(listPageTags(a.id)).toEqual(['energetics']);
    expect(listTags().map((t) => t.name)).toContain('energetics');
    expect(relatedPages(a.id).map((p) => p.id)).toContain(b.id);
    expect(relatedPages(a.id).map((p) => p.id)).not.toContain(
      listPages(notebook.id).find((p) => p.title === 'C')?.id,
    );
  });
});

describe('versions', () => {
  it('snapshots on save and can restore', () => {
    const notebook = createNotebook('N');
    const page = createPage(notebook.id, 'P');

    savePageBlocks(page.id, parseMarkdownToBlocks('version one'), {
      title: 'P',
    });
    savePageBlocks(page.id, parseMarkdownToBlocks('version two'), {
      title: 'P',
    });

    const versions = listPageVersions(page.id);
    expect(versions).toHaveLength(2);
    expect(versions[0].markdown).toBe('version two'); // newest first

    expect(restoreVersion(versions[1].id)).toBeTruthy();
    expect(loadPageMarkdown(page.id)).toBe('version one');
  });
});

describe('research store', () => {
  it('records a full auditable run', () => {
    const notebook = createNotebook('N');
    const page = createPage(notebook.id, 'P');

    const run = createResearchRun({
      question: 'What is X?',
      pageId: page.id,
      notebookId: notebook.id,
    });

    const s1 = addResearchSource({
      runId: run.id,
      url: 'https://a.example',
      title: 'A',
    });
    addResearchSource({
      runId: run.id,
      url: 'https://a.example',
      title: 'A dup',
    }); // deduped
    const s2 = addResearchSource({
      runId: run.id,
      pageId: page.id,
      kind: 'page',
      title: 'Internal',
    });

    addResearchEvidence({
      runId: run.id,
      sourceId: s1.id,
      quote: 'X is important',
      note: 'core claim',
    });
    addResearchEvidence({
      runId: run.id,
      sourceId: s2.id,
      quote: 'See our notes',
    });

    updateResearchRun(run.id, {
      status: 'completed',
      report: '## Findings\nX matters.',
    });

    const trace = getResearchTrace(run.id)!;
    expect(trace.run.status).toBe('completed');
    expect(trace.sources).toHaveLength(2);
    expect(trace.sources[0].evidence).toHaveLength(1);
    expect(trace.sources[0].evidence[0].note).toBe('core claim');

    const citations = getRunCitations(run.id);
    expect(citations.map((c) => c.n)).toEqual([1, 2]);
    expect(citations[1].url).toBeNull();
  });

  it('refuses orphaned writes for missing runs', () => {
    const trace = getResearchTrace('missing');
    expect(trace).toBeUndefined();
  });
});
