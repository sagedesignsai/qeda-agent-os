# The Code page — a vibe-coding surface on opencode

**Status:** design, nothing implemented. Follows `docs/opencode-engine.md` (the
generic chat-engine plan) but is a **separate, richer consumer** of the same
opencode server.

**Decisions taken:**

- **Surface:** a new `Code` page *inside Qeda*, scoped to the active project's
  `repo_path`.
- **Control model:** **autonomous run, review after.** opencode runs to
  completion, then the user reviews the whole session diff and keeps or reverts.
- **Integration:** a **dedicated opencode domain** (`src/main/opencode/`), using
  the full server API — `diff`, `revert`, `abort`, `todo` — not the thin
  stream-translation path from the engine plan.

> ### ⚠ Corrected by the protocol probe — see `docs/opencode-v2-protocol.md`
>
> The probe against the installed `v2.0.18` binary invalidated several
> assumptions carried over from the v1 docs. Corrections are applied inline below
> and marked where they changed a decision:
>
> - **No npm SDK matches this server** — `@opencode-ai/sdk` latest is `1.18.34`
>   (v1). Use a thin client over `/api/*` typed from `/openapi.json`.
> - **No per-repo server** — v2 sessions carry `location.directory`; one server
>   serves many repos.
> - **Diff is a unified-diff string**, so this is a viewer, not a differ.
> - **Revert is staged** (`revert/stage` → `revert/commit` | `DELETE`), not one call.
> - **`/todo` does not exist in v2** (it was v1).
> - **`opencode acp` exists** — an Agent Client Protocol server, a genuine
>   architectural alternative to the HTTP API.

**Environment facts (verified in this checkout / by the probe):**

- opencode binary present at `~/.opencode/bin/opencode`, **version `v2.0.18`**.
- **A background opencode service already runs** at a dynamic port (observed
  `http://127.0.0.1:49374`); discover it via `opencode service status`.
- Node `v26.8.2` (satisfies the `>=24` devEngine).
- `@opencode-ai/sdk` is **not installed**, and installing it would be wrong (v1).
- **No diff-rendering primitive exists in this repo** — a new diff viewer is
  net-new work. Input is a unified-diff `patch` string.

---

## 1. The product loop

```
pick project  →  describe intent  →  opencode runs (autonomous)
                                            │
                                            ▼
                              review the full session diff
                                            │
                              ┌─────────────┴─────────────┐
                           Keep                        Revert
                    (files stay changed)      (undo the run's changes)
                                            │
                                            ▼
                                   iterate: another intent
                                   (same session, or fresh)
```

The user never approves individual tool calls. That is the whole point of the
"vibe" model — and it is also what makes §2 the most important section of this
document.

---

## 2. Why "autonomous, review after" dictates the safety model

Auto-approving every tool means opencode can write files and run shell commands
in a real repo before the user sees anything. So the *review* step has to be
strong enough to be the actual safety mechanism. Three consequences, all of them
load-bearing:

1. **`revert` must genuinely restore the tree.** The plan leans on opencode's
   revert. The probe found v2 makes this **staged**:
   `POST /api/session/{id}/revert/stage` (`{ messageID, files?: boolean }`) →
   inspect → `POST …/revert/commit` or `DELETE …/revert`. `Session.Revert` also
   carries a **`snapshot`** field. **[verify]** whether that snapshot is a
   restorable checkpoint — if it is, it replaces the hand-rolled git checkpoint
   in point 3 below and this section gets much simpler.
2. **The repo must be a git repository with a clean working tree before a run.**
   Otherwise the "session diff" is not a clean unit and "revert" cannot be
   reasoned about. `src/main/tools/repo.ts` already refuses non-git directories
   and never falls back to a default path — reuse that validation rather than
   re-deriving it.
3. **A checkpoint is the honest safety net.** Before a run, capture the exact
   tree state (git HEAD + a stash/checkpoint commit, or a recorded
   `git status --porcelain`), so "revert" has something concrete to return to
   even if opencode's bookkeeping disagrees. This is the difference between
   "review after" being a product and being a gamble.

Refuse to start a run on a dirty tree, or make the checkpoint explicit and
visible. Do not silently proceed.

---

## 3. Architecture at a glance — what is reused vs. new

The single most valuable reuse: **`src/hooks/use-agent-chat.ts` already accepts a
`transport` prop** (`invokeChannel` / `chunkChannel` / `doneChannel` /
`errorChannel` / `fallbackChannel`), and its reducer, persistence call, and tool
cards are transport-agnostic. So the Code page runs on the **same hook**, with an
`opencode:` transport, and gets streaming, folding, and `sessions:save-messages`
persistence for free.

