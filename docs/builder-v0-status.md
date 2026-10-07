# Qeda Builder v0 — implementation status and next steps

**Snapshot:** 2026-10-07  
**Basis:** source inspection of the current Builder implementation and the stated v0 goal: a polished, local-first “describe → build → inspect → preview → review” experience. This is not a screenshot-by-screenshot visual audit; the reference screenshots were not available in this working context.

## Executive summary

Builder has a separate route and a polished, responsive workspace shell. The preview, code explorer, change review, chat composer, and OpenCode interaction cards are present as frontend surfaces. The OpenCode v2 connection preflight is real, and the latest slice adds creation of an empty session plus a main-process event subscription and normalized activity feed.

**Builder cannot yet perform a coding turn.** Prompt submission is intentionally disabled. No project/worktree is selected or isolated, no prompt is sent, no build process is started, and the code/diff/preview surfaces are not connected to project data. The current implementation is therefore a UI and integration foundation—not an end-to-end vibecoding loop.

## Implemented

### Route and workspace UI

- Dedicated `/builder` page and sidebar entry.
- Responsive chat/canvas split, compact-screen Chat/Canvas switch, resizable desktop panels, and persisted surface/viewport preferences.
- Preview, Code, and Changes tabs with empty states that do not present fabricated project output as agent-generated work.
- Preview viewport controls update the visual frame; the preview URL is blank by default and navigation/server controls remain disabled.
- Code surface includes a searchable file tree, file selection, a read-only editor frame, loading/empty states, and renderer-safe file view-model types.
- Changes surface includes Added/Modified/Deleted filters, counts, a unified-diff display, and gated Keep/Discard actions.

### OpenCode connection and current session lane

- Direct `@opencode/client` dependency pinned to `2.0.24`.
- Main-process, attach-only OpenCode service discovery and v2 API preflight. The app does not start or stop the user-owned OpenCode service.
- Typed IPC for connection status, creating/stopping the active Builder event feed, and replying to Builder session forms and permissions.
- Main-process adapter normalizes selected OpenCode v2 events before forwarding them to the renderer: text deltas, tool lifecycle, permission/form requests and resolutions, execution status, and errors.
- Renderer hook owns session/feed state and lifecycle; the activity feed uses the existing tool, form, and permission renderers.
- Session creation does **not** submit a prompt. Prompt submission remains disabled pending safe workspace isolation.

### Interaction UI

- Specialized tool-call, form, and permission components exist.
- Form renderer supports typed fields, defaults, conditions, validation, and cancel/submit callbacks.
- Permission UI exposes explicit **Allow once**, **Always allow**, and **Deny** decisions.
- Starter ideas and quick prompts populate the draft only; they do not initiate execution.

### Coverage authored

Builder-focused component and event-adapter test files are present. **They have not been run**, and no typecheck/build has been run for this implementation snapshot, per the current instruction to defer checks until the v0 implementation is complete.

## Present, but not connected to real workspace data

| Surface | What works now | What is still a placeholder |
| --- | --- | --- |
| Code | Search/filter UI, tree interaction, editor presentation for injected data | No project scan, file read IPC, editor writes, or service-provided files are wired into the page |
| Changes | Filtering, totals, diff presentation for injected data | No OpenCode/Git diff fetch, checkpoint, keep, discard, or revert operation is wired |
| Preview | Responsive frame and viewport selector | No project process, port allocation, embedded live page, reload, or external-open lifecycle |
| Session activity | Empty session creation and live event subscription for the active session | No prompt submission, session history, durable persistence, resume/reconnect, or abort control |
| Forms/permissions | UI plus IPC response handlers | No Builder-originated coding turn can currently produce these requests; they are ready for a future session turn |

## Missing for the v0 product loop

