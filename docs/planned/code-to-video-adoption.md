# Code-to-Video Adoption — Trace & Motion

**Status:** Plan for review. Not yet approved for implementation.
**Scope:** All four adoption tracks — copilot workflow upgrades, parallel-agent
authoring, engine-as-skill distribution, and the code-scene element type — across
both Trace (NovaTrace) and Motion.
**Pattern sources (clean-room inspected):**

- `code-cartoon` skill — locally at `~/.agents/skills/code-cartoon/`
  (`example/balloon/CONTRACT.md`, `film.js`, `references/checking.md`,
  `references/parallel-build.md`, `references/voices.md`)
- `remotion-dev/skills` — cloned at `.slim/clonedeps/repos/remotion-dev__skills/`
  (router pattern, docs-grounding, render gating, Elements install flow)
- `Yusuke710/manim-skill` — cloned at `.slim/clonedeps/repos/Yusuke710__manim-skill/`
  (narration→TTS→code pipeline, timestamped-notes viewer, selective re-render)

**Relation to existing specs:** additive. `docs/systems/novatrace-system.md` and
`docs/motion-2-spec.md` remain the sources of truth for their systems. Only
Phase 6 extends the Trace document model; everything else works within the
existing op contracts and invariants ("every document change goes through an op",
"renderer is a pure function of (document, time)").

---

## How to read this plan

- Phases are ordered by dependency, not priority. Each lists **work items**
  (with file targets), **dependencies**, and **exit criteria**.
- Phases 0–2 upgrade the copilots and close the explainer loop — no document
  model changes. Phases 3–4 restructure agent grounding and delegation. Phases
  5–6 are the strategic bets (external distribution, code medium).
- Shared conventions from `docs/AGENTS.md` and `docs/motion-2/00-overview.md`
  apply to every phase: bun-only, `bun run build` before `bun test`,
  IPC channels only in `src/main/ipc/channels.ts` (+ run
  `python3 scripts/verify-ipc-split.py`), `import type` discipline, semantic
  design tokens, conventional commits, banner comments on every new file.
- The pattern-source index at the end maps every design decision back to the
  reference file it was adopted from, so a reviewer can audit the lineage.

### Phase dependency graph

```
Phase 0 (contracts + hygiene)
   ├──> Phase 1 (narration-first explainers, Trace)
   │        └──> Phase 2 (review loop + measurable QA)
   └──> Phase 3 (router + docs grounding)
            └──> Phase 4 (parallel-agent authoring)
                     └──> Phase 5 (engine-as-skill distribution)
Phase 6 (code-scene) — independent; can start after Phase 0
```

---

## Phase 0 — Contracts, gating, and hygiene

**Goal:** the agent-facing rules become a *contract* (rules, budgets, test
commands, "done means", honest not-checked reporting), user edits are never
clobbered, and known IPC deviations are fixed before anything builds on them.

### Work items

- **0.1 — Trace copilot contract.** New `docs/systems/trace-contract.md`,
  modeled on code-cartoon's `CONTRACT.md`: the module shape (op batches, not
  raw mutations — already true), hard rules that each exist because something
  broke (stagger ranges, default easing, safe subtitle band, scene coverage,
  `baseX/baseY` vs `x/y` position trap), per-composition budgets (element
  count, keyframe count, preview cost), the exact preview/lint commands
  (`renderTracePreview`, `lintProject`), and a **"Done means"** section: lint
  passes, a preview frame at every scene boundary exists and was inspected,
  and the final message lists what was *not* checked.
  `src/main/tools/trace.ts` `getTraceCapability` then serves the contract
  alongside the capability doc (same disk-read mechanism), and
  `src/main/ai/trace-copilot-agent.ts` instructions reference it as
  normative instead of embedding the style guide inline (the style guide
  moves into the contract).
- **0.2 — Motion copilot contract.** Same treatment:
  `docs/motion-2/copilot-contract.md`, served by a new
  `motion:contract` entry or folded into `discoverMotionCapability`
  (`src/main/ai/motion-capability.ts`). Pin: scene/node budgets, procedural
  instance cap (already 5,000), preview render explicitness, done-means.
