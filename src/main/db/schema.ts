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
 * Project scope: `notebooks.project_id` is the knowledge side's copy of the
 * project link, and `pages` / `research_runs` inherit it from their notebook.
 * They are denormalised on purpose — a project reads its own knowledge with one
 * indexed lookup rather than a join that a missing `projects.notebook_id` turns
 * into an empty result.
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
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
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
  project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
  code_project_id TEXT REFERENCES code_projects(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_path);
-- NO INDEX ON project_id HERE. "CREATE TABLE IF NOT EXISTS" is a no-op on a
-- database written before project_id existed, so an inline index on that column
-- in this statement throws "no such column" on exactly those databases --
-- inside the migration loop in applyMigrations, which then aborts before the
-- ALTER TABLE back-fill can add the column. That is a deadlock: the migration
-- can never succeed, so the column is never added.
-- idx_chunks_project is created in applyMigrations, after the back-fill.
`;

// ─── Knowledge workspace ──────────────────────────────────────────────────────

export const CREATE_NOTEBOOKS = `
CREATE TABLE IF NOT EXISTS notebooks (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon        TEXT NOT NULL DEFAULT 'notebook',
  project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
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
  project_id   TEXT REFERENCES projects(id) ON DELETE SET NULL,
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
  project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
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
  cwd        TEXT NOT NULL DEFAULT '',
  env        TEXT NOT NULL DEFAULT '{}',
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
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

// ─── Projects ──────────────────────────────────────────────────────────────────

/**
 * projects – the spine of the productivity system.
 *
 * A project unifies the four things "project" used to mean separately: an
 * outcome with a deadline, the tasks that achieve it, the code repo the work
 * happens in, the docs that describe it, and the conversations about it.
 *
 * Every other table points at it with a nullable `project_id`, so a project is
 * an *optional* lens rather than a mandatory container.
 */
export const CREATE_PROJECTS = `
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK(status IN ('active','paused','done','archived')),
  color       TEXT NOT NULL DEFAULT '',
  icon        TEXT NOT NULL DEFAULT 'folder',
  deadline    INTEGER,                       -- unix epoch, nullable
  repo_path   TEXT,                          -- working dir for terminal sessions
  notebook_id TEXT REFERENCES notebooks(id) ON DELETE SET NULL,
  sort_order  REAL    NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status, sort_order);
`;

/** Multiple codebases may be connected to one outcome-oriented Project. */
export const CREATE_CODE_PROJECTS = `
CREATE TABLE IF NOT EXISTS code_projects (
  id             TEXT PRIMARY KEY,
  project_id     TEXT REFERENCES projects(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  directory      TEXT NOT NULL,
  source         TEXT NOT NULL DEFAULT 'existing'
                 CHECK(source IN ('existing','created','clone')),
  remote_url     TEXT,
  index_status   TEXT NOT NULL DEFAULT 'not-indexed'
                 CHECK(index_status IN ('not-indexed','indexing','ready','error')),
  indexed_files  INTEGER NOT NULL DEFAULT 0,
  indexed_at     INTEGER,
  index_error    TEXT,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(project_id, directory)
);
CREATE INDEX IF NOT EXISTS idx_code_projects_project ON code_projects(project_id, updated_at DESC);
`;

/**
 * The default project for unsorted capture. Deterministic id so the data
 * migration and code can agree without a lookup.
 */ export const INBOX_PROJECT_ID = 'inbox';

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
  estimate_mins  INTEGER,                      -- rough time estimate, nullable
  project_id     TEXT REFERENCES projects(id) ON DELETE SET NULL,
  pomodoro_count INTEGER NOT NULL DEFAULT 0,   -- completed pomodoros
  position       REAL    NOT NULL DEFAULT 0,   -- for manual ordering
  created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, position);
