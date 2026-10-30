# Motion — 3D-First No-Code Authoring Studio

**Status:** Phase 1 foundation in progress. The editor shell, timeline, versioned
3D document, registered node types, deterministic frame evaluation, AI-callable
operation manifest, and document-driven R3F preview are in place. Durable media
management, multi-scene documents, glTF/GLB import, and deterministic offline
rendering remain.
**Home:** `/motion` route inside Qeda. The feature is called **Motion**, not Studio.
**Source spec:** the original product brief ("Node-Based 3D Motion Studio"), amended
by the design interview below. Where the brief and this document disagree, this
document wins — it records decisions, not aspirations.

---

## 1. Product definition

**Motion** is a no-code, 3D-first authoring tool for a broader creator audience.
Creators compose scenes from media, 3D assets, reusable objects, and UI-like
surfaces; animate them on a timeline; and render frame-exact video as the first
complete output workflow. The same document and evaluator are designed to grow
into interactive experiences such as UI, presentations, and games.

Rive is the primary interaction and runtime inspiration, not a feature-by-feature
template. Motion is **3D-first**: its canonical, multi-scene document is a typed
scene graph whose properties are evaluated at explicit times. The editor, video
renderer, interactive runtime, and AI agents are clients of that shared document
and engine, not independent sources of scene state.

This is not intended to become a full general-purpose 3D DCC. It prioritizes
approachable no-code workflows, fast visual iteration, reusable 3D scenes, and
high-fidelity rendered output over low-level modeling features.

### Primary workflow

`import or create assets → compose a scene → animate it → preview → export`

AI assistance is available throughout that workflow as a copilot and an automation
surface. It proposes understandable edits, previews their impact, and applies
validated operations through the same approval and undo path as the editor.

### Product direction and recommended sequencing

The recommended approach is **one shared authoring document and runtime, delivered
in capability phases**. Build video output first because it provides a concrete,
testable end-to-end creator workflow; establish the document and evaluation
boundaries now so interactivity does not require replacing the engine later.

1. **Authoring and video foundation:** no-code scene composition, multiple scenes,
   reusable assets including glTF/GLB, timeline animation, project persistence,
   AI-assisted edits, and deterministic video export.
2. **Advanced copilot and automation:** grow beyond bounded authoring assistance
   into repeatable, multi-step workflows for preparing and validating projects
   and exports. Keep every mutation on the typed op/approval boundary.
3. **Interactive runtime:** add explicit inputs, state, events, and transitions to
   the same document/evaluator; then support interactive UI and game-like behavior.
   This phase adds runtime semantics, rather than creating a separate document
   format or animation engine.
4. **External runtime delivery:** harden runtime packaging, embedding, and
   distribution for creators who want to publish interactive work. External
   no-code creators are the product audience from the first release, not a later
   phase; the exact interactive delivery targets can be selected when this phase
   is scoped.

Multi-scene identity, asset references, and a renderer-independent runtime
contract are architectural foundations for Phase 1, even where scene switching
and interactive delivery arrive later. AI-callable operations are also a
foundation, while autonomous multi-step automation should be introduced with
user-visible previews, scoped permissions, and recovery.

### Non-goals for the first video-first release

- Live screen capture (Showcase Studio owns capture; Motion consumes recordings).
- Full general-purpose modeling and simulation tools.
- Shipping a complete interactive UI/game runtime before deterministic video
  authoring and export are reliable.
- Collaboration, cloud sync, and asset marketplaces.

---

## 2. Decision record

