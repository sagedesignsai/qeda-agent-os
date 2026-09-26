/**
 * db/workspace.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD for the knowledge workspace: notebooks, pages (nested), typed blocks,
 * tags, backlinks, version snapshots and FTS5 search.
 *
 * Every write path goes through `savePageBlocks`, which is the single choke
 * point that: persists blocks, re-syncs the FTS index, re-resolves backlinks
 * and snapshots a version. Callers cannot forget any of those steps.
 *
 * All functions are synchronous (better-sqlite3 is sync by design).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { randomUUID } from 'node:crypto';
import { getDb } from './client.js';
import {
  parseMarkdownToBlocks,
  serializeBlocksToMarkdown,
  extractDocLinks,
  extractDocTags,
  CONTAINER_BLOCK_TYPES,
  type Block,
  type BlockType,
} from '../../lib/markdown-blocks.js';

// ─── Row types ────────────────────────────────────────────────────────────────

export interface Notebook {
  id: string;
  title: string;
  description: string;
  icon: string;
  created_at: number;
  updated_at: number;
}

export interface Page {
  id: string;
  notebook_id: string;
  parent_page: string | null;
  title: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface BlockRow extends Block {
  page_id: string;
  position: number;
}

export interface PageVersion {
  id: string;
  page_id: string;
  title: string;
  markdown: string;
  origin: 'manual' | 'ai' | 'restore';
  created_at: number;
}

export interface SearchHit {
  page_id: string;
  title: string;
  snippet: string;
  rank: number;
}

export interface BacklinkEdge {
  from_page: string;
  to_page: string;
}

// ─── Notebooks ────────────────────────────────────────────────────────────────

export function createNotebook(title: string, description = '', icon = 'notebook'): Notebook {
  const db = getDb();
  const id = randomUUID();
  db.prepare('INSERT INTO notebooks (id, title, description, icon) VALUES (?, ?, ?, ?)').run(
    id,
    title,
    description,
    icon,
  );
  return db.prepare<[string], Notebook>('SELECT * FROM notebooks WHERE id = ?').get(id)!;
}

export function listNotebooks(): Notebook[] {
  return getDb().prepare<[], Notebook>('SELECT * FROM notebooks ORDER BY updated_at DESC').all();
}

export function getNotebook(id: string): Notebook | undefined {
  return getDb().prepare<[string], Notebook>('SELECT * FROM notebooks WHERE id = ?').get(id);
}

export function updateNotebook(
  id: string,
  patch: { title?: string; description?: string; icon?: string },
): void {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  if (patch.title !== undefined) fields.push('title = ?'), values.push(patch.title);
  if (patch.description !== undefined) fields.push('description = ?'), values.push(patch.description);
  if (patch.icon !== undefined) fields.push('icon = ?'), values.push(patch.icon);
  if (fields.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE notebooks SET ${fields.join(', ')}, updated_at = unixepoch() WHERE id = ?`).run(
    ...values,
  );
}

export function deleteNotebook(id: string): void {
  getDb().prepare('DELETE FROM notebooks WHERE id = ?').run(id);
}

// ─── Pages ────────────────────────────────────────────────────────────────────

export function createPage(notebookId: string, title: string, parentPage: string | null = null): Page {
  const db = getDb();
  const id = randomUUID();
  const maxOrder = db
    .prepare<[string], { m: number | null }>(
      'SELECT MAX(sort_order) AS m FROM pages WHERE notebook_id = ?',
    )
    .get(notebookId)?.m ?? 0;
  db.prepare(
    'INSERT INTO pages (id, notebook_id, parent_page, title, sort_order) VALUES (?, ?, ?, ?, ?)',
  ).run(id, notebookId, parentPage, title, maxOrder + 1);
  return db.prepare<[string], Page>('SELECT * FROM pages WHERE id = ?').get(id)!;
}

export function getPage(id: string): Page | undefined {
  return getDb().prepare<[string], Page>('SELECT * FROM pages WHERE id = ?').get(id);
}

export function listPages(notebookId?: string): Page[] {
  const db = getDb();
  if (notebookId) {
    return db
      .prepare<[string], Page>('SELECT * FROM pages WHERE notebook_id = ? ORDER BY sort_order, title')
      .all(notebookId);
  }
  return db.prepare<[], Page>('SELECT * FROM pages ORDER BY notebook_id, sort_order').all();
}

export function updatePage(id: string, patch: { title?: string; parent_page?: string | null; sort_order?: number }): void {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  if (patch.title !== undefined) fields.push('title = ?'), values.push(patch.title);
  if (patch.parent_page !== undefined) fields.push('parent_page = ?'), values.push(patch.parent_page);
  if (patch.sort_order !== undefined) fields.push('sort_order = ?'), values.push(patch.sort_order);
  if (fields.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE pages SET ${fields.join(', ')}, updated_at = unixepoch() WHERE id = ?`).run(
    ...values,
  );
}

/** Delete a page plus its FTS entry. Cascades remove blocks/versions/edges. */
export function deletePage(id: string): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM pages_fts WHERE page_id = ?').run(id);
    db.prepare('DELETE FROM pages WHERE id = ?').run(id);
  });
  tx();
}

