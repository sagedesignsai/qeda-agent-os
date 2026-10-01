# OpenCode as a second chat engine

> ## ⚠ Superseded in part — see `docs/opencode-v2-protocol.md`
>
> This plan was written from `opencode.ai/docs/sdk`, which documents the **v1**
> API. A live probe of the installed binary (`v2.0.18`) found a different API
> under `/api`, and **no v2 SDK published on npm** (`@opencode-ai/sdk` latest is
> `1.18.34`). The following are now known to be wrong or incomplete:
>
> - **Do not use `@opencode-ai/sdk`.** Write a thin client over `/api/*` typed
>   from the server's own `/openapi.json`. This also removes R4/R10 below.
> - **Server lifecycle (§7):** opencode runs a **background service** on a
>   dynamic port (observed `http://127.0.0.1:49374`), discoverable via
>   `opencode service status`; do not spawn on a fixed `4096`.
> - **`/global/health` does not exist** in v2 — the root serves the desktop SPA
>   (`200 text/html`). Identity is `GET /api/info`.
> - **Streaming (`/api/event`, §4):** SSE carries JSON per `data:` line, and the
>   event name is the JSON `type` field (`server.connected`, `: heartbeat`),
>   **not** an SSE `event:` line. The event taxonomy is still unenumerated — this
>   remains the main open item.
> - **Approval (§5):** `Permission.Reply` is the bare enum
>   `"once" | "always" | "reject"`, not `{ response, remember }`; respond to
>   `POST /api/session/{id}/permission/{requestID}/reply`. Abort is
>   `POST /api/session/{id}/interrupt`, not `session.abort`.
> - **Directory scoping (§6):** v2 sessions carry `location.directory` and can be
>   moved, so one server serves many directories — the per-repo server model is
>   unnecessary.
>
> Verified details, endpoint inventory, and remaining open items live in
> `docs/opencode-v2-protocol.md`.

**Status:** plan only — nothing implemented. Every claim about the OpenCode
surface below is sourced from `opencode.ai/docs/sdk` and `opencode.ai/docs/server`
(both read at time of writing); claims that still need a live probe are marked
**[verify]**.

**Decision taken:** embed OpenCode as an *alternate engine* behind the existing
`agent:chat` surface. Qeda's own `ToolLoopAgent` stays the default and stays
authoritative; the OpenCode server is opt-in per install.

**Why bother:** `src/main/ai/registry.ts` already registers `opencode` (OpenCode
Zen, `https://opencode.ai/zen/v1`) but deliberately lists `freeModels: []`,
because a prior live probe found the free tier rejects any non-OpenCode client
with `403 FreeTierError: Free tier can only be used from within OpenCode`
(`docs/services-audit.md` §F4). Running the **real** opencode server is the only
legitimate way to use those models — this engine is that path, not a
reimplementation of it. The v2 probe confirmed this end to end: a live session
was observed running `model: { id: "space-bunny-free", providerID: "opencode" }`
with `outcome: "succeeded"`.

---

## 1. The core problem: two incompatible agent protocols

Qeda and OpenCode agree on vocabulary (session, message, part, event, approval)
and disagree on semantics. That is the whole difficulty, and it is worth stating
plainly before any code is proposed.

| Concern | Qeda today | OpenCode |
| --- | --- | --- |
| Loop location | in-process, `ToolLoopAgent` | external `opencode serve` process |
| Turn shape | **stateless** — renderer sends the full `UIMessage[]` every turn | **stateful** — server owns history; you `prompt` a session |
| Streaming | main pushes JSON `fullStream` chunks over IPC | `GET /event` SSE bus (`{ type, properties }`) |
| Approval | `tool-approval-request` chunk → renderer rewrites the part → **the whole turn re-runs** | server holds a *pending permission*; you `POST /session/:id/permissions/:permissionID` to unblock it |
| History store | `vellum.db` (`sessions`, messages as `UIMessage`) | server-side session/message/part store |
| Tool registry | `src/main/tools/` (`allTools`, `chatApprovalPolicy`) | server-side tools + LSP/MCP |
| Model selection | `resolveModelChain()` + cross-provider fallback | `session.prompt` `model: { providerID, modelID }` |