| Piece | Status |
| --- | --- |
| Rail section, route, `AppLayout` shell | Reuse |
| `use-agent-chat` hook + `applyStreamPart` reducer | **Reuse as-is** via custom `transport` |
| `sessions` table + `sessions:save-messages` | Reuse (Code sessions are ordinary chat sessions scoped to a project) |
| `projects.repo_path` + git validation in `tools/repo.ts` | Reuse |
| `shiki` (already a dep) for diff syntax highlighting | Reuse |
| `src/main/opencode/` domain | **New** |
| `src/renderer/pages/Code.tsx` + `src/components/code/` | **New** |
| Diff viewer | **New** (nothing exists) |
| Checkpoint / revert safety logic | **New** |
| `opencode_session_id` column + migration | **New** |

**Resolved by the probe:** `GET /api/session/{id}/diff` returns `FileDiff.Info[]`
= `{ file, patch, additions, deletions, status }`, where **`patch` is a
unified-diff string**. So this is a **viewer, not a differ** — parse the patch
hunks and colour them with `shiki`. Do not compute diffs locally.

---

## 4. Main-process domain: `src/main/opencode/`

Same layout discipline as `ai/`, `pty/`, `services/`: one concern per file, banner
comments, pure logic kept Electron-free and testable.

| File | Responsibility |
| --- | --- |
| `server.ts` | Managed `opencode serve` lifecycle **per repo**: spawn with `cwd = project.repo_path`, free port, one live server for the active project, restart on project switch. Attach mode (user-supplied `baseUrl`) also here. |
| `client.ts` | `createOpencodeClient({ baseUrl })` wrapper; health; credential seeding via `auth.set`. |
| `session-map.ts` | Qeda `session.id` → opencode `sessionID`, persisted (§8). |
| `translate.ts` | Pure: bus event → `TextStreamPart` chunk; permission/tool parts → tool chunks. The only protocol logic, and the only file that is fully unit-testable. |
| `checkpoint.ts` | Pre-run tree snapshot + restore/verify, built on git. |
| `engine.ts` | Ties it together: prompt, subscribe, translate, forward, expose diff/abort/revert. |

`translate.ts` and `checkpoint.ts` must not import Electron, so they stay
testable under Jest without booting Electron — the discipline `ai/fallback.ts`
already follows.

### Directory scoping — corrected: no per-repo server

This section previously required one server per `repo_path`. The probe disproved
that: v2 sessions carry a **`location.directory`** and can be moved
(`POST /api/session/{id}/move`, `PUT /api/session/{id}/environment`), and a live
`GET /api/session` returned sessions across multiple projects.

So:

- **one server serves many directories** — `server.ts` holds a single client,
  not one per repo;
- the server still has a **cwd default** (`/api/location`, `/api/location/reload`),
  and `opencode <directory>` / `--server <url>` select a target;
- the simplest topology is to **attach to the ambient background service**
  (`opencode service status` → URL) rather than spawning anything;
- **[verify]** how `location.directory` is set at session creation — the
  `POST /api/session` body was not inspected in the probe.

---

## 5. IPC surface

Add to `IpcChannels` in `src/main/ipc/channels.ts` — the one contract file, per
`AGENTS.md`. Implement in a new `src/main/ipc/handlers/opencode.ts`, registered in
`src/main/ipc/index.ts` (the composition root) and nowhere else.

**Request/response**

| Channel | Purpose |
| --- | --- |
| `opencode:status` | running / stopped / version / repo path / health |
| `opencode:start` | start (or attach) the server for a repo |
| `opencode:stop` | stop the managed server |
| `code:run` | run one intent (invoked by `useAgentChat` as `transport.invokeChannel`) |
| `code:abort` | `POST /api/session/{id}/interrupt` — the kill switch for an autonomous run |
| `code:diff` | `GET /api/session/{id}/diff` → `FileDiff.Info[]` (`patch` strings) |
| `code:revert` | `POST …/revert/stage` then `…/revert/commit` (§2) |
| `code:keep` | `DELETE /api/session/{id}/revert` (discard the staged boundary), optionally commit |
| `code:progress` | run progress from the event stream. **v2 has no `/todo` endpoint** (that was v1); use `/api/session/active` plus `/api/event` |

**Events (main → renderer)**

