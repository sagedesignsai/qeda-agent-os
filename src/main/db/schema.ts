/**
 * db/schema.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * DDL for the local SQLite database.
 *
 * Tables
 * ------
 * sessions      – chat threads (one per conversation)
 * messages      – persisted AI SDK UIMessage rows per session
 * embeddings    – document chunks + sqlite-vec float32 vectors for RAG (vec0)
 * chunks        – companion plain table storing chunk text & metadata
 *
 * Vellum knowledge platform:
 * notebooks     – top-level knowledge containers
 * pages         – nested documents inside notebooks (parent_page = tree)
 * blocks        – typed block rows belonging to a page (block editor model)
 * tags          – normalized tag vocabulary
 * page_tags     – many-to-many page ↔ tag
 * backlinks     – resolved doc:<id> / wiki:[[Page]] edges between pages
 * page_versions – immutable markdown snapshots for version history
 * research_runs – one deep-research investigation (per page or notebook)
 * research_sources – discovered sources (URLs, pages, files) per run
 * research_evidence – extracted evidence snippets tied to a source
 * pages_fts     – FTS5 full-text index over page titles + markdown
 *
 * All statements are idempotent. `CREATE_MIGRATIONS` + `MIGRATION_STATEMENTS`
 * expose the DDL as data so tests can apply it to an in-memory database
 * without booting Electron.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const CREATE_SESSIONS = `
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL DEFAULT 'New Chat',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
`;

export const CREATE_MESSAGES = `
CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
  parts_json TEXT NOT NULL,   -- JSON-serialised UIMessage.parts array
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
`;

/**
 * sqlite-vec virtual table. Vectors are stored as raw float32 blobs.
 * Dimension = 1536 (OpenAI text-embedding-3-small / most common).
 * Override via EMBEDDING_DIM env var if you use a different model.
 */
export const CREATE_EMBEDDINGS = (dim: number) => `
CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vec0(
  chunk_id   TEXT PRIMARY KEY,
  embedding  float[${dim}]
);
`;

/**
 * Companion plain table that stores the chunk text & metadata.
 */
export const CREATE_CHUNKS = `
CREATE TABLE IF NOT EXISTS chunks (
  id          TEXT PRIMARY KEY,
  file_path   TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content     TEXT NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_path);
`;

// ─── Knowledge workspace ──────────────────────────────────────────────────────

export const CREATE_NOTEBOOKS = `
CREATE TABLE IF NOT EXISTS notebooks (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon        TEXT NOT NULL DEFAULT 'notebook',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
`;

export const CREATE_PAGES = `
CREATE TABLE IF NOT EXISTS pages (
  id           TEXT PRIMARY KEY,
  notebook_id  TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  parent_page  TEXT REFERENCES pages(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  sort_order   REAL NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_pages_notebook ON pages(notebook_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_pages_parent   ON pages(parent_page);
`;

export const CREATE_BLOCKS = `
CREATE TABLE IF NOT EXISTS blocks (
  id          TEXT PRIMARY KEY,
  page_id     TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  text        TEXT NOT NULL DEFAULT '',
  position    INTEGER NOT NULL,
  checked     INTEGER,             -- todo checked state (NULL for other types)
  language    TEXT,                -- code fence language (NULL otherwise)
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_blocks_page ON blocks(page_id, position);
`;

export const CREATE_TAGS = `
CREATE TABLE IF NOT EXISTS tags (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE
);
`;

export const CREATE_PAGE_TAGS = `
CREATE TABLE IF NOT EXISTS page_tags (
  page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (page_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_page_tags_tag ON page_tags(tag_id);
`;

export const CREATE_BACKLINKS = `
CREATE TABLE IF NOT EXISTS backlinks (
  from_page TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  to_page   TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  PRIMARY KEY (from_page, to_page)
);
CREATE INDEX IF NOT EXISTS idx_backlinks_to ON backlinks(to_page);
`;

export const CREATE_PAGE_VERSIONS = `
CREATE TABLE IF NOT EXISTS page_versions (
  id          TEXT PRIMARY KEY,
  page_id     TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  markdown    TEXT NOT NULL,
  origin      TEXT NOT NULL DEFAULT 'manual',   -- manual | ai | restore
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_page_versions ON page_versions(page_id, created_at);
`;

// ─── Deep research ────────────────────────────────────────────────────────────

export const CREATE_RESEARCH_RUNS = `
CREATE TABLE IF NOT EXISTS research_runs (
  id          TEXT PRIMARY KEY,
  session_id  TEXT,             -- chat session that produced it (nullable)
  page_id     TEXT REFERENCES pages(id) ON DELETE SET NULL,
  notebook_id TEXT REFERENCES notebooks(id) ON DELETE SET NULL,
  question    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'running'
              CHECK(status IN ('running','completed','failed','cancelled')),
  report      TEXT NOT NULL DEFAULT '',   -- final synthesized markdown
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_research_runs_page     ON research_runs(page_id);
CREATE INDEX IF NOT EXISTS idx_research_runs_notebook ON research_runs(notebook_id);
`;

export const CREATE_RESEARCH_SOURCES = `
CREATE TABLE IF NOT EXISTS research_sources (
  id         TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
  url        TEXT,
  page_id    TEXT REFERENCES pages(id) ON DELETE SET NULL,
  title      TEXT NOT NULL DEFAULT '',
  kind       TEXT NOT NULL DEFAULT 'web' CHECK(kind IN ('web','page','file')),
  snippet    TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_research_sources_run ON research_sources(run_id);
`;

