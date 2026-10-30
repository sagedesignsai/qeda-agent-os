# Copilot tools

**Phase:** 1.5 (contract), 3 (UI)
**Dependencies:** `op-contract-v2.md`, `document-model-v4.md`, `persistence.md`
**Master spec:** §13.1–§13.6, §13.8–§13.10
**Goal:** the agent contract — a planning and editing assistant that proposes
edits, never applies them without explicit user approval, and calls the same ops
as the UI.

## What the copilot is

A planning and editing assistant, not an autonomous editor. It reads the project,
proposes changes, explains them, and applies them only after the user approves.
It cannot silently mutate the document, run shell commands, access the
filesystem, or call arbitrary tools. Every action it can take has a manual UI
equivalent.

## Tools

Exactly these tools; each is a thin wrapper over the same services the UI uses.

| Tool | Purpose | Mutates? |
| --- | --- | --- |
| `motion.describe` | Engine manifest: node types, ops, JSON Schemas, schema version, contract version. | No |
| `motion.getDocument` | Document, optionally scoped to a scene or node subtree. | No |
| `motion.getContext` | Selection, active scene, playhead, work area, warnings, recent edits, project summary. | No |
| `motion.query` | Search nodes, assets, clips, tracks, keyframes by id/name/type/property. | No |
| `motion.plan` | Validate a proposed op batch; return preview, diff, risk, warnings, baseRevision. | No |
| `motion.apply` | Apply a previously planned batch, guarded by plan id, base revision, approval. | Yes |
| `motion.focus` | Select a scene/node/asset and move the playhead (UI-only). | No |
| `motion.importAsset` | Import files through the asset service; returns descriptors. | No (until `asset.add` planned) |
| `motion.lint` | Document issues without changing anything. | No |
| `motion.recipe` | List recipes or expand a recipe into primitive ops for planning. | No |
| `motion.render` | Start an export job after preflight and explicit user action. | No (writes a render file) |

`motion.getDocument` scope: `summary | scene | node | selection`, with optional
`sceneId`, `nodeId`, `includeAssets`, `includeBrand`, `includeTimeline`.
Summary returns metadata, scene list, node/asset counts, warnings, active scene
id. Scene returns nodes, timeline summary, clip names. Node returns the node,
ancestors/children, animated channels. Selection returns the current selection
and surrounding context.

`motion.query` is read-only and returns compact results. Filters:
`{ kind: 'node', sceneId, type }`, `{ kind: 'asset', missing: true }`,
`{ kind: 'channel', targetId }`.

`motion.lint` returns `MotionLintIssue[]` with `severity`, `code`, `message`,
`sceneId?`, `nodeId?`, `assetId?`, `fix?` (label + ops). The copilot must call
`motion.lint` before proposing a plan; a plan with lint errors is rejected by
`motion.plan`.

`motion.recipe`: `list` returns metadata; `expand` returns primitive ops for a
recipe id + target + options.

`motion.render` is explicit — the copilot can prepare an export plan and ask for
confirmation, but cannot start a render without the user clicking Export.

## Plan lifecycle

```
User instruction
  → getContext → getDocument(scope: scene) → query → lint
  → plan({ summary, ops })
  → engine validates ops, applies to clone, diff, risk, warnings, baseRevision
  → UI plan card (summary, changes, risk, warnings, preview)
  → Cancel → discard, no mutation
  → Apply → (destructive? second confirm) → apply({ planId, baseRevision })
  → revision guard → apply ops → new revision → one undo entry
```

Plan card: one-sentence summary, "what will change" grouped by scene/node, diff
counts, risk badge (Safe/Changes/Destructive), warnings, optional preview (still
or low-res loop; Phase 3), buttons Apply/Cancel/Show me/Why.

Approval rules:
- Every plan requires explicit Apply. No auto-apply, no "apply all", no timeout.
- Destructive plans require a second confirmation naming entities and counts.
- The agent cannot set `approved`, `confirmedDestructive`, or `approvalToken`.
  Stripped from tool input; added by the renderer on Apply.