| Channel | Shape |
| --- | --- |
| `code:stream-chunk` | JSON `TextStreamPart` — same shape as `agent:stream-chunk`, so the reducer is untouched |
| `code:stream-done` | run finished; renderer then fetches the diff |
| `code:stream-error` | run failed |
| `code:run-status` | queued / running / awaiting-review / reverted / kept (drives the UI state machine) |

`code:stream-fallback` is deliberately **absent**: opencode owns provider
selection, so Qeda's cross-provider fallback loop (`isRetryableProviderError`,
`resolveModelChain`) does not apply and must not wrap this engine.

Because the engine is autonomous, the **approval channel from
`opencode-engine.md` §5 is not needed for v1** — that is the concrete payoff of
the "review after" decision. It may come back later if a "supervised mode" is
added.

---

## 6. Run lifecycle (the UI state machine)

```
idle ──▶ running ──(session.idle)──▶ awaiting-review ──┬─▶ kept ──▶ idle
  │          │                                          └─▶ reverted ──▶ idle
  │          └─(abort / error)──▶ idle
  └─ requires: git repo + clean tree + server healthy
```

`code:run-status` drives this so the page never has to infer state from chunks.
`abort` must be reachable at all times during `running` — an autonomous agent
with no kill switch is not shippable.

---

## 7. Diff review panel

The centerpiece of the review step. On `code:stream-done`, the page fetches
`code:diff` and renders per-file changes: path, added/removed counts, hunks, and
a per-file "open in editor / reveal in folder" action (reuse the
`studio:open-path` pattern for OS integration).

Render opencode's `FileDiff.Info[]` directly: `file`, `additions`, `deletions`,
`status`, and the **unified-diff `patch` string** (see §3). Syntax highlighting
for the patch body comes from `shiki`, already a dependency.

The panel should also surface a **"what changed outside git"** view if the
checkpoint (§2) recorded anything opencode touched that git does not track —
otherwise the review can lie by omission.

---

## 8. Persistence and the migration

Code sessions are ordinary Qeda chat sessions scoped to a project, so the
existing `sessions` table and `sessions:save-messages` path carry them. Only one
addition is needed: the opencode session link.

Per `AGENTS.md`, adding a column is **two edits**, and only the first leaves
existing users broken:

1. add `opencode_session_id TEXT` to the `CREATE TABLE` in
   `src/main/db/schema.ts`;
2. add the `ALTER TABLE … ADD COLUMN` guard in `applyMigrations()`.

Create the opencode session lazily on first run (`session.create({ body: { title } })`),
persist the id, then `prompt_async`. Only the **new** user message is sent —
opencode owns history, so the adapter must not replay Qeda's `UIMessage[]`. That
inversion is handled in `engine.ts`, not in the shared handler.

### Streaming path

**Corrected by the probe.** v2 has no `prompt_async` path and no `parts[]`. The
architecture is:

- `POST /api/session/{id}/prompt` with a **`text`** field (plus optional
  `files`, `agents`, `skills`, `metadata`, `delivery`, `resume`) — response is
  `{ data: Session.Inbox.User }`, an **inbox** submission rather than a blocking call;
- `GET /api/event` for the live stream.

**SSE wire format** is JSON per `data:` line, and the event name is the JSON
**`type`** field — *not* an SSE `event:` line:

```
data: {"id":"evt_…","type":"server.connected","data":{}}

: heartbeat
```

The spec exposes no enum of event names (`V2EventEncoded` is just an encoded
string), so **the event taxonomy is still the main open item** — enumerate it by
running a real session in a throwaway repo before writing `translate.ts`.

---

## 9. Safety guardrails

| Guardrail | Why |
| --- | --- |
| Require `repo_path` to be a git repo | Reuse `tools/repo.ts`; a non-git dir has no revert story |
| Require a clean tree (or explicit checkpoint) before running | Makes the session diff an honest unit (§2) |
| Checkpoint before every run | Revert must have something concrete to return to |
| Visible abort at all times | Autonomous agent with shell access |
| `OPENCODE_SERVER_PASSWORD` on the managed server | It is a local server with filesystem + shell access; do not leave it unauthenticated |
| Never auto-commit | "Keep" leaves files changed; committing is an explicit, separate user action |
| Show untracked-file changes in the review | Otherwise the review lies |

---

## 10. Tests

Flat `src/__tests__/`, jsdom, `isolatedModules`.

- `@/main/opencode/translate` — pure: bus event → chunk, tool-id stability across
  call/result, idle → `finish`. No Electron, no server.
- `@/main/opencode/checkpoint` — pure git-state logic against a temp fixture repo
  (mirroring how `repo-tools.test.ts` builds a fixture).
