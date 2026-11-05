---
sessionId: session-261105-172327-2nqg
---

# Technical Design

### Current State
The codebase contains ~87 references to 'vellum' across 5 categories:
1. **Database filename** (`vellum.db`) in `src/main/db/client.ts:42`
2. **URI scheme** (`vellum-page://`) in `workspace-rag.ts`, `os-integration.ts`, and `schema.ts` migration
3. **Shell integration** temp files, env vars, and function names in `shell-integration.ts`
4. **Banner comments** in 8+ files saying 'Vellum'
5. **Test fixtures** with 'Vellum Core' project names

### Key Decisions
- **Full rename**: all 5 categories will be renamed to 'qeda' equivalents
- **URI migration**: `vellum-page://` → `qeda-page://` via a new idempotent data migration `MIGRATE_RAG_URI_SCHEME_V2` in `schema.ts`
- **DB migration**: `vellum.db` → `qeda.db` with a one-time copy-on-first-launch in `client.ts`
- **Shell integration**: all temp files, env vars, and function names renamed (no migration needed — these are runtime-only)
- **Banner comments**: 'Vellum' → 'Qeda' in all file headers
- **Test fixtures**: 'Vellum Core' → 'Qeda Core', paths updated

### Proposed Changes

#### 1. Shell Integration (`src/main/pty/shell-integration.ts`)
- `vellum-shell-integration-${pid}` → `qeda-shell-integration-${pid}`
- `vellum-bash.sh` → `qeda-bash.sh`
- `VELLUM_SHELL_INTEGRATION` → `QEDA_SHELL_INTEGRATION`
- `__vellum_prompt_command` → `__qeda_prompt_command`
- `__vellum_precmd` → `__qeda_precmd`
- `__vellum_preexec` → `__qeda_preexec`
- Banner: 'Vellum Terminal' → 'Qeda Terminal'
- Also `src/main/main.ts:82`: `VELLUM_DISABLE_HW_ACCEL` → `QEDA_DISABLE_HW_ACCEL`

#### 2. Banner Comments (8+ files)
Replace 'Vellum' with 'Qeda' in file header comments:
- `src/main/db/schema.ts`, `src/main/ai/agent.ts`, `src/main/ai/terminal-agent.ts`
- `src/main/services/registry.ts`, `src/main/tools/web.ts`, `src/main/tools/workspace.ts`
- `src/lib/markdown-blocks.ts`, `src/lib/workflows.ts`
- Plus comments in: `GenerateNotebookDialog.tsx`, `EmbeddingsView.tsx`, `PageInfoPanel.tsx`
- `presets.ts`, `notebook-prompt.ts`, `embedding-config.ts`, `tokenize-terminal.mjs`

#### 3. URI Scheme Migration
- Add `MIGRATE_RAG_URI_SCHEME_V2` in `schema.ts`: rewrites `vellum-page://` → `qeda-page://`
- Register in `DATA_MIGRATIONS` array
- Update `pageIndexPath()` in `workspace-rag.ts` to return `qeda-page://`
- Update search filter and chunk extraction in `workspace-rag.ts`
- Update deep link handlers in `os-integration.ts`

#### 4. Database Filename Migration
- Update `getDb()` in `client.ts` to use `qeda.db`
- Add migration: on first open, copy `vellum.db` → `qeda.db` if old exists and new doesn't
- Update comments in `main.ts` and `os-integration.ts`

#### 5. Documentation
- `README.md`, `AGENTS.md`, `docs/Implementation Plan.md`, `docs/opencode-engine.md`
- `docs/terminal-implementation.md`, `package.json` repo URL

#### 6. Test Fixtures
- Replace 'Vellum Core' → 'Qeda Core' in 7 test files
- Update paths from 'vellum' to 'qeda'
- Update deep link test for `qeda-page://`

### Architecture Diagram

``` mermaid
graph LR
  A[client.ts] -->|copy on first launch| B[vellum.db → qeda.db]
  C[schema.ts] -->|DATA_MIGRATIONS| D[MIGRATE_RAG_URI_SCHEME_V2]
  D -->|vellum-page:// → qeda-page://| E[chunks table]
  F[workspace-rag.ts] -->|pageIndexPath| E
  G[os-integration.ts] -->|deep link handler| E
  H[shell-integration.ts] -->|temp files| I[qeda- prefixed]
```