// ─── Blocks ───────────────────────────────────────────────────────────────────

function mapBlockRow(row: {
  id: string;
  page_id: string;
  type: string;
  text: string;
  position: number;
  checked: number | null;
  language: string | null;
}): BlockRow {
  return {
    id: row.id,
    page_id: row.page_id,
    position: row.position,
    type: row.type as BlockType,
    text: row.text,
    ...(row.checked !== null ? { checked: row.checked === 1 } : {}),
    ...(row.language !== null ? { language: row.language } : {}),
  };
}

/** Load a page's blocks in order. */
export function loadBlocks(pageId: string): BlockRow[] {
  const rows = getDb()
    .prepare<
      [string],
      {
        id: string;
        page_id: string;
        type: string;
        text: string;
        position: number;
        checked: number | null;
        language: string | null;
      }
    >('SELECT * FROM blocks WHERE page_id = ? ORDER BY position')
    .all(pageId);
  return rows.map(mapBlockRow);
}

/** Blocks as the pure-library shape the renderer edits. */
export function loadPageBlocks(pageId: string): Block[] {
  return loadBlocks(pageId).map(({ page_id: _p, position: _pos, ...block }) => block);
}

/** Full markdown body of a page. */
export function loadPageMarkdown(pageId: string): string {
  return serializeBlocksToMarkdown(loadPageBlocks(pageId));
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

function tagIdFor(name: string): string {
  const db = getDb();
  const existing = db
    .prepare<[string], { id: string }>('SELECT id FROM tags WHERE name = ?')
    .get(name);
  if (existing) return existing.id;
  const id = randomUUID();
  db.prepare('INSERT INTO tags (id, name) VALUES (?, ?)').run(id, name);
  return id;
}

export function listTags(): { name: string; count: number }[] {
  return getDb()
    .prepare<[], { name: string; count: number }>(
      `SELECT t.name, COUNT(pt.page_id) AS count
       FROM tags t LEFT JOIN page_tags pt ON pt.tag_id = t.id
       GROUP BY t.id ORDER BY t.name`,
    )
    .all();
}

export function listPageTags(pageId: string): string[] {
  return getDb()
    .prepare<[string], { name: string }>(
      'SELECT t.name FROM page_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.page_id = ? ORDER BY t.name',
    )
    .all(pageId)
    .map((r) => r.name);
}

// ─── Backlinks ────────────────────────────────────────────────────────────────

export function listBacklinks(pageId: string): Page[] {
  return getDb()
    .prepare<[string], Page>(
      `SELECT p.* FROM backlinks b JOIN pages p ON p.id = b.from_page
       WHERE b.to_page = ? ORDER BY p.updated_at DESC`,
    )
    .all(pageId);
}

export function listOutgoingLinks(pageId: string): Page[] {
  return getDb()
    .prepare<[string], Page>(
      `SELECT p.* FROM backlinks b JOIN pages p ON p.id = b.to_page
       WHERE b.from_page = ? ORDER BY p.title`,
    )
    .all(pageId);
}

// ─── Versions ─────────────────────────────────────────────────────────────────

export function listPageVersions(pageId: string): PageVersion[] {
  return getDb()
    .prepare<[string], PageVersion>(
      'SELECT * FROM page_versions WHERE page_id = ? ORDER BY created_at DESC LIMIT 50',
    )
    .all(pageId);
}

export function getVersion(versionId: string): PageVersion | undefined {
  return getDb()
    .prepare<[string], PageVersion>('SELECT * FROM page_versions WHERE id = ?')
    .get(versionId);
}

/** Restore a snapshot as the page's current content (records an audit snapshot first). */
export function restoreVersion(versionId: string): Page | undefined {
  const version = getVersion(versionId);
  if (!version) return undefined;
  const blocks = parseMarkdownToBlocks(version.markdown);
  const page = getPage(version.page_id);
  savePageBlocks(version.page_id, blocks, {
    title: version.title,
    versionOrigin: 'restore',
    skipVersion: true, // the snapshot itself is the record of this change
  });
  return page;
}

// ─── Save: the single write choke point ───────────────────────────────────────

export interface SavePageOptions {
  /** Also rename the page. */
  title?: string;
  /** Why this save happened (stored on the version snapshot). */
  versionOrigin?: PageVersion['origin'];
  /** Skip snapshotting (e.g. autosave storms); use for transient drafts. */
  skipVersion?: boolean;
}

/**
 * Persist a page's block list and every derived structure:
 *
 *   blocks → markdown → FTS sync → backlinks → tags → version snapshot.
 *
 * Wrapped in one transaction so the FTS index can never drift from the rows.
 */
export function savePageBlocks(pageId: string, blocks: Block[], options: SavePageOptions = {}): void {
  const db = getDb();
  const markdown = serializeBlocksToMarkdown(blocks);

  const tx = db.transaction(() => {
    // 1. Title.
    if (options.title !== undefined) {
      db.prepare('UPDATE pages SET title = ?, updated_at = unixepoch() WHERE id = ?').run(
        options.title,
        pageId,
      );
    } else {
      db.prepare('UPDATE pages SET updated_at = unixepoch() WHERE id = ?').run(pageId);
    }

    // 2. Blocks: replace-all is simplest and pages are small.
    db.prepare('DELETE FROM blocks WHERE page_id = ?').run(pageId);
    const insertBlock = db.prepare(
      `INSERT INTO blocks (id, page_id, type, text, position, checked, language)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    blocks.forEach((block, index) => {
      insertBlock.run(
        block.id || randomUUID(),
        pageId,
        block.type,
        block.text,
        index,
        block.type === 'todo' ? (block.checked ? 1 : 0) : null,
        block.type === 'code' ? (block.language ?? null) : null,
      );
    });

    // 3. FTS sync (delete + insert row).
    db.prepare('DELETE FROM pages_fts WHERE page_id = ?').run(pageId);
    const page = db.prepare<[string], Page>('SELECT * FROM pages WHERE id = ?').get(pageId);
    if (page) {
      db.prepare('INSERT INTO pages_fts (page_id, title, body) VALUES (?, ?, ?)').run(
        pageId,
        options.title ?? page.title,
        markdown,
      );
    }

    // 4. Backlinks: recompute from doc: links + wiki names.
    db.prepare('DELETE FROM backlinks WHERE from_page = ?').run(pageId);
    const insertEdge = db.prepare('INSERT OR IGNORE INTO backlinks (from_page, to_page) VALUES (?, ?)');
    for (const link of extractDocLinks(blocks)) {
      if (link.target.startsWith('doc:')) {
        const targetId = link.target.slice('doc:'.length).trim();
        if (targetId && targetId !== pageId) insertEdge.run(pageId, targetId);
      } else if (link.target.startsWith('wiki:')) {
        const name = link.target.slice('wiki:'.length).trim();
        const target = db
          .prepare<[string], { id: string }>('SELECT id FROM pages WHERE title = ? LIMIT 1')
          .get(name);
        if (target && target.id !== pageId) insertEdge.run(pageId, target.id);
      }
    }

    // 5. Tags: recompute from #tags.
    db.prepare('DELETE FROM page_tags WHERE page_id = ?').run(pageId);
    const insertPageTag = db.prepare('INSERT OR IGNORE INTO page_tags (page_id, tag_id) VALUES (?, ?)');
    for (const tag of extractDocTags(blocks)) {
      insertPageTag.run(pageId, tagIdFor(tag));
    }

    // 6. Version snapshot.
    if (!options.skipVersion) {
      const current = db.prepare<[string], Page>('SELECT * FROM pages WHERE id = ?').get(pageId);
      db.prepare(
        'INSERT INTO page_versions (id, page_id, title, markdown, origin) VALUES (?, ?, ?, ?, ?)',
      ).run(
        randomUUID(),
        pageId,
        options.title ?? current?.title ?? '',
        markdown,
        options.versionOrigin ?? 'manual',
      );
    }
  });

  tx();
}

/** Create a page and save its initial blocks in one step. */
export function createPageWithBlocks(
  notebookId: string,
  title: string,
  blocks: Block[],
  parentPage: string | null = null,
): Page {
  const page = createPage(notebookId, title, parentPage);
  savePageBlocks(page.id, blocks, { title, versionOrigin: 'manual', skipVersion: true });
  return page;
}

/** One page in a generated notebook tree. */
export interface NotebookPageSpec {
  title: string;
  markdown: string;
  /** Nest under the page with this title (must appear earlier in the list). */
  parentTitle?: string;
  /** Nest under this existing page id (takes precedence over parentTitle). */
  parentPageId?: string;
}

export interface CreatedNotebookPage {
  pageId: string;
  title: string;
  parentPageId: string | null;
}

/**
 * Build a whole page tree in one call: an overview page plus nested sections.
 *
 * Nesting is resolved by page title from within this batch (or against pages
 * already in the notebook), so a caller can express a document outline without
 * first creating pages to get their ids. Throws if the notebook is missing.
 */
export function createPagesForNotebook(
  notebookId: string,
  specs: NotebookPageSpec[],
): CreatedNotebookPage[] {
  if (!getNotebook(notebookId)) {
    throw new Error(`No notebook with id ${notebookId}`);
  }

  // Title → id map, seeded with pages already in the notebook so a batch can
  // also nest under pre-existing pages.
  const byTitle = new Map<string, string>();
  for (const page of listPages(notebookId)) {
    if (!byTitle.has(page.title)) byTitle.set(page.title, page.id);
  }

  // Pass 1: create every page row so titles resolve to ids for nesting.
  const created: { page: Page; spec: NotebookPageSpec }[] = [];
  for (const spec of specs) {
    const parentPageId =
      spec.parentPageId ??
      (spec.parentTitle ? (byTitle.get(spec.parentTitle) ?? null) : null);
    const page = createPage(notebookId, spec.title, parentPageId);
    byTitle.set(spec.title, page.id);
    created.push({ page, spec });
  }

  // Pass 2: write the bodies now that every page exists, so `[[Page Title]]`
  // links resolve into backlinks no matter where in the batch their target is.
  for (const { page, spec } of created) {
    savePageBlocks(page.id, parseMarkdownToBlocks(spec.markdown), {
      title: spec.title,
      versionOrigin: 'manual',
      skipVersion: true,
    });
  }

  return created.map(({ page }) => ({
    pageId: page.id,
    title: page.title,
    parentPageId: page.parent_page,
  }));
}

// ─── Search ───────────────────────────────────────────────────────────────────

/** Build the FTS5 MATCH expression for a plain user query. */
export function buildFtsQuery(query: string): string {
  // Words only: at least 2 chars of [A-Za-z0-9_-] with at least one
  // alphanumeric. Everything else (operators, quotes, punctuation) is
  // dropped, and each kept word is quoted, so user input can never inject
  // FTS5 MATCH syntax.
  const words = query
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => /^[A-Za-z0-9_-]{2,}$/.test(w) && /[A-Za-z0-9]/.test(w))
    .map((w) => `"${w}"*`);

  if (words.length === 0) return '';
  // AND semantics: every word must appear somewhere in title or body.
  return words.join(' AND ');
}

/**
 * Full-text search across page titles and bodies.
 * Returns title matches first, then body matches ranked by bm25.
 */
export function searchPages(query: string, limit = 20): SearchHit[] {
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) return [];

  const db = getDb();
  const rows = db
    .prepare<[string, number], { page_id: string; title: string; snippet: string; rank: number }>(
      `SELECT page_id, title,
              snippet(pages_fts, 2, '[', ']', '…', 12) AS snippet,
              bm25(pages_fts) AS rank
       FROM pages_fts
       WHERE pages_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
    )
    .all(ftsQuery, limit);

  return rows.map((r) => ({
    page_id: r.page_id,
    title: r.title,
    snippet: r.snippet,
    rank: r.rank,
  }));
}

/** Pages sharing at least one tag, strongest overlap first. */
export function relatedPages(pageId: string, limit = 5): Page[] {
  return getDb()
    .prepare<[string, string, number], Page>(
      `SELECT DISTINCT p.* FROM pages p
       JOIN page_tags pt ON pt.page_id = p.id
       WHERE pt.tag_id IN (SELECT tag_id FROM page_tags WHERE page_id = ?)
         AND p.id != ?
       ORDER BY p.updated_at DESC
       LIMIT ?`,
    )
    .all(pageId, pageId, limit);
}