`;

// ─── Focus system: steps, time blocks, focus sessions ────────────────────────

/**
 * task_steps – the checklist produced when a task is broken down.
 * Steps live *inside* a task rather than on the board, so a big task can be
 * broken into calm, actionable pieces without flooding the backlog.
 */
export const CREATE_TASK_STEPS = `
CREATE TABLE IF NOT EXISTS task_steps (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_task_steps_task ON task_steps(task_id, position);
`;

/**
 * task_blocks – a time box on the calendar.
 *
 * A block may be attached to a task (`task_id`) or stand alone with its own
 * `title` (e.g. "Email triage"). status flow: planned → active → done | skipped.
 */
export const CREATE_TASK_BLOCKS = `
CREATE TABLE IF NOT EXISTS task_blocks (
  id         TEXT PRIMARY KEY,
  task_id    TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title      TEXT NOT NULL DEFAULT '',
  start_at   INTEGER NOT NULL,              -- unix epoch seconds
  end_at     INTEGER NOT NULL,              -- unix epoch seconds
  status     TEXT NOT NULL DEFAULT 'planned'
             CHECK(status IN ('planned','active','done','skipped')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_task_blocks_start ON task_blocks(start_at);
CREATE INDEX IF NOT EXISTS idx_task_blocks_task  ON task_blocks(task_id);
`;

/**
 * focus_sessions – one completed (or abandoned) pomodoro/flow phase.
 * Doubles as the raw material for the focus stats strip.
 */
export const CREATE_FOCUS_SESSIONS = `
CREATE TABLE IF NOT EXISTS focus_sessions (
  id          TEXT PRIMARY KEY,
  task_id     TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL DEFAULT 'work' CHECK(kind IN ('work','break')),
  planned_sec INTEGER NOT NULL DEFAULT 0,
  actual_sec  INTEGER NOT NULL DEFAULT 0,
  completed   INTEGER NOT NULL DEFAULT 0,   -- 1 when the phase ran to the end
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_started ON focus_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_task    ON focus_sessions(task_id);
`;

// ─── Gamification & Dopamine System ──────────────────────────────────────────

export const CREATE_GAMIFICATION_STATE = `
CREATE TABLE IF NOT EXISTS gamification_state (
  id              TEXT PRIMARY KEY DEFAULT 'default',
  current_xp      INTEGER NOT NULL DEFAULT 0,
  current_level   INTEGER NOT NULL DEFAULT 1,
  streak_days     INTEGER NOT NULL DEFAULT 0,
  streak_shields  INTEGER NOT NULL DEFAULT 2,
  last_active_day TEXT NOT NULL DEFAULT '',
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
`;

export const CREATE_XP_LEDGER = `
CREATE TABLE IF NOT EXISTS xp_ledger (
  id          TEXT PRIMARY KEY,
  amount      INTEGER NOT NULL,
  source      TEXT NOT NULL,
  entity_id   TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_xp_ledger_created ON xp_ledger(created_at);
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

export const CREATE_DOCUMENTS = `
CREATE TABLE IF NOT EXISTS documents (
  id          TEXT PRIMARY KEY,
  project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  template_id TEXT NOT NULL DEFAULT '',
  data_json   TEXT NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
`;

export const CREATE_STUDIO_TAKES = `
CREATE TABLE IF NOT EXISTS studio_takes (
  id                TEXT PRIMARY KEY,
  project_id        TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  description       TEXT,
  source_type       TEXT NOT NULL DEFAULT 'screen',
  source_name       TEXT,
  duration_ms       INTEGER NOT NULL DEFAULT 0,
  video_path        TEXT NOT NULL,
  audio_path        TEXT,
  mouse_events_path TEXT,
  cuts_json         TEXT,
  zooms_json        TEXT,
  captions_json     TEXT,
  effects_json      TEXT,
  overlays_json     TEXT,
  styling_json      TEXT,
  social_kit_json   TEXT,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_studio_takes_project ON studio_takes(project_id);
CREATE INDEX IF NOT EXISTS idx_studio_takes_created ON studio_takes(created_at DESC);
`;

export const CREATE_SOUNDLAB_SESSIONS = `
CREATE TABLE IF NOT EXISTS soundlab_sessions (
  id              TEXT PRIMARY KEY,
  project_id      TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title           TEXT NOT NULL DEFAULT 'Untitled Session',
  bpm             INTEGER NOT NULL DEFAULT 120,
  key_signature   TEXT NOT NULL DEFAULT 'C',
  target_band     TEXT NOT NULL DEFAULT 'alpha',
  duration_beats  INTEGER NOT NULL DEFAULT 64,
  loop_enabled    INTEGER NOT NULL DEFAULT 0,
  loop_start_beat REAL NOT NULL DEFAULT 0,
  loop_end_beat   REAL NOT NULL DEFAULT 32,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_soundlab_sessions_project ON soundlab_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_soundlab_sessions_updated ON soundlab_sessions(updated_at DESC);
`;

export const CREATE_SOUNDLAB_TRACKS = `
CREATE TABLE IF NOT EXISTS soundlab_tracks (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES soundlab_sessions(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK(type IN ('instrument','entrainment','noise','drums')),
  name            TEXT NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  muted           INTEGER NOT NULL DEFAULT 0,
  solo            INTEGER NOT NULL DEFAULT 0,
  volume          REAL NOT NULL DEFAULT 0.8,
  pan             REAL NOT NULL DEFAULT 0.0,
  color           TEXT NOT NULL DEFAULT '#6366f1',
  config_json     TEXT NOT NULL DEFAULT '{}',
  patterns_json   TEXT NOT NULL DEFAULT '[]',
  clips_json      TEXT NOT NULL DEFAULT '[]',
  automation_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_soundlab_tracks_session ON soundlab_tracks(session_id, sort_order ASC);
`;

/**
 * Builder session persistence.
 *
 * One row per app window — there is only ever one active Builder session at a
 * time, so we use a fixed singleton id ('active') rather than accumulating
 * history. The row is upserted on session-create and deleted on session-stop.
 *
 * `opencode_session_id` is the OpenCode v2 session id needed to re-subscribe
 * to the event stream after an app restart. `worktree_path` is the isolated
 * worktree (may be NULL when isolation was not available).
 */
export const CREATE_BUILDER_SESSIONS = `
CREATE TABLE IF NOT EXISTS builder_sessions (
  id                  TEXT PRIMARY KEY NOT NULL DEFAULT 'active',
  opencode_session_id TEXT NOT NULL,
  title               TEXT NOT NULL DEFAULT '',
  repo_directory      TEXT NOT NULL,
  worktree_path       TEXT,
  workspace_name      TEXT NOT NULL DEFAULT '',
  branch              TEXT,
  engine              TEXT NOT NULL DEFAULT 'opencode',
  messages_json       TEXT,
  events_json         TEXT,
  created_at          INTEGER NOT NULL DEFAULT (unixepoch())
);
`;

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
 * Create the Inbox project. `INSERT OR IGNORE` makes it a no-op once present.
 * Deterministic id so tasks can default to it without a lookup.
 */
export const MIGRATE_INBOX_PROJECT = `
INSERT OR IGNORE INTO projects (id, name, description, status, icon, sort_order)
VALUES ('inbox', 'Inbox', 'Unsorted capture — file these into a project.', 'active', 'inbox', -1);
`;

/**
 * Adopt every task that predates projects. Converges: once a task has a
 * project, the WHERE clause no longer matches it.
 */
export const MIGRATE_ASSIGN_ORPHAN_TASKS = `
UPDATE tasks SET project_id = 'inbox' WHERE project_id IS NULL;
`;

/**
 * Adopt pre-existing knowledge into its project.
 *
 * `notebooks.project_id` is the knowledge side's copy of the link that
 * `projects.notebook_id` already holds, and `pages.project_id` /
 * `research_runs.project_id` inherit from their notebook. They are denormalised
 * so a project can read its own knowledge directly instead of through a join
 * that a missing or stale `projects.notebook_id` silently empties — which is
 * exactly how a notebook with 100+ blocks ends up looking orphaned while the
 * project page shows nothing.
 *
 * Only ever fills NULLs, so it converges: once a row agrees with its notebook the
 * WHERE clause stops matching, and a page deliberately left unscoped (its
 * notebook belongs to no project) is never adopted.
 *
 * Ordering matters — this runs after MIGRATE_INBOX_PROJECT and after the
 * `ALTER TABLE` column guards in `applyMigrations`, which add these columns to
 * databases written by an earlier build.
 */
export const MIGRATE_PROJECT_SCOPE_KNOWLEDGE = `
UPDATE notebooks
   SET project_id = (SELECT p.id FROM projects p WHERE p.notebook_id = notebooks.id LIMIT 1)
 WHERE project_id IS NULL
   AND EXISTS (SELECT 1 FROM projects p WHERE p.notebook_id = notebooks.id);

UPDATE pages
   SET project_id = (SELECT n.project_id FROM notebooks n WHERE n.id = pages.notebook_id)
 WHERE project_id IS NULL
   AND EXISTS (
         SELECT 1 FROM notebooks n
          WHERE n.id = pages.notebook_id AND n.project_id IS NOT NULL
       );

UPDATE research_runs
   SET project_id = COALESCE(
         (SELECT n.project_id FROM notebooks n WHERE n.id = research_runs.notebook_id),
         (SELECT pg.project_id FROM pages pg WHERE pg.id = research_runs.page_id)
       )
 WHERE project_id IS NULL
   AND (
         EXISTS (SELECT 1 FROM notebooks n
                  WHERE n.id = research_runs.notebook_id AND n.project_id IS NOT NULL)
      OR EXISTS (SELECT 1 FROM pages pg
                  WHERE pg.id = research_runs.page_id AND pg.project_id IS NOT NULL)
       );
`;

/**
 * Statements that rewrite existing rows. Kept separate from
 * MIGRATION_STATEMENTS (which is DDL and may be applied by tests against a
 * fresh in-memory database) because these only matter for databases written by
 * a previous build. Like the DDL, every statement must be idempotent.
 */
export const DATA_MIGRATIONS: readonly string[] = [
  MIGRATE_RAG_URI_SCHEME,
  MIGRATE_INBOX_PROJECT,
  MIGRATE_ASSIGN_ORPHAN_TASKS,
  MIGRATE_PROJECT_SCOPE_KNOWLEDGE,
];

// ─── Correspondence ───────────────────────────────────────────────────────────

/**
 * contacts – one organisation or person you correspond with.
 *
 * `project_id` is nullable like every other table's, so a contact is reusable
 * across projects and exists as a project lens rather than a container. A person
 * hangs off an organisation via `parent_id` (one hop only — a deeper tree is a
 * data-modelling problem this system does not have).
 *
 * Nothing here is ever written without the user having seen it: rows arrive from
 * the reviewed grid in the Harvest flow, so `source` records provenance and
 * `confidence` records how sure the extractor was, and neither is authoritative.
 */
export const CREATE_CONTACTS = `
CREATE TABLE IF NOT EXISTS contacts (
  id         TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL DEFAULT 'organisation'
             CHECK(kind IN ('organisation','person')),
  name       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT '',
  parent_id  TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  notes      TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_contacts_project ON contacts(project_id);
CREATE INDEX IF NOT EXISTS idx_contacts_parent  ON contacts(parent_id);
`;

/**
 * contact_channels – one way of reaching a contact, with its own state.
 *
 * The row exists because "verify all contact information" is a data problem, not
 * a checkbox: a phone number can be correct while the email bounces, and a body
 * that only accepts portal submissions has neither. `verified` is therefore per
 * channel, and it is only ever set by a user action or a real bounce — an
 * extracted value is `unverified` no matter how confident the extractor was.
 *
 * `value` is normalised on write for the kinds where two spellings are the same
 * address (email lowercased, phone reduced to digits), so the `(kind, value)`
 * index is a usable duplicate key.
 */
export const CREATE_CONTACT_CHANNELS = `
CREATE TABLE IF NOT EXISTS contact_channels (
  id          TEXT PRIMARY KEY,
  contact_id  TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL
              CHECK(kind IN ('email','phone','portal','postal','social','manual')),
  value       TEXT NOT NULL,
  label       TEXT NOT NULL DEFAULT '',
  verified    TEXT NOT NULL DEFAULT 'unverified'
              CHECK(verified IN ('unverified','verified','bounced')),
  verified_at INTEGER,
  source      TEXT NOT NULL DEFAULT 'manual'
              CHECK(source IN ('manual','harvest','import')),
  confidence  REAL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_contact_channels_contact ON contact_channels(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_channels_lookup  ON contact_channels(kind, value);
`;

/**
 * correspondence_messages – the content of one outbound (or logged) item, before it
 * fans out.
 *
 * A message is a *record*, not a send. It carries what was said and what went with
 * it; the per-recipient truth lives in `message_recipients`. Splitting them is the
 * modelling decision the whole system rests on: one letter to seven bodies is one
 * message and seven recipients, not seven messages.
 *
 * NOT named `messages`: that table is the persisted chat transcript (`session_id`,
 * `parts_json`), and `CREATE TABLE IF NOT EXISTS` would have made this file's DDL a
 * silent no-op on every real install — no error, just a correspondence table that
 * does not exist while the chat one answers the queries. The pair of traps is worth
 * naming for the next person: the table needs a distinct name, and so does the
 * `export const` holding its DDL, because two exports under one identifier leave the
 * later one winning inside this module — which handed `MIGRATION_STATEMENTS` the chat
 * table's SQL and never this one's.
 */
export const CREATE_CORRESPONDENCE_MESSAGES = `
CREATE TABLE IF NOT EXISTS correspondence_messages (
  id         TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  subject    TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_correspondence_messages_project ON correspondence_messages(project_id, updated_at);
`;

/**
 * message_attachments – what went with the message.
 *
 * Two kinds because both are real: a composed document (an in-app row, linked by
 * id) and a file on disk (the .odt and photo evidence a lawyer actually sends).
 * Storing the path rather than the bytes keeps the database out of the file-copy
 * business; `label` is what the recipient will see the attachment called.
 */
export const CREATE_MESSAGE_ATTACHMENTS = `
CREATE TABLE IF NOT EXISTS message_attachments (
  id          TEXT PRIMARY KEY,
  message_id  TEXT NOT NULL REFERENCES correspondence_messages(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK(kind IN ('document','file')),
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  path        TEXT,
  label       TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_message_attachments_message ON message_attachments(message_id);
`;

/**
 * message_recipients – the per-recipient state machine. This table IS the system.
 *
 * One row per body on one message, each with its own clock, because that is the
 * reality every existing product models badly: five organisations are contacted in
 * parallel and reply on their own schedules, and "the status" of the letter is not
 * a single value.
 *
 *   dispatch_state – how far the sending got. `sent` on a `manual` or `postal`
 *                    channel means the user told us they sent it, which is all this
 *                    system can ever know without owning delivery.
 *   reply_state    – what came back. `not_expected` is not a failure state: a
 *                    demand letter to a regulator is not awaiting a chat reply.
 *   deadline_class – statutory / contractual / tactical. A missed 14-day statutory
 *                    window and a missed "call them Tuesday" must not look alike.
 *   response_due_at – ALWAYS an absolute timestamp, never a duration. This is what
 *                    keeps the model restart-correct: a clock is a date, so it means
 *                    the same thing whether or not the app was running.
 *
 * `channel_kind` is copied from the channel at dispatch time rather than joined,
 * because how something was sent is a historical fact and the channel record is
 * allowed to change (or be deleted) afterwards.
 */
export const CREATE_MESSAGE_RECIPIENTS = `
CREATE TABLE IF NOT EXISTS message_recipients (
  id                 TEXT PRIMARY KEY,
  message_id         TEXT NOT NULL REFERENCES correspondence_messages(id) ON DELETE CASCADE,
  contact_id         TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel_id         TEXT REFERENCES contact_channels(id) ON DELETE SET NULL,
  channel_kind       TEXT NOT NULL DEFAULT 'manual'
                     CHECK(channel_kind IN ('email','phone','portal','postal','social','manual')),
  dispatch_state     TEXT NOT NULL DEFAULT 'queued'
                     CHECK(dispatch_state IN ('queued','sent','failed','withdrawn')),
  reply_state        TEXT NOT NULL DEFAULT 'awaiting'
                     CHECK(reply_state IN ('awaiting','replied','no_response','not_expected')),
  sent_at            INTEGER,
  replied_at         INTEGER,
  response_due_at    INTEGER,
  deadline_class     TEXT NOT NULL DEFAULT 'tactical'
                     CHECK(deadline_class IN ('statutory','contractual','tactical')),
  external_ref       TEXT NOT NULL DEFAULT '',
  notes              TEXT NOT NULL DEFAULT '',
  escalation_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  created_at         INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at         INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_recipients_message ON message_recipients(message_id);
CREATE INDEX IF NOT EXISTS idx_recipients_contact ON message_recipients(contact_id);
CREATE INDEX IF NOT EXISTS idx_recipients_due     ON message_recipients(response_due_at)
  WHERE response_due_at IS NOT NULL AND reply_state = 'awaiting';
`;

/**
 * correspondence_events – the append-only log of what actually happened.
 *
 * Every state change writes one of these, and nothing ever updates or deletes one.
 * That is deliberate for two reasons: it is the audit trail a legal dispute needs
 * ("we wrote to them on this date"), and it is the table a v2 hash-chain would run
 * over, so adding tamper-evidence later needs new columns rather than a backfill of
 * history that was never kept.
 */
export const CREATE_CORRESPONDENCE_EVENTS = `
CREATE TABLE IF NOT EXISTS correspondence_events (
  id           TEXT PRIMARY KEY,
  project_id   TEXT REFERENCES projects(id) ON DELETE SET NULL,
  recipient_id TEXT REFERENCES message_recipients(id) ON DELETE CASCADE,
  message_id   TEXT REFERENCES correspondence_messages(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  detail       TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_correspondence_events_recipient
  ON correspondence_events(recipient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_correspondence_events_project
  ON correspondence_events(project_id, created_at);
`;

// ─── Sequences ────────────────────────────────────────────────────────────────

/**
 * sequences – an ordered plan: wait, chase, escalate.
 *
 * The founding case is a demand letter followed by a 14-day wait, then chasing
 * whichever bodies stayed quiet. Expressed as prose (which is how the original
 * research notebook held it) it is a plan nobody can act on or be reminded by;
 * expressed as ordered steps it is something a runner can refuse to invent.
 */
export const CREATE_SEQUENCES = `
CREATE TABLE IF NOT EXISTS sequences (
  id          TEXT PRIMARY KEY,
  project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_sequences_project ON sequences(project_id);
`;

/**
 * sequence_steps – the plan, in order.
 *
 * `config_json` holds per-kind settings (a wait's days, an escalate's priority) so
 * adding a step kind is a data change rather than another migration.
 */
export const CREATE_SEQUENCE_STEPS = `
CREATE TABLE IF NOT EXISTS sequence_steps (
  id          TEXT PRIMARY KEY,
  sequence_id TEXT NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  kind        TEXT NOT NULL
              CHECK(kind IN ('wait','branch','escalate','task','stop')),
  title       TEXT NOT NULL DEFAULT '',
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_sequence_steps_sequence ON sequence_steps(sequence_id, position);
`;

/**
 * sequence_runs – one execution of a plan, against one dispatched message.
 *
 * `last_seen_at` is the load-bearing column. It records the last moment the app was
 * open and advancing this run, which is the only way to answer "did this step come
 * due while nobody was watching?" — the question that decides whether the runner may
 * fire a step on its own. There is deliberately no `next_fire_at`: what is stored is
 * each step's absolute `not_before`, so a restart cannot shift a deadline.
 */
export const CREATE_SEQUENCE_RUNS = `
CREATE TABLE IF NOT EXISTS sequence_runs (
  id              TEXT PRIMARY KEY,
  sequence_id     TEXT NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  project_id      TEXT REFERENCES projects(id) ON DELETE SET NULL,
  message_id      TEXT REFERENCES correspondence_messages(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'running'
                  CHECK(status IN ('running','completed','stalled','stopped')),
  current_step_id TEXT REFERENCES sequence_steps(id) ON DELETE SET NULL,
  last_seen_at    INTEGER,
  started_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  finished_at     INTEGER,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_sequence_runs_status  ON sequence_runs(status);
CREATE INDEX IF NOT EXISTS idx_sequence_runs_message ON sequence_runs(message_id);
`;

/**
 * sequence_step_runs – what happened to each step of a run.
 *
 * `late_sec` is recorded for every fired step, even an on-time one (as zero), so the
 * record can answer "was this done when it was supposed to be" rather than only "was
 * it done".
 */
export const CREATE_SEQUENCE_STEP_RUNS = `
CREATE TABLE IF NOT EXISTS sequence_step_runs (
  id         TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL REFERENCES sequence_runs(id) ON DELETE CASCADE,
  step_id    TEXT NOT NULL REFERENCES sequence_steps(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'pending'
             CHECK(status IN ('pending','waiting','stalled','fired','skipped')),
  not_before INTEGER,
  fired_at   INTEGER,
  late_sec   INTEGER,
  detail     TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_sequence_step_runs_run ON sequence_step_runs(run_id);
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
  CREATE_PROJECTS,
  CREATE_CODE_PROJECTS,
  CREATE_TASKS,
  CREATE_TASK_STEPS,
  CREATE_TASK_BLOCKS,
  CREATE_FOCUS_SESSIONS,
  CREATE_GAMIFICATION_STATE,
  CREATE_XP_LEDGER,
  CREATE_DOCUMENTS,
  CREATE_STUDIO_TAKES,
  CREATE_SOUNDLAB_SESSIONS,
  CREATE_SOUNDLAB_TRACKS,
  CREATE_BUILDER_SESSIONS,
  CREATE_CONTACTS,
  CREATE_CONTACT_CHANNELS,
  CREATE_CORRESPONDENCE_MESSAGES,
  CREATE_MESSAGE_ATTACHMENTS,
  CREATE_MESSAGE_RECIPIENTS,
  CREATE_CORRESPONDENCE_EVENTS,
  CREATE_SEQUENCES,
  CREATE_SEQUENCE_STEPS,
  CREATE_SEQUENCE_RUNS,
  CREATE_SEQUENCE_STEP_RUNS,
];

/** Bookkeeping table for future schema versions. */
export const CREATE_MIGRATIONS = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL DEFAULT (unixepoch())
);
`;

/** First meaningful line of a DDL string, for logging which step failed. */
function firstStatementLine(statement: string): string {
  return (
    statement
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? '<empty>'
  );
}

function describeMigrationError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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

  // Each statement runs independently and a failure is reported, not fatal.
  //
  // This used to be a plain `for` loop, which meant one bad statement aborted
  // every statement after it — silently, because nothing caught it. A database
  // in that half-migrated state cannot recover on the next launch either: the
  // same statement throws again at the same point, so a transient or
  // order-dependent failure becomes permanent. Each statement is idempotent, so
  // retrying the remainder on the next launch is always safe.
  MIGRATION_STATEMENTS.forEach((statement, index) => {
    try {
      db.exec(statement);
    } catch (error) {
      console.warn(
        `[db] migration statement #${index} failed and was skipped: ${describeMigrationError(error)}\n${firstStatementLine(statement)}`,
      );
    }
  });

  // Ensure optional columns exist on databases written by an earlier build.
  // This must run BEFORE DATA_MIGRATIONS, because some data migrations (the
  // orphan-task adoption below) reference those columns.
  if (typeof db.prepare === 'function') {
    const columnsOf = (table: string): string[] =>
      db.prepare!(`PRAGMA table_info(${table})`)
        .all()
        .map((c) => c.name);

    /**
     * Add one column, tolerating a table that does not exist yet and a column
     * that is already there.
     *
     * Deliberately per-statement rather than one big try/catch: the previous
     * single try wrapped every back-fill below, so the first failure silently
     * skipped all of the later ones. That is how a database ended up carrying
     * `tasks.project_id` but not `chunks.project_id`, `builder_sessions.engine`,
     * or the knowledge project-scope columns, with nothing in the log.
     */
    const addColumn = (table: string, column: string, definition: string) => {
      try {
        const columns = columnsOf(table);
        // No rows means the table is absent; there is nothing to add a column to.
        if (columns.length === 0) return;
        if (!columns.includes(column)) {
          db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        }
      } catch (error) {
        console.warn(
          `[db] back-fill skipped: ${table}.${column} — ${describeMigrationError(error)}`,
        );
      }
    };

    /** Idempotent DDL that is safe to retry but must not abort the chain. */
    const execOptional = (label: string, sql: string) => {
      try {
        db.exec(sql);
      } catch (error) {
        console.warn(
          `[db] ${label} failed and was skipped: ${describeMigrationError(error)}`,
        );
      }
    };

    addColumn('terminal_blocks', 'duration_ms', 'INTEGER');

    addColumn('terminal_sessions', 'cwd', "TEXT NOT NULL DEFAULT ''");
    addColumn('terminal_sessions', 'env', "TEXT NOT NULL DEFAULT '{}'");
    addColumn(
      'terminal_sessions',
      'project_id',
      'TEXT REFERENCES projects(id) ON DELETE SET NULL',
    );

    addColumn('tasks', 'estimate_mins', 'INTEGER');
    addColumn(
      'tasks',
      'project_id',
      'TEXT REFERENCES projects(id) ON DELETE SET NULL',
    );

    addColumn(
      'task_blocks',
      'project_id',
      'TEXT REFERENCES projects(id) ON DELETE SET NULL',
    );

    addColumn(
      'sessions',
      'project_id',
      'TEXT REFERENCES projects(id) ON DELETE SET NULL',
    );

    addColumn(
      'documents',
      'project_id',
      'TEXT REFERENCES projects(id) ON DELETE SET NULL',
    );

    addColumn(
      'studio_takes',
      'project_id',
      'TEXT REFERENCES projects(id) ON DELETE SET NULL',
    );
    addColumn('studio_takes', 'effects_json', 'TEXT');
    addColumn('studio_takes', 'overlays_json', 'TEXT');

    // `code_project_id` references code_projects, which is created in
    // MIGRATION_STATEMENTS above. On a legacy database that table does not
    // exist yet at this point, so this back-fill can legitimately fail —
    // addColumn logs and continues rather than taking the rest with it, and
    // the next launch retries it once the table exists.
    addColumn(
      'chunks',
      'project_id',
      'TEXT REFERENCES projects(id) ON DELETE SET NULL',
    );
    addColumn(
      'chunks',
      'code_project_id',
      'TEXT REFERENCES code_projects(id) ON DELETE CASCADE',
    );

    addColumn('builder_sessions', 'engine', "TEXT NOT NULL DEFAULT 'opencode'");
    // Durable Local Builder context. Without these, a restart loses the
    // conversation and the re-attached feed even when the worktree survives.
    addColumn('builder_sessions', 'messages_json', 'TEXT');
    addColumn('builder_sessions', 'events_json', 'TEXT');

    // Knowledge-side project scope. Added after notebooks/pages/research_runs
    // first shipped, so existing databases get the columns here and the
    // MIGRATE_PROJECT_SCOPE_KNOWLEDGE backfill below fills them in.
    addColumn(
      'notebooks',
      'project_id',
      'TEXT REFERENCES projects(id) ON DELETE SET NULL',
    );
    addColumn(
      'pages',
      'project_id',
      'TEXT REFERENCES projects(id) ON DELETE SET NULL',
    );
    addColumn(
      'research_runs',
      'project_id',
      'TEXT REFERENCES projects(id) ON DELETE SET NULL',
    );

    // Indexes on back-filled columns are created HERE, never inline in the
    // CREATE TABLE statements above, and that placement is load-bearing:
    // `CREATE TABLE IF NOT EXISTS` is a no-op on a database written by an
    // earlier build, so an inline `CREATE INDEX ... (project_id)` would run
    // against a table that does not have the column yet, throw, and — inside
    // the migration loop — abort every statement after it. That is exactly
    // what `chunks` did, and it deadlocked the migration permanently.
    // Unconditional because `IF NOT EXISTS` already makes this idempotent.
    execOptional(
      'idx_chunks_project',
      'CREATE INDEX IF NOT EXISTS idx_chunks_project ON chunks(project_id)',
    );
    execOptional(
      'idx_chunks_code_project',
      'CREATE INDEX IF NOT EXISTS idx_chunks_code_project ON chunks(code_project_id)',
    );
    execOptional(
      'idx_notebooks_project',
      'CREATE INDEX IF NOT EXISTS idx_notebooks_project ON notebooks(project_id)',
    );
    execOptional(
      'idx_pages_project',
      'CREATE INDEX IF NOT EXISTS idx_pages_project ON pages(project_id)',
    );
    execOptional(
      'idx_research_runs_project',
      'CREATE INDEX IF NOT EXISTS idx_research_runs_project ON research_runs(project_id)',
    );
  }

  // Data migrations run last: the Inbox project must exist before orphan tasks
  // can adopt it, and the columns above must exist before the UPDATE runs.
  DATA_MIGRATIONS.forEach((statement, index) => {
    try {
      db.exec(statement);
    } catch (error) {
      console.warn(
        `[db] data migration #${index} failed and was skipped: ${describeMigrationError(error)}\n${firstStatementLine(statement)}`,
      );
    }
  });
}