### Risks
- **DB migration failure**: if the copy fails, the app should fall back to `vellum.db` gracefully
- **URI migration**: the WHERE clause ensures idempotency — safe to run on every launch
- **Shell integration**: existing sessions won't be affected; new sessions get the new names
- **Tests**: the `os-integration.test.ts` tests `vellum-page://` deep links — must update to `qeda-page://`

# File Structure

### Modified Files

#### Main Process
- `src/main/db/client.ts` — DB filename + migration logic
- `src/main/db/schema.ts` — new URI migration + banner comment
- `src/main/tools/workspace-rag.ts` — URI scheme in `pageIndexPath()`, search filter, chunk extraction
- `src/main/os-integration.ts` — deep link handlers for `qeda-page://`
- `src/main/pty/shell-integration.ts` — all temp file names, env vars, function names
- `src/main/main.ts` — env var name + comment
- `src/main/ai/agent.ts` — banner comment
- `src/main/ai/terminal-agent.ts` — banner comment
- `src/main/services/registry.ts` — banner comment
- `src/main/tools/web.ts` — banner comment
- `src/main/tools/workspace.ts` — banner comment
- `src/main/ai/embedding-config.ts` — comment

#### Renderer
- `src/components/GenerateNotebookDialog.tsx` — comment
- `src/components/settings/views/EmbeddingsView.tsx` — comment
- `src/components/workspace/PageInfoPanel.tsx` — banner comment + URI reference
- `src/lib/markdown-blocks.ts` — banner comment
- `src/lib/workflows.ts` — banner comment
- `src/lib/canvas/presets.ts` — comment
- `src/lib/notebook-prompt.ts` — comment

#### Tests
- `src/__tests__/app-sidebar-project.test.tsx`
- `src/__tests__/builder-project-scope.test.tsx`
- `src/__tests__/os-integration.test.ts`
- `src/__tests__/project-context.test.ts`
- `src/__tests__/project-files-tools.test.ts`
- `src/__tests__/projects-db.test.ts`
- `src/__tests__/repo-tools.test.ts`

#### Docs & Config
- `README.md`
- `AGENTS.md`
- `docs/Implementation Plan.md`
- `docs/opencode-engine.md`
- `docs/terminal-implementation.md`
- `package.json`
- `scripts/tokenize-terminal.mjs`

# Testing

### Validation Approach
Run the full test suite after all changes to ensure no regressions.

### Key Scenarios
1. **Database migration**: `client.ts` correctly copies `vellum.db` to `qeda.db` on first launch when old file exists
2. **URI migration**: `MIGRATE_RAG_URI_SCHEME_V2` rewrites `vellum-page://` rows to `qeda-page://` in the chunks table
3. **Workspace RAG**: `pageIndexPath()` returns `qeda-page://`, search filters match, chunk extraction works
4. **Deep links**: `os-integration.ts` resolves `qeda-page://` URLs correctly
5. **Shell integration**: new sessions use `qeda-` prefixed temp files and env vars
6. **Test fixtures**: all tests pass with updated project names and paths

### Edge Cases
- **DB migration**: `qeda.db` already exists (no copy needed)
- **DB migration**: neither file exists (fresh install, no copy)
- **URI migration**: no `vellum-page://` rows exist (idempotent, no-op)
- **Shell integration**: existing shell sessions with old env var names continue working

### Test Changes
- Update `src/__tests__/os-integration.test.ts` to test `qeda-page://` deep links instead of `vellum-page://`
- All other test fixtures updated from 'Vellum' to 'Qeda' names
- Run `bun run build && bun test` to verify

# Delivery Steps

