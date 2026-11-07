<p align="center">
  <img src="./assets/logomark.svg" alt="Qeda Logo" width="80" height="auto" />
</p>

<h1 align="center">Qeda</h1>

<p align="center">
  <strong>Finish what you start. A local agent OS built for completion.</strong><br>
  <em>From the isiZulu word <strong>qeda</strong> — to finish, complete, or bring to an end.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white" alt="Electron 44" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white" alt="TypeScript 7" />
  <img src="https://img.shields.io/badge/AI%20SDK-v7-000000?logo=vercel&logoColor=white" alt="Vercel AI SDK v7" />
  <img src="https://img.shields.io/badge/Bun-1%2B-F9F1E1?logo=bun&logoColor=black" alt="Bun" />
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License" />
</p>

A **local agent OS** built on Electron 44, React 19, TypeScript 7, and the Vercel AI SDK v7.
Qeda runs **9 specialized AI agents** with **47+ tools** across a single SQLite database with
**51+ tables**. The agent runs in the Electron **main process** with real access to the local
machine — filesystem, shell, clipboard, and a local document index — and the renderer talks to
it exclusively over **34 typed IPC handlers**.

Describe a goal. Qeda plans the work, proposes each command, and waits for your approval before
running anything. What comes back is not an ephemeral chat log but a record: every command, its
output, and its exit code, written down and inspectable.

### Modules

| Module | What it does |
| --- | --- |
| **Chat** | Conversational agent with tool use, streaming reasoning, and deep research runs with citations |
| **Workspace** | Block-editor notebooks, version history, and local RAG over your own pages |
| **Terminal** | Agent Mode (goal → plan → approve → execute) and Shell Mode (raw PTY + xterm.js) |
| **Projects** | The spine: an outcome with a deadline, its tasks, its repo, its docs, and its chats in one place |
| **Tasks & Focus** | Task manager with time blocking, synthesised soundscapes, focus sessions, and an AI copilot |
| **Correspondence** | Legal-grade letter drafting, contact management, dispatch tracking with escalation sequences |
| **Documents** | Block-structured document studio with AI-assisted drafting agent |
| **Studio** | Screen recording editor with AI copilot: kinetic zoom, captions, effects, social media kits |
| **Music** | Music library, playlists, SoundLab synthesis (BPM/key entrainment), and scene-based playback |
| **Motion** | 3D product showcase scenes with GLTF models, environments, and AI copilot |
| **Trace** | 2D vector animation workspace with SVG elements, keyframe tracks, and AI copilot |
| **Builder** | Coding agent integration with git worktree isolation and E2B cloud sandbox support |
| **Offline AI** | Local private inference with Transformers.js models, no network required |
| **Onboarding** | First-launch guided flow: welcome → project → first task → ready |

## The name

