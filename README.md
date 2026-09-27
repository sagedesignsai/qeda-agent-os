# Vellum

> **A figment of your intention, made real.**

A **local agent OS** built on Electron, React and the Vercel AI SDK. The agent
runs in the Electron **main process** with real access to the local machine —
filesystem, shell, clipboard and a local document index — and the renderer talks
to it exclusively over typed IPC.

Describe a goal. Vellum plans the work, proposes each command, and waits for
your approval before running anything. What comes back is not a chat log but a
record: every command, its output, and its exit code, written down and
inspectable.

| Module | What it does |
| --- | --- |
| **Chat** | Conversational agent with tool use, plus deep research runs with citations |
| **Workspace** | Block-editor notebooks, version history, and local RAG over your own pages |
| **Terminal** | Agent Mode (goal → plan → approve → execute) and Shell Mode (raw PTY + xterm.js) |
| **Projects** | The spine: an outcome with a deadline, its tasks, its repo, its docs, and its chats in one place |
| **Focus** | Task manager with time blocking, a synthesised soundscape, focus sessions, and an AI copilot agent with tools |

## The name

*Vellum* is the parchment scribes worked on — the surface where thought was
pressed into something durable and readable. That is the bet here: an agent
should not leave a trail of activity you cannot audit, it should leave a record
you can read. The same word is the root of *vellus*, "a writing tablet."