### ✓ Step 1: Rename shell integration identifiers
Replace all 'vellum' references in shell integration with 'qeda' equivalents.
**Files:** `src/main/pty/shell-integration.ts`
- Rename temp directory from `vellum-shell-integration-${pid}` to `qeda-shell-integration-${pid}`
- Rename bash script from `vellum-bash.sh` to `qeda-bash.sh`
- Rename env var from `VELLUM_SHELL_INTEGRATION` to `QEDA_SHELL_INTEGRATION`
- Rename hook functions: `__vellum_prompt_command` → `__qeda_prompt_command`, `__vellum_precmd` → `__qeda_precmd`, `__vellum_preexec` → `__qeda_preexec`
- Update banner comments: 'Vellum Terminal' → 'Qeda Terminal'
- Update env var in `src/main/main.ts`: `VELLUM_DISABLE_HW_ACCEL` → `QEDA_DISABLE_HW_ACCEL`

### ✓ Step 2: Update banner comments and documentation
Replace 'Vellum' with 'Qeda' in all file banner comments and documentation files.
**Files:** `src/main/db/schema.ts`, `src/main/ai/agent.ts`, `src/main/ai/terminal-agent.ts`, `src/main/services/registry.ts`, `src/main/tools/web.ts`, `src/main/tools/workspace.ts`, `src/lib/markdown-blocks.ts`, `src/lib/workflows.ts`, `README.md`, `AGENTS.md`, `docs/Implementation Plan.md`, `docs/opencode-engine.md`, `docs/terminal-implementation.md`, `package.json`, `scripts/tokenize-terminal.mjs`, `src/components/GenerateNotebookDialog.tsx`, `src/components/settings/views/EmbeddingsView.tsx`, `src/components/workspace/PageInfoPanel.tsx`, `src/lib/canvas/presets.ts`, `src/lib/notebook-prompt.ts`, `src/main/ai/embedding-config.ts`

### ✓ Step 3: Migrate URI scheme vellum-page:// to qeda-page://
Add a data migration and update all code references for the workspace RAG URI scheme.
**Files:** `src/main/db/schema.ts`, `src/main/tools/workspace-rag.ts`, `src/main/os-integration.ts`, `src/components/workspace/PageInfoPanel.tsx`
- Add `MIGRATE_RAG_URI_SCHEME_V2` migration: `UPDATE chunks SET file_path = 'qeda-page://' || substr(file_path, length('vellum-page://') + 1) WHERE file_path LIKE 'vellum-page://%';`
- Register in `DATA_MIGRATIONS` array in `src/main/db/schema.ts`
- Update `pageIndexPath()` in `workspace-rag.ts` to return `qeda-page://${pageId}`
- Update search filter in `workspace-rag.ts` from `vellum-page://` to `qeda-page://`
- Update deep link handlers in `os-integration.ts` for `qeda-page://` protocol
- Update `PageInfoPanel.tsx` comment referencing the URI scheme

### ✓ Step 4: Migrate database filename vellum.db to qeda.db
Rename the database file and add a migration to copy existing data on first launch.
**Files:** `src/main/db/client.ts`, `src/main/main.ts`, `src/main/os-integration.ts`
- Update `getDb()` in `client.ts` to use `qeda.db` as the new filename
- Add migration logic: on first open, check for `vellum.db` existence, copy it to `qeda.db` if it doesn't exist, then delete the old file
- Update comments in `main.ts` and `os-integration.ts` referencing `vellum.db`

### ✓ Step 5: Update test fixtures and verify
Replace 'Vellum' project names and paths in test fixtures with 'Qeda' equivalents, then run tests.
**Files:** `src/__tests__/app-sidebar-project.test.tsx`, `src/__tests__/builder-project-scope.test.tsx`, `src/__tests__/os-integration.test.ts`, `src/__tests__/project-context.test.ts`, `src/__tests__/project-files-tools.test.ts`, `src/__tests__/projects-db.test.ts`, `src/__tests__/repo-tools.test.ts`
- Replace project name `'Vellum Core'` with `'Qeda Core'`
- Replace repo paths containing 'vellum' with 'qeda'
- Update session titles from `'Builder · vellum'` to `'Builder · qeda'`
- Update deep link test for `qeda-page://` instead of `vellum-page://`
- Run `bun run build && bun test` to verify all tests pass