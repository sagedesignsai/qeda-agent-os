# Qeda Builder v0 — implementation status and next steps

**Snapshot:** 2026-10-07 (revision 2)
**Basis:** source inspection of the current Builder implementation after the UX
pass that unified the workspace header, wired real file/diff data, and added
compact tool summaries. Reference: v0.dev screenshots (three captures from
2026-10-07).

---

## Executive summary

Builder has a full coding-turn loop: workspace selection → OpenCode session
creation → prompt submission → streaming events → permission/form approvals →
abort. The canvas shows a live preview (Qeda-owned or agent-detected), a real
git-backed file tree, and a real git diff change list. The activity feed
collapses completed tool calls to compact single-line summaries, matching the
v0 reference style.

**What still cannot happen:** a fully autonomous run against an isolated
worktree. Every coding turn runs against the user's actual working tree. Safe
worktree isolation, checkpoint/revert semantics, and a local preview lifecycle
are the three remaining product-loop gaps.

---

## Implemented

### Route, workspace UI, and chrome

- Dedicated `/builder` page and sidebar entry.
- Responsive chat/canvas split with resizable desktop panels and persisted
  preferences.
- **Unified canvas top bar** — workspace name, branch badge, dirty-file count,
  runtime status dot, folder picker, and Preview/Code/Changes tabs are all in
  one horizontal toolbar (no separate workspace header row). Matches the v0
  single-bar pattern.
- Compact surface tabs with viewport controls (desktop/tablet/mobile) in the
  same bar.
- Canvas footer showing live process status.

### OpenCode connection and full session turn loop

- `@opencode/client` dependency pinned to `2.0.24`.
- Main-process attach-only service discovery and v2 API preflight.
- **Prompt submission is live**: `builder:prompt` calls
  `rt.client.session.prompt()`, which starts a real coding turn.
- Full streaming event subscription normalized into the renderer activity
  contract: text deltas, tool lifecycle, permission/form requests,
  status transitions, errors.
- Abort: `builder:abort` calls `rt.client.session.interrupt()`.
- Session continuity: session identity, workspace, and the normalized event
  buffer survive route changes and renderer reloads via `builder:session-state`.
- Permission approvals: Allow once / Always allow / Deny forwarded to OpenCode.
- Form replies and cancellations forwarded to OpenCode.

### Activity feed

- **Compact tool summaries**: completed tool calls collapse to a single row —
  `✓ <icon> Label · detail` (file path, command, search pattern + match count).
- Pending/streaming/failed tools still show the full expandable `BuilderToolCall`
  card because those require the user's attention.
- User prompts, assistant text deltas, permission cards, and form cards remain
  unchanged.

### Code and Changes surfaces

- **Real file tree**: `builder:workspace-files` IPC walks the active session's
  workspace with `git ls-files` (respects `.gitignore`, includes untracked-but-not-ignored
  files). Result is a nested `BuilderFileNode[]` sorted directories-first.
- **Real git diff**: `builder:workspace-changes` IPC runs `git diff HEAD --numstat`
  plus per-file unified diffs. Returns `BuilderFileChange[]` with
  additions/deletions counts and raw diff text (capped at 256 KB total).
- File tree and change list are visible in Code and Changes tabs when a session
  is bound.
- Read-only code viewer, change filters (all/added/modified/deleted), diff display.

### Preview

- `BuilderPreview` class owns one dev-server process per session.
- Readiness is detected by scanning stdout/stderr for a `localhost:` URL.
- Graceful teardown kills the process group (detached spawn) to avoid orphaned
  grandchildren.
- Detected preview: a server the agent started inside a turn is shown read-only
  without offering a Stop control the app cannot honour.
- Preview status broadcasts over `builder:preview-changed`.

### Project scope

- Builder reads `?project=` and pre-fills the folder picker with `repo_path`.
- The project is a suggestion only — the user still confirms the folder and main
  proves it is a git repo.

---

## Present, but not connected / still placeholder

| Surface | What works now | What is still a gap |
| --- | --- | --- |
| **Code** | Real git-backed file tree, path filtering, file selection | File content is not fetched (editor shows empty / coming soon) |
| **Changes** | Real git diff with per-file additions/deletions and unified diff | Keep / Discard / Revert actions are UI-only stubs |
| **Preview** | Qeda-owned dev server, readiness detection, stop | No isolated worktree; the server runs against the user's actual working tree |
| **Session** | Full turn loop: prompt → stream → approve → abort | No durable session persistence across app restarts; no history fetch on resume |
| **File content** | `builder:workspace-files` returns the tree | `builder:workspace-files` does not yet return file body (needs a separate IPC for selected-file content) |

---

## Missing for the v0 product loop

### P0 — Safe workspace isolation

- Create or select an isolated git worktree for Builder changes so a run cannot
  silently modify the user's main working tree.
- Decide and document the dirty-tree / untracked-file policy (refuse, stash, or
  checkpoint).
- Pass the worktree directory to `session.create({ location })` explicitly.
- Keep-all / Discard-all backed by `git checkout` or `git worktree remove`.

**Exit condition:** a repeatable test workspace can be created, inspected, and
discarded without modifying the source branch.

### P1 — File content in the code viewer

- Add `builder:workspace-file-read` IPC that reads one file from the active
  workspace.
- Call it when a file is selected in `BuilderCodeWorkspace` and populate the
  editor frame.

**Exit condition:** selecting a file in the tree shows its content.

### P2 — Keep / Discard / Revert in the Changes surface

- Implement keep-all (no-op when worktree isolation is in place), discard-all
  (`git checkout -- .` or worktree teardown), and per-file discard.
- Re-fetch the diff after each action.

**Exit condition:** a controlled edit appears in Changes, and discard restores
the exact pre-run state.

### P3 — Session persistence and resume

- Persist the active session ID and workspace to SQLite alongside other session
  types.
- On re-attach, fetch recent session events from OpenCode's history endpoint so
  the activity feed can be rebuilt after an app restart.
- Handle `builder:session-state` reconnect after a renderer reload without
  losing the ongoing turn.

**Exit condition:** closing and reopening the app while a session is idle
restores the activity feed.

### P4 — Local preview lifecycle in isolated workspace

- Start the project's dev server only inside the isolated worktree.
- Track readiness, logs, port, and process ownership; always clean up.
- Embedded preview, device widths, reload; never open a port owned by the
  user's own running server.

**Exit condition:** a prompt results in a live local preview that can be
aborted and discarded cleanly.

### P5 — Visual and release validation

- Compare the current UI against the v0 reference screenshots for hierarchy,
  density, breakpoints, and empty/running/error/approval/review states.
- Run deferred typecheck (`npx tsc --noEmit`), lint, targeted Builder tests,
  `scripts/verify-ipc-split.py`, production build, and smoke test.

---

## Architecture decisions to reconcile

`docs/vibe-coding-surface.md` describes **autonomous execution followed by
full-session review** (no per-tool approvals). The current Builder exposes
explicit permission cards per OpenCode request. These are not in conflict while
prompt submission runs against a real isolated worktree — the permission model
can be revisited as a setting once the safety boundary is established.

---

## Current verification status

The following have not been run for this snapshot:
- `npx tsc --noEmit` — TypeScript typecheck
- `npm run lint`
- `npm test` (Builder-specific test files exist but have not been executed)
- `npm run build` + production smoke run
- `python3 scripts/verify-ipc-split.py` (two new IPC channels added)

Treat all runtime behaviour — especially OpenCode event payload handling,
session location semantics, and the new `git diff` / `git ls-files` paths — as
**unverified until the deferred verification pass**.