The project started from
[electron-react-boilerplate](https://github.com/electron-react-boilerplate/electron-react-boilerplate)
(electron-vite + React 19 + TypeScript) and layers an agent runtime on top.

## Requirements

- Node.js 24+ and npm 10+
- Native modules (`better-sqlite3`, `sqlite-vec`) are declared in
  `release/app/package.json` and rebuilt/packaged by electron-builder. They are
  kept external to the main/preload bundles by `electron.vite.config.ts`.

## Setup

```bash
npm install
cp .env.example .env.local   # optional – providers can also be set in Settings
npm start
```

`.env.local` is gitignored. **Never commit real credentials.**

The main process loads `.env.local` then `.env` into `process.env` on startup
(`src/main/env.ts`). This matters because electron-vite only forwards
`VITE`-prefixed variables, and provider keys are deliberately unprefixed. Real
environment variables take precedence over the files. Packaged builds do not
ship `.env*` — configure credentials through Settings there (they are encrypted
with `safeStorage`).

## Scripts

| Script               | Purpose                                             |
| -------------------- | --------------------------------------------------- |
| `npm start`          | Dev server with main/preload/renderer hot reload    |
| `npm run build`      | Bundle main, preload and renderer                   |
| `npm run preview`    | Build and run the production bundles locally        |
| `npm run package`    | Build installers with electron-builder              |
| `npm test`           | Jest (jsdom) unit tests                             |
| `npm run test:smoke` | Boots the built app and verifies the preload bridge |
| `npm run lint`       | ESLint                                              |

## Architecture

```
src/
├── main/                  # Everything privileged: Node, Electron, the agent
│   ├── main.ts            # App bootstrap, window, DB + IPC registration
│   ├── ai/
│   │   ├── agent.ts       # ToolLoopAgent definition + system instructions
│   │   ├── provider.ts    # Provider factory (AI Gateway / OpenAI-compatible)
│   │   └── settings.ts    # Settings persisted with safeStorage-encrypted keys
│   ├── tools/             # filesystem, shell, clipboard, RAG tool definitions
│   ├── db/                # better-sqlite3 client, schema, session CRUD
│   └── ipc/               # Typed channel contract + handlers
├── hooks/                 # use-agent-chat (IPC transport), use-ipc
├── components/            # chat/*, 50 ai-elements/*, vendored shadcn ui/*
└── renderer/              # App shell and pages (Chat, Tools, Sessions)
```

**Routes:** `/` Agent Chat · `/tools` Tools & Sandbox · `/sessions` Session History

### The agent loop

`createDesktopAgent()` builds a `ToolLoopAgent` with the shared `allTools`
registry and a step budget of 30. A chat turn is always **stateless**: the
renderer sends the full `UIMessage[]` to main, main converts it with
`convertToModelMessages`, streams, and forwards every `fullStream` chunk back
over the `agent:stream-chunk` event.

Both the chat agent and the focus copilot receive the active project when their
surface is scoped: `ai/project-context.ts` renders a shared "Active project"
block (outcome, deadline, repo path, task progress) into the system prompt, and
the agent cache keys on the project so scoped and unscoped chats never share an
agent.

### Streaming

The renderer folds each JSON chunk into UI parts in `use-agent-chat.ts`:
`text-delta` → `text` parts, `reasoning-delta` → `reasoning` parts,
`tool-call` / `tool-result` → `tool-<name>` parts with AI SDK v7 states
(`input-streaming`, `input-available`, `output-available`, `output-error`,
`output-denied`).

When the stream finishes the renderer hands the reconstructed conversation back
to main via `sessions:save-messages` for persistence — the renderer owns the
message shapes, so there is exactly one reconstruction path.

### Human-in-the-loop approvals

Tools listed in `toolApprovalPolicy` (`writeFile`, `deleteFile`, `runShell`,
`writeClipboard`) always require approval. The agent emits a
`tool-approval-request`, the UI renders an approve/reject card, and answering it
rewrites the tool part to `approval-responded` before re-running the turn —
`convertToModelMessages` turns that into the `tool-approval-response` message the
model needs to continue.

Executing a tool directly from the Tools page goes through the same policy: main
shows a confirmation dialog before running anything that requires approval.### Providers

The provider registry lives in `src/main/ai/registry.ts` and is the single
source of truth for the app, the IPC layer and the Settings dialog. Every
provider is reached through `@ai-sdk/openai-compatible`, except the AI Gateway
which uses its own SDK.

Entries are ordered free-first, and `pickDefaultProvider()` selects the first
provider that is both **configured in the environment** and has a curated free
model. So a checkout with only `GROQ_API_KEY` set starts on Groq with no
configuration at all.

| Provider | Base URL | Free coding default |
| --- | --- | --- |
| Groq | `api.groq.com/openai/v1` | `openai/gpt-oss-120b` |
| OpenRouter | `openrouter.ai/api/v1` | `qwen/qwen3.8-27b:free` |
| Gemini | `generativelanguage.googleapis.com/v1beta/openai/` | `gemini-3.8-flash` |
| NVIDIA NIM | `integrate.api.nvidia.com/v1` | `moonshotai/kimi-k2.6` |
| Cohere | `api.cohere.ai/compatibility/v1` | (live list only) |
| AI Gateway | — | `openai/gpt-4o-mini` |
| OpenAI / Anthropic / Ollama | standard endpoints | — |

### Automatic provider fallback

Free tiers run out. When a turn fails on the active provider, `agent:chat`
retries it on the next configured provider instead of showing the user a 429.
The rules, all in `src/main/ai/fallback.ts`:

- The user's selection is always attempted first — an explicit choice is never
  silently second-guessed.
- Fallback candidates are other configured providers in registry order (free
  tiers first) that have a curated default model, capped at 3 attempts.
- **Only retryable failures fall back**: HTTP 408/409/425/429/5xx, and transient
  network errors. A 400, an invalid key or a malformed tool call will not be
  retried elsewhere — that would just burn another provider's quota and hide the
  bug. The SDK's `RetryError` wrapper is unwrapped so a wrapped 401 is not
  mistaken for a transient failure.
- **Fallback stops as soon as any content reaches the renderer.** Retrying after
  output has been displayed would duplicate or contradict what the user can
  already see. Only content-bearing chunks count — lifecycle chunks such as
  `start` do *not*, because the SDK emits `start` before a provider error (a 429
  stream looks like `["start", "error"]`).

Failures surface as an `agent:stream-fallback` event; the Chat page shows a
notice naming the provider that took over. The whole thing can be turned off
with the **Automatic provider fallback** toggle in Settings.

**Model lists are fetched live.** `listProviderModels()` calls the provider's
own `/models` endpoint (sorted free-first, e.g. anything ending in `:free`), and
the curated `freeModels` entries are only a fallback for when that lookup is
unavailable or unauthenticated. This is deliberate — these catalogs churn, and a
hardcoded list rots within weeks.

Credentials come from Settings (encrypted via `safeStorage`) first, then from
the environment, so plaintext keys never touch disk. `settings:save` merges into
the existing settings rather than replacing them, so saving does not discard
unrelated configuration such as custom providers or embedding settings.

### Storage & RAG

One SQLite database in `userData` (`vellum.db`) holds `sessions`, `messages`,
and the RAG tables (`chunks` + a `sqlite-vec` `embeddings` virtual table).
`indexFile` chunks and embeds a document; `searchDocs` runs a KNN query over the
vectors.

Embeddings are configured **separately** from the chat provider, because most
free chat tiers (Groq, OpenRouter's free models) do not expose an embeddings
endpoint. Set both `EMBEDDING_PROVIDER` and `EMBEDDING_MODEL`, and make sure
`EMBEDDING_DIM` matches the model — otherwise RAG reports a clear configuration
error instead of failing at request time. Changing the dimension after indexing
requires re-indexing, since the `vec0` table is created with a fixed width.

### Focus system

The Focus module is built in layers with clear boundaries:

- **Data** — `db/task-steps.ts` (breakdown checklists), `db/task-blocks.ts`
  (time boxes), `db/focus-sessions.ts` (phase history + streaks). The `tasks`
  table gains an `estimate_mins` column via an idempotent migration.
- **AI** — `ai/task-copilot.ts` exposes three schema-validated operations
  (`breakdownTask`, `expandBrainDump`, `planDay`) through `generateObject`, so
  nothing parses free-form JSON.
- **Copilot agent** — `ai/task-copilot-agent.ts` is a `ToolLoopAgent` whose tools
  (`tools/tasks.ts`) can list, create, schedule, and (with approval) edit tasks
  and blocks, plus read-only context tools over the web, workspace, filesystem,
  and RAG index. Approval is risk-based: additive actions run straight through,
  while edits and deletions pause as approve/deny cards. The panel reuses the
  chat streaming/approval plumbing via `hooks/use-copilot-chat.ts`.
- **Audio** — `lib/focus-audio.ts` synthesises white/pink/brown noise and
  binaural beats at runtime with the Web Audio API. No assets, no network.
- **State** — `hooks/use-focus-timer.ts` (UI-free interval machine) and
  `hooks/use-focus-audio.ts` (engine binding) keep the views thin.
- **Views** — `pages/Tasks.tsx` is a two-tab surface: **Today** (a calm, finite
  timeline of blocks) and **Board** (the planning kanban), plus a focus overlay,
  a steps sheet, a brain-dump dialog, and a schedule dialog.

The two prompts that matter most (breakdown and brain dump) are written to be
anti-overwhelm: fewer, smaller, action-first items, with priority by real
consequence rather than volume.

### Projects

A project is the unit of *intent* the rest of the productivity system hangs off,
because "project" used to mean four disconnected things: an outcome, a repo, a
notebook, and a set of tasks. `db/projects.ts` unifies them behind one row with
nullable `project_id` columns on `tasks`, `task_blocks`, `sessions`, and
`terminal_sessions` — so a project is an *optional lens*, not a mandatory
container.

- **Data** — `db/schema.ts` defines `projects` and its foreign keys, and the
  `MIGRATE_INBOX_PROJECT` / `MIGRATE_ASSIGN_ORPHAN_TASKS` data migrations seed an
  **Inbox** project (`id = 'inbox'`) and file every pre-existing task into it.
  Deleting a project re-homes its tasks to the Inbox rather than deleting work;
  the Inbox itself cannot be deleted.
- **Rollups** — `projectRollup(id, now?)` answers "how far along is this, what's
  overdue, how much focus has it received today?" in one query, driving the
  Projects page and the sidebar without the UI stitching four reads together.
- **Copilot** — the task tools gain `listProjects`, `createProject`, and an
  approval-gated `assignTaskToProject`; `listTasks` and task creation are
  project-aware. When its surface is scoped, the copilot's system prompt carries
  the shared "Active project" block plus a filing instruction, so new capture
  lands in the right place.
- **Views** — `pages/Projects.tsx` is a grid of rollup cards at `/projects` and a
  project detail at `/projects/:projectId`; `components/sidebar/ProjectsMenu.tsx`
  makes the rail a project switcher. Tasks, Terminal, and Chat all accept a
  `?project=` scope via the shared `hooks/use-project-scope.ts`: lists filter to
  the project, anything created while scoped is filed into it (a Terminal
  session starts in the project's `repo_path` when set), and a header chip clears
  the scope. So a project is a *view* over the work, not a copy of it. When only
  the Inbox exists (e.g. onboarding was skipped) the grid is replaced by a
  first-run empty state that still surfaces the Inbox, so quick capture is never
  stranded.
- **Onboarding** — because the Inbox is seeded for every install, "no projects"
  really means *only the Inbox exists*. On first launch `AppLayout` renders
  `components/onboarding/OnboardingDialog.tsx`: a guided welcome → project →
  first task → ready flow. It is gated on both the persisted
  `onboardingCompleted` setting **and** the absence of any real project, so an
  existing user upgrading into the build never sees it. Every step is skippable;
  the project is created on the last step so backing up can't leave a half-made
  row behind.

## Testing notes

Several dependencies (`streamdown`, `@streamdown/*`, `nanoid`,
`react-resizable-panels`) are ESM-only and cannot be `require`d by Jest. They are
mapped to lightweight mocks in `.erb/mocks/` via `jest.config.js`.

## Security

- `.env.local` and other `.env*` files are gitignored; `.env.example` is the
  committed template.
- If secrets were ever committed, **rotate them** — removing a file from the
  working tree does not remove it from git history.
- Renderer code never imports Node or Electron directly; everything goes through
  the `contextBridge` surface defined in `src/main/preload.ts`.