| # | Question | Decision | Consequence |
|---|---|---|---|
| 1 | Where does it live? | New `/motion` route inside Qeda | Reuses IPC, the ffmpeg path, the rail, and shadcn. Name collision with Showcase Studio (`/studio`) resolved by naming this **Motion**; nav labels must disambiguate. |
| 2 | Architecture | Framework-agnostic engine in `src/lib/motion` + **thin** R3F binding | Preview and any future web export run the same runtime. Core stays WebGL-free, so it is jest-testable. |
| 3 | Extensibility | **Node/op registry**, not hardcoded node types | Adding a node type or an edit is a registration, not a switch statement. The registry is the plugin boundary. |
| 4 | Project storage | Portable folder bundle (`project.json` + managed assets) + one SQLite row for listing | Autosave is an atomic file write, not DB churn. Assets travel with the project. Multi-scene data is stored in this shared project. |
| 5 | First release | Video-first no-code authoring foundation | Deliver a usable scene-to-MP4 workflow before shipping interactive runtime behavior; preserve a compatible runtime foundation in the document and evaluator. |
| 6 | Agent surface | Copilot and automation share the editor's typed op boundary | Every edit is a serializable op. The op set is a public contract. No UI-only mutation paths; destructive or broad automation remains approval-gated. |
| 7 | Render path | Deterministic offline render (clock-stepped → encode) | The evaluator takes an **injected clock**. Cheap now, impossible to retrofit. Realtime recording is never used for motion output. |
| 8 | Document model | Graph-native and multi-scene from the start; node canvas deferred | First authoring surfaces can use scene hierarchy, inspector, and timeline views. Adding a graph canvas later is a new view, not a new data model. |
| 9 | Phase 1 media | Text, images, image sequences, glTF/GLB, device frames, brand tokens, title presets | Imported assets are managed by the project bundle, not transient browser URLs. glTF/Draco material mapping and a reliable font pipeline are in the video-first foundation. |
| 10 | Agent edit safety | Tiered by risk: `safe` / `mutating` / `destructive` | `safe` applies directly; `destructive` requires approval and applies as one undoable transaction. |
| 11 | Video output | 1080p30 H.264 MP4 default, presets above it | No alpha in H.264. The renderer keeps an alpha-capable background mode internally so VP9/WebM alpha is additive later. |
| 12 | First integrations | Agent/copilot operations first; launch-pipeline handoff is an integration, not the product boundary | MCP and launch-pipeline links can reuse existing app services, but Motion's core remains useful to external no-code creators without them. |
| 13 | Relationship to Showcase Studio | Complementary, no engine coupling | Motion owns 3D composition and rendering; Showcase keeps capture and social kits and may consume Motion outputs. Reuse helpers without coupling the engines. |
| 14 | Scene content | Screenshots, recordings, image sequences, and glTF/GLB assets | No live window capture in the scene. Imported media and 3D models are project-managed assets. |
| 15 | Brand & device primitives | Device frames, brand tokens, title text as **presets** | Brand kit is data (colors, type ramp), not UI styling — it must be renderer-agnostic because the web export needs it too. |
| 16 | Timing authority | **Seconds in the document, frames at the edges** | Keys snap to whole frames while dragging (`quantizeToFrame`), and aligning existing keys is an explicit op (`timeline.quantizeToFps`). Changing an output preset never silently rewrites authored timing; the editor shows how many keys are off-grid and offers the snap. |

---

## 3. Layering

```
src/lib/timeline/        reusable timeline kit — knows nothing about Motion
  types.ts               neutral model: rows, items, keys, clock, edit handlers
  time.ts                timecode, ticks, px↔seconds, zoom, snapping
  layout.ts              virtualized layout + hit testing (pure geometry)
  clock.ts               injected playback clock (rAF, or fixed-step for render)

src/lib/motion/          pure TS — no React, no Electron, no DOM, no WebGL
  schema.ts              versioned zod document schema + migration chain
  document.ts            project and scene identity, references, validation
  node-registry.ts       node definitions, property schemas, defaults, animatable paths
  ops.ts                 op registry (risk classes) + apply
  sample.ts              easing + keyframe/clip sampling
  evaluate.ts            deterministic scene/frame evaluation
  engine-contract.ts     JSON manifest, command preview, approval-gated apply
  timeline-adapter.ts    Motion document ⇄ neutral timeline model
  defaults.ts            empty + starter documents (stable ids)

src/hooks/use-motion-store.ts     document, op history, selection, playhead clock
src/components/timeline/…         CanvasTimeline, transport, row headers
src/components/motion/…           Motion binding: model projection + op intents
src/renderer/pages/Motion.tsx     route composition
src/main/…                        bundle I/O, render encode, DB index row
```

The rule that makes the layering real: **the store mutates the document only by
applying registered ops**, and **the canvas never holds document state** — it reads
a layout produced by pure functions and paints it.

The project is the persistence and authoring boundary; scenes are independently
addressable composition units within it. A scene owns its graph and scene-level
settings, while project-level assets and reusable animation/runtime definitions
can be referenced by more than one scene. Scene activation is editor/runtime
context, not a second mutable copy of scene data. The current single-scene
`scene.nodes` shape is an initial implementation, not the target multi-scene
contract; introduce the project/scene model through an explicit schema migration.