- **0.3 — Drift protection ("preserve user changes").** Both copilots receive
  the document per turn and write it back after (`handlers/trace-copilot.ts`,
  `handlers/motion-copilot.ts` + renderer save). Adopt the Remotion rule:
  *if the live document changed since the turn started, do not clobber —
  rebase or ask.* Implementation: the chat request carries
  `expectedRevision`; when the copilot's apply/save path detects the store's
  current revision is newer, it emits a `trace-copilot:drift` /
  `motion-copilot:drift` push and the UI offers *keep mine / rebase ops /
  discard theirs*. This uses the revision machinery that already exists
  (`TRACE_REVISION_CONFLICT`, Motion `save-project` semantics) rather than
  inventing new state.
- **0.4 — Explicitness gating + completion contract.** Copilot instructions
  gain two rules, enforced by policy where possible: (a) expensive renders
  (Motion export, multi-frame Trace previews) only when the user asked or the
  plan requires verification; (b) *"continue until the deliverable exists; if
  blocked, return the exact blocker plainly"* — the agent may not end a turn
  with a half-applied composition and a vague success message.
  `tools/policies/trace.ts` gains a `render-expensive` capability class for
  the preview/export tools.
- **0.5 — IPC hygiene (pre-existing deviation).** Register the
  `trace-copilot:*` family (`chat`, `stream-chunk`, `stream-done`,
  `stream-error`, `stream-fallback`, `plan-event`) in
  `src/main/ipc/channels.ts` — they currently exist only as string literals
  in `handlers/trace-copilot.ts` and `use-trace-copilot.ts`, violating the
  single-source-of-truth rule. Run `python3 scripts/verify-ipc-split.py`.

### Exit criteria

- A copilot turn that finishes reports done-means explicitly, including
  unchecked items.
- Editing a document in the GUI while a copilot turn is in flight produces a
  drift prompt, never a silent overwrite.
- `verify-ipc-split.py` passes with `trace-copilot:*` registered.

---

## Phase 1 — Narration-first explainers (Trace)

**Goal:** the YouTube-explainer loop, on Trace's existing substrate:
*write spoken lines → TTS with measured durations → scenes and keyframes timed
to those numbers, never the other way round → narrated MP4.*
This is the pattern both code-cartoon ("voices before pictures") and
manim-skill (Phases 1–3) prove out; it is the single highest-value feature in
the program.

### Work items

- **1.1 — Narration model in the Trace document.** Add an optional
  `narration` block to `TraceProject` (`src/lib/trace/types.ts`):
  `{ voiceId, lines: TraceNarrationLine[] }` with
  `TraceNarrationLine = { id, text, ttsAssetId?, durationMs?, sceneId? }`.
  New ops `setNarration`, `updateNarrationLine`, `clearNarration` in
  `src/lib/trace/ops/` (atomic, undoable, lintable like every other op).
  `migrate.ts` handles older documents (absent = no narration — additive,
  no data migration needed since absence is the default).