1. **Explicit project/workspace selection.** The user cannot choose a repository or workspace in Builder.
2. **A safety boundary for code execution.** There is no isolated worktree, clean-tree/checkpoint policy, or documented handling for dirty/untracked files. The current session-create request supplies a title but no explicit location; the service’s default location is relied upon and has not been validated as the intended Builder workspace.
3. **A real coding turn.** No send-prompt IPC, streaming turn lifecycle, cancellation/abort, retry, or recovery exists. The composer is intentionally non-submitting.
4. **Session continuity.** Session identity and events live in renderer/main-process memory only. There is no persisted Builder-to-OpenCode session link, history fetch, route-reentry resume, or stream reconnection.
5. **Real source and diff data.** File tree, selected file content, change list, unified diff, and review actions are not populated from the selected project/session.
6. **Safe local preview lifecycle.** No isolated dev server start/stop, readiness check, port ownership, embedded preview, or cleanup exists.
7. **Run/review state machine.** The UI does not yet transition through queued/running/awaiting-review/kept/reverted/error states based on real work.
8. **Screenshot validation.** Responsive behavior is implemented in code, but a comparison against the supplied visual references could not be made here.

## Decisions to reconcile before enabling autonomous turns

There is a product-policy mismatch in the repository documentation:

- `docs/vibe-coding-surface.md` describes **autonomous execution followed by full-session review**, with no individual tool approvals.
- The current Builder interaction design exposes explicit permission decisions and prioritizes inspecting diffs and keeping/discarding changes.

The current code does not execute prompts, so this conflict has not yet produced behavior. Before the turn loop is enabled, settle whether Builder is supervised per permission, autonomous inside an isolated workspace with review-after, or offers both modes. Update the older design doc once that choice is confirmed; its opening status and some SDK assumptions are stale relative to the current implementation.

## Recommended next steps

### P0 — Define and establish the safety boundary

- Select a project/repository explicitly and show its canonical path/branch.
- Create or select an isolated worktree for Builder changes; never silently run against OpenCode’s ambient default directory.
- Decide how dirty, ignored, and untracked files are protected and surfaced. Require a clean tree or create a verifiable checkpoint before a run.
- Make session creation receive the validated workspace location explicitly.
- Keep the send control disabled until the main process can prove the session is bound to that workspace.

**Exit condition:** a repeatable test workspace can be created, inspected, and discarded without changing the source repository.

### P1 — Complete the session turn lifecycle

- Add prompt submission and streaming IPC against the pinned v2 client.
- Normalize assistant text, tool input/progress/result, interaction requests, session idle/failure, and files changed into a stable renderer contract.
- Add abort/cancel, prevent duplicate turns, surface transport errors, and recover after route changes or renderer reloads.
- Persist or otherwise reliably restore Builder session identity and history.
- Keep permission behavior aligned with the product decision above.

**Exit condition:** a deterministic fixture prompt streams to completion, can be aborted, and produces no activity in another session.

### P2 — Connect project inspection and review

- Populate the file tree and read-only editor from the isolated workspace.
- Fetch per-file diff/status and display real additions/deletions and hunks.
- Implement explicit keep/discard/revert semantics backed by checkpoints or verified OpenCode revert behavior.
- Ensure untracked and ignored file changes cannot disappear from review.

**Exit condition:** a controlled edit appears in Code and Changes, and discard restores the exact pre-run state.

### P3 — Add local preview and finish the product loop

- Start the project’s preview process only inside the isolated workspace; track readiness, logs, port, and process ownership.
- Load the real page in the embedded preview, support reload/device widths, and always clean up owned processes.
- Connect chat, activity, code, changes, and preview state so users can move between them without implying unsupported readiness.

**Exit condition:** a prompt results in a live local preview and a reviewable diff, with a working abort and safe discard path.

### P4 — Visual and release validation

- Re-open the reference screenshots and compare hierarchy, density, breakpoints, and empty/running/error/approval/review states.
- Once implementation is complete, run the deferred typecheck, lint, targeted Builder tests, IPC coverage script, production build, and an end-to-end smoke run against a disposable isolated project.

## Current verification status

No tests, typechecks, or builds were run for this snapshot, by request. The newly added test files are not evidence of passing behavior. Treat all integration behavior—especially OpenCode event payload handling, default session location, response semantics, and session recovery—as **unverified until the deferred verification pass**.