---

## 4. Document model

A project is a folder bundle:

```
MyProject.motion/
  project.json     versioned project (scenes, shared assets, timelines, runtime data)
  assets/          images, image sequences, glTF/GLB, fonts
  .autosave/       previous project.json (crash recovery)
```

Assets are copied or imported into project-managed storage and referenced by
stable asset ids in the document. Runtime URLs and browser object URLs are
ephemeral renderer details and must never be the persisted asset identity. A
missing or unsupported file reference is surfaced as a recoverable asset error;
it must not silently render as a successful placeholder.

`schemaVersion` is a monotonic integer. Migrations are an ordered chain of
`(from → to)` functions applied on load; loading a newer version than the app
understands fails loudly rather than silently dropping fields.

Time is stored in **seconds** everywhere in the document. Frames exist only at the
render/UI boundary (`fps` is a project setting). This keeps animation math independent
of frame rate, which is what makes deterministic re-renders at a different fps possible.

---

## 5. Op contract

```ts
type MotionOp = { op: string; [param: string]: unknown }
type Risk = 'safe' | 'mutating' | 'destructive'
```

- Each op registers an id, a zod param schema, a risk class, and a pure
  `(doc, params) => doc` reducer.
- `safe` is additive and reversible without loss (`addKeyframe`, `addTrack`).
- `mutating` edits existing values (`movePlacement`) — applies directly, joins history.
- `destructive` deletes user work (`removeTrack`, `removeKeyframe`) — needs approval,
  and a batch of them commits as **one** undo entry.
- There is deliberately **no** `replaceDocument` op. A generic setter would make the
  risk classes decorative, since every destructive change could be laundered through it.

### Engine and AI boundary

Each scene is stored as serializable `MotionNode` records (`id`, registered `type`,
optional `parentId`, transform, typed properties, visibility and lock state). The
node registry owns each type's property schema, defaults, category and animatable
paths. It has no Three.js or React imports; renderers bind registered types outside
`src/lib/motion`. Project, scene, timeline, and asset operations use stable ids so
agents and interactive runtime inputs can address content without depending on
editor selection or renderer object identity.

`evaluateMotionFrame(document, time)` composes active timeline channels over the
document's base nodes and returns a renderer-neutral frame. It reads no clock and
does not mutate the source document, so preview, tests and offline rendering can
evaluate the same frame at the same time. Schema v2 adds this graph; the v1 migration
creates nodes for existing animation targets instead of dropping those channels.

`describeMotionEngine()` is the discovery contract for agent clients: contract and
document versions, registered node schemas/defaults, animatable paths, and operation
parameter JSON Schemas with risk metadata. The copilot can explain, propose, preview,
and apply edits; automation composes the same bounded operations rather than mutating
editor or renderer state. Commands are previews first; applying a destructive batch
requires explicit approval. Changes always use the same op registry; renderer
integrations commit the resulting batch through the editor store to preserve undo
history. MCP/IPC transport is deliberately downstream of this pure contract, so an
integration cannot invent a second mutation API.

Interactivity is a future capability of this shared engine, not a separate product
format. The document and evaluator must leave a clean boundary for declared runtime
inputs, state, events, and transitions. Those concepts should be introduced only
with explicit schema semantics and deterministic evaluation; do not smuggle them
into arbitrary node properties or editor-only state.

---

## 6. Render

Deterministic offline render: the evaluator is stepped at a fixed timestep for exactly
`duration × fps` frames, independent of wall-clock. Encoding path: WebCodecs
`VideoEncoder` in the renderer, ffmpeg for muxing/transcoding (system ffmpeg, resolved
through the existing `FFMPEG_PATH` helper). The alternative — `readPixels` → IPC →
ffmpeg stdin — ships ~8 MB per 1080p RGBA frame across IPC and must be measured
before it is chosen for anything but a fallback.

---

## 7. Timeline (first module)

The timeline is the first thing built because Phase 1 is *animation* — without it there
is no motion to render, and its performance ceiling sets the ceiling for the whole
editor. Constraints taken from the existing Showcase/SoundLab timelines, which already
solve this problem in this codebase:

