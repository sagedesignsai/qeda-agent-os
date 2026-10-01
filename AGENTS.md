# AGENTS.md

Electron + React 19 + TypeScript desktop app ("local agent OS") forked from
[electron-react-boilerplate](https://github.com/electron-react-boilerplate/electron-react-boilerplate).
Node 24+ / npm 10+ are **hard-enforced** via `devEngines` (`onFail: "error"`).

## Commands

```bash
npm install
cp .env.example .env.local    # optional; providers can also be set in Settings
npm start                     # dev: main+preload+renderer HMR, renderer on localhost:1212
npm run build                 # REQUIRED before npm test — see below
npm test                      # jest, jsdom
npm run lint                  # eslint (prettier is wired in as an eslint plugin)
npm run lint:fix
```

- **`npm test` fails without `npm run build` first.** `.erb/scripts/check-build-exists.ts`
  (a jest `setupFiles` entry) throws unless `release/app/dist/main/main.js` **and**
  `release/app/dist/renderer/renderer.js` exist. It is not a build-output dependency
  of the tests, just a hard guard.
- Single test: `npx jest src/__tests__/projects-db` or `npm test -- -t "name"`.
- **There is no `typecheck` script.** Use `npx tsc --noEmit -p tsconfig.json`
  (TypeScript 7.x, i.e. the native compiler — much faster than tsc 5).
- `npm run test:smoke` spawns a real `npm start` on `SMOKE_PORT` (1213) and probes
  the preload bridge over the Chrome debug port. Slower and flakier than unit tests.
- `npm run theme:terminal` is a one-shot codemod that rewrites hardcoded Tailwind
  palette classes in the Terminal module to design tokens. **Dry run by default**;
  needs `--write` to apply.
- No CI (`.github/` does not exist) and no pre-commit hooks — verification is
  whatever you run locally. Commit messages follow conventional commits
  (`feat:`, `fix:`, …).

## Layout — the paths will mislead you

Three electron-vite bundles, fixed output names under `release/app/dist/`:
`src/main/main.ts` → `main.js`, `src/main/preload.ts` → `preload.js`,
`src/renderer/index.html` → `renderer.js`.

The renderer's Vite root is `src/renderer`, **but the `@/*` alias points at `src/*`**.
So most shared code lives *outside* the renderer directory:

| Path | Reality |
| --- | --- |
| `src/renderer/pages/` | Route-level views (Chat, Tasks, Projects, Terminal, Workspace, Tools) |
| `src/renderer/components/` | **Only `AppLayout.tsx`.** Everything else is `src/components/*` |
| `src/components/` | All components: `ui/` (61 shadcn files), `ai-elements/`, plus feature dirs |
| `src/hooks/` | Shared hooks — renderer, but not under `src/renderer/` |
| `src/lib/` | Pure, UI-free logic shared by main and renderer |
| `src/main/` | Everything privileged: `ai/`, `db/`, `ipc/`, `pty/`, `services/`, `tools/` |
| `src/__tests__/` | All tests, flat |

Do not infer a module's location from its name; grep for the import.

### Tailwind v4 needs manual source registration

Because `src/components`, `src/hooks` and `src/lib` sit outside the Vite root,
`src/renderer/index.css` registers them by hand:

```css
@source '../components';
@source '../hooks';
@source '../lib';
```

Create a new top-level directory under `src/` and **you must add a matching
`@source` line**, or every class used there gets purged with no error.

## IPC is the only renderer↔main channel

`src/main/ipc/channels.ts` holds an `IpcChannels` map — every channel name with its
`req`/`res` types. It is the single source of truth, and it stays **one file on
purpose**: 36 renderer files import it for domain types as well as channel names,
and a contract should be readable in one place. To add a capability:

1. Add the channel to `IpcChannels` in `src/main/ipc/channels.ts`.
2. Add `ipcMain.handle('<name>', ...)` to the **domain module that owns it** under
   `src/main/ipc/handlers/` (81 already). If the capability crosses concerns, add
   the module and register it in `src/main/ipc/index.ts`.
3. Call it from the renderer via `window.electron.ipc.invoke<T>(name, payload)`.
   For main→renderer pushes use `.on(name, listener)`, which **returns a cleanup fn**.

### Handler layout

`ipc/index.ts` is the composition root — the only place that knows every handler
module exists. `main.ts` calls `registerIpcHandlers(mainWindow)` and nothing else.
Each module exposes one `register<Domain>Handlers` and owns one user-facing
concern; the 18 comment-delimited sections of the old monolithic file became 10
feature-grouped modules (`tasks.ts` merges four "Focus system" sections, `copilot.ts`
merges two). A module that broadcasts takes `{ mainWindow }`; one that does not,
takes nothing — the dependency is visible in the signature rather than a global.

- `ipc/agent-runtime.ts` holds `agentCache`, the **only** mutable module-level
  state in the IPC layer. Settings invalidates it, the chat handler reads it.
  The terminal agent and task copilot deliberately bypass it.
- **PTY handlers are not in `handlers/`.** They live in `src/main/pty/manager.ts`
  next to the `PtyManager` class, and `main.ts` registers them separately. A
  grep of `ipc/` alone will make them look unimplemented — they are not.
- `ipcMain.handle` is **not** typed against `IpcChannels`, so a misspelled channel
  name still compiles and silently never fires. `python3 scripts/verify-ipc-split.py`
  checks channel coverage, import resolution, and missing/unused imports without
  needing tsc — run it after touching the IPC layer. (A typed
  `handle<C extends ChannelName>()` wrapper is the intended follow-up.)

Rules that bite:

- The renderer must never import Node or Electron directly. Everything goes through
  the `contextBridge` surface in `src/main/preload.ts`.
- **Import renderer-facing domain types from `@/main/ipc/channels`, not from `db/*`.**
  `channels.ts` deliberately re-exports them (`export type { Task, Project, … }`)
  so the renderer does not reach into the database layer.
- Pure `invoke`/`handle` for request-response. Streaming and events are separate
  channel entries with `data`/`error` shapes and no `req`/`res` — e.g. the
  `agent:stream-*`, `copilot:stream-*`, `terminal:block-*`, `pty:*` families.
  Broadcasts that invalidate renderer caches are their own event
  (`projects:changed`, `copilot:changed`, `terminal:sessions-changed`).
- The router is `MemoryRouter` (`src/renderer/App.tsx`), so `window.location` never
  changes. Read scope params with `useSearchParams`, never `window.location.search`.

## Database

One SQLite file, `vellum.db`, in `userData`. Schema lives in `src/main/db/schema.ts`
as **data, not as a boot-time side effect** — this is deliberate so tests can apply it
to an in-memory database without booting Electron.

- `MIGRATION_STATEMENTS` — idempotent DDL, applied to fresh and existing DBs.
- `DATA_MIGRATIONS` — row rewrites that only matter for DBs written by an older
  build. Must be idempotent (converge to a no-op).
- `applyMigrations()` — also does `PRAGMA table_info` column back-fills via
  `ALTER TABLE` for columns added after a table first shipped.

**Adding a column means two edits:** put it in the `CREATE TABLE`, *and* add an
`ALTER TABLE … ADD COLUMN` guard in `applyMigrations`. Only the first leaves existing
users broken.

- The `embeddings` sqlite-vec `vec0` table is created in `db/client.ts` **after** the
  extension loads, deliberately *not* in `schema.ts`, because tests run without the
  extension. Its width is fixed at creation — changing `EMBEDDING_DIM` requires
  re-indexing or RAG breaks.
- `projects` is the spine: every other table has a **nullable** `project_id`, so a
  project is an optional lens, not a container. `MIGRATE_INBOX_PROJECT` seeds
  `id = 'inbox'`; deleting a project re-homes its tasks to the Inbox rather than
  deleting work.
- Row rewrites to persisted data (e.g. renaming a path/URI scheme) need a data
  migration — a code-only rename silently orphans the old rows, because cleanup
  queries match exact paths and search filters by prefix. `MIGRATE_RAG_URI_SCHEME`
  is the worked example.

## Native modules live in a second package.json

`release/app/package.json` is a separate manifest holding the native deps
(`better-sqlite3`, `node-pty`, `sqlite-vec`). `electron.vite.config.ts` reads *that
file* to build the `external` list, and `npm run rebuild` targets
`--module-dir release/app`. **Add native modules there, not in the root
`package.json`** — a root-only entry gets bundled and fails to load.

- The app **version** lives only in `release/app/package.json` (currently `4.6.0`);
  the root manifest has no `version` field.
- `CHANGELOG.md` is untouched boilerplate from the upstream template (stops at 2.1.0,
  webpack era). It is not maintained — don't read it as current, don't append to it
  as if it were.

## Tests

Flat `src/__tests__/*.test.ts(x)`, jsdom, transformed by `ts-jest` with
`isolatedModules: true`.

- **`isolatedModules` means type-only imports must use `import type` / `export type`.**
  A plain `import { Task }` or `export { Task }` of a type is elided at runtime and
  breaks. This is why `channels.ts` re-exports with `export type { … }`.
- ESM-only packages cannot be `require`d by Jest and are mapped to mocks in
  `.erb/mocks/`. Introducing another ESM-only dependency means adding both a mock
  and a `moduleNameMapper` entry in `jest.config.js`, or the whole suite fails to load.
  Currently mocked: `streamdown`, `@streamdown/*`, `nanoid`, `react-resizable-panels`,
  `use-stick-to-bottom`, `electron`, plus all asset extensions.
- The `^(\.{1,2}/.*)\.js$` mapper exists because main-process modules use
  ESM-style `./x.js` specifiers for `./x.ts`. Both suffixed and extensionless
  relative imports appear in `src/main/` — follow the local file's style.
- **DB test recipe** (see `projects-db.test.ts`): `new Database(':memory:')` →
  `db.pragma('foreign_keys = ON')` → `applyMigrations(db)` → `useTestDatabase(db)`
  from `db/client` in `beforeEach`, and `useTestDatabase(null)` + `db.close()` in
  `afterEach`. No Electron, no fixtures on disk. Heads-up: `useTestDatabase` is
  declared as `(db: Database.Database)` but every store calls `getDb()` lazily, so
  the `null` reset is the established pattern even though the signature doesn't
  admit it. Follow the existing tests rather than "fixing" the signature.
- Component tests import `'@testing-library/jest-dom'` explicitly at the top of the
  file. Use `fireEvent` over `userEvent` (not installed).

## Environment & secrets

- `.env.local` then `.env` are loaded into `process.env` by `src/main/env.ts` with
  `override: false`, so real OS env vars win. This is necessary because electron-vite
  only forwards `VITE_`-prefixed variables and provider keys are deliberately
  unprefixed.
- `.env*` is gitignored except `.env.example`, which is the committed template.
  **Never commit real credentials.** If a secret is ever committed, rotate it —
  removing the file does not purge git history.
- Packaged builds ship no `.env*`; credentials come from Settings and are encrypted
  with `safeStorage`. `settings:save` *merges* rather than replaces.
- Embeddings are configured separately from the chat provider, and `EMBEDDING_DIM`
  must match the model.

## Conventions

- Each file opens with a banner comment (`path`, then a `───` rule) explaining
  *why* the module exists and any non-obvious constraint. Match it.
- Keep domain logic out of views: `src/lib` and `src/main/db` are pure and UI-free,
  `src/hooks` owns state/transport, `src/renderer/pages` stays thin. This is why
  `focus-timer` is a UI-free interval machine with a separate audio binding.
- `src/components/ui/**` is vendored from the shadcn registry and managed by the
  `shadcn add` CLI (`components.json`, style `radix-nova`) — hand edits get
  overwritten on the next add. Put custom variants in `src/components/<feature>/`.
  ESLint deliberately relaxes several rules for `src/components/**` and
  `src/hooks/**` because of this.
- `cn` comes from the `cn` package; `@/lib/utils` just re-exports it. Import `cn`
  from `@/lib/utils` in app code.
- Use semantic design tokens (`bg-card`, `text-muted-foreground`, `border-border/60`),
  not raw palette ramps — the terminal codemod exists because that rule was broken once.
- Renderer is React 19 with the new JSX transform; no `React` import needed.
- Lint runs `prettier` as a plugin, so `eslint --fix` handles formatting. Prettier
  config (single quotes) lives in `package.json`, not a `.prettierrc`.

## Naming is mid-rebrand — do not "fix" it casually

Three names coexist, and which one is "correct" depends on the layer:

- **Qeda** — what the app actually ships as. `package.json` `name`,
  `productName`, `appId` (`com.qeda.desktop`), `release/app/package.json`, and the
  user-facing branding rendered by `src/components/QedaLogo.tsx`.
- **Vellum** — the older name, still live in `README.md` prose, the on-disk DB name
  `vellum.db`, and assorted comments.
- **Docugent** — the name before that. Still present in *persisted data*:
  `MIGRATE_RAG_URI_SCHEME` rewrites stored `docugent-page://` rows to
  `vellum-page://` on every launch.

Match the surrounding file's convention. Don't rename identifiers across layers
without asking: persisted rows, data migrations, and the packaged `appId` are all
involved, and a code-only rename of a persisted value silently orphans the old rows
(see `MIGRATE_RAG_URI_SCHEME` for the pattern that avoids that).
