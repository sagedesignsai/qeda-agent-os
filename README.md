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
| **Focus** | Task manager with a Pomodoro timer and agent-assisted prioritisation |

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