- **Canvas, not DOM.** One DOM node per keyframe does not survive a real motion project.
- **Split into two stacked canvases.** A *base* canvas (ruler, lanes, placements,
  keyframe diamonds) repainted only when the document, selection, zoom or size changes,
  and an *overlay* canvas (playhead, snap guide, drag ghost) repainted every animation
  frame. The playhead therefore costs one clear plus a few strokes per frame, and
  structural painting never happens during playback.
- **HiDPI** by scaling the backing store by `devicePixelRatio` and drawing in CSS pixels.
- **No React re-render on time.** Playback advances a clock in the store; the canvas
  subscribes imperatively and repaints. The transport readout is written through a ref.
  React state changes only for structural edits and selection.
- **Virtualized painting.** `timeline-layout.ts` emits only items intersecting the
  visible time range, plus one screen of padding. A 10k-keyframe clip costs the same
  per frame as a 10-keyframe clip; this is asserted in tests.
- **Hit testing by geometry, not DOM.** Pure `hitTest(layout, x, y)` against the same
  layout the painter used, so what you see is exactly what you can grab.
- **Drags are local until commit.** Pointer movement updates a local drag preview and
  repaints the overlay; a single op is emitted on pointer-up. That yields one undo
  entry per drag and zero document cloning per pointer event.
- **Snapping** to placement edges, the playhead, and 0/duration, threshold in pixels
  (not seconds) so it behaves identically at every zoom level.
- **Zoom** scales `pxPerSecond` around the pointer; scroll is stored in seconds so a
  resize does not shift the contents.

### The kit is reusable, not Motion-shaped

`src/lib/timeline` and `src/components/timeline` contain no reference to clips,
tracks, keyframes, easing or 3D. They consume a `TimelineModel` (rows, items,
keys, loop range) and emit plain edit intents (`onMoveItem`, `onMoveKey`,
`onLoopChange`, `onScrub`). Motion's `timeline-adapter.ts` is the only file that
knows both vocabularies.

That split is deliberate: any surface that needs a scrubbable time canvas — a
Showcase edit lane, a second motion document type, a future automation or
keyframe editor — adopts the kit by writing an adapter, not by copying a canvas.
Ids crossing the boundary are composed by the adapter (`placement::channel::
keyframe`), because the same reusable clip may be placed more than once and a
raw keyframe id would then be ambiguous on the canvas.

### Timeline data model

```ts
MotionClip     { id, name, duration, channels: AnimatedChannel[] }   // reusable library item
AnimatedChannel{ id, targetId, property, keyframes: Keyframe[] }
Keyframe       { id, time, value, easing }
TimelineTrack  { id, name, targetId, muted, locked, placements: ClipPlacement[] }
ClipPlacement  { id, clipId, start }                                   // instance on a track
```

Clips are referenced, not inlined, so the same clip can drive several placements — the
brief's "clips stay independently editable and reusable" requirement, without duplicated
keyframes. At a given time, placements are resolved in track order and in placement
order; later writes win for a colliding channel. That rule is stated here because it is
observable, and it is covered by a test rather than left to whatever iteration order the
code happens to have.

---

## 8. Phase 1 status and build order

| # | Deliverable | Status |
|---|---|---|
| 1 | Op registry + versioned schema | done for the initial single-scene document (scene/project migration still required) |
| 2 | Clock-injectable evaluator + keyframe sampling | done (pure deterministic scene-frame evaluator) |
| 3 | Scene projection → Three.js graph | done (registered-node R3F bindings; editor stage remains host-owned) |
| 4 | Screen surface and media binding | prototype (device frame, starter artwork, and editor image selection; persistent project-owned media and deterministic sequence playback remain) |
| 5 | Multi-scene project model and scene switching | not started |
| 6 | Project-managed import (images, sequences, fonts, glTF/GLB) | not started |
| 7 | Timeline + inspector UI | in progress |
| 8 | Deterministic render → MP4 | not started |
| 9 | Project I/O (bundle, autosave, DB row, op-log undo) | op-log undo done; bundle I/O not started |
| 10 | MVP AI copilot authoring | operation manifest and approval path exist; user-facing copilot integration not started |
| 11 | Launch handoff | not started |

Recommended implementation order from the current foundation is **project/scene
identity → project-managed assets and glTF/GLB → complete timeline/inspector →
deterministic MP4 → end-to-end no-code authoring and copilot workflow**. The first
release is not complete until an external no-code creator can create or import
content, compose and animate a scene, get bounded AI assistance, save/reopen the
project, and render the same frames deterministically.

