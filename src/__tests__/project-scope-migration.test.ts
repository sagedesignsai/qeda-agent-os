/**
 * __tests__/project-scope-migration.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 0 of the Correspondence system: the knowledge layer learns which
 * project it belongs to.
 *
 * `notebooks.project_id` / `pages.project_id` / `research_runs.project_id` are
 * denormalised copies of the project link, so the failure mode that matters is
 * not "the column is missing" — `CREATE TABLE IF NOT EXISTS` silently does
 * nothing to a table that already exists, and adding a column to the DDL alone
 * leaves every existing row NULL forever. That is exactly how a notebook with
 * 100+ blocks ends up looking orphaned while its project page shows nothing.
 *
 * So the first suite builds the OLD table shapes by hand, inserts rows the old
 * build would have written, and then runs `applyMigrations` against them. That
 * is the only test shape that catches an unbackfilled column.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { useTestDatabase } from '../main/db/client';
import { applyMigrations } from '../main/db/schema';
import {
  createNotebook,
  createPage,
  getNotebook,
  getPage,
  listPages,
  updateNotebook,
} from '../main/db/workspace';
import { createResearchRun } from '../main/db/research';
import {
  createProject,
  getProject,
  updateProject,
} from '../main/db/projects';

/**
 * The pre-Phase-0 shape of the tables that gain a `project_id`, plus the
 * `projects` row shape the migration reads. Deliberately without the new
 * columns — that is the whole point.
 */
const LEGACY_DDL = `
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
  sort_order  REAL    NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE notebooks (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon        TEXT NOT NULL DEFAULT 'notebook',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE pages (
  id          TEXT PRIMARY KEY,
  notebook_id TEXT NOT NULL,
  parent_page TEXT,
  title       TEXT NOT NULL,
  sort_order  REAL NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE research_runs (
  id          TEXT PRIMARY KEY,
  session_id  TEXT,
  page_id     TEXT,
  notebook_id TEXT,
  question    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'running',
  report      TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
`;

/** A database as an earlier build left it: linked project, unscoped rows. */
function makeLegacyDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(LEGACY_DDL);

  db.exec(`
    INSERT INTO projects (id, name, notebook_id)
    VALUES ('proj-dispute', 'Employment and Legal References', 'nb-dispute');

    INSERT INTO notebooks (id, title) VALUES ('nb-dispute', 'Stakeholders');
    INSERT INTO notebooks (id, title) VALUES ('nb-loose', 'Scratch notes');

    INSERT INTO pages (id, notebook_id, title) VALUES ('pg-1', 'nb-dispute', 'Stakeholders & Plan');
    INSERT INTO pages (id, notebook_id, title) VALUES ('pg-loose', 'nb-loose', 'Unsorted idea');

    INSERT INTO research_runs (id, notebook_id, page_id, question, status)
    VALUES ('run-1', 'nb-dispute', 'pg-1', 'Contact details', 'completed');
    INSERT INTO research_runs (id, page_id, question, status)
    VALUES ('run-page-only', 'pg-1', 'Follow-up', 'completed');
    INSERT INTO research_runs (id, notebook_id, question, status)
    VALUES ('run-loose', 'nb-loose', 'Something else', 'completed');
  `);

  return db;
}

/** Column names on a table, via the same pragma the migration guards use. */
function columnsOf(db: Database.Database, table: string): string[] {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => (c as { name: string }).name);
}