The approval row is the one that breaks a naive adapter: Qeda has **no
long-lived pending operation**, so there is nothing for a permission response to
unblock. Any plan that ignores this produces a UI where clicking "Approve" does
nothing.

### Recommended strategy

**Translate OpenCode → Qeda's existing wire format, and keep the renderer's
reducer unchanged.** Specifically:

- The engine adapter subscribes to `/event`, translates bus events into the
  *same* `TextStreamPart`-shaped JSON chunks that `agent:stream-chunk` already
  carries, and emits `agent:stream-done` when the session goes idle.
- `src/hooks/use-agent-chat.ts` and its `applyStreamPart` reducer stay untouched
  for the happy path. This is the single biggest cost saver: the reducer, the
  `ai-elements` renderers, the persistence call, and the tool cards all keep
  working with zero changes.
- The **approval path is the one deliberate exception** (§5).

The rejected alternative — a parallel `opencode:stream-*` event family with its
own transport and its own reducer — doubles the renderer's surface for
fidelity we do not need, since the UI only ever renders text, reasoning, and
tool parts.

---

## 2. New module: `src/main/opencode/`

Follows the existing main-process layout (`ai/`, `pty/`, `services/`): one
concern per file, banner comments explaining *why*.

| File | Responsibility |
| --- | --- |
| `server.ts` | Lifecycle of the managed `opencode serve` process: lazy singleton, health poll, port choice, `close()` on quit. Attach-mode (user-supplied `baseUrl`) lives here too. |
| `client.ts` | `createOpencodeClient({ baseUrl })` wrapper + `auth.set` seeding from Qeda's encrypted settings. |
| `session-map.ts` | Qeda `session.id` → opencode `sessionID`, persisted (§6). |
| `translate.ts` | Pure: bus event → `TextStreamPart` chunk; permission event → `tool-approval-request`. **The only file with unit-testable protocol logic.** |
| `engine.ts` | Implements the engine interface (§3); subscribes, prompts, translates, forwards to `mainWindow`. |

`translate.ts` must be pure and Electron-free (no `import { app }`, no
`BrowserWindow`) so it is testable under Jest without booting Electron — the same
discipline `ai/fallback.ts` already follows.

---

## 3. Engine dispatch in `agent:chat`

Introduce a thin interface both engines satisfy, and dispatch on a setting.

```ts
// src/main/ai/engine.ts  (new)
export interface ChatEngine {
  /** Run one turn; pushes chunk/done/error over the existing agent:stream-* events. */
  run(turn: AgentTurn): Promise<void>;
  /** Whether an approval resumes a pending op (opencode) or re-runs a turn (local). */
  readonly approvalResumesInPlace: boolean;
}
```

- `src/main/ipc/handlers/agent-chat.ts` keeps its current body as the `local`
  engine (the fallback loop, `isOutputChunk`, `resolveModelChain`), and gains a
  branch: when the setting selects `opencode`, hand off to `opencode/engine.ts`.
- **The cross-provider fallback loop does not apply to the opencode engine.**
  OpenCode owns provider selection and its own retry; wrapping it in
  `isRetryableProviderError` would misclassify server errors as provider errors.
  The `agent:stream-fallback` event simply never fires for this engine.
- `src/main/ipc/index.ts` gains `registerOpencodeHandlers({ mainWindow })` if a
  dedicated handler module is needed for lifecycle/settings channels (§7);
  otherwise the engine plugs into the existing `agent:chat` handler and no new
  module is registered.