- `@/main/opencode/session-map` — mapping round-trip using the documented
  in-memory DB recipe (`applyMigrations` + `useTestDatabase`).
- DB migration — assert `opencode_session_id` exists on a fresh `CREATE TABLE`
  and is back-filled by `applyMigrations()` on an old DB.
- `Code` page component test — the state machine: running → awaiting-review →
  kept/reverted, and that **abort is reachable while running**.
- **Jest ESM hazard — no longer applies.** Because the plan now uses a thin
  `/api` client instead of an npm SDK, there is no ESM-only dependency to mock or
  map. Keep `translate.ts` and `checkpoint.ts` free of Electron and `fetch` so
  they stay directly unit-testable.
- `npm run build` before `npm test` (the `check-build-exists` guard), and
  `python3 scripts/verify-ipc-split.py` after touching the IPC layer.

---

## 11. Risks and open questions

| # | Risk | Status after the probe |
| --- | --- | --- |
| R1 | CLI/SDK major-version skew | **Resolved — no v2 SDK exists.** `@opencode-ai/sdk` is v1 (`1.18.34`); use a thin client over `/api/*` typed from `/openapi.json`. |
| R2 | Bus event taxonomy unenumerated | **Resolved.** 23 types captured from a real run and mapped to Qeda's chunk shapes — `docs/opencode-v2-protocol.md` §4. Outstanding within it: the tool-failure, `session.execution.failed`, and permission-request events (none were exercised). |
| R3 | `revert` semantics | **Partly resolved.** It is staged (`stage` → `commit` \| `DELETE`). Whether `Session.Revert.snapshot` is a restorable checkpoint is **[verify]** and decides how much git checkpointing is still needed. |
| R4 | Directory-scoped server | **Resolved, inverted.** v2 sessions carry `location.directory` and can be moved — one server serves many repos. |
| R5 | No diff renderer exists | **Resolved in shape.** `FileDiff.Info.patch` is a unified-diff string — viewer, not differ. |
| R6 | ESM-only SDK breaks Jest load | **Eliminated** — no SDK dependency. Generated/ hand-written `/api` client is plain TS. |
| R7 | Bundling the binary in packaged builds | Open. `~/.opencode/bin` is dev-only; shipped builds need it bundled (`release/app/package.json`) or a `PATH` fallback. |
| R8 | Second copy of provider secrets | Open, and the endpoint changed: v2 uses `/api/credential`, not v1's `auth.set`. |
| R9 | Long autonomous runs | Open. Timeout / interrupt / cost; the run must survive a slow model without hanging the UI. |
| R10 | Bundling ESM SDK into CJS main | **Eliminated** — no SDK dependency. |
| **R11** | **We do not own the server process** | A **background service** runs already. The app must **attach**, never kill or restart it out from under the user (`opencode service status` to discover). |
| **R12** | ACP vs HTTP API fork | **Decided: `/api/*`.** The review loop needs `diff`, `vcs/*`, staged `revert` and `worktree`, which are HTTP-only. `opencode acp` stays a note for a future *generic* agent client, not this product. |

**Decisions still open:** commit-on-keep vs. leave-changes-staged; whether to
require a clean tree or auto-checkpoint a dirty one; and whether the Code page
pins one session per project or allows many.

---

## 12. Milestones

1. ~~**Probe the protocol.**~~ **Done** — see `docs/opencode-v2-protocol.md`;
   retired R1/R2/R4/R5/R6/R10 and settled **R12** in favour of `/api/*`. The run
   completed end to end at **cost 0** on `longcat-2.5-preview-free`, and the diff
   came back as a unified-diff patch string.
2. **Main domain.** `client.ts` (a thin `/api` client — **no npm SDK**) +
   `session-map.ts` + the `opencode_session_id` migration. Attach to the ambient
   service; do not spawn or stop it.
3. **`translate.ts` + tests.** Pure protocol mapping, fully unit-tested.
4. **IPC + engine.** `code:run/abort/diff/revert/keep/progress` and the event
   family; register `handlers/opencode.ts` in `ipc/index.ts`.
5. **Code page.** Route, rail section, intent composer, run status, progress,
   wired to `useAgentChat` with the `opencode:` transport.
6. **Diff review + keep/revert.** The patch viewer and the staged-revert loop.
7. **Checkpoints.** Clean-tree precondition, unless `Session.Revert.snapshot`
   proves to be a usable checkpoint (R3).
8. **Packaging.** Bundle the binary (or `PATH` fallback) for shipped builds.