Keep timeline polish proportional to the end-to-end path: prioritize the affordances
needed to author, inspect, and validate a render, but defer nonessential editor
fidelity work until a project reliably renders to MP4.

### Later phases

| Phase | Outcome | Scope boundary |
|---|---|---|
| 2 — Advanced copilot and automation | A creator can delegate multi-step workflows and refine results conversationally | Build on the operation contract, previews, approval gates, and undo; no alternate agent-only document mutation |
| 3 — Interactive runtime | The same project can react to inputs and events for UI and game-like experiences | Add explicit deterministic runtime semantics; do not block video-first shipping on a complete state machine |
| 4 — External delivery | External creators can package, embed, or distribute authored work | Select targets and publishing requirements when scoped; keep the runtime contract portable |

---

## 9. Risks

- **Three storages of truth** — bundle, DB row, op log — need one owner and a defined
  failure order on autosave. The bundle is authoritative; the DB row is an index; the
  op log is in-memory only and dies with the session.
- **Tiered approval is only real if the op set is closed.** Enforced by the absence of a
  generic document-setter op, plus a test that the registry has no such op.
- **Single-scene prototype** must not become a migration trap. Project and scene ids,
  shared assets, and scene-scoped operations are foundational before scene-specific
  workflows grow.
- **Video-first without runtime foresight** must not force a second engine. Keep time
  evaluation deterministic and isolate future inputs/events from renderer bindings.
- **Two video tools in one app** stay complementary only while Motion refuses to grow a
  recorder.
- **No-code accessibility** requires clear asset errors, safe defaults, undoable
  actions, and approachable composition workflows; a registry alone does not make
  the product usable to nontechnical creators.

---

## 10. Design reference: Rive animate mode

The timeline is modelled on **Rive's animate mode**, not on a desktop NLE. Rive's
editor, for reference:

- https://mintcdn.com/rive/LTt3dbNyEAMvuJ4M/images/editor/animate-mode/5c396825-8293-4d8b-8968-aff442075b60.webp
- https://mintcdn.com/rive/LTt3dbNyEAMvuJ4M/images/editor/animate-mode/fa768437-b336-4730-8375-a4307176e17b.webp

What its animate mode actually does, and where we stand:

| Rive convention | Why it matters | Motion |
|---|---|---|
| **Work-area band above the ruler**, draggable at both ends | Playback range is a first-class strip, not a setting hidden in a panel | Loop band is currently drawn *inside* ruler — move it to its own strip |
| **Frame-based ruler**: `00:00s`, then `10f 20f 30f …` | Animation is authored in frames; a key between frames is a frame that never renders as authored | Adopted: `formatTickLabel` labels sub-second ticks as frames |
| **Keys snap to whole frames** | Deterministic output at any render frame rate | Adopted: `quantizeToFrame` on key/placement drags, plus the explicit `timeline.quantizeToFps` op for keys authored off-grid |
| **Play-mode menu**: One Shot / Loop / Ping Pong, plus Work Area | A hover loop and a one-shot intro are different animations | Queued: `MotionTimeline.playMode` + ping-pong in `PlaybackClock` |
| **Docked Interpolation panel** for the selected key (linear / cubic / hold) | Easing is chosen while looking at the key you selected | Queued: panel reads `MotionSelection` and emits `keyframe.setEasing` |
| **Compact hierarchy rows** (~24px) with expand carets, object → property | Dense rows are the difference between 8 visible tracks and 3 | Partly: rows are 64px and show up to 3 property rows per clip; compacting and an expandable object column are queued |
| **Minimal chrome**, icons only | The canvas is the interface | Partly: transport currently uses small text buttons (`Loop`, `Snap`, `Fit`) |

The queued rows are deliberately ordered by cost, and all of them are kit-side
work: none requires a document-schema change except `playMode`, which is additive
and rides the existing migration chain.

## 11. Still open (safe to defer)

- External runtime delivery target: script + global, React component, or npm package.
- Interactive runtime semantics: input types, event delivery, transition priority,
  multi-clip blending, and deterministic behavior when inputs change during playback.
- How the external no-code audience discovers templates, onboarding, and shareable
  project examples.
- Performance budgets: target GPU, triangle and texture ceilings.
- Camera units for glTF interop (assumed Y-up, meters).