- A plan is single-use and expires after 10 minutes.
- If the document revision changed since the plan, `apply` fails with
  `MOTION_REVISION_CONFLICT`. The copilot re-reads context and re-plans; it
  must not retry blindly.
- Applying a plan creates one undo entry, even with 40 ops.

## Context assembly

Assembled by the main process, not the model. The model cannot request arbitrary
files.

Always included: engine manifest summary (node types, op ids, schema version),
project summary (name, output, scene count, duration, brand colors/fonts), active
scene summary (node tree names/types/parents, track/clip names, timeline
duration, work area, play mode), current selection and playhead, lint summary,
user instruction.

On demand: full node props for selected node + children, animated channels,
asset metadata (names, kinds, dimensions, missing flags), brand kit, recent op
history (last 10 labels), compact list of other scenes (names/durations only).

Never included: binary asset bytes, absolute filesystem paths, API keys/settings,
full documents for every scene by default.

Token budget: system prompt + manifest under ~6k tokens; context under ~20k;
leave room for the plan. If the project is too large, summarize and ask the user
to narrow scope.

## Prompt and behavior rules

System prompt encodes:
- "You are a motion design copilot inside Qeda. You propose edits, you do not
  apply them."
- "Use the op registry. Never invent an op, node type, or property."
- "Prefer small, reversible changes. Explain the creative intent."
- "Ask before destructive changes."
- "If the user's request is ambiguous, ask one clarifying question or propose
  two directions."
- "Do not claim a render exists unless `motion.render` returned a completed
  job."
- "Do not invent asset ids, node ids, or clip ids. Query first."
- "If lint reports an error, fix it or explain why you cannot."
- "Keep summaries short; the diff is the detail."

Common intents → tools:
- "Make it more premium" → read scene, propose slower camera, softer light,
  more negative space, easing changes.
- "Add a call to action" → add text node, fade in, place in safe area.
- "Fix the timing" → read clips/keys, propose trims/moves, show diff.
- "Use our brand" → read brand, propose color/font updates to selected nodes.
- "Make a 9:16 version" → duplicate project/scene, change output, reframe
  camera, warn about layout.
- "Why is export blocked?" → lint/preflight, explain missing assets/fonts.
- "Render it" → prepare render plan, ask for confirmation, call
  `motion.render` only after.

## Safety and privacy

- No filesystem, shell, network, or Electron APIs. Only the tools in §13.3.
- Asset import is user-initiated or explicitly confirmed.
- Render is user-initiated.
- Cannot disable lint, approval, or revision guards.
- Tool inputs validated against JSON Schema + op registry; unknown fields
  rejected.
- Prompt injection from project text (node names, asset names) treated as data,
  not instructions. Tool layer does not grant capability based on text.
- Project is local. If a cloud model provider is configured, the context above
  is sent to that provider. UI states this in Settings; Motion adds no second
  cloud path.

## Evaluation

Track locally (opt-in): plan acceptance rate, immediate undo rate after apply,
lint errors per plan, revision conflicts per session, median time request→plan,
token usage, "Show me" usage, failed tool calls. A plan applied and undone
within 10s is a failure — review those transcripts first.

## Acceptance criteria

- The copilot cannot change the document without `motion.apply`.
- Every plan has a diff, risk, warnings, and `baseRevision`.
- A destructive plan requires two user actions.
- A stale plan is rejected, not merged.
- The copilot can complete "add a call to action" and "fix the timing" on the
  starter project without inventing ids.
- The copilot can explain why export is blocked using `motion.lint`/preflight.
- With the copilot disabled, every one of those tasks is still possible by
  hand.

## Files to touch

- `src/main/ipc/handlers/motion-copilot.ts` — plan/apply/stream IPC.
- `src/lib/motion/plan.ts`, `lint.ts`, `recipes.ts` — contract.
- `src/hooks/use-motion-copilot.ts` — client state.

## Tests

- Integration test: scripted "add a call to action" through tools → apply → one
  undo entry.
- Stale plan rejection test.
- Destructive plan double-confirm test.
- Lint-before-plan test.