Adding a top-level directory under `src/` does **not** require an `@source` line
here — `src/main/**` is not Tailwind-scanned. That rule only bites for renderer
code (§8).

---

## 4. Streaming translation (the heart of it)

OpenCode exposes `POST /session/:id/prompt_async` (returns `204`, no wait) and a
`GET /event` SSE bus. **That pair is the streaming architecture** — `session.prompt`
(which blocks until the assistant message completes) is for structured-output
calls, not for rendering a live turn. **[verify]** that the SDK surfaces
`promptAsync`; it is generated from the OpenAPI spec and the endpoint is
documented, so it should exist as `client.session.promptAsync` or similar.

The bus event **names** are not enumerated in the public docs — only the shape
`{ type, properties }` is. They must be enumerated once against a live server
(`GET /doc`, then `task` a session) before `translate.ts` is written. Presumed
mapping, to confirm:

| OpenCode bus event | Emitted chunk |
| --- | --- |
| `message.part.updated`, part `type: "text"` | `text-delta` |
| part `type: "reasoning"` | `reasoning-delta` |
| part `type: "tool"`, state `call` | `tool-input-start` then `tool-call` |
| part `type: "tool"`, state `completed` | `tool-result` |
| part `type: "tool"`, state `error` | `tool-error` |
| permission request | `tool-approval-request` (see §5) |
| `session.idle` / assistant message finalized | `finish`, then `agent:stream-done` |

Two fidelity notes:

- **Tool ids.** Qeda's reducer keys tool parts by `toolCallId`. OpenCode parts
  have their own ids; the adapter must map them 1:1 and stay consistent for the
  call→result pair, or the tool card will render an empty second card.
- **Chunk text.** `applyStreamPart` reads `part.text ?? part.delta`. Emitting
  both fields (same value) removes any ambiguity about which the SDK populates.

---

## 5. Approval: the one renderer change

This is the only place the "renderer untouched" claim breaks, and it needs a
deliberate decision.

Today (`use-agent-chat.ts` → `respondToApproval`): the hook rewrites the tool
part to `approval-responded` and calls `runTurn()`, re-sending the full message
list. Main's `convertToModelMessages` turns that part into a
`tool-approval-response` the model continues from. Stateless, and it works.

OpenCode instead parks a permission request server-side and waits. Nothing
should re-run; the correct response is
`POST /session/:id/permissions/:permissionID` with `{ response, remember? }`.

Options, in order of preference:

1. **Engine-aware approval channel (recommended).** Add
   `agent:approval-respond` to `IpcChannels`. The hook calls it first; if it
   resolves `{ resumedInPlace: true }` the hook skips `runTurn()`, otherwise it
   proceeds as today. One channel, one branch, `approvalResumesInPlace` from §3
   decides the branch. The local engine's handler is a no-op returning
   `{ resumedInPlace: false }`.
2. **Pre-approve at the server.** Configure opencode with a tool/agent policy
   that auto-allows read-only tools and never raises a permission, so the
   approval path is simply unreachable for this engine. Cheapest, but it gives
   up Qeda's "approve the work" contract for that engine — a real product loss.
3. **Ignore approvals for v1** and document that switching to the OpenCode
   engine disables the approval gate. Not acceptable for a write-capable agent;
   listed only to be rejected explicitly.

`remember?` on the permission response maps naturally onto a future "always
allow this tool" affordance, but is out of scope for the first slice.

---

## 6. Session identity and persistence

Qeda is the source of truth for the **UI**; OpenCode is the source of truth for
its own **run state**. Keeping both means a user can switch engines mid-project
without losing visible history.

- **Mapping.** `vellum.db` needs a durable Qeda-session → opencode-session link.
  Per `AGENTS.md`, adding a column is **two edits**: add it to the `CREATE TABLE`
  in `src/main/db/schema.ts` *and* add an `ALTER TABLE … ADD COLUMN` guard in
  `applyMigrations()`. A nullable `opencode_session_id TEXT` on `sessions` is the
  minimal form; a side table is the alternative if a session should ever map to
  more than one opencode session (forks — `POST /session/:id/fork` exists).