describe('project scope migration on a database from an earlier build', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeLegacyDb();
    // The store functions read through `getDb()`, so the migrated legacy handle
    // has to be the one under test — reading the real app database here would
    // prove nothing about the upgrade.
    useTestDatabase(db);
  });

  afterEach(() => {
    useTestDatabase(null as unknown as Database.Database);
    db.close();
  });

  it('adds the column to existing tables instead of only to fresh ones', () => {
    expect(columnsOf(db, 'pages')).not.toContain('project_id');

    applyMigrations(db);

    expect(columnsOf(db, 'notebooks')).toContain('project_id');
    expect(columnsOf(db, 'pages')).toContain('project_id');
    expect(columnsOf(db, 'research_runs')).toContain('project_id');
  });

  it('adopts the linked notebook, its pages and its research runs', () => {
    applyMigrations(db);

    // Read through the stores, not raw SQL: after an upgrade the app must be
    // able to load its own rows, not merely have them in a table.
    expect(getNotebook('nb-dispute')?.project_id).toBe('proj-dispute');

    // The page the project's own notebook already contained is now readable as
    // project knowledge with a single indexed lookup.
    expect(getPage('pg-1')?.project_id).toBe('proj-dispute');

    // A run that only knew its page inherits the project through the page.
    const runByPage = db
      .prepare(`SELECT project_id FROM research_runs WHERE id = 'run-page-only'`)
      .get() as { project_id: string | null };
    expect(runByPage.project_id).toBe('proj-dispute');
  });

  it('leaves knowledge that belongs to no project unscoped', () => {
    applyMigrations(db);

    expect(getNotebook('nb-loose')?.project_id).toBeNull();
    expect(getPage('pg-loose')?.project_id).toBeNull();
  });

  it('leaves the projects table itself alone', () => {
    applyMigrations(db);

    // The migration fills the knowledge side only. Rewriting `notebook_id` here
    // would turn a derived copy into a second writer of the same fact.
    expect(getProject('proj-dispute')?.notebook_id).toBe('nb-dispute');
  });

  it('converges when applied twice', () => {
    applyMigrations(db);
    const first = getPage('pg-1')?.project_id;

    expect(() => applyMigrations(db)).not.toThrow();

    expect(getPage('pg-1')?.project_id).toBe(first);
  });
});

describe('project scope write paths', () => {
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

  it('inherits the project on new pages and research runs', () => {
    const project = createProject({ name: 'Dispute' });
    const notebook = createNotebook('Stakeholders', '', 'notebook', project.id);

    const page = createPage(notebook.id, 'Contact plan');
    expect(page.project_id).toBe(project.id);

    const run = createResearchRun({ question: 'Who to write to', pageId: page.id });
    expect(run.project_id).toBe(project.id);
  });

  it('leaves pages unscoped when their notebook has no project', () => {
    const notebook = createNotebook('Loose');
    expect(createPage(notebook.id, 'Idea').project_id).toBeNull();
  });

  it('moves a notebook\u2019s contents when it is re-homed', () => {
    const project = createProject({ name: 'Dispute' });
    const notebook = createNotebook('Stakeholders');
    const page = createPage(notebook.id, 'Contact plan');
    expect(page.project_id).toBeNull();

    updateNotebook(notebook.id, { project_id: project.id });
    expect(listPages(notebook.id).every((p) => p.project_id === project.id)).toBe(
      true,
    );

    updateNotebook(notebook.id, { project_id: null });
    expect(getPage(page.id)?.project_id).toBeNull();
  });

  it('adopts an existing notebook when a project links it', () => {
    const notebook = createNotebook('Stakeholders');
    const page = createPage(notebook.id, 'Contact plan');

    // The repair path for a project whose notebook was never attached: linking
    // it in the project dialog adopts what is already inside.
    const project = createProject({ name: 'Dispute', notebook_id: notebook.id });

    expect(getNotebook(notebook.id)?.project_id).toBe(project.id);
    expect(getPage(page.id)?.project_id).toBe(project.id);
  });

  it('releases the previous notebook when a project is re-pointed', () => {
    const first = createNotebook('First');
    const firstPage = createPage(first.id, 'Old content');
    const second = createNotebook('Second');
    const secondPage = createPage(second.id, 'New content');

    const project = createProject({ name: 'Dispute', notebook_id: first.id });
    updateProject(project.id, { notebook_id: second.id });

    expect(getNotebook(first.id)?.project_id).toBeNull();
    expect(getPage(firstPage.id)?.project_id).toBeNull();
    expect(getNotebook(second.id)?.project_id).toBe(project.id);
    expect(getPage(secondPage.id)?.project_id).toBe(project.id);
  });

  it('clears the scope when a project drops its notebook', () => {
    const notebook = createNotebook('Stakeholders');
    const page = createPage(notebook.id, 'Contact plan');
    const project = createProject({ name: 'Dispute', notebook_id: notebook.id });

    updateProject(project.id, { notebook_id: null });

    expect(getProject(project.id)?.notebook_id).toBeNull();
    expect(getNotebook(notebook.id)?.project_id).toBeNull();
    expect(getPage(page.id)?.project_id).toBeNull();
  });
});