- **1.2 — TTS generation with per-line cache.** Main-process service
  `src/main/trace/narration-service.ts` that wraps the existing `tts:*`
  surface (`src/main/ipc/handlers/tts.ts` already returns `TtsAsset` with
  `durationMs: number | null`). Per-line cache keyed on
  `hash(voiceId + text)` (manim-skill's `.tts-cache` pattern): unchanged
  lines are never re-synthesized; a `--bust`-style force flag regenerates
  one line. When `durationMs` is null, measure from the asset
  (decode duration) rather than estimating. Expose over IPC as
  `trace:narration-generate` / `trace:narration-status` in `channels.ts`,
  and reuse the `qeda-media://tts/<id>` host for playback (already exists,
  `src/lib/tts/media.ts`).
- **1.3 — Timeline-from-voices op.** `buildTimelineFromNarration` (a
  pure function in `src/lib/trace/storyboard.ts` or a new
  `src/lib/trace/narration-timing.ts`, callable as an op batch builder):
  given measured durations, set scene `startMs/durationMs` so each scene
  spans its lines, and generate/adjust per-element track offsets so content
  beats land *inside* the spoken line they belong to. The copilot and the UI
  call the same function — one evaluation path, per the house rule.
  Enforce the code-cartoon subtitle rule: engine-owned subtitle band
  (y-range constant per canvas size), content ops are lint-warned when
  they place elements inside it while narration exists
  (`src/lib/trace/lint.ts` check).
- **1.4 — Subtitles from narration.** Subtitle rendering belongs to the
  runtime, not the document: `src/lib/trace/runtime/dom-renderer.ts` gains a
  narration-driven subtitle layer (phrase-splitting on punctuation, ≤8 words,
  timed by line duration — code-cartoon `film.js` `phrase()` is the reference
  implementation, already JS). Export parity: GSAP-code export includes it;
  animated-SVG export documents the limitation (SMIL cannot time to audio;
  the SVG export omits subtitles and notes it in the export report).
- **1.5 — Narration UI.** `src/components/trace/narration/NarrationPanel.tsx`:
  write lines, pick voice (existing TTS voice catalog UI is reusable),
  generate with progress, see measured durations, assign lines to storyboard
  scenes, one-click "fit timeline to narration". Store additions in a new
  `src/stores/trace/slices/narration-slice.ts` (ops-backed, like tracks).
  The timeline shows spoken-line lanes under scene lanes so the mismatch
  between "scene says 3.0s" and "voice says 3.4s" is visible.
- **1.6 — Copilot narration phase.** New tool `setNarration` in
  `src/main/tools/trace.ts` + the composition workflow in
  `trace-copilot-agent.ts` instructions gains the ordered rule: *narration
  first, then composition timed to it* (mirrors "voices before pictures";
  the subagent brief in Phase 4 hard-codes it). The counter/kinetic-text
  recipes gain narration-aware variants (label beats on word boundaries).
- **1.7 — Narrated MP4 export for Trace.** New `trace:export-*` channel
  family + `src/main/trace/render-host.ts` cloning the proven Motion
  pattern (`src/main/motion/render-host.ts`): hidden sandboxed
  `BrowserWindow` loading a new `src/renderer/trace-render.html` entry,
  driving the existing GSAP playback driver with fixed timestamps
  (`playback-driver.ts` already supports a RAF/headless path), screenshotting
  per frame, encoding via WebCodecs/Mediabunny in the hidden window
  (same `run-motion-export.ts` mechanics), chunks back over IPC to a
  `.part` file. **Audio muxing is the known gap:** neither system currently
  muxes audio (`src/lib/motion/export/` has no audio path). Extend the
  in-window Mediabunny output with an audio track from the concatenated
  TTS assets (preferred — keeps everything in the existing chunked
  pipeline); fallback is a main-process ffmpeg mux after finalize if a
  system ffmpeg is present. Add `test:export:trace` modeled on
  `scripts/export-smoke/` (jsdom cannot encode; the hidden-window harness is
  the only real verification).
- **1.8 — Audio sync verification.** The transcript-diff check from
  code-cartoon `checking.md`: after export, transcribe the final audio with
  word timestamps (only when an STT-capable provider is configured; otherwise
  report "not checked") and verify every line starts within ±200 ms of its
  timeline slot. This check *proves intelligibility and alignment in one
  step* and becomes part of the export report (Phase 2 generalizes the
  report format).

### Dependencies

Phase 0 (contract, so the copilot's narration behavior is normative).

### Exit criteria

- From a plain script of spoken lines, one copilot turn + one user review
  produces a narrated 1080p MP4 whose scene boundaries and content beats are
  word-aligned (transcript check passes when STT is available).
- Re-generating one changed line re-renders only that line's audio and the
  scenes it affects (cache + per-scene render, Phase 2.4 completes the
  caching half for previews).
- `bun run test:export:trace` passes, demuxing and asserting frame count and
  duration drift ≤ one frame, with the audio track present.

---

## Phase 2 — Review loop and measurable QA

**Goal:** the manim-skill feedback loop (timestamped notes → agent looks at
the exact frame before editing) and code-cartoon's "checking a film you
cannot watch" discipline, as first-class product surfaces.

### Work items

- **2.1 — Timestamped review notes (Trace).** `N` (or a button) while the
  stage/timeline has focus drops a note at the playhead:
  `{ id, timeMs, sceneId, text, stillSvg? }` in a new review slice +
  `src/components/trace/review/ReviewNotesPanel.tsx`. The still is captured
  via the existing preview path so the note *carries the frame the user saw*
  (SVG, cheap). Notes copy out as markdown lines
  `[0:02.3] Scene 2 — the label overlaps the ring`, the manim-skill format.
- **2.2 — Frame-look-before-edit.** The copilot chat request can carry
  review notes; the agent instructions require calling
  `renderTracePreview` (or reading the attached still) at each note's
  `timeMs` *before* mutating anything near it. Tool-side nudge:
  `trace.ts` `renderTracePreview` accepts `{ timeMs, noteId }` and the
  handler attaches the existing note still when present, so the agent
  cannot claim it looked without the frame being in the transcript.
- **2.3 — Contact sheets + measurable checks.** Extend
  `trace-preview-tool.ts`: `renderTraceContactSheet(project, times[])`
  (one image, N frames — for scene boundaries *and* for full-film
  `fps=1`-style sweeps from the exported file), and an export report
  section (ffprobe facts via main, loudness via ffmpeg `ebur128` when a
  system ffmpeg exists, else marked not-checked). Motion side:
  `motion-verify-tool.ts` gains contact-sheet frames from the render job
  snapshots. Every report ends with the code-cartoon honesty section:
  **"what these checks do not cover"** (rhythm, taste, voice acting) —
  stated, not implied.
- **2.4 — Selective re-render.** Trace preview/export jobs accept a scene
  list; a changed scene re-renders itself *and the next scene* (transitions
  live in the next segment — code-cartoon's rule). For Motion, the render
  plan (`src/lib/motion/export/render-plan.ts`) gains per-scene segment
  caching keyed on a scene content hash, so an iteration on scene 4 of 7
  does not pay for scenes 1–3.
- **2.5 — Motion review notes.** Same note mechanism on
  `MotionTimeline.tsx` (store: a lightweight notes array on the editor
  state — `motion:write-editor-state`, *not* the document, because notes
  are review ephemera, not composition data — an explicit decision to
  record here).

### Dependencies

Phase 1 (notes reference narration lines; export report wraps the MP4 path).

### Exit criteria

- The loop "note at 2.3 s → copilot renders 2.3 s → fixes → shows
  before/after stills in the reply" works end-to-end in one turn.
- Every export produces a report whose *checked* claims are mechanically
  derived and whose *unchecked* claims are explicit.
- A single-scene edit after export costs only that scene's render time
  (asserted in the render job timing).

---

## Phase 3 — Router skills and docs grounding

**Goal:** Remotion's information architecture for agent instructions: a small
router that loads deep references on demand, and grounding that reads
*current documentation* instead of memorized knowledge.

### Work items

- **3.1 — Split the Trace copilot instructions.** Today
  `trace-copilot-agent.ts` (lines ~82–171) injects the full style guide +
  capability summary every turn. Restructure into
  `src/main/ai/copilot-knowledge/trace/`: `router.md` (small, always
  injected: which reference for which task) + `elements.md`,
  `animation.md`, `filters.md`, `recipes.md`, `narration.md` (Phase 1),
  `export.md`, `qa.md` (Phase 2). The agent factory loads the router and
  the agent pulls references through the grounding tool as needed. Keep
  every reference a *file on disk served to the agent*, not prompt-baked
  constants, so edits don't require a rebuild (matches the existing
  `getTraceCapability` disk-read mechanism).
- **3.2 — Docs-grounding tool.** New copilot tool `trace-docs` /
  `motion-docs` (`src/main/tools/docs-grounding-tool.ts`, shared): keyword
  search + section extraction over a local corpus — Trace:
  `docs/systems/novatrace-system.md`, `trace-contract.md`; Motion: the 37
  briefs in `docs/motion-2/` + `docs/motion-2-spec.md`. The tool returns
  markdown sections with source paths. This is the local-corpus version of
  Remotion's Algolia + `.md` fetch: *"implement using the current
  documentation rather than memorized API knowledge."* The corpus is the
  repo's own briefs — the grounding and the human docs stay one artifact.
- **3.3 — Router discipline in tools.** `getTraceCapability` /
  `discoverMotionCapability` become router entries that point at the
  references instead of inlining everything. Measure instruction tokens
  before/after (the agent already logs step counts; add a token count on
  the first request) and record it in the phase summary.
- **3.4 — Checklists for multi-step agent operations** (Remotion Elements
  pattern): the copilot's plan output for a composition includes a
  copy-tracked checklist (library → dry-run → apply → verify) the agent
  must tick in its final message.

### Dependencies

Phase 0 (contract is the router's first entry). Phase 1 (narration reference
exists).

### Exit criteria

- Instruction payload for a typical turn drops measurably (target: ≥50%
  fewer injected tokens after the split, router included).
- The Motion copilot answers an API question by citing the specific brief
  section it loaded (visible in tool-call transcripts).
- A docs edit lands without an app rebuild and changes agent behavior on
  the next turn.

---

## Phase 4 — Parallel-agent authoring

**Goal:** the code-cartoon `parallel-build.md` protocol — *contract first,
then people* — on top of the existing subagent infrastructure:
one lead, N scene authors, hard ownership boundaries, resumable builds.

### Work items

- **4.1 — Ownership in the ops engine.** `applyOps` batch context gains an
  optional author scope: `{ subagentId, allowedSceneIds?, allowedElementIdPrefixes? }`.
  Ops referencing elements outside the scope are rejected with a specific
  error (like a risk-class failure, atomic all-or-nothing preserved).
  The editor path passes no scope (unrestricted); the composition subagent
  passes each worker's scope. This is enforcement, not convention — the
  same place risk classes are already enforced
  (`src/lib/trace/ops/index.ts`, `src/lib/motion/ops.ts`).
- **4.2 — The brief protocol.** `trace-composition-subagent.ts` splits the
  build into per-scene worker turns with the code-cartoon brief shape:
  (1) what to read in order — contract, story/timeline entry, style
  reference, one finished scene as sample; (2) the element id prefix and
  scene it owns (the only things it may create/mutate); (3) the look in
  three lines; (4) beats, each tied to a narration line or timeline mark;
  (5) budgets (elements, keyframes, preview calls); (6) what to return —
  the three best preview stills, lint result, and what was not checked.
  Motion equivalent: the copilot's scene-level tool calls carry the same
  brief structure (its node registry already groups by family — group
  workers by node family the way code-cartoon groups by technique).
- **4.3 — Build log and resume.** A durable `buildLog` on the copilot
  session (main-process, keyed to project + run id): done / running / next
  five steps, worker states. Interruption recovery follows the code-cartoon
  rule: *resume a stopped worker with a message, don't start a new one* —
  its work is on disk (its elements are already applied atomically per
  batch). Surface the log in the copilot panel (read-only progress list).
- **4.4 — Resource budgets.** Enforce at most K concurrent
  preview/render jobs across workers (a semaphore around the preview tools
  — single-job export already serializes; previews do not). Per-frame
  budgets become part of the brief and are reported back by the preview
  tool (it already measures seconds-per-frame in the code-cartoon tool;
  ours measures via the existing render timing).

### Dependencies

Phase 3 (router/contract give workers their reading list), Phase 1
(beats tie to narration marks).

### Exit criteria

- An 8-scene narrated composition is built by 4 workers in parallel with
  zero cross-owner mutations (ownership violations are rejected, not
  merged).
- Killing the session mid-build and resuming completes the film without
  redoing finished scenes.
- Concurrent preview renders never exceed the semaphore (asserted in
  tests).

---

## Phase 5 — Engine-as-skill distribution

**Goal:** invert the relationship — external agents (Claude Code, Cursor,
Codex, OpenCode) drive the Trace/Motion op engines through an installable
Agent Skill, with the app's own renderer as the render farm.

### Work items

- **5.1 — Headless CLI entry in the app binary.** `src/main/main.ts`
  branches on `process.argv` (before window creation):
  `qeda --headless <command>` with commands `trace list|open|save|ops|render`,
  `motion list|open|save|ops|render` over stdin/stdout JSON. The op engines
  are already UI-free (`src/lib/trace`, `src/lib/motion` run in jest); the
  stores already work without Electron except `app.getPath('userData')`
  (parameterize the root: `--data-dir`). Render reuses Phase 1.7's
  trace render host and Motion's existing hidden-window host (a hidden
  window in a CLI-launched app is the same proven path). Exit codes follow
  the contract style: 0 deliverable exists, 1 blocked with the exact
  blocker on stderr.
- **5.2 — The skill package.** New top-level repo (or a `skills/` workspace
  published independently — *not* shipped inside the app): one skill per
  engine (`trace-studio`, `motion-studio`), each a router SKILL.md +
  contract + command reference + examples, installable via
  `npx skills add <repo>`. The SKILL.md is the public face of the op
  contract: same rules the in-app copilot obeys (batch ops atomically,
  destructive ops require explicit user intent, render only when asked).
  Distribution metadata follows the skills.sh conventions (the registry the
  ecosystem already indexes).
- **5.3 — Trust and safety boundary.** The skill never asks the external
  agent to write arbitrary code (that's Phase 6's job, and only in-app).
  All mutations are op JSON validated by the engines — the CLI is a
  *typed contract boundary*, which is precisely the differentiator versus
  Remotion's code-first surface. Document it as such in the skill.
- **5.4 — Verification loop for external agents.** The CLI's `render`
  command emits stills at requested timestamps (the preview tool, main-side)
  so an external agent gets the same look-before-iterate loop as the
  in-app copilot. Ship a `verify` subcommand that runs lint + export
  preflight and prints the measurable-QA report.

### Dependencies

Phases 1 (render path) and 3 (contract content becomes the skill body).
Phase 4 is not a hard dependency but the ownership scoping (4.1) makes
multi-agent external use safe.

### Exit criteria

- From a clean machine with the skill installed, an external agent with no
  prior knowledge of the codebase creates, narrates, animates, and renders
  a Trace project to MP4 through the CLI only, applying the same contract
  discipline the in-app copilot does (verified in a scripted dry-run).
- `qeda --headless` runs without a visible window and exits with the
  contract exit codes.

---

## Phase 6 — Code-scene element (the escape hatch)

**Goal:** code-cartoon's medium inside the document medium: a scene/element
whose content is a sandboxed `draw(u, S)` function, stored as source in the
document, executed deterministically — the flexibility of the code ecosystem
without giving up the document's durability, undo, and export guarantees.

### Work items

- **6.1 — Trace `code-scene` element type.** New element type in
  `src/lib/trace/elements/code-scene/`: attributes carry
  `{ source, entry = 'draw' }`; the element participates in the scene graph,
  storyboard, and ops like any element (source edits are
  `updateElement` ops — undoable, diffable). The runtime
  (`dom-renderer.ts`) executes it into an owned `<canvas>`/`<foreignObject>`
  surface.
- **6.2 — Sandbox and contract enforcement.** Execution happens in a
  locked-down sandboxed iframe (no Node, no network, `csp` restricted),
  bridge via `postMessage` with the frame contract:
  `init(S)` once, `draw(u, S)` per frame, *pure function of u*, injected
  `rng(seed)` (code-cartoon's rules), wall-clock budget per frame with
  timeout → the element renders a visible placeholder and a lint error,
  never a hung render. Static source lint in `lib/trace/lint.ts` flags
  `Date.now`, bare `Math.random`, and global fetch as contract violations.
  The editor and the export render window share one execution module, so
  *a frame cannot look one way on screen and another way in the file*
  (the frame-binding invariant, extended).
- **6.3 — Export parity.** MP4 export (Phase 1.7) and the editor preview
  run code-scenes natively (same sandbox). GSAP-code export embeds the
  source as a sandboxed module. Animated-SVG export **cannot** execute
  code: the export dialog and report state that code-scenes require the
  MP4/GSAP paths (an explicit, documented limitation, not a silent gap).
- **6.4 — Motion `code` node.** A `code` node type whose renderer executes
  `draw(u, S)` into an offscreen canvas used as a texture (or a
  three.js group). Same sandbox module, same budgets. Registration in the
  node registry (`src/lib/motion/nodes/`) makes inspector/menu/manifest
  follow automatically, per the registry's design.
- **6.5 — Copilot authoring support.** The contract reference (Phase 0)
  gains the code-scene chapter: the module shape, the rules, per-frame
  budget, and done-means (still at scene start/mid/end without errors).
  This is the code-cartoon CONTRACT.md, verbatim in spirit, as the
  in-repo contract for this element type.

### Dependencies

Phase 0 (contract), Phase 1.7 (MP4 export path to make code-scenes
produce video). Independent of Phases 3–5 otherwise.

### Exit criteria

- A copilot-authored code-scene (procedural background, particle path) runs
  in the editor, renders identically in the MP4 export, and survives undo.
- A code-scene that throws or overruns its budget degrades to a placeholder
  + lint error without failing the render job.
- The sandbox demonstrably has no Node/network access (test asserts the
  bridge rejects `require`/`fetch` attempts).

---

## Testing strategy

- **Unit (jest/jsdom):** narration timing math, timeline-from-voices,
  ops for narration/code-scene, lint checks (subtitle band, source
  contract), ownership scoping, docs-grounding search. The domain layers
  are already jsdom-clean by design.
- **Contract tests:** applyOps ownership rejection, drift detection on
  stale revisions, sandbox violation cases.
- **Export smoke (`test:export` pattern):** `test:export:trace` —
  hidden-window harness rendering a narrated fixture, demuxed with
  Mediabunny, asserting frames, duration drift, audio track presence;
  a code-scene fixture asserting placeholder-on-failure.
- **CLI smoke (Phase 5):** scripted `qeda --headless` run asserting exit
  codes and deliverable existence.
- All suites respect the repo rule: `bun run build` before `bun test`.

## Risks and open questions

1. **Audio muxing is unimplemented anywhere in the app** — the largest
   unknown in Phase 1.7. Mediabunny in-window muxing is the plan; if the
   in-window audio encode path proves fragile, the ffmpeg fallback (with
   presence detection) is the documented second choice.
2. **STT availability for the transcript-diff check** depends on the
   configured provider; the check must degrade to "not checked" (and say
   so) rather than fail the export.
3. **Sandboxing depth (Phase 6):** a sandboxed iframe is strong but not
   formally verifiable; the security posture is *defense in depth + lint +
   budget*, documented as such. Copilot-authored code-scenes carry the
   same approval gating as destructive ops (they execute arbitrary JS).
4. **Token accounting (Phase 3):** the ≥50% instruction reduction target is
   a hypothesis; measure before committing to the number.
5. **Naming:** the skill packages (Phase 5) ship under the Qeda brand with
   Trace/Motion feature names; the repo's mid-rebrand warning applies —
   do not casually rename persisted values along the way.
6. **`durationMs: null` TTS assets:** the narration service must measure,
   never estimate, and fail loudly into the drift/blocker contract when a
   duration cannot be established.

## Pattern-source index

| Pattern | Adopted from | Reference file |
| --- | --- | --- |
| Contract with "Done means" + not-checked reporting | code-cartoon | `example/balloon/CONTRACT.md`, `references/checking.md` |
| Voices before pictures (measured-duration timing) | code-cartoon + manim-skill | `references/voices.md`; `SKILL.md` Phases 1–3 |
| Per-line TTS cache with bust | manim-skill | `tools/tts-generate.py` design |
| Timestamped notes → look-before-edit | manim-skill | `SKILL.md` Phase 6, `tools/video_viewer.py` |
| Contact sheets, loudness, transcript-diff | code-cartoon | `references/checking.md` |
| Selective re-render (+next scene) | code-cartoon + manim-skill | `checking.md` reproducibility; `SKILL.md` Phase 6 |
| Router + progressive disclosure | Remotion skills | `remotion-best-practices/SKILL.md` |
| Docs grounding over static readme | Remotion skills | `remotion-docs/SKILL.md` |
| "Preserve user changes" drift rule | Remotion skills | `remotion-markup/SKILL.md` |
| Render explicitness + completion contract | Remotion + manim-skill | `remotion-render/SKILL.md`; `SKILL.md` Contract |
| Dry-run install, source-owns-copy, trust note | Remotion Elements | `remotion-elements/SKILL.md` |
| Parallel briefs, ownership, build log, resume | code-cartoon | `references/parallel-build.md` |
| Sandbox + pure-frame + seeded RNG + budgets | code-cartoon | `CONTRACT.md`, `film.js` |
| Deliverable-exists exit codes | manim-skill | `SKILL.md` Contract |