export const CREATE_RESEARCH_EVIDENCE = `
CREATE TABLE IF NOT EXISTS research_evidence (
  id         TEXT PRIMARY KEY,
  source_id  TEXT NOT NULL REFERENCES research_sources(id) ON DELETE CASCADE,
  run_id     TEXT NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
  quote      TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_research_evidence_run    ON research_evidence(run_id);
CREATE INDEX IF NOT EXISTS idx_research_evidence_source ON research_evidence(source_id);
`;

// ─── Agentic terminal ─────────────────────────────────────────────────────────

/**
 * terminal_sessions – one agent-driven shell session per row.
 * A session maps to a goal-conversation: the user types a goal, the agent
 * plans and executes commands, and all of that lives in one session.
 */
export const CREATE_TERMINAL_SESSIONS = `
CREATE TABLE IF NOT EXISTS terminal_sessions (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL DEFAULT 'New Session',
  goal       TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'idle'
             CHECK(status IN ('idle','running','done','error')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
`;

/**
 * terminal_blocks – each command-output pair produced by the agent.
 *
 * status flow: pending → running → done | error | skipped
 *   pending  = approval requested, awaiting user
 *   running  = command executing
 *   done     = completed with exit_code
 *   error    = exited non-zero or threw
 *   skipped  = user rejected the command
 */
export const CREATE_TERMINAL_BLOCKS = `
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
  duration_ms   INTEGER,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_terminal_blocks_session ON terminal_blocks(session_id, position);
`;

// ─── ADHD task manager ────────────────────────────────────────────────────────

/**
 * tasks – one row per task in the focus manager.
 *
 * status flow: backlog → active → done (can revert to backlog)
 */
export const CREATE_TASKS = `
CREATE TABLE IF NOT EXISTS tasks (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'backlog'
                 CHECK(status IN ('backlog','active','done')),
  priority       INTEGER NOT NULL DEFAULT 2   -- 1=high 2=medium 3=low
                 CHECK(priority IN (1,2,3)),
  due_at         INTEGER,                      -- unix epoch, nullable
  pomodoro_count INTEGER NOT NULL DEFAULT 0,   -- completed pomodoros
  position       REAL    NOT NULL DEFAULT 0,   -- for manual ordering
  created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, position);
`;

// ─── Full-text search ─────────────────────────────────────────────────────────

/**
 * FTS5 index over page titles and full markdown bodies. `content=''` marks an
 * external-content-less index the store keeps in sync manually inside the same
 * transaction as the row writes (simplest reliable strategy here).
 */
export const CREATE_PAGES_FTS = `
CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
  page_id UNINDEXED,
  title,
  body,
  tokenize = 'porter unicode61'
);
`;

/** DDL applied in order; every statement must be idempotent. */
export const MIGRATION_STATEMENTS: readonly string[] = [
  CREATE_SESSIONS,
  CREATE_MESSAGES,
  CREATE_CHUNKS,
  CREATE_NOTEBOOKS,
  CREATE_PAGES,
  CREATE_BLOCKS,
  CREATE_TAGS,
  CREATE_PAGE_TAGS,
  CREATE_BACKLINKS,
  CREATE_PAGE_VERSIONS,
  CREATE_RESEARCH_RUNS,
  CREATE_RESEARCH_SOURCES,
  CREATE_RESEARCH_EVIDENCE,
  CREATE_PAGES_FTS,
  CREATE_TERMINAL_SESSIONS,
  CREATE_TERMINAL_BLOCKS,
  CREATE_TASKS,
];

// ─── Data migrations (idempotent) ─────────────────────────────────────────────

/**
 * Rename the workspace RAG pseudo-URI scheme after the Docugent → Vellum
 * rebrand. `chunks.file_path` is persisted data (see tools/workspace-rag.ts),
 * so a code-only rename would orphan every previously indexed page: the
 * cleanup query deletes by exact path, and search filters by prefix, so stale
 * `docugent-page://` rows would never be re-indexed or matched again.
 *
 * Safe to run on every launch — the WHERE clause matches nothing once applied.
 */
export const MIGRATE_RAG_URI_SCHEME = `
UPDATE chunks
   SET file_path = 'vellum-page://' || substr(file_path, length('docugent-page://') + 1)
 WHERE file_path LIKE 'docugent-page://%';
`;

/**
 * Statements that rewrite existing rows. Kept separate from
 * MIGRATION_STATEMENTS (which is DDL and may be applied by tests against a
 * fresh in-memory database) because these only matter for databases written by
 * a previous build. Like the DDL, every statement must be idempotent.
 */
export const DATA_MIGRATIONS: readonly string[] = [MIGRATE_RAG_URI_SCHEME];

/** Bookkeeping table for future schema versions. */
export const CREATE_MIGRATIONS = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL DEFAULT (unixepoch())
);
`;

/**
 * Apply every migration to the given database handle.
 *
 * The sqlite-vec `embeddings` table is intentionally NOT created here: it is a
 * native virtual table created by db/client.ts after the extension loads, and
 * tests run without the extension.
 */
export function applyMigrations(db: {
  exec: (sql: string) => unknown;
  prepare?: (sql: string) => { all: () => Array<{ name: string }> };
}): void {
  db.exec(CREATE_MIGRATIONS);
  for (const statement of MIGRATION_STATEMENTS) {
    db.exec(statement);
  }
  for (const statement of DATA_MIGRATIONS) {
    db.exec(statement);
  }

  // Ensure optional columns exist if migrating an existing database
  if (typeof db.prepare === 'function') {
    try {
      const cols = db.prepare('PRAGMA table_info(terminal_blocks)').all().map((c) => c.name);
      if (!cols.includes('duration_ms')) {
        db.exec('ALTER TABLE terminal_blocks ADD COLUMN duration_ms INTEGER');
      }
    } catch {
      // Table might not exist yet or running in raw exec mock
    }
  }
}