- **Creation.** Lazily, on the first turn for a Qeda session that has no mapping:
  `session.create({ body: { title } })`, persist the id, then prompt.
- **Prompting.** Only the **new** user message is sent to opencode (it owns
  history). The adapter must not replay Qeda's full `UIMessage[]`. This is the
  inverse of the local engine and must be handled in `opencode/engine.ts`, not
  in the shared handler.
- **Hydration.** `use-agent-chat.ts` already hydrates from `sessions:messages`
  (i.e. from `vellum.db`). Leave that alone — do **not** fetch
  `session.messages` from opencode for the UI. Persist the translated turn back
  through the existing `sessions:save-messages` path so the conversation list,
  rail, and restart behaviour are identical across engines.
- **Revert/undo is out of scope.** OpenCode's `revert`/`unrevert` and Qeda's
  message model do not reconcile cleanly; note it and skip.

---

## 7. Lifecycle, credentials, and packaging

**Process lifecycle.** `server.ts` owns a singleton:

- Managed mode: spawn `opencode serve` on a **free port** (not hardcoded 4096 —
  a user with the TUI running already owns 4096), poll
  `global.health()` until `{ healthy: true }` or timeout (the SDK's default is
  5000 ms; make it configurable and surface failure rather than hanging a turn).
- Attach mode: user supplies a `baseUrl`; poll health, never spawn, never kill.
- Shut down on `before-quit`, and kill the child on `SIGINT`/crash so an orphaned
  server does not linger. This mirrors how `pty/manager.ts` owns its processes.
- Optional hardening: `OPENCODE_SERVER_PASSWORD` (documented, basic auth) on the
  managed server, so any local process cannot drive the agent. Recommended given
  the server holds shell + filesystem access.

**Credentials.** Qeda already stores provider keys encrypted via `safeStorage`
(`ai/settings.ts`). Seeding them into opencode with `auth.set({ path: { id },
body: { type: 'api', key } })` means the user does not re-enter keys. Two
caveats to document: this copies secrets into opencode's own store (a second
at-rest location), and provider ids must be reconciled between Qeda's registry
and opencode's `config.providers()` / `provider` lists.

**Packaging — the biggest deployment risk.** `opencode serve` is a **separate
binary**; the `opencode-ai` npm package uses a `postinstall` script to select a
native binary for the platform. A packaged, notarized Qeda build must therefore
either:

- (a) bundle the correct platform binary per target (mac arm64/x64, win nsis,
  linux AppImage) via `asarUnpack` + `extraResources` — this is a new native
  artifact class alongside `better-sqlite3`/`node-pty`/`sqlite-vec`, and belongs
  in **`release/app/package.json`**, not the root manifest; or
- (b) require a user-installed `opencode` on `PATH` and degrade gracefully when
  missing (health poll fails → the engine option is disabled in Settings with an
  install hint).

**Which dependency file.** `@opencode-ai/sdk` itself is pure JS/ESM → root
`package.json`. The **binary** is the native artifact → `release/app/package.json`
if bundled. Do not conflate the two.

**Bundling.** `electron.vite.config.ts` builds the main bundle from the
`external` list read out of `release/app/package.json`. An SDK left out of that
list gets bundled; an ESM-only package with top-level await can break a CJS main
bundle. **[verify]** whether `@opencode-ai/sdk` needs an explicit `external`
entry.

---

## 8. Settings and UI surface

- `AppSettings` (`ai/settings.ts`) gains `agentEngine?: 'local' | 'opencode'`
  and an optional `opencodeBaseUrl?: string` (attach mode). Default `'local'`, so
  existing installs are unaffected.