*Qeda* (pronounced *k'e-da* / *!e-da*) is an **isiZulu** word meaning **to finish, to complete, or to bring to an end**.

In modern productivity and software development, the hardest challenge is rarely starting — it is seeing work through to the finish line. Qeda is engineered around that single promise: taking human intention and carrying it through plans, approvals, and execution until the job is done.

The visual mark pairs a bold circular "Q" with an energetic lightning finish, symbolizing the transition from intention to accomplished outcome.

Built with electron-vite, React 19, TypeScript 7, and Tailwind CSS, layering a high-performance, privileged local agent runtime directly into the OS shell.

## Requirements

- Bun 1+
- Native modules (`better-sqlite3`, `sqlite-vec`) are declared in
  `release/app/package.json` and rebuilt/packaged by electron-builder. They are
  kept external to the main/preload bundles by `electron.vite.config.ts`.

## Setup

```bash
bun install
cp .env.example .env.local   # optional – providers can also be set in Settings
bun start
```

`.env.local` is gitignored. **Never commit real credentials.**

The main process loads `.env.local` then `.env` into `process.env` on startup
(`src/main/env.ts`). This matters because electron-vite only forwards
`VITE`-prefixed variables, and provider keys are deliberately unprefixed. Real
environment variables take precedence over the files. Packaged builds do not
ship `.env*` — configure credentials through Settings there (they are encrypted
with `safeStorage`).

## Scripts

| Script                     | Purpose                                                     |
| -------------------------- | ----------------------------------------------------------- |
| `bun start`                | Dev server with main/preload/renderer hot reload            |
| `bun run build`            | Bundle main, preload and renderer                           |
| `bun run build:light`      | Bundle without source maps                                  |
| `bun run preview`          | Build and run the production bundles locally                |
| `bun run package`          | Build installers with electron-builder                      |
| `bun run package:appimage` | Build Linux AppImage only                                   |
| `bun test`                 | Jest (jsdom) unit tests                                     |
| `bun run test:smoke`       | Boots the built app and verifies the preload bridge         |
| `bun run test:export`      | Export smoke test via Electron                              |
| `bun run typecheck`        | TypeScript type check (no emit)                             |
| `bun run lint`             | ESLint                                                      |
| `bun run lint:fix`         | ESLint with auto-fix                                        |
| `bun run models:catalog`   | Build model catalog at pre-build time                       |

## Architecture

```
src/
├── main/                          # Everything privileged: Node, Electron, the agents
│   ├── main.ts                    # App bootstrap, window, DB + IPC registration
│   ├── ai/                        # 20 files: 9 agents, provider registry, fallback
│   │   ├── agent.ts               # Chat ToolLoopAgent (40/60/120 step budgets)
│   │   ├── terminal-agent.ts      # Goal → plan → approve → execute shell agent
│   │   ├── task-copilot-agent.ts  # Task breakdown, scheduling, brain dump expansion
│   │   ├── studio-copilot-agent.ts# Video editing: kinetic zoom, captions, effects
│   │   ├── motion-copilot-agent.ts# 3D scene editing and animation
│   │   ├── music-copilot-agent.ts # Music library, playlists, scene mixing
│   │   ├── correspondence-copilot-agent.ts # Legal letter drafting, contacts
│   │   ├── document-drafter-agent.ts       # Block-structured document creation
│   │   ├── model-builder-agent.ts  # 3D model building and scene state
│   │   ├── trace-copilot-agent.ts  # 2D vector animation editing
│   │   ├── registry.ts            # Provider registry (9 providers, free-first)
│   │   ├── fallback.ts            # Automatic provider fallback on retryable errors
│   │   └── settings.ts            # safeStorage-encrypted credentials
│   ├── tools/                     # 25 files: 47+ tools across all domains
│   │   ├── filesystem.ts          # readFile, listDir, writeFile, deleteFile
│   │   ├── shell.ts               # runShell (approval-gated)
│   │   ├── clipboard.ts           # read/write clipboard
│   │   ├── web.ts                 # webSearch, fetchUrl, advancedSearch, scrapePage
│   │   ├── rag.ts / workspace-rag.ts # searchDocs, indexFile, RAG over pages
│   │   ├── workspace.ts           # listPages, createNotebook, writePage, etc.
│   │   ├── tasks.ts               # CRUD tasks, blocks, projects, focus stats
│   │   ├── studio.ts              # 769 lines: video editing tools
│   │   ├── computer-use.ts        # Window control, screenshots, mouse/keyboard
│   │   ├── browser-use.ts         # Browser automation with persistent sessions
│   │   ├── capability.ts          # Approval policy framework (5 capability classes)
│   │   └── policies/              # Per-surface approval policies (5 files)
│   ├── db/                        # better-sqlite3 client, 51+ table schema, CRUD
│   │   └── schema.ts              # 1,554 lines of idempotent DDL
│   ├── services/                  # External service integrations
│   │   └── registry.ts            # 10 services: Tavily, Exa, Serper, Firecrawl, etc.
│   ├── browser-use.ts             # Electron BrowserWindow for browser automation
│   └── ipc/                       # Typed channel contracts + 34 handlers
│       ├── channels.ts            # 2,170 lines of typed IPC definitions
│       └── handlers/              # 34 handler files covering all domains
├── hooks/                         # use-agent-chat (IPC transport), use-ipc, copilot hooks
├── components/                    # chat/*, 50+ ai-elements/*, shadcn ui/*
├── lib/                           # Shared utilities, focus-audio, etc.
├── stores/                        # Zustand state stores
└── renderer/                      # App shell, router, and 14+ page views
    ├── routes.tsx                 # Route tree with conditional homepage
    └── pages/                     # 15 page components
```

### Routes

| Route | Page | Description |
| --- | --- | --- |
| `/projects` | Projects | Project hub grid and detail view |
| `/chat` | Chat | Conversational agent with tool use and streaming |
| `/workspace` | Workspace | Block-editor notebooks with version history |
| `/terminal` | Terminal | Agent mode and shell PTY |
| `/tasks` | Tasks | Task manager, kanban board, focus timer, soundscapes |
| `/correspondence` | Correspondence | Legal letter drafting, contacts, dispatch tracking |
| `/documents` | Documents | Block-structured document studio |
| `/studio` | Studio | Screen recording editor with AI copilot |
| `/music` | Music | Music library, playlists, SoundLab synthesis |
| `/motion` | Motion | 3D product showcase scenes |
| `/trace` | Trace | 2D vector animation workspace |
| `/builder` | Builder | Coding agent with git worktree isolation |
| `/offline-ai` | OfflineAI | Local inference with Transformers.js |
| `/onboarding` | Onboarding | First-launch guided flow |

### Agents

Qeda runs **9 distinct AI agents**, each with its own system prompt, tool set, and approval policy:

| Agent | File | Step Budget | Purpose |
| --- | --- | --- | --- |
| **Chat Agent** | `agent.ts` | 40 (chat) / 60 (research) / 120 (notebook) | General-purpose conversational agent with all tools |
| **Terminal Agent** | `terminal-agent.ts` | Stateful loop | Goal → plan → approve → execute shell commands |
| **Task Copilot** | `task-copilot-agent.ts` | 20 | Task breakdown, scheduling, brain dump expansion |
| **Studio Copilot** | `studio-copilot-agent.ts` | 20 | Video editing: kinetic zoom, captions, effects, social kits |
| **Motion Copilot** | `motion-copilot-agent.ts` | 20 | 3D scene editing and animation |
| **Music Copilot** | `music-copilot-agent.ts` | 20 | Music library management, playlist creation, scene mixing |
| **Correspondence Copilot** | `correspondence-copilot-agent.ts` | 20 | Legal letter drafting, contact management, dispatch tracking |
| **Document Drafter** | `document-drafter-agent.ts` | 20 | Block-structured document creation and editing |
| **Trace Copilot** | `trace-copilot-agent.ts` | 20 | 2D vector animation editing |

### Tool Ecosystem

**47+ tools** across **25 files** in `src/main/tools/`:

- **Core**: `readFile`, `listDir`, `writeFile` (approval-gated), `deleteFile` (approval-gated), `runShell` (approval-gated), `readClipboard`, `writeClipboard` (approval-gated)
- **Web & Research**: `webSearch`, `fetchUrl`, `advancedSearch`, `scrapePage`, `libraryDocs`
- **RAG**: `searchDocs`, `listIndexed`, `indexFile`, `indexPage`, `removeFromIndex`
- **Workspace**: `listPages`, `findPages`, `getPage`, `createNotebook`, `writeNotebook`, `writePage`, `appendToPage`, `relatedPages`
- **Tasks & Projects**: `listTasks`, `createTask`, `addSteps`, `scheduleBlock`, `listProjects`, `createProject`, `assignTaskToProject`, `getFocusStats`
- **Studio (Video)**: `getTakeDetails`, `addKineticZoom`, `cutSilenceOrRange`, `setCaptions`, `generateSocialKit` (769 lines of tools)
- **Computer Use**: `captureScreenshot`, `moveMouse`, `click`, `typeText`, `pressKey`, `scroll`
- **Browser Use**: `openBrowser`, `navigateBrowser`, `clickSelector`, `typeSelector`, `screenshotBrowser`
- **Documents**: `createDocument`, `appendBlocks`, `insertBlocksAt`, `replaceBlock` (approval-gated)
- **Correspondence**: Contact and message management with state-machine dispatch tracking
- **Motion/Trace**: 3D scene and 2D vector animation operations

### Approval Policy

A capability-based approval framework with five classes: `read`, `write-local`, `destructive` (always requires user approval), `network`, and `cost`. Each agent surface has its own policy file derived from the same framework. Unclassified tools fail closed (denied with explanatory message). Per-surface policies live in `tools/policies/` (5 files).

### The agent loop

`createDesktopAgent()` builds a `ToolLoopAgent` with the shared `allTools`
registry and a per-mode step budget (40 chat / 60 research / 120 notebook —
see `STEP_BUDGETS`). A chat turn is always **stateless**: the
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

Tool execution across all agent surfaces (Chat, Terminal Agent, and Task Copilot) adheres to this policy: main process guards display approval cards and confirmation dialogs before running anything requiring permissions.

### Providers

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
| OpenCode Zen | — | Paid only (free tier blocked outside client) |
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

One SQLite database in `userData` (`qeda.db`) holds **51+ tables** organized
into domains:

| Domain | Key Tables |
| --- | --- |
| **Chat** | `sessions`, `messages` (AI SDK `UIMessage` rows with `parts_json`) |
| **Workspace** | `notebooks`, `pages`, `blocks` (paragraph, heading, code, todo, quote, image, divider), `tags`, `page_tags`, `backlinks`, `page_versions`, `pages_fts` (FTS5) |
| **RAG** | `embeddings` (sqlite-vec virtual table), `chunks` (companion text and metadata) |
| **Research** | `research_runs`, `research_sources`, `research_evidence` |
| **Terminal** | `terminal_sessions`, `terminal_blocks` (command-output pairs with approval states) |
| **Projects** | `projects`, `code_projects`, `project_files`, `project_file_scans` |
| **Tasks & Focus** | `tasks`, `task_steps`, `task_blocks`, `focus_sessions`, `gamification_state`, `xp_ledger` |
| **Correspondence** | `contacts`, `contact_channels`, `correspondence_messages`, `message_attachments`, `message_recipients`, `correspondence_events`, `sequences`, `sequence_steps`, `sequence_runs`, `sequence_step_runs` |
| **Documents** | `documents` (block-structured drafts with `data_json`) |
| **Studio (Video)** | `studio_takes` (recordings with cuts, zooms, captions, effects, overlays, styling, social kits, filmstrips, waveforms) |
| **Music** | `soundlab_sessions`, `soundlab_tracks`, `music_folders`, `music_tracks`, `music_playlists`, `music_playlist_tracks`, `music_scenes`, `music_state`, `focus_session_tracks` |
| **Motion (3D)** | `motion_projects` (GLTF scenes with environments) |
| **Trace (2D)** | `trace_projects` (SVG vector animation with keyframes) |
| **Builder** | `builder_sessions`, `builder_session_history` |

All 51+ DDL statements are idempotent (`CREATE TABLE IF NOT EXISTS`). Data
migrations converge (only fill NULLs, never overwrite). Each migration statement
runs independently with non-fatal error handling.

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
  makes the rail a project switcher. Tasks, Terminal, Chat, and Builder all
  accept a `?project=` scope via the shared `hooks/use-project-scope.ts`: lists
  filter to the project, anything created while scoped is filed into it (a
  Terminal session starts in the project's `repo_path` when set), and a header
  chip clears the scope. Builder is the one exception to the filing rule — it
  only *suggests* the project's `repo_path` as the folder picker's default, since
  a coding session has to be bound to a directory the user explicitly confirms
  (and main proves is a git repository). So a project is a *view* over the work, not a copy of it. When only
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

### External Services

Qeda integrates with **10 external services** beyond chat models, all optional
and configured via Settings or environment variables:

| Service | Category | Purpose |
| --- | --- | --- |
| **Tavily** | Search | AI-native web search with synthesized answers |
| **Exa** | Search | Neural search with inline content extraction |
| **Serper** | Search | Real Google SERP results |
| **Firecrawl** | Scrape | JavaScript-heavy page scraping to markdown |
| **Context7** | Docs | Version-specific library documentation |
| **Unsplash** | Images | Stock photography |
| **ElevenLabs** | Speech | High-quality text-to-speech |
| **Deepgram** | Speech | TTS (Aura) and STT (Nova) |
| **Cartesia** | Speech | Low-latency Sonic TTS |
| **E2B** | Sandbox | Cloud sandboxes for Builder sessions |

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
- Destructive tools (`writeFile`, `deleteFile`, `runShell`, `writeClipboard`)
  always require user approval before execution.
- Browser-use sessions are sandboxed with `contextIsolation: true` and
  `sandbox: true`.
- Computer-use is gated by `settings.computerUse` (enabled + allowlist).
- Correspondence rows are never written without user review (Harvest flow).
- Credentials in packaged builds are encrypted via Electron's `safeStorage`.