- New channels in `ipc/channels.ts` (the one place, per the contract rule):
  `opencode:status` (event — running/stopped/version), `opencode:start`,
  `opencode:stop`, plus `agent:approval-respond` from §5.
- Settings UI: an engine picker plus a live server status readout (mirroring how
  `settings:changed` feeds the sidebar footer). When the server is unreachable,
  the picker explains why rather than failing a turn.
- No new Tailwind `@source` line is needed: this adds files under
  `src/components/` and `src/main/`, both already covered or not scanned.

---

## 9. Tests

Following the repo's conventions (flat `src/__tests__/`, jsdom, `isolatedModules`):

- `@/main/opencode/translate` — pure unit tests: bus event → chunk mapping,
  tool-id stability across call/result, idle → `finish`. No Electron, no server.
- `@/main/opencode/session-map` — mapping persistence round-trip using the
  documented in-memory DB recipe (`applyMigrations` + `useTestDatabase`).
- `@/main/db` migration — assert the new `opencode_session_id` column exists on a
  DB created from `CREATE TABLE` and is back-filled by `applyMigrations()` on an
  older one.
- `@/hooks/use-agent-chat` — the approval branch: `resumedInPlace: true` must
  **not** re-run the turn. Table-driven so both engines are covered.
- **Jest ESM hazard.** `@opencode-ai/sdk` is ESM-only; if any module under test
  imports it transitively, it needs *both* a mock in `.erb/mocks/` *and* a
  `moduleNameMapper` entry in `jest.config.js`, or the whole suite fails to load.
  Keeping `translate.ts` free of SDK imports avoids this for the important tests.
- `npm run build` before `npm test` (the `check-build-exists` guard), and
  `python3 scripts/verify-ipc-split.py` after touching the IPC layer.

---

## 10. Risks and open questions

| # | Risk | Mitigation |
| --- | --- | --- |
| R1 | `opencode serve` binary not present in packaged builds | Decide bundle vs. `PATH` (§7); feature-detect and disable the option when absent |
| R2 | Bus event names unknown until probed | Enumerate against a live server before writing `translate.ts` |
| R3 | Approval semantics differ from Qeda's re-run model | Engine-aware `agent:approval-respond` (§5) |
| R4 | ESM-only SDK breaks Jest load | Mock + `moduleNameMapper`; keep `translate.ts` SDK-free |
| R5 | Bundling an ESM SDK into a CJS main bundle | `external` entry if required |
| R6 | Second copy of provider secrets in opencode's store | Document; or seed only on explicit user action |
| R7 | Local unauthenticated server with shell access | `OPENCODE_SERVER_PASSWORD` on the managed server |
| R8 | Version skew: SDK types generated from a server we do not pin | Pin the SDK version and the binary version together |
| R9 | Two engines, two truth stores → confused history | Qeda DB remains the UI truth; opencode is run state only (§6) |

**Open questions needing a decision before implementation:**

1. Bundle the opencode binary, or require it on `PATH`? (R1 — changes packaging.)
2. Approve-at-the-server (option 2 in §5) or engine-aware approval channel
   (option 1)? (Product contract vs. implementation cost.)
3. Seed provider keys into opencode automatically, or ask first? (R6.)

---

## 11. Suggested milestones

1. **Protocol spike (no UI).** Install the SDK, run `opencode serve`, enumerate
   `/event` bus events, and prove a round trip: `session.create` →
   `prompt_async` → translate one text-delta → log it. Resolves R2 and R1.
2. **`translate.ts` + tests.** Pure mapping, fully unit-tested, no Electron.
3. **Engine wiring.** `agent:chat` dispatch on the setting; local stays default.
4. **Approval channel.** `agent:approval-respond` + the hook branch + tests.
5. **Lifecycle + settings UI.** Start/stop, health readout, engine picker.
6. **Persistence + migration.** `opencode_session_id` column and its guard.
7. **Packaging.** Bundle/native-artifact work, or the `PATH` fallback.
