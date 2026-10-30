# Motion 2.0 — Product & Implementation Spec

**Status:** Draft for review. This document supersedes
[`docs/motion-studio-spec.md`](./motion-studio-spec.md) for Motion 2.0. The old
spec stays in the repository as the historical Phase 1 record; it is not a
second source of truth.

**Home:** `/motion` (project browser) and `/motion/:projectId` (editor) inside
Qeda. The feature is called **Motion**. “Studio” is the separate Showcase
product.

**Audience:** product, design, and engineering. This document is written to be
implemented, not pitched. Every section states a decision or an explicit open
question.

**Last updated:** 2026-10-30.

---

## Contents

| § | Section |
| --- | --- |
| 0 | How to read this document |
| 1 | Executive summary |
| 2 | Product definition |
| 3 | Current-state audit (including the Phase 0 defect list) |
| 4 | Rive as the design reference |
| 5 | Information architecture and routes |
| 6 | Document model v4 |
| 7 | Runtime and rendering architecture |
| 8 | Scene graph and node types |
| 9 | Timeline |
| 10 | No-code authoring UX |
| 11 | Asset pipeline |
| 12 | Export pipeline |
| 13 | Copilot |
| 14 | Operation contract v2 |
| 15 | Persistence and recovery |
| 16 | IPC surface |
| 17 | Package plan |
| 18 | Testing strategy |
| 19 | Roadmap |
| 20 | Risks and open questions |
| 21 | Appendices (glossary, file map, research notes, decision log) |

A reader in a hurry should read §1, §6.4 (invariants), §14 (op contract), and
§19 (roadmap). Those four sections constrain everything else.

---

## 0. How to read this document

- **Phase 0** is cleanup and foundations. Nothing user-facing ships here.
- **Phase 1** is the no-code authoring core and the first closed create → export loop.
- **Phase 1.5** is the agent contract. It ships before the chat UI, so the copilot
  cannot invent a second mutation API.
- **Phase 2** is the production video pipeline and the master sequence.
- **Phase 3** is the copilot UI.
- **Phase 4** is the interactive runtime foundation.
- **Phase 5** is web/runtime export and polish.

Anything marked **reserved** is in the schema now so a later phase does not
require a breaking migration, but has no UI and no runtime behaviour yet.

The normative parts of this document are the TypeScript shapes, the op table,
the invariants, and the acceptance criteria. Prose exists to explain those.
When prose and a type disagree, the type wins and the prose is a bug.

---

## 1. Executive summary

Motion is Qeda’s **3D-first, video-first motion studio**. A user composes a scene
from product screens, devices, text, cameras, lights, and imported glTF models;
animates it on a timeline; and exports frame-exact video. An AI copilot can
propose edits, but the user applies them.

Motion 2.0 changes the product in five ways:

1. **Multi-scene projects.** A project is a set of scenes plus an optional master
   sequence, not one hard-coded scene.
2. **A real no-code editor.** Project browser, templates, hierarchy, generated
   inspector, asset library, autosave, crash recovery, and export presets.
3. **A production video pipeline.** WebCodecs encoding through Mediabunny,
   deterministic frame stepping, runtime codec probing, audio muxing, and a
   fallback path that does not require a system ffmpeg install.
4. **An agent-native operation contract.** Every edit is a serializable,
   validated, risk-classified op. The copilot calls the same ops as the UI,
   returns a plan, and never mutates the document without an explicit Apply.
5. **A runtime seam.** Video is the only output in Phase 1–3, but scene
   evaluation is a pure `MotionFrame` function with a `MotionRuntime` interface,
   so an interactive state-machine runtime can be added in Phase 4 without
   rewriting the document model.

Rive is the design reference for **authoring ergonomics**: a compact scene
hierarchy, a timeline that does not feel like a spreadsheet, direct manipulation,
and a clear separation between artboard, state, and playback. Rive is not the
engine and not the template. Motion’s scene graph is canonical 3D, its output is
video, and its agent contract has no Rive equivalent.

The core architectural bet is:

> **A Motion project is a deterministic, versioned document. The editor is a
> view over that document. The copilot is a client of the same op registry. The
> renderer is a pure function of `(document, time)`.**

Every decision below protects that bet.

---

## 2. Product definition

### 2.1 What Motion is

Motion is a local-first desktop tool for making short, high-craft product films:
launch trailers, feature announcements, app-store previews, landing-page hero
loops, and social clips. The user does not need to know Blender, After Effects,
or code. They start from a template or a blank scene, bring in their product
imagery, stage it in 3D, animate a few properties, and export.

The editor has four persistent surfaces:

| Surface | Job |
| --- | --- |
| **Project browser** | Find, create, duplicate, rename, delete, and open Motion projects. |
| **Scene hierarchy** | Understand and reorganize what is in the scene. |
| **Viewport** | Directly manipulate the scene and preview playback. |
| **Timeline** | Author time: clips, placements, keyframes, work area, audio. |
| **Inspector** | Edit the selected object’s properties without hunting through menus. |

A fifth surface, the **copilot**, is collapsible and never owns the document. It
reads context, proposes a plan, and waits.

### 2.2 Who it is for

**Primary audience:** external no-code users who make product marketing assets.
They understand their product and their brand. They do not understand node
graphs, shaders, or frame timing. They will abandon a tool that makes them feel
stupid in the first five minutes.

**Secondary audience:** Qeda’s own team, making launch films for Qeda features.
They are power users, but they use the same product surface as external users.
Internal-only shortcuts are a smell.

**Not the audience:** 3D generalists who want a DCC, motion designers who want
After Effects, and developers who want a scripting environment. Motion should be
deep enough for them to be pleasantly surprised, but it should not compete on
their terms.

### 2.3 Jobs to be done

1. “I have a screenshot and a launch date. Make a 15-second hero video that
   looks like my product, without hiring an agency.”
2. “I have a 3D model from our design team. Put it in a branded scene and make it
   turn slowly while the headline lands.”
3. “I need five aspect-ratio variants of the same story for launch day.”
4. “I have a rough idea. Show me three directions I can apply, not a blank
   canvas.”
5. “I changed the headline. Re-render without redoing the animation.”

### 2.4 Differentiation

| Dimension | Motion | Rive | After Effects | Canva-style tools |
| --- | --- | --- | --- | --- |
| Primary medium | 3D scene, video out | 2D vector, interactive runtime | 2D/3D compositing | 2D templates |
| Authoring model | Scene graph + timeline + op registry | Artboard + state machine | Layer comps + expressions | Form-based templates |
| No-code ceiling | High: generated inspector, templates, copilot | Medium-high | Low | Low |
| Agent integration | First-class: plans, diffs, approval | None | Plugins/scripts | Limited |
| Output | Frame-exact MP4/WebM, future runtime | Rive runtime | Render queue | MP4/GIF |
| Local-first | Yes | Desktop + cloud | Desktop | Cloud |

Motion’s defensible combination is **3D staging + no-code authoring + a
deterministic agent contract**, not any one of those alone.

### 2.5 Goals

- A new user can create a branded 10–15 second video from a template in under
  ten minutes without reading documentation.
- A user can import a GLB, place it, animate it, and export it without leaving
  the app.
- The same project renders identically at the same time on the same machine,
  and differences across machines are explainable (codec, GPU, font
  substitution), not random.
- Every persistent edit is an op. There is no UI path that mutates the document
  directly.
- A copilot plan is previewable, diffable, and rejectable. “Apply” is always a
  user action.
- A project survives a crash, a schema upgrade, and a missing asset without
  silent data loss.

### 2.6 Non-goals for Motion 2.0

- Cloud sync, multiplayer editing, comments, or accounts.
- A general-purpose 3D modeling or sculpting tool.
- A full compositing app (no roto, tracking, keying, particle systems).
- A code editor or expression language for end users.
- A plugin marketplace.
- Mobile authoring. Desktop only.
- A Rive-compatible runtime or `.riv` import. Rive may be useful later for 2D
  overlays, but it is not the core engine; the editor is proprietary and the
  runtime is a separate product.
- Autonomous agents that edit without approval.

### 2.7 Success metrics

Phase 1 exit:

- ≥ 60% of new users who open the editor create a second scene or apply a
  template within the first session.
- Median time from “new project” to first successful export < 15 minutes for a
  template-based project.
- Export success rate ≥ 95% on supported machines, with a clear fallback message
  on the rest.
- Zero data-loss reports caused by autosave or schema migration.

Phase 3 exit:

- ≥ 40% of active Motion users open the copilot at least once per project.
- ≥ 70% of copilot plans are applied or partially applied, not dismissed.
- Fewer than 5% of applied plans are immediately undone.

These are product guardrails, not promises. They are listed so the team can
argue about the right thing.

---

## 3. Current-state audit

This section is deliberately blunt. The Phase 1 implementation proved the core
idea; it is not a foundation that can absorb Motion 2.0 without cleanup.

### 3.1 What already exists and is worth keeping

| Area | Current implementation | Verdict |
| --- | --- | --- |
| Document as data | `src/lib/motion/types.ts`, v3, seconds-based | Keep the principle; migrate the shape. |
| Node registry | `node-registry.ts`, Zod props, animatable paths | Keep and extend. It is the seed of the generated inspector. |
| Op registry | `ops.ts`, 25 ops, risk classes, pure reducers | Keep and extend into contract v2. |
| Deterministic sampling | `sample.ts`, binary search, hold at boundaries | Keep; add trim and scene scoping. |
| Frame evaluation | `evaluate.ts`, pure `(doc, time) → nodes` | Keep; widen to `MotionFrame`. |
| Timeline kit | `src/lib/timeline`, `src/components/timeline` | Keep. It is reusable and already separated from Motion. |
| R3F bindings | `MotionNodeRenderers.tsx`, document-driven | Keep; add asset resolution and new node types. |
| Editor shell | `MotionEditor.tsx`, four panels | Keep the arrangement; replace panel internals. |
| Tests | 39 Motion tests passing | Keep; add coverage for every new invariant. |

The important thing that exists is not any single file. It is the discipline:
**document changes go through ops, sampling is pure, and the renderer reads the
document rather than owning state.** Motion 2.0 must not lose that.

### 3.2 Blocking defects

These are defects, not design gaps. They should be fixed in Phase 0 before any
new feature lands.

#### D1 — Missing `SRGBColorSpace` import

`src/components/motion/scene/MotionSceneCanvas.tsx:285` assigns
`gl.outputColorSpace = SRGBColorSpace`, but `SRGBColorSpace` is not imported from
`three`. This is a compile error and a runtime `ReferenceError` on canvas
creation.

**Fix:** import `SRGBColorSpace` from `three` alongside `Color` and
`PerspectiveCamera`.

**Test:** the component test currently mocks `MotionSceneCanvas`, so it cannot
catch this. Add a narrow module test that imports the module and asserts the
exported component is defined, or remove the mock and render the canvas with a
stubbed R3F `Canvas`. At minimum, `bunx tsc --noEmit` must pass before the phase
is declared done.

#### D2 — Asset kind widening and blob-URL persistence

`src/components/motion/MotionScenePanel.tsx:77` builds an asset object whose
`kind` is inferred as `string` because it comes from a ternary over
`file.type.startsWith('image/')`. The `asset.add` op expects
`'image' | 'image-sequence'`, so the `as const` array does not narrow the object
and TypeScript reports `TS2345` at line 99.

Worse, the same handler stores `URL.createObjectURL(file)` in `asset.uri` and
writes that blob URL into the document. A blob URL is scoped to the current
renderer process and dies on reload. The document then references an asset that
can never be resolved again.

**Fix:** asset import moves to the main process (Phase 1), which copies the file
into the project bundle and returns a durable asset descriptor. Until then,
remove the blob URL from persisted state and keep imported files in an
in-memory map keyed by asset id, or disable the import button behind a
“Phase 1” flag. The document model must never contain `blob:` or `data:` URLs.

**Test:** schema round-trip rejects `blob:`/`data:` in `asset.path` and in
`screen.image.props.assetId`; an import op returns a bundle-relative path.

#### D3 — No-op commits create history entries

`MotionStore.commit()` always pushes the current document onto `past` before
calling `applyMotionOps`, even when the reducers return the same document
reference. A user who types the same track name, or sets a keyframe to its
current value, gets an undo entry that does nothing. This makes undo feel broken
and inflates the history limit.

**Fix:** apply first, compare references, and only push history if the document
changed. `applyMotionOps` already returns the same reference for no-ops in most
reducers; the store must respect it.

**Test:** commit a no-op op, assert `canUndo` is unchanged and the document
reference is identical.

#### D4 — Pending-approval lifecycle is incomplete

`MotionStore.confirmPending()` clears `pendingApproval` and then calls
`commit(..., { approved: true })`. If the apply throws, the pending request is
lost and the user sees an error with no way to retry or cancel. Conversely,
`commit()` sets `pendingApproval` and returns `false`, but callers have no
structured way to distinguish “held for approval” from “rejected by validation.”

**Fix:** introduce a discriminated `MotionCommitResult`:
`{ status: 'applied' | 'unchanged' | 'pending' | 'rejected'; document; error? }`.
Keep the pending request until it is explicitly confirmed or cancelled. On a
failed confirmed apply, restore the pending request and surface the error.

**Test:** destructive op → pending; confirm with an op that throws → pending is
restored; cancel clears it.

#### D5 — Schema validation is shallower than the document’s invariants

`parseMotionDocument()` checks duplicate node ids, missing parents, parent type
compatibility, parent cycles, missing channel targets, and unsupported animated
properties. It does **not** check:

- duplicate clip ids, track ids, channel ids, keyframe ids, or placement ids;
- keyframes sorted ascending within a channel;
- keyframe times within `[0, clip.duration]`;
- placement start/duration within the timeline;
- `timeline.duration > 0` and `workArea` inside it;
- duplicate channel targets (`targetId + property`) within a clip;
- `screen.image` source being an asset id rather than a URL;
- `meta.output` sane bounds (fps 1–240, dimensions 16–16384);
- `activeSceneId` / `cameraId` references (v4).

**Fix:** move validation into `validateMotionDocument(doc)` with a stable,
ordered error list. `parseMotionDocument` calls it after Zod parsing. Ops call
the same validator on the result in development/test builds, so an op cannot
write a document that the loader would reject.

**Test:** one fixture per invariant, each asserting a specific error path.

#### D6 — `scene.node.remove` leaves dangling timeline data

Removing a node removes channels targeting it, but it does not remove tracks
whose `targetId` was that node, and it does not remove placements of clips that
became empty. It nulls `track.targetId`, which is better than dangling, but the
track remains and may confuse the hierarchy. It also does not handle future
model-node references or scene camera references.

**Fix:** define a single `collectNodeCascade(scene, nodeId)` helper used by both
`scene.node.remove` and `scene.remove`. It returns removed node ids, affected
track ids, affected clip ids, and affected camera ids. The op then decides
whether to delete tracks or re-home them; the default is to delete tracks that
were scoped only to the removed node, and to keep unscoped tracks.

**Test:** remove a parent with children, a scoped track, and channels; assert no
dangling ids and no camera pointing at a removed node.

#### D7 — `keyframe.add` accepts out-of-clip times

`keyframe.add` validates `time >= 0` but does not cap it at `clip.duration`,
while `keyframe.move` does cap. Two paths, two behaviours. A keyframe outside the
clip is invisible on the timeline but still sampled at the boundary, which is a
confusing ghost.

**Fix:** validate `0 <= time <= clip.duration` in the op, and reject rather than
clamp on add. Move keeps clamping because dragging is a continuous gesture.

**Test:** add at `duration + 0.1` → `MotionOpError`; add at exactly `duration` →
accepted.

#### D8 — `asset.add` does not validate kind-specific fields

The op accepts `frameCount`/`fps` for every asset and only checks that an image
has one frame. It does not check that an image sequence has `frameCount > 1`,
that a video has a duration, or that the MIME type matches the kind. The schema
mirrors the same looseness.

**Fix:** discriminated validation by `kind`; `MotionAsset` becomes a union or a
single type with a `superRefine`.

**Test:** table-driven invalid-asset cases.

### 3.3 Functional gaps

These are not bugs in the current code; they are things the current code does
not attempt.

| Gap | Consequence | Phase |
| --- | --- | --- |
| No project persistence | Reload loses everything; no project browser. | 1 |
| No asset import through main | Only blob URLs; no durable assets. | 1 |
| No export | The product cannot produce its primary output. | 1 |
| Single scene | Cannot tell a multi-beat story or reuse a scene. | 1 |
| No master sequence | No way to cut scenes together. | 2 |
| No brand kit | Every project re-invents colors and type. | 1 (colors/fonts); 2 (logo/safe area) |
| No glTF import | Cannot use the 3D models the product is named for. | 2 |
| No audio | Product films are silent. | 2 |
| No generated inspector | Users can only edit tracks and keyframes, not nodes. | 1 |
| No direct manipulation | No gizmos, no drag-to-place, no snapping. | 1 |
| No templates | Blank canvas is the only starting point. | 1 |
| No copilot | The agent contract exists but has no UI. | 3 |
| No state machine runtime | Interactive output is impossible. | 4 |
| No runtime export | Cannot ship an interactive artifact. | 5 |
| No recovery | Crash during edit loses work. | 1 |
| No asset relink | Moving a project folder breaks every asset. | 1 |
| No render queue | Long exports block the editor. | 2 |
| No color management | H.264 output can shift colors. | 2 |

### 3.4 Phase 0 work plan

Phase 0 is one PR-sized change set per item, each with a test. Do not bundle
these with feature work; the point is to make the foundation trustworthy.

| ID | Work | Files | Exit criterion |
| --- | --- | --- | --- |
| P0-1 | Fix `SRGBColorSpace` import | `MotionSceneCanvas.tsx` | `bunx tsc --noEmit` passes; canvas mounts. |
| P0-2 | Remove blob/data URLs from persisted assets; narrow asset kind | `MotionScenePanel.tsx`, `types.ts`, `schema.ts`, `ops.ts` | No `blob:`/`data:` can reach the document. |
| P0-3 | Add `MotionCommitResult`; fix no-op history | `use-motion-store.ts`, tests | No-op commit leaves `canUndo` unchanged. |
| P0-4 | Fix pending-approval lifecycle | `use-motion-store.ts`, tests | Failed confirm restores pending. |
| P0-5 | Central `validateMotionDocument()` | `schema.ts`, `ops.ts`, tests | Every invariant has a fixture. |
| P0-6 | Node-removal cascade helper | `ops.ts`, tests | No dangling ids after removal. |
| P0-7 | Keyframe time bounds | `ops.ts`, tests | Out-of-clip add rejected. |
| P0-8 | Asset kind-specific validation | `schema.ts`, `ops.ts`, tests | Invalid kind/field combos rejected. |
| P0-9 | Scene-aware evaluator seam | `evaluate.ts`, `sample.ts`, tests | `evaluateMotionFrame` takes a scene, not a whole document. |
| P0-10 | Document v4 skeleton behind a migration | `types.ts`, `schema.ts`, `defaults.ts` | v3 project migrates to a single-scene v4 project; all tests pass. |

P0-9 and P0-10 are deliberately last. They change signatures that the rest of
the code touches, so the smaller defects should be fixed first and kept as
separate commits.

**Phase 0 exit gate:** `bun run build`, `bun test`, `bun run lint`, and
`bunx tsc --noEmit` all pass; the 39 existing Motion tests still pass; the
manual smoke path (open `/motion`, play, scrub, undo, redo) works.

---

## 4. Rive as the design reference

Rive is the closest thing to the authoring experience Motion wants: a compact
scene outliner, a timeline that reads at a glance, direct manipulation, and a
clear mental model from “artboard” to “state” to “play.” It is also a 2D vector
tool with a proprietary editor. Copying its surface would produce a worse Rive;
copying its principles produces a better Motion.

### 4.1 What to borrow

| Rive principle | What it gets right | Motion translation |
| --- | --- | --- |
| **One canvas, one mental model** | The artboard is always visible and always the thing you are editing. | The viewport is the anchor. The hierarchy and timeline are lenses on it, not separate modes. |
| **Compact hierarchy** | A short, scannable tree with clear icons and inline visibility/lock. | Scene tree with node-type icons, inline eye/lock, drag-to-reparent, multi-select. |
| **Selection drives the inspector** | You rarely hunt for a property panel. | A registry-driven inspector shows only the selected node’s properties and animatable paths. |
| **Timeline as a story, not a spreadsheet** | Clips, keys, and playhead are visually distinct; the eye finds the beat. | Tracks with clip blocks, key diamonds, work-area shading, audio waveform, and a playhead that snaps. |
| **Direct manipulation** | Drag the thing on canvas; the inspector follows. | Transform gizmos, drag-to-place assets, camera framing handles, numeric fields that accept expressions later. |
| **Playback is instant** | Space plays; scrub updates the artboard; no render step. | The same `MotionFrame` evaluator drives preview and export. Preview is not a separate code path. |
| **Templates are first-class** | New users start from something alive. | A template gallery with editable brand slots, not a static file. |
| **State is explicit** | Inputs, transitions, and layers are visible. | Reserved state-machine panel in Phase 4; in Phase 1–3, “state” is a scene and “transition” is a sequence item. |
| **Small, legible controls** | Dense but not cramped; icons carry meaning. | Use the existing Qeda density and semantic tokens; no new visual language. |

### 4.2 What not to copy

| Rive choice | Why Motion should not copy it |
| --- | --- |
| 2D vector artboards as the root | Motion’s root is a 3D scene graph with a camera. A 2D artboard is a node type, not the document. |
| Proprietary `.riv` format | Motion’s document is JSON, inspectable, diffable, and agent-callable. |
| State machines as the only playback model | Video needs a deterministic timeline. State machines are an interactive runtime concern, reserved for Phase 4. |
| Editor-owned runtime | Motion’s runtime is a pure evaluator plus a thin renderer adapter, so offline export and live preview share semantics. |
| Per-artboard export | Motion exports a project or a sequence, with scenes as internal beats. |
| A graph editor as the primary surface | Motion’s primary surface is spatial. Graphs are an advanced inspector, not the front door. |
| Rive’s exact panel layout | Qeda already has a shell, a rail, and a density system. Motion fits Qeda, not Rive. |

### 4.3 The Rive-derived authoring loop

Motion’s core loop should feel as short as Rive’s:

1. **Choose a starting point** — template or blank scene.
2. **Stage** — drop a screen or model into the scene; move/rotate/scale it.
3. **Light and frame** — pick a camera, adjust lights, set background.
4. **Animate** — select a property, set a keyframe, move the playhead, change
   the value. Repeat.
5. **Play** — spacebar. The viewport updates immediately.
6. **Export** — choose a preset, render, reveal the file.

Every additional click in that loop is a design failure. The copilot can shorten
steps 2–4, but it cannot remove the user’s ability to do them by hand.

### 4.4 Where Motion deliberately diverges

- **3D-first.** Depth, cameras, lights, and imported models are first-class. A
  user who only wants 2D can ignore them, but the tool does not pretend they do
  not exist.
- **Video-first.** The output is a file with a duration, a frame rate, and an
  audio track. There is no “runtime” in the default workflow.
- **Agent-native.** Every action is an op with a risk class and a diff. Rive has
  no equivalent, and this is the main reason Motion can be a copilot product
  rather than a chat bolted onto an editor.
- **No-code, not low-code.** The inspector is generated from the node registry;
  the user never sees a schema or a script.
- **Local-first.** No account, no cloud, no collaboration. Projects are folders
  on disk that the user can back up.

---

## 5. Information architecture and routes

### 5.1 Route map

| Route | Screen | Notes |
| --- | --- | --- |
| `/motion` | Project browser | Grid/list of projects, templates, “New project.” |
| `/motion/:projectId` | Editor | Loads the project by id; deep-linkable. |
| `/motion/:projectId?scene=:sceneId` | Editor, specific scene | Selection survives reload. |
| `/motion/:projectId?panel=copilot` | Editor, copilot open | Used by the agent surface and notifications. |
| `/motion/templates` | Template gallery | Optional; can be a tab inside `/motion`. |
| `/motion/settings` | Motion preferences | Autosave interval, default export preset, cache location. |

The router is `MemoryRouter`, so `window.location` never changes. Read params
with `useSearchParams`, never `window.location.search`.

`/motion` must not mount the editor. The current `Motion.tsx` page owns the
editor directly; Phase 1 splits it into:

- `src/renderer/pages/MotionBrowser.tsx`
- `src/renderer/pages/MotionEditorPage.tsx`
- `src/components/motion/browser/*`
- `src/components/motion/editor/*`

The route tree becomes:

```tsx
{
  path: 'motion',
  children: [
    { index: true, element: <MotionBrowser /> },
    { path: 'templates', element: <MotionTemplates /> },
    { path: 'settings', element: <MotionSettings /> },
    { path: ':projectId', element: <MotionEditorPage /> },
  ],
}
```

### 5.2 Project browser

The browser is the front door. It should feel like a creative tool, not a file
manager.

**Layout**

- Header: “Motion,” project count, search, sort, view toggle (grid/list), “New
  project.”
- Hero row: “Start from a template” with 3–4 large cards. Templates are the
  fastest path to a first success.
- Project grid: thumbnail (last rendered frame or scene poster), name, duration,
  resolution, last edited, scene count.
- Empty state: a single large “Create your first motion” card with a 20-second
  silent loop showing what the tool does, plus “Start from template” and “Start
  blank.”
- Footer/status: storage location, cache size, “Open project folder.”

**Project card actions**

- Open.
- Rename (inline).
- Duplicate.
- Duplicate with brand swap (Phase 2).
- Export last render (if one exists).
- Reveal in file manager.
- Delete (destructive, confirm; moves to trash, not unlink).

**Sorting:** last edited (default), name, created, duration.

**Filtering:** all, drafts, rendered, archived (Phase 2).

**Search:** name and scene names. Debounced, local only.

**New project flow**

1. Modal with two tabs: **Template** and **Blank**.
2. Template tab: category chips (Launch, Feature, App store, Social, Model).
3. Blank tab: name, aspect ratio (16:9, 9:16, 1:1, 4:5, custom), duration
   (5/10/15/30s), frame rate (24/30/60), background (graphite/slate/paper/
   transparent).
4. “Create” writes the project bundle and navigates to the editor with the
   starter scene selected.

The blank project is not empty. It contains a camera, a key light, a fill light,
a ground plane, and a title node — the minimum needed to see something and
understand the scene. A truly empty viewport is a worse teacher.

### 5.3 Editor layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Top bar: back · project name · scene switcher · undo/redo · preview · Export │
├───────────────┬──────────────────────────────────────────┬───────────────────┤
│ Scene         │ Viewport                                 │ Inspector         │
│ hierarchy     │  (camera view, gizmos, safe area)        │  (selection)      │
│               │                                          │                   │
│ Assets        │                                          │  Brand            │
│               │                                          │  Output           │
├───────────────┴──────────────────────────────────────────┴───────────────────┤
│ Timeline: transport · work area · tracks · clips · keys · audio              │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Top bar** is 44px. Left: back to browser, project name (inline rename),
  scene switcher dropdown, “+ Scene.” Center: nothing (the viewport is the
  focus). Right: undo/redo, preview quality, “Copilot” toggle, “Export.”
- **Left panel** is 260–320px, resizable, collapsible. Two tabs: Scene and
  Assets. Scene tab is the hierarchy. Assets tab is the project library.
- **Viewport** fills the remaining center. It has a floating toolbar (camera
  view, grid, background, zoom) and a bottom status strip (scene, fps, duration,
  selection).
- **Inspector** is 300–360px, resizable, collapsible. It is selection-driven.
  With no selection it shows scene settings, brand, and output.
- **Timeline** is 240–420px, resizable, collapsible. It can be docked bottom
  (default) or right (Phase 2).
- **Copilot** is a right-side drawer, 360–420px, overlaying the inspector. It
  does not permanently shrink the viewport. It can be pinned (Phase 3).

**Minimum window:** 1100 × 720. Below that, the inspector collapses to icons and
the timeline becomes a compact strip. The app is desktop-only; do not pretend to
support phone widths.

### 5.4 Editor modes

Motion does not have “modes” in the Blender sense. It has **focus states** that
change which panel is emphasized, not what the document means.

| Focus state | Trigger | Behavior |
| --- | --- | --- |
| **Design** | Default | Viewport + hierarchy + inspector. Timeline collapsed or short. |
| **Animate** | Click timeline or press `T` | Timeline expands; inspector shows animated properties; playhead active. |
| **Sequence** | Phase 2; click “Sequence” tab above timeline | Timeline shows scene blocks, not node tracks. Inspector shows sequence item settings. |
| **Present** | Phase 4; “Present” button | Full-screen runtime preview; no editing chrome. |
| **Render** | Export dialog | Modal with progress; editor is read-only while rendering. |

The mode is derived from the active panel and stored in editor state, not in the
document. Opening a project restores the last mode per user, not per project.

### 5.5 Scene switcher

The scene switcher is a dropdown in the top bar, not a separate page. It shows:

- Scene name, duration, and a thumbnail.
- A check mark on the active scene.
- “+ New scene” and “Duplicate scene.”
- “Manage scenes…” which opens a small dialog for reorder/rename/delete.
- In Phase 2, “Master sequence” appears as a special item at the top.

Switching scenes preserves the playhead time when possible. If the new scene is
shorter, clamp to its duration. Do not reset to zero; that loses the user’s
place in a multi-beat story.

### 5.6 Keyboard map

| Key | Action |
| --- | --- |
| `Space` | Play/pause |
| `Shift+Space` | Play from start |
| `,` / `.` | Step one frame back/forward |
| `Home` / `End` | Go to start/end |
| `T` | Focus timeline |
| `F` | Frame selection in viewport |
| `G` | Translate gizmo |
| `R` | Rotate gizmo |
| `S` | Scale gizmo |
| `W` | Toggle wireframe (viewport only) |
| `Cmd/Ctrl+Z` | Undo |
| `Cmd/Ctrl+Shift+Z` | Redo |
| `Cmd/Ctrl+S` | Save now (autosave is already on) |
| `Cmd/Ctrl+D` | Duplicate selection |
| `Delete` / `Backspace` | Delete selection (destructive, confirm for nodes) |
| `Cmd/Ctrl+G` | Group selection |
| `Cmd/Ctrl+Shift+G` | Ungroup |
| `Cmd/Ctrl+K` | Open command palette |
| `?` | Shortcut cheat sheet |

Shortcuts must not fire while an input, textarea, or contenteditable is focused.
The existing `Motion.tsx` handler already follows this rule; keep it.

### 5.7 Deep links and restoration

- `/motion/:projectId` loads the project. If it is missing, show a recoverable
  error with “Locate project folder” and “Remove from list.”
- `?scene=` selects a scene. Invalid ids fall back to the first scene and show a
  non-blocking toast.
- `?panel=copilot` opens the copilot drawer. It does not auto-send a message.
- The editor restores per-project view state (camera orbit, zoom, timeline
  scroll, selected scene) from a local `editor-state.json`, not from the
  document. View state is not portable and should not pollute the project file.
- If the app was closed with unsaved changes, the recovery prompt appears before
  the editor mounts. See §15.4.

### 5.8 Loading, empty, and error states

| State | Treatment |
| --- | --- |
| Loading project | Skeleton layout, not a spinner over a blank screen. Show the project name from the index. |
| Missing asset | Node renders a magenta placeholder with an inline “Relink” button; export is blocked with a list of missing assets. |
| Missing font | Fallback font + warning badge; export warns that typography may differ. |
| Unsupported node type | Placeholder box + “This project uses a newer node type” banner; do not silently drop the node. |
| Corrupt project | Error page with “Restore from backup” and the path to the bundle. Never overwrite the corrupt file. |
| Render failure | Dialog with the failing frame/time, codec, and a “Try WebM” / “Try software” action. |
| Permission failure | Explain which folder and why; offer “Choose another location.” |

---

## 6. Document model v4

### 6.1 Principles

1. **The document is the product.** The editor, the copilot, the renderer, and
   the tests all read and write the same versioned JSON document. There is no
   parallel editor state that can drift.
2. **Seconds are authoritative.** Frames are a boundary constraint, not a
   storage unit. Changing `fps` must not silently rewrite authored timing;
   `timeline.quantizeToFps` remains an explicit op.
3. **Every id is stable and globally unique within its namespace.** Ops take ids
   as parameters. Replaying a batch produces the same document.
4. **The document is renderer-independent.** `src/lib/motion` stays free of
   React, Electron, DOM, and WebGL so it can run in jsdom and in a future
   headless runtime.
5. **Reserved fields are honest.** A field marked reserved is parsed, validated,
   round-tripped, and ignored by the runtime. It is not a promise that the
   feature works today.
6. **Strict parsing, loud failure.** A document written by a newer build fails
   with an actionable message instead of dropping fields. Silent truncation
   corrupts work on the next save.

### 6.2 Type definitions

The following is the normative shape. It lives in `src/lib/motion/types.ts`.

```ts
export const MOTION_SCHEMA_VERSION = 4;

// ── Time and easing ─────────────────────────────────────────────────────────

export type MotionEasing =
  | { type: 'linear' }
  | { type: 'step' }
  | { type: 'cubic'; x1: number; y1: number; x2: number; y2: number };

export type MotionKeyframe = {
  id: string;
  /** Seconds on the clip's local timeline. */
  time: number;
  value: number;
  /** Governs the segment from this keyframe to the next. */
  easing: MotionEasing;
};

export type MotionPropertyPath = string;

export type MotionChannel = {
  id: string;
  /** Node id within the owning scene. */
  targetId: string;
  property: MotionPropertyPath;
  /** Strictly ascending by time; no duplicate times. */
  keyframes: MotionKeyframe[];
};

// ── Clips, placements, tracks ───────────────────────────────────────────────

export type MotionClip = {
  id: string;
  name: string;
  /** Local length in seconds. */
  duration: number;
  channels: MotionChannel[];
};

export type MotionClipPlacement = {
  id: string;
  clipId: string;
  /** Seconds on the scene timeline. */
  start: number;
  /** Seconds skipped at the start of the clip. */
  trimIn: number;
  /** Seconds of the clip used on the timeline. */
  duration: number;
};

export type MotionTrack = {
  id: string;
  name: string;
  /** Node the track is scoped to, when it is scoped to one. */
  targetId: string | null;
  muted: boolean;
  locked: boolean;
  placements: MotionClipPlacement[];
};

export type MotionWorkArea = {
  enabled: boolean;
  start: number;
  end: number;
};

export type MotionPlayMode = 'once' | 'loop' | 'ping-pong';

export type MotionAudioPlacement = {
  id: string;
  assetId: string;
  start: number;
  trimIn: number;
  duration: number;
  gain: number;
  muted: boolean;
  /** Fade lengths in seconds, clamped to duration. */
  fadeIn: number;
  fadeOut: number;
};

export type MotionTimeline = {
  /** Scene length in seconds. */
  duration: number;
  workArea: MotionWorkArea;
  playMode: MotionPlayMode;
  tracks: MotionTrack[];
  clips: MotionClip[];
  /** Audio is timeline-level, not a scene-graph node. */
  audio: MotionAudioPlacement[];
};

// ── Scene graph ─────────────────────────────────────────────────────────────

export type MotionVector3 = [number, number, number];

export type MotionNodeTransform = {
  position: MotionVector3;
  rotation: MotionVector3;
  scale: MotionVector3;
};

export type MotionNode = {
  id: string;
  type: string;
  name: string;
  parentId: string | null;
  visible: boolean;
  locked: boolean;
  transform: MotionNodeTransform;
  props: Record<string, unknown>;
};

export type MotionBackground =
  | { type: 'color'; color: string }
  | { type: 'transparent' }
  | { type: 'environment'; assetId: string; intensity?: number; blur?: number };

export type MotionScene = {
  id: string;
  name: string;
  nodes: MotionNode[];
  timeline: MotionTimeline;
  /** Null means "the first camera node in the scene," for hand-written docs. */
  cameraId: string | null;
  background?: MotionBackground;
  /** Reserved for Phase 4. Parsed and round-tripped; no runtime yet. */
  stateMachines?: MotionStateMachineDefinition[];
};

// ── Assets ──────────────────────────────────────────────────────────────────

export type MotionAssetKind =
  | 'image'
  | 'image-sequence'
  | 'video'
  | 'audio'
  | 'font'
  | 'model'
  | 'environment';

export type MotionAsset = {
  id: string;
  name: string;
  kind: MotionAssetKind;
  mimeType: string;
  /** Bundle-relative POSIX path, e.g. "assets/ab12/hero.png". */
  path: string;
  /** SHA-256 of the file bytes, lowercase hex. */
  hash: string;
  byteSize: number;
  width?: number;
  height?: number;
  frameCount?: number;
  fps?: number;
  duration?: number;
  /** Original filename, for relink and display. */
  sourceName?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

// ── Brand ───────────────────────────────────────────────────────────────────

export type MotionBrandColorToken =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'background'
  | 'foreground'
  | 'muted';

export type MotionFontRef = {
  family: string;
  assetId?: string;
  weight?: number;
  style?: 'normal' | 'italic';
};

export type MotionBrand = {
  name: string;
  colors: Record<MotionBrandColorToken, string>;
  fonts: {
    heading: MotionFontRef;
    body: MotionFontRef;
    mono?: MotionFontRef;
  };
  logoAssetId?: string;
  safeArea: { top: number; bottom: number; left: number; right: number };
  cornerRadius: number;
  defaults: {
    easing: MotionEasing;
    duration: number;
  };
};

// ── Sequence (Phase 2) ──────────────────────────────────────────────────────

export type MotionTransitionKind = 'cut' | 'crossfade' | 'dip';

export type MotionTransition = {
  type: MotionTransitionKind;
  duration: number;
  /** Required for `dip`; ignored otherwise. */
  color?: string;
};

export type MotionSequenceItem = {
  id: string;
  sceneId: string;
  start: number;
  duration: number;
  transitionIn?: MotionTransition;
  transitionOut?: MotionTransition;
};

export type MotionSequence = {
  duration: number;
  items: MotionSequenceItem[];
};

// ── State machines (reserved, Phase 4) ──────────────────────────────────────

export type MotionStateMachineTransition = {
  target?: string;
  guard?: string;
  actions?: string[];
};

export type MotionStateMachineState = {
  on?: Record<string, MotionStateMachineTransition | MotionStateMachineTransition[]>;
  after?: Record<string, MotionStateMachineTransition>;
  always?: MotionStateMachineTransition;
  entry?: string[];
  exit?: string[];
};

export type MotionStateMachineDefinition = {
  id: string;
  name: string;
  initial: string;
  states: Record<string, MotionStateMachineState>;
  context?: Record<string, unknown>;
};

// ── Document ────────────────────────────────────────────────────────────────

export type MotionOutputSettings = {
  fps: number;
  width: number;
  height: number;
};

export type MotionMeta = {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  output: MotionOutputSettings;
};

export type MotionDocument = {
  schemaVersion: 4;
  /** Monotonic edit counter for optimistic concurrency. */
  revision: number;
  meta: MotionMeta;
  brand: MotionBrand;
  assets: MotionAsset[];
  scenes: MotionScene[];
  activeSceneId: string;
  /** Optional master sequence. Absent means "scenes are independent." */
  sequence?: MotionSequence;
};

// ── Editor selection (never persisted in the document) ──────────────────────

export type MotionSelection =
  | { kind: 'scene'; sceneId: string }
  | { kind: 'node'; sceneId: string; nodeId: string }
  | { kind: 'track'; sceneId: string; trackId: string }
  | {
      kind: 'placement';
      sceneId: string;
      trackId: string;
      placementId: string;
    }
  | {
      kind: 'keyframe';
      sceneId: string;
      trackId: string;
      placementId: string;
      clipId: string;
      channelId: string;
      keyframeId: string;
    }
  | { kind: 'asset'; assetId: string }
  | null;
```

### 6.3 Why these changes

| Change | Reason |
| --- | --- |
| `scene` → `scenes[]` + `activeSceneId` | Multiple beats, reusable scenes, master sequence. |
| `revision` at root | Optimistic concurrency for autosave and the copilot. |
| `brand` at root | One brand kit per project, not per scene. Assets are shared. |
| `assets[].path` + `hash` | Durable, relocatable, verifiable. Blob URLs cannot survive reload. |
| `timeline.loop` → `workArea` + `playMode` | Loop is one play mode, not the timeline’s identity. Work area is an authoring range. |
| `placement.trimIn` + `duration` | Non-destructive trimming. A clip can be placed multiple times with different in/out points. |
| `timeline.audio[]` | Audio is not a scene node and must not be parented to a camera. |
| `scene.background` | A scene can be transparent for overlays or use an environment map. |
| `sequence` optional | Phase 1–1.5 projects do not need a master sequence; the field can be absent without a migration. |
| `stateMachines` optional | Reserving the field now avoids a breaking migration in Phase 4. |

### 6.4 Invariants

`validateMotionDocument(doc)` enforces the following. Each rule has a stable
`code` so the UI and tests can assert on it without matching prose.

**Document**

- `schemaVersion === 4`.
- `revision` is a non-negative integer.
- `meta.id` is non-empty; `meta.name` is non-empty after trim.
- `meta.output.fps` is in `[1, 240]`.
- `meta.output.width` and `height` are integers in `[16, 16384]`.
- `scenes.length >= 1`.
- Scene ids are unique.
- `activeSceneId` references a scene.
- If `sequence` exists, every item references a scene.

**Scene**

- Node ids are unique within the scene.
- Every `parentId` references a node in the same scene.
- The parent graph is acyclic.
- Every node type is registered.
- Node props validate against the type’s `propsSchema`.
- If `cameraId` is non-null, it references a camera node in the same scene.
- If `background.type === 'environment'`, `assetId` references an environment asset.
- State machine ids are unique; every `initial` and transition `target` names a
  state in the same machine. Reserved machines are validated, not executed.

**Timeline**

- `duration > 0`.
- If `workArea.enabled`, `0 <= start < end <= duration`.
- `playMode` is one of the three literals.
- Track ids are unique across the scene.
- Clip ids are unique across the scene.
- Placement ids are unique across the scene (not just per track).
- Audio placement ids are unique across the scene.
- Every placement references an existing clip.
- Every track’s `targetId` is null or references a node in the scene.
- `placement.start >= 0`, `placement.trimIn >= 0`, `placement.duration > 0`.
- `placement.trimIn + placement.duration <= clip.duration + 1e-9`.
- Placements may extend past `timeline.duration`; the renderer clips them and
  the UI shows an overflow badge. This preserves work when a user shortens a
  scene temporarily.
- Every audio placement references an audio asset; `trimIn + duration <=
  asset.duration`.
- Audio `gain` is in `[0, 2]`; `fadeIn >= 0`, `fadeOut >= 0`, and
  `fadeIn + fadeOut <= duration`.
- Audio placements do not overlap on the same asset unless `allowOverlap` is
  added later. For v4, overlap is allowed but the mixer sums them; this is
  explicit, not accidental.

**Clips and channels**

- Channel ids are unique across the scene.
- Every channel’s `targetId` references a node in the owning scene.
- The node type declares the channel’s `property` as animatable.
- A clip contains at most one channel for a given `(targetId, property)` pair.
- Keyframe ids are unique across the scene.
- Keyframe times are strictly ascending within a channel.
- Every keyframe time is in `[0, clip.duration]`.
- Easing cubic control points are finite and within the unit square
  (`x1,x2 ∈ [0,1]`, `y1,y2 ∈ [0,1]`); this is a UI constraint, not a sampling
  requirement, but it keeps presets portable.

**Assets**

- Asset ids are unique.
- `path` is relative, uses `/`, contains no `..` segment, and has no URL scheme.
- `hash` is 64 lowercase hex characters, except:
  - `metadata.builtin === true` → `hash === 'builtin'` and `path` starts with
    `builtin/`;
  - `metadata.legacy === true` → `hash === ''`; legacy assets block export.
- `byteSize >= 0`.
- Kind-specific rules:
  - `image`: `width > 0`, `height > 0`, `frameCount === 1`, no `duration`.
  - `image-sequence`: `frameCount > 1`, `fps > 0`, `width/height > 0`.
  - `video`: `duration > 0`, `width/height > 0`; `fps` optional.
  - `audio`: `duration > 0`.
  - `font`: `metadata.format` is `'woff2' | 'woff' | 'ttf' | 'otf'`.
  - `model`: `metadata.format` is `'glb' | 'gltf'`.
  - `environment`: `metadata.format` is `'hdr' | 'exr'`.
- Every asset reference resolves:
  - `screen.image.props.assetId`
  - `screen.video.props.assetId`
  - `model.gltf.props.assetId`
  - `text.*.props.fontAssetId` (optional)
  - `brand.logoAssetId` (optional)
  - `brand.fonts.*.assetId` (optional)
  - `scene.background.assetId` (environment only)
  - `timeline.audio[].assetId` (audio only)

**Sequence**

- `sequence.duration > 0`.
- Item ids are unique.
- `item.start >= 0`, `item.duration > 0`.
- `item.start + item.duration <= sequence.duration + 1e-9`.
- Items are sorted by `start`; gaps are allowed; overlaps are allowed only when
  at least one side declares a transition whose duration covers the overlap.
- `transition.duration >= 0`; a `cut` has duration `0`; a `crossfade` or `dip`
  has duration `> 0` and `<= min(previous.duration, item.duration) / 2`.

**Brand**

- Color tokens are valid CSS hex colors (`#rgb`, `#rgba`, `#rrggbb`,
  `#rrggbbaa`).
- `safeArea` values are in `[0, 0.5]` as fractions of the output dimension.
- `cornerRadius >= 0`.
- `defaults.duration > 0`.

### 6.5 Timeline semantics

The timeline is the part most likely to be misunderstood, so the semantics are
stated explicitly.

**Clips are reusable; placements are occurrences.** A clip owns keyframes on a
local timeline `[0, clip.duration]`. A placement says where that clip appears on
the scene timeline and which slice of it is used:

```
visible local range = [trimIn, trimIn + duration]
scene time t maps to local time = trimIn + (t - placement.start)
```

A placement is active when `placement.start <= t < placement.start +
placement.duration`. At exactly `placement.start + placement.duration`, it is
inactive. This half-open convention matches the existing sampler and avoids
double-applying a value at a cut.

**Overlaps are allowed.** When two placements on the same track overlap, the
later one in the track’s `placements` array wins. Ops keep placements sorted by
`start`, then id, so “later” is deterministic. The UI shows an overlap badge and
offers “trim to remove overlap,” but does not silently delete keys.

**Tracks are evaluated in document order.** A later track overrides an earlier
track for the same `(node, property)` key. Muted tracks contribute nothing.
Locked tracks reject edits but still evaluate. There is no solo in v4; solo is a
UI filter, not a document concept, so it cannot change the exported result.

**Work area vs. scene duration.** `timeline.duration` is the scene’s authored
length. `workArea` is the range the user is currently focusing on; it drives
loop playback and “export work area.” The default work area is the full scene
and `enabled: false`. Enabling a work area never changes keyframe times.

**Play modes.** `once` plays from the playhead to the end (or work-area end) and
stops. `loop` wraps to the work-area start. `ping-pong` reverses at the ends
without duplicating time. `ping-pong` is a preview mode in Phase 1; export uses
`once` over the chosen range, because a ping-pong video is a creative decision,
not an export setting.

**Audio.** Audio placements are mixed over the scene timeline. They do not
affect visual evaluation. Export mixes them into the output; preview plays them
through an `AudioContext` clock that is slaved to the playback clock. If the
audio clock drifts, the visual clock wins.

**Quantization.** `timeline.quantizeToFps` snaps every keyframe to the output
frame grid and merges keys that collapse onto the same frame (later wins). It is
explicit, destructive, and confirmed. Changing `fps` does not quantize.

### 6.6 Scene model

A scene is a self-contained 3D composition with its own nodes, timeline, camera,
and background. Scenes share the project’s assets and brand.

- **One camera is active at a time.** `cameraId` selects it. A scene may contain
  multiple camera nodes (e.g. “wide” and “close”); switching is an editor action
  that changes `cameraId`, not a cut. `cameraId` is a document field and is not
  animatable, so a shot cannot cut between cameras inside one scene. To cut,
  use two scenes (Phase 1) or two sequence items with different scenes
  (Phase 2). This is a deliberate simplification: an animatable camera switch is
  a state-machine feature, not a timeline feature.
- **Background is optional.** Absence means the renderer uses the project’s
  default stage color (graphite). `transparent` is only meaningful for overlays
  and WebM/PNG output; MP4 export composites onto the brand background and warns.
- **Scenes are independent.** There is no implicit parent scene, no shared node
  graph, and no cross-scene channel targeting. If two scenes need the same
  product setup, duplicate the scene or use a template. Phase 2 may add scene
  instancing; it is not in v4.
- **Scene duration is independent.** A 3-second logo sting and a 20-second
  product film can live in the same project. The master sequence is what gives
  the project a total duration.

### 6.7 Assets

An asset is a file the project owns, plus the metadata needed to use it without
re-reading the file on every render.

**Bundle-relative paths.** `path` is always relative to the project bundle root
and always uses `/`. Absolute paths, `..`, `file:`, `http:`, `data:`, and `blob:`
are invalid. The renderer never receives a raw filesystem path; it receives a
`qeda-media://motion/<projectId>/<assetId>` URL, and the main process resolves
that URL through the project index. This is the same trust model as
`studio-media.ts`: the protocol handler only serves paths that a persisted
project references.

**Hashing and deduplication.** Import computes SHA-256 while copying the file.
Two assets with the same hash may share one file on disk, but keep separate
asset ids if they are used differently (e.g. the same logo with different
names). Deduplication is an optimization, not an identity rule.

**Asset ids are opaque.** `asset_01J...` (ULID or nanoid) is the only thing the
document stores. Names and paths can change without touching node props.

**Built-in assets.** A small set of generated assets (the starter dashboard,
default environment) are shipped in code and represented as assets with
`metadata.builtin = true`, `path: 'builtin/<name>'`, and `hash: 'builtin'`.
They resolve through the renderer, not the filesystem. This keeps the starter
project self-contained without embedding a PNG in JSON.

**Image sequences.** A sequence is a directory of numbered frames plus a
manifest:

```json
{
  "id": "asset_seq_01J...",
  "kind": "image-sequence",
  "path": "assets/asset_seq_01J.../",
  "frameCount": 120,
  "fps": 30,
  "width": 1600,
  "height": 900,
  "metadata": { "pattern": "frame_%04d.png", "start": 0 }
}
```

The renderer resolves frame `i` to
`qeda-media://motion/<projectId>/<assetId>/<i>`, matching the existing
`motionAssetFrameUrl()` helper. Frame selection uses
`motionAssetFrameIndex(asset, localTime)`, which clamps to the last frame. Do not
use a video element for image sequences; seeking is not frame-exact.

**Video.** `screen.video` uses an `HTMLVideoElement` in preview. For export, the
frame is decoded through WebCodecs/Mediabunny at the exact scene time, not by
calling `video.currentTime` and hoping. If exact decode is unavailable, export
falls back to the nearest decoded frame and records a warning. Phase 2.

**Fonts.** `font` assets are loaded with `FontLoader`/`troika-three-text`. If a
brand font asset is missing, fall back to the system stack and add a warning to
the frame. Never silently substitute a different brand font without telling the
user.

**Models.** `model` assets are GLB or GLTF. The primary path is a single `.glb`.
A `.gltf` with external buffers/textures is imported into a folder and its
relative URIs are rewritten to bundle-relative paths. Import validates with
`gltf-validator`; errors block import, warnings are shown but do not block.
Draco, KTX2/Basis, and Meshopt decoders ship with `three` and are wired through
`GLTFLoader` (`setDRACOLoader`, `setKTX2Loader`, `setMeshoptDecoder`). Do not
fetch decoders from a CDN; the app is local-first and may be offline.

**Environments.** `environment` assets are HDR/EXR. They are optional. A scene
background can reference one; the renderer uses `RGBELoader`/`EXRLoader` and
sets `scene.environment`. Environment maps are expensive; cache the decoded
texture per asset id and dispose on project close.

**Asset lifecycle**

| Action | Behavior |
| --- | --- |
| Import | Copy into bundle, hash, probe metadata, add `asset.add` op. |
| Use | Node props store the asset id; no path duplication. |
| Rename | `asset.rename` changes display name only. |
| Relink | `asset.relink` points the same id at a new file; hash is recomputed; references stay valid. |
| Remove | Refused while referenced. The UI lists references and offers “Replace references…” or “Cancel.” |
| Clean unused | Explicit maintenance action; never automatic. Undo may still need an asset. |
| Missing | Render placeholder, block export, show “Relink” with hash/name hints. |

### 6.8 Brand kit

The brand kit is project-level so a user can apply the same colors and type to
every scene without repeating themselves. It is data, not a theme provider.

Default brand (used by blank projects and the starter template):

```ts
const DEFAULT_BRAND: MotionBrand = {
  name: 'Untitled brand',
  colors: {
    primary: '#5885f7',
    secondary: '#a88cf7',
    accent: '#59c7a6',
    background: '#10131b',
    foreground: '#f1f3f8',
    muted: '#828b9c',
  },
  fonts: {
    heading: { family: 'ui-sans-serif', weight: 650 },
    body: { family: 'ui-sans-serif', weight: 400 },
    mono: { family: 'ui-monospace', weight: 400 },
  },
  safeArea: { top: 0.06, bottom: 0.08, left: 0.06, right: 0.06 },
  cornerRadius: 0.08,
  defaults: {
    easing: { type: 'cubic', x1: 0.22, y1: 1, x2: 0.36, y2: 1 },
    duration: 0.6,
  },
};
```

**Brand tokens are not live CSS variables.** They are values copied into node
props when the user applies a token. Changing the brand kit does not
retroactively restyle every node unless the user chooses “Update from brand.”
This is the same trade-off as a design system: automatic propagation is
convenient until it destroys a deliberate exception.

Phase 1 exposes brand colors and fonts in the inspector. Phase 2 adds logo
placement, safe-area overlays, and “apply brand to scene.”

### 6.9 Master sequence (Phase 2)

A project can be a set of independent scenes, or a film cut from them. The
master sequence is the film.

```ts
type MotionSequence = {
  duration: number;
  items: MotionSequenceItem[];
};

type MotionSequenceItem = {
  id: string;
  sceneId: string;
  start: number;
  duration: number;
  transitionIn?: MotionTransition;
  transitionOut?: MotionTransition;
};
```

**Semantics**

- Items are sorted by `start`.
- A gap renders the project’s background for that interval. Gaps are allowed;
  the UI shows them as empty blocks and warns on export if they exceed 0.5s.
- A scene can appear more than once (e.g. a recurring product shot). Each
  occurrence is a separate item with its own in/out points.
- `duration` can be shorter than the scene’s timeline duration; the scene is
  clipped, not time-stretched.
- `transitionIn` belongs to the incoming item; `transitionOut` belongs to the
  outgoing item. If both are present on an overlap, the incoming transition
  wins and the outgoing is ignored (one transition per boundary).
- `crossfade` renders both scenes into the same frame with alpha. `dip` renders
  the outgoing scene, then the transition color, then the incoming scene. `cut`
  is a hard switch.
- Audio lives on each scene’s timeline. The sequence mixes scene audio at the
  item’s offset. A future project-level audio track is a Phase 3 addition; do
  not fake it with a scene.

**When `sequence` is absent**

- The editor shows a “Sequence” tab with a single item for the active scene.
- Export defaults to the active scene.
- “Export all scenes” builds a temporary sequence in memory (cuts, no
  transitions) and exports it. It does not write the temporary sequence back to
  the document unless the user clicks “Save as master sequence.”

This keeps Phase 1 simple without blocking the Phase 2 feature.

### 6.10 State machines (reserved, Phase 4)

`MotionScene.stateMachines` exists now so a Phase 4 project does not need a
schema migration. It is not evaluated in Phase 1–3.

The shape is intentionally a serializable subset of XState v5 configs:

- States are named.
- Transitions reference targets by name.
- Actions and guards are **names**, not functions.
- Context is JSON.
- No inline `assign` functions, no promises, no invocations.

This lets the document store a machine without storing code, and lets a future
runtime compile it with `setup({ actions, guards }).createMachine(config)`. The
runtime will map named actions to Motion operations (play clip, set visibility,
set property, emit event). It will not use XState for video timeline evaluation;
the timeline is deterministic and XState is event-driven.

Why reserve it now: adding `stateMachines` to a scene later is a schema change,
and schema changes are the expensive part. Reserving an optional array costs
nothing and documents the intent.

### 6.11 Migration from v3

`MIGRATIONS[3]` converts a v3 document to v4. v3 projects were never persisted
to disk, so this migration exists mainly for fixtures, tests, and any in-memory
document created by an older build. It must still be correct.

**Step-by-step**

1. `schemaVersion = 4`, `revision = 0`.
2. `scenes = [{ id: 'scene_main', name: 'Scene 1', nodes: old.scene.nodes,
   timeline: migrateTimeline(old.timeline), cameraId: findFirstCamera(nodes),
   background: undefined }]`.
3. `activeSceneId = 'scene_main'`.
4. `brand = DEFAULT_BRAND`.
5. `assets = old.assets.map(migrateAsset).filter(Boolean)`.
6. `sequence` is absent.
7. Every `screen.image` node:
   - If `props.source === 'starter-dashboard'`, set
     `props.assetId = 'builtin:starter-dashboard'` and add the built-in asset.
   - If `props.source` matches an asset id, set `props.assetId` to that id.
   - If `props.source` matches an asset `uri`, set `props.assetId` to the asset
     id and delete `props.source`.
   - If `props.source` is a `qeda-media://motion/...` URL, map it to the asset
     whose path matches; otherwise drop the node’s asset reference and add a
     `missingAsset` warning.
   - `blob:`, `data:`, `http:`, and `file:` references are dropped. They were
     never durable.
8. Delete `scene`, `timeline.loop`.

**Timeline migration**

```ts
function migrateTimeline(old: V3Timeline): MotionTimeline {
  const clips = old.clips.map((clip) => ({ ...clip }));
  const clipsById = new Map(clips.map((clip) => [clip.id, clip]));
  return {
    duration: old.duration,
    workArea: {
      enabled: old.loop.enabled,
      start: old.loop.start,
      end: old.loop.end,
    },
    playMode: old.loop.enabled ? 'loop' : 'once',
    tracks: old.tracks.map((track) => ({
      ...track,
      placements: track.placements.map((placement) => {
        const clip = clipsById.get(placement.clipId);
        return {
          ...placement,
          trimIn: 0,
          duration: clip?.duration ?? 0,
        };
      }),
    })),
    clips,
    audio: [],
  };
}
```

If `loop.end` is `0` (a v3 default for some docs), use `old.duration` instead.
If `loop.start >= loop.end`, set `workArea.enabled = false` and `end =
old.duration`. A migration must converge to a valid document, not preserve a
nonsense range.

**Asset migration**

```ts
function migrateAsset(asset: V3Asset): MotionAsset | null {
  if (!asset.uri || /^(blob:|data:|https?:|file:)/i.test(asset.uri)) return null;
  const path = asset.uri.startsWith('qeda-media://motion/')
    ? asset.uri.replace('qeda-media://motion/', '')
    : `assets/${asset.id}/${asset.name}`;
  return {
    ...asset,
    path,
    hash: '',
    byteSize: 0,
    metadata: { legacy: true, v3Uri: asset.uri },
    createdAt: new Date(0).toISOString(),
  };
}
```

Legacy assets with `hash: ''` parse but block export with a “Relink assets”
error. This is better than inventing a hash or silently dropping a user’s
imagery.

**Migration tests**

- v1 → v4, v2 → v4, v3 → v4 all produce a valid document.
- A v3 document with a loop and placements preserves start times and clip
  durations.
- A v3 document with a blob asset drops it and marks the referencing node
  missing.
- A v4 document with `schemaVersion: 5` fails with a newer-version message.
- Migration is idempotent: running it on an already-v4 document is a no-op.

### 6.12 Revision and change tracking

`revision` is a monotonic integer, not a content hash.

- Every applied batch that changes the document increments `revision` by 1.
- A no-op batch does not increment it.
- Undo and redo restore content from history but assign
  `revision = current.revision + 1`. This makes every visible change a new
  revision, so an agent plan created before an undo is stale.
- Autosave writes `{ revision, savedAt, hash }` to a sidecar. If the app crashes
  and the sidecar revision is newer than the project file, recovery offers the
  sidecar.
- `plan` returns `baseRevision`. `apply` rejects with
  `MOTION_REVISION_CONFLICT` if the document’s revision no longer matches,
  unless the caller passes `force: true` (only the UI may do that, after showing
  a diff).

This is deliberately simpler than CRDTs. Motion is single-writer, local-first,
and agent-assisted; optimistic concurrency plus a diff is enough.

---

## 7. Runtime and rendering architecture

### 7.1 The contract

The runtime is the seam between the document and every consumer: preview,
export, tests, and the future interactive player.

```ts
export type MotionFrameWarning = {
  code:
    | 'missing-asset'
    | 'missing-font'
    | 'unsupported-node'
    | 'unsupported-property'
    | 'audio-decode-failed'
    | 'background-transparent-mp4'
    | 'frame-approximated'
    | 'missing-camera';
  message: string;
  nodeId?: string;
  assetId?: string;
};

export type MotionCameraFrame = {
  /** Empty string when the camera is synthetic (no camera node in the scene). */
  nodeId: string;
  fov: number;
  near: number;
  far: number;
  position: MotionVector3;
  rotation: MotionVector3;
  lookAt: MotionVector3 | null;
};

export type MotionAudioSample = {
  assetId: string;
  /** Seconds into the source asset. */
  sourceTime: number;
  gain: number;
  muted: boolean;
};

export type MotionFrame = {
  /** Scene time in seconds. */
  time: number;
  sceneId: string;
  /** Evaluated nodes, in document order. */
  nodes: MotionNode[];
  camera: MotionCameraFrame | null;
  background: MotionBackground;
  audio: MotionAudioSample[];
  warnings: MotionFrameWarning[];
};

export interface MotionRuntime {
  readonly kind: 'timeline' | 'state-machine';
  /** Scene duration in seconds. */
  getDuration(): number;
  /** Pure sample at `time`; must not read a wall clock. */
  sample(time: number): MotionFrame;
  reset(): void;
  dispose(): void;
}

export interface MotionInteractiveRuntime extends MotionRuntime {
  send(event: { type: string; [key: string]: unknown }): void;
}
```

`TimelineRuntime` is the Phase 1 implementation. `StateMachineRuntime` is the
Phase 4 implementation. Both return `MotionFrame`. The renderer never knows
which runtime produced a frame.

### 7.2 Evaluation pipeline

`evaluateMotionFrame(scene, time, context)` is the only place that composes
animation onto nodes.

```ts
export type MotionEvaluationContext = {
  assets: readonly MotionAsset[];
  brand: MotionBrand;
  output: MotionOutputSettings;
  /** Editor-only overrides; never persisted. */
  preview?: { stageColor?: string; showGrid?: boolean };
};

export function evaluateMotionFrame(
  scene: MotionScene,
  time: number,
  context: MotionEvaluationContext,
): MotionFrame;
```

Steps:

1. Validate `time` is finite. Throw `MotionEvaluationError` if not.
2. Clone the node map (shallow; immutable updates only).
3. Resolve the active placement per track with trim semantics.
4. Sample each active channel at `trimIn + (time - placement.start)`.
5. Apply each sampled value through `applyNodeProperty`, which validates the
   path and returns a new node.
6. Resolve the camera:
   - `scene.cameraId` if set and valid;
   - otherwise the first node of type `camera.perspective` or
     `camera.orthographic`;
   - otherwise a synthetic default camera and a `missing-camera` warning (not a
     hard error, so a half-built scene still previews).
7. Resolve the background:
   - explicit `scene.background`;
   - otherwise the project default (graphite);
   - if an environment asset is missing, fall back to color and add a warning.
8. Collect audio samples for the scene timeline.
9. Collect warnings: missing assets, missing fonts, unsupported node types,
   unsupported animated properties, missing camera.
10. Return a new `MotionFrame`. Do not mutate the document or the scene.

The evaluator is **pure**: no `Date.now()`, no `Math.random()`, no DOM, no
network. That is what makes the offline renderer deterministic and the tests
fast.

### 7.3 TimelineRuntime

```ts
export class TimelineRuntime implements MotionRuntime {
  readonly kind = 'timeline';

  constructor(
    private readonly scene: MotionScene,
    private readonly context: MotionEvaluationContext,
  ) {}

  getDuration(): number {
    return this.scene.timeline.duration;
  }

  sample(time: number): MotionFrame {
    return evaluateMotionFrame(this.scene, time, this.context);
  }

  reset(): void {
    // Timeline evaluation is stateless. Kept for interface symmetry.
  }

  dispose(): void {
    // No resources owned. The renderer owns GPU resources.
  }
}
```

The editor’s `PlaybackClock` supplies `time`. The clock owns wall-clock
playback; the runtime owns document time. This separation is why scrubbing,
playback, and export can share one evaluator without sharing a clock.

### 7.4 StateMachineRuntime (reserved)

Phase 4 adds:

```ts
export class StateMachineRuntime implements MotionInteractiveRuntime {
  readonly kind = 'state-machine';
  // Compiles scene.stateMachines with XState `setup().createMachine()`.
  // Named actions map to Motion ops; named guards map to pure predicates.
  // `sample(time)` evaluates the active state's timeline/animation layer.
  // `send(event)` transitions the machine.
}
```

Constraints for Phase 4, recorded now so the schema stays compatible:

- Machine configs are serializable; no functions in the document.
- Actions and guards are referenced by name.
- A state can select a clip, set node visibility, set a property, or emit an
  event. It cannot execute arbitrary code.
- Time still comes from the caller. XState does not own the render loop.
- The video timeline remains the source of truth for authored animation. State
  machines compose on top; they do not replace clips.

### 7.5 Renderer architecture

There are two renderers, sharing one document and one evaluator.

**Preview renderer**

- React Three Fiber `<Canvas>` inside `MotionSceneCanvas`.
- `frameloop="demand"`; the playback clock invalidates.
- Device pixel ratio capped at 1.75 for performance.
- Editor chrome (grid, gizmos, selection outline, safe area) lives outside the
  exported scene graph.
- Preview quality can be reduced (shadows off, DPR 1, lower resolution) without
  changing the document.

**Export renderer**

- A dedicated hidden `BrowserWindow` loads `motion-render.html`.
- It creates an offscreen `WebGLRenderer` at the output resolution, with
  `preserveDrawingBuffer: true`, `antialias: true`, and the same color
  management as preview.
- It steps time at exactly `1 / fps`, evaluates a frame, renders, reads the
  canvas, wraps it in a `VideoFrame`, and feeds Mediabunny.
- It never uses `requestAnimationFrame` for timing. `requestAnimationFrame` may
  be used to yield to the event loop, but the timestamp is ignored.
- It reports progress and accepts a cancel flag over IPC.
- It writes to a `.part` file and renames on success.

Why a hidden window instead of the editor’s canvas:

- A long render must not freeze the editor.
- A GPU/WebGL crash takes down the render window, not the user’s edit session.
- The export renderer can run at a different resolution and DPR without
  disturbing the preview.
- It can be reused for a future render queue and batch variants.

Why not a Node renderer: WebGL, WebCodecs, and font shaping are all in Chromium.
A Node-native renderer would be a second implementation with different bugs.

### 7.6 Determinism rules

The same project must render the same frames on the same machine, and close
enough on another machine that differences are explainable.

**Required**

- Fixed timestep: frame `i` is at `i / fps`, not “whenever the last frame
  finished.”
- All async resources (textures, fonts, models, video frames) are fully loaded
  before the first frame is rendered.
- No `Math.random()` in document evaluation. Future particle systems must use a
  seeded PRNG stored in the document.
- No `Date.now()` in evaluation. Timestamps are metadata, not animation input.
- Camera aspect ratio is derived from the output settings, not the window size.
- Color management is explicit: `SRGBColorSpace` output, `ACESFilmicToneMapping`
  for 3D, `toneMapped={false}` for UI/screen textures that are already sRGB.
- Shadow map size is a render setting, not a document property. Changing it may
  change softness; document the preset.

**Allowed differences**

- GPU vendor differences in antialiasing and shadow filtering.
- Font rasterization differences when a font asset is missing and a system
  fallback is used. This is why missing fonts warn and block “pixel-perfect”
  export.
- Codec differences between H.264 and VP9. The frame content is the same; the
  compressed bytes are not.

**Verification**

- Golden-frame tests render a small fixture at fixed times and compare a hash of
  the pixel buffer (or a perceptual diff with a tight threshold) on CI-less
  local runs. Do not compare encoded bytes; encoders are not stable across
  versions.
- A “determinism” test samples the same time twice and asserts deep equality of
  `MotionFrame`.
- An export smoke test renders 12 frames at 320×180 and asserts the output file
  opens and has the expected duration/frame count.

### 7.7 Color, transparency, and codecs

The local Electron 44 / Chromium 152 probe on this machine found:

| Codec | Profile | Supported |
| --- | --- | --- |
| H.264 | High (`avc1.640028`) | Yes |
| H.264 | Baseline (`avc1.42001E`) | No |
| H.264 | Main (`avc1.4D401F`) | No |
| HEVC | Main (`hvc1.1.6.L93.B0`) | No |
| VP9 | Profile 0 (`vp09.00.10.08`) | Yes |
| AV1 | Main (`av01.0.04M.08`) | Yes |

This is a data point, not a guarantee. Codec support varies by OS, GPU, and
Electron build. The exporter must probe at runtime:

```ts
const config = { codec: 'avc1.640028', width, height, bitrate, framerate };
const support = await VideoEncoder.isConfigSupported(config);
```

Mediabunny exposes `canEncodeVideo('avc', ...)` and
`getFirstEncodableVideoCodec([...])`; use those rather than hand-rolling the
probe. Preset order:

1. MP4 / H.264 High, `yuv420p`, AAC audio (if available).
2. MP4 / H.264 High, video-only + warning if audio encoding is unavailable.
3. WebM / VP9, Opus audio.
4. WebM / AV1, Opus audio (slower, smaller; opt-in).
5. Error with an actionable message and a “Try software rendering” action.

Transparent output:

- WebM/VP9 supports alpha in some configurations; MP4/H.264 does not.
- If the scene background is `transparent` and the preset is MP4, composite
  onto the brand background and add a `background-transparent-mp4` warning in
  the export summary. Do not silently produce a black background.

Color:

- Screen textures are sRGB and must not be tone-mapped twice.
- 3D materials are tone-mapped with ACES.
- The canvas is sRGB; the encoder receives sRGB frames. Do not apply a second
  gamma transform in the muxer.
- HDR output is out of scope for Motion 2.0.

### 7.8 Render performance budgets

| Scenario | Target |
| --- | --- |
| 1080p preview, 30fps, 20 nodes, 3 lights | 30fps on integrated graphics |
| 1080p preview, 60fps, 50 nodes, 6 lights | 30fps with shadows off |
| 1080p30 export, 15s, H.264 | ≤ 3× realtime on a 2021 laptop |
| 4K30 export, 15s, H.264 | ≤ 10× realtime; warn above |
| Project open (100 assets, 10 scenes) | < 2s to first paint; assets lazy |
| Timeline scrub | < 16ms per frame for 200 keys |

If a budget is missed, the fix is not “lower the quality silently.” Show a
preview-quality badge and let the user choose.

### 7.9 Resource lifecycle

- Textures, geometries, materials, and decoded models are cached by asset id and
  node type.
- A node renderer owns its GPU resources and disposes them on unmount.
- The project close path disposes the asset cache, the environment map, and the
  renderer.
- The export renderer is destroyed after the job, even on failure.
- A cancelled render deletes its `.part` file and releases the hidden window.

Memory leaks in R3F are easy and expensive. Every `useMemo` that creates a
`Texture`, `Geometry`, or `Material` needs a matching dispose in `useEffect`.
The existing `ScreenRenderer` and `TitleRenderer` already do this; new node
renderers must follow the pattern.

---

## 8. Scene graph and node types

### 8.1 Transform semantics

Every node has a local transform:

- `position`: `[x, y, z]` in scene units.
- `rotation`: Euler angles in radians, applied in XYZ order.
- `scale`: `[x, y, z]`, default `[1, 1, 1]`.

World transform is composed parent-to-child. A node’s `visible` flag hides it
and its descendants. A node’s `locked` flag blocks selection/manipulation in the
viewport but does not affect rendering or evaluation.

**Opacity is inherited multiplicatively.** A group with `opacity: 0.5` and a
child screen with `opacity: 0.8` renders at `0.4`. The current renderer
implements this by walking the Three.js object tree; keep that behavior and
test it. Do not put opacity in the transform; it is a prop because not every
node type supports it.

**Parenting rules.** The node registry declares `allowedParents`. Examples:

- `screen.image` may parent to `device.tablet`, `device.phone`, `device.laptop`,
  `device.monitor`, or `scene.group`.
- `model.gltf` may parent to `scene.group` or another `model.gltf` (for rigs).
- `light.*` may parent to `scene.group` but not to a device.
- `camera.*` may parent to `scene.group`; a camera parented to a moving object
  is allowed and useful for “camera inside the product” shots.

Reparenting preserves world transform by default (compensate local transform),
with a modifier to preserve local transform. The op records the resulting local
transform, so replay is deterministic.

### 8.2 Node registry v2

The registry is the single source of truth for:

- what can be added to a scene;
- what props it has;
- which props are animatable;
- how the inspector renders those props;
- which icon and category the add menu uses;
- which parents are legal.

```ts
export type MotionNodeCategory =
  | 'scene'
  | 'camera'
  | 'geometry'
  | 'surface'
  | 'lighting'
  | 'model'
  | 'stage';

export type MotionPropertyHint = {
  label?: string;
  control?: 'text' | 'number' | 'slider' | 'color' | 'vector3' | 'asset' | 'select' | 'toggle';
  min?: number;
  max?: number;
  step?: number;
  /** Inspector group, e.g. "Transform", "Material", "Layout". */
  group?: string;
  /** Asset kind accepted by an `asset` control. */
  assetKind?: MotionAssetKind;
  /** Options for a `select` control. */
  options?: Array<{ value: string; label: string }>;
};

export type MotionNodeTypeDefinition = {
  id: string;
  label: string;
  category: MotionNodeCategory;
  description: string;
  icon: string; // lucide icon name, resolved by the UI
  propsSchema: z.ZodType<Record<string, unknown>>;
  defaultProps: Record<string, unknown>;
  animatableProperties: Readonly<Record<string, { description: string }>>;
  defaultTransform?: Partial<MotionNodeTransform>;
  defaultName: string;
  allowedParents?: readonly string[];
  propertyHints?: Readonly<Record<string, MotionPropertyHint>>;
};
```

The inspector is generated from `propsSchema` + `propertyHints`. There is no
hand-written form per node type. A new node type ships with its inspector for
free, which is the only way the no-code surface stays complete as the node
library grows.

**Why not AutoForm.** `@autoform/react@5.0.0` supports React 19, but a generic
form generator cannot express Motion’s needs: asset pickers with relink, color
tokens from the brand kit, vector3 controls with drag-scrubbing, “animate this
property” affordances, and conditional fields. A registry with explicit hints is
less magic and more controllable.

### 8.3 Built-in node types

**Existing (keep, extend)**

| Type | Category | Purpose | Key props |
| --- | --- | --- | --- |
| `scene.group` | scene | Transform parent | `opacity` |
| `camera.perspective` | camera | Perspective camera | `fov`, `near`, `far`, `lookAt` |
| `device.tablet` | geometry | Tablet frame | `width`, `height`, `depth`, `bezel`, `opacity`, `color` |
| `screen.image` | surface | Image surface | `assetId`, `width`, `height`, `fit`, `opacity`, `cornerRadius`, `tint` |
| `text.title` | surface | Brand title | `text`, `fontAssetId`, `fontFamily`, `fontSize`, `color`, `align`, `letterSpacing`, `lineHeight`, `maxWidth`, `opacity` |
| `light.ambient` | lighting | Ambient fill | `intensity`, `color` |
| `light.directional` | lighting | Key light | `intensity`, `color`, `castShadow` |
| `light.point` | lighting | Accent light | `intensity`, `color`, `distance`, `decay` |

**New in Phase 1**

| Type | Category | Purpose | Key props |
| --- | --- | --- | --- |
| `device.phone` | geometry | Phone frame | `width`, `height`, `depth`, `bezel`, `cornerRadius`, `opacity`, `color` |
| `device.laptop` | geometry | Laptop frame | `width`, `height`, `depth`, `bezel`, `opacity`, `color` |
| `device.monitor` | geometry | Monitor frame | `width`, `height`, `depth`, `bezel`, `opacity`, `color` |
| `text.body` | surface | Supporting copy | same as title, plus `maxLines` |
| `shape.rect` | surface | Solid/rounded rectangle | `width`, `height`, `color`, `cornerRadius`, `opacity` |
| `shape.ellipse` | surface | Ellipse | `width`, `height`, `color`, `opacity` |
| `stage.ground` | stage | Ground plane | `size`, `color`, `roughness`, `metalness`, `opacity`, `shadow` |
| `model.gltf` | model | Imported glTF/GLB | `assetId`, `animationName`, `animationMode`, `animationSpeed`, `castShadow`, `receiveShadow`, `opacity` |
| `screen.video` | surface | Video surface | `assetId`, `width`, `height`, `fit`, `opacity`, `muted`, `loop`, `playbackRate` |

**New in Phase 2**

| Type | Category | Purpose | Key props |
| --- | --- | --- | --- |
| `camera.orthographic` | camera | Orthographic camera | `zoom`, `near`, `far`, `lookAt` |
| `light.spot` | lighting | Spot light | `intensity`, `color`, `angle`, `penumbra`, `distance`, `castShadow` |
| `text.badge` | surface | Small label/pill | text props + `backgroundColor`, `paddingX`, `paddingY` |
| `model.gltf` animation clips | model | glTF animation playback | `animationName`, `animationMode`, `animationSpeed` |

**Deprecated aliases**

- `device.tablet` stays. It is the starter scene’s device and is used in v3
  documents. Do not rename it to `device.frame` without a data migration; the
  cost is not worth the symmetry.
- `screen.image.props.source` is replaced by `assetId` in v4. The migration
  rewrites it. The op rejects `source` in v4.

### 8.4 Node props that matter

**`screen.image`**

```ts
{
  assetId: string;          // required; must reference an image asset
  width: number;            // scene units
  height: number;
  fit: 'contain' | 'cover' | 'stretch';
  opacity: number;          // 0..1
  cornerRadius: number;     // scene units
  tint: string;             // hex; multiplies the texture
}
```

Rendering: a plane with a `MeshBasicMaterial` (screens are UI, not lit
surfaces) or `MeshStandardMaterial` if `tint`/lighting is enabled. Default is
basic, `toneMapped: false`, sRGB texture. `fit` maps to UV cropping:
`contain` letterboxes, `cover` crops, `stretch` distorts. The UI should default
to `contain` and show an aspect-ratio warning when the asset and plane differ.

**`model.gltf`**

```ts
{
  assetId: string;          // required; must reference a model asset
  animationName: string | null;
  animationMode: 'none' | 'clip' | 'loop';
  animationSpeed: number;   // 1 = authored speed
  castShadow: boolean;
  receiveShadow: boolean;
  opacity: number;
}
```

Rendering: load once per asset id, clone the scene per node, and drive
`AnimationMixer` from scene time. `animationMode: 'clip'` plays the named clip
once; `loop` repeats. `none` holds the bind pose. Do not use `useFrame` to
advance the mixer with delta time; set `mixer.setTime(sceneTime)` so scrubbing
and export are deterministic.

**`text.title` / `text.body`**

Use `troika-three-text` for SDF text. It gives crisp text, font asset support,
and layout without rasterizing to a canvas. The existing canvas-texture title is
a placeholder; replace it in Phase 1. Props map to troika:
`font` (asset URL), `fontSize`, `color`, `anchorX`, `anchorY`, `maxWidth`,
`lineHeight`, `letterSpacing`, `textAlign`. `maxLines` is implemented by
truncating with an ellipsis in the layout pass, not by shader tricks.

**`stage.ground`**

The current canvas hardcodes a ground plane. In v4 it is a node, so the user can
turn it off, change its color, or remove it for a floating product shot. The
starter/blank scenes include one. The editor grid is separate chrome and never
exports.

**`screen.video`**

Preview: `VideoTexture` with a muted `HTMLVideoElement`, play/pause slaved to the
clock. Export: decode exact frames (Phase 2). Until exact decode exists, export
uses the nearest decoded frame and adds `frame-approximated`; do not ship a
video-first product that silently desyncs video surfaces.

### 8.5 Add menu and hierarchy

**Add menu** groups by category, with search:

- Scene: Group, Ground.
- Camera: Perspective, Orthographic (Phase 2).
- Devices: Tablet, Phone, Laptop, Monitor.
- Surfaces: Image, Video, Title, Body, Rectangle, Ellipse.
- Models: Import model… (opens file dialog).
- Lights: Ambient, Key, Point, Spot (Phase 2).

Each item shows a one-line description and a default size. Adding a node:
1. Creates it at the scene root (or as a child of the selected group).
2. Selects it.
3. Frames it in the viewport if it is off-screen.
4. Pushes one undo entry.

**Hierarchy rows** show:

- Disclosure triangle for children.
- Type icon.
- Name (inline rename on double-click).
- Visibility eye, lock.
- A warning badge for missing assets.
- A colored dot for nodes with animation channels.

Drag-to-reparent uses `@dnd-kit/core` + `@dnd-kit/sortable`. Drop targets show a
line between rows; holding `Alt` drops as a child. Invalid parents are disabled
with a tooltip explaining why.

**Multi-select** (Phase 1): `Shift+click` range, `Cmd/Ctrl+click` toggle. The
inspector shows the primary selection; shared properties show mixed values. Ops
are emitted per node in one batch, so undo is one step.

---

## 9. Timeline

The timeline kit in `src/lib/timeline` and `src/components/timeline` is already
a neutral, canvas-rendered editor. Motion owns an adapter
(`lib/motion/timeline-adapter.ts`) that projects a scene into the kit’s model and
translates intents back into ops. Motion 2.0 extends that adapter; it does not
fork the kit.

### 9.1 What the user sees

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ⏮  ▶  ⏭   00:02:14 / 00:15:00   30fps   Loop ▾   Snap   −   Fit   +        │
├──────────────────────────────────────────────────────────────────────────────┤
│ Work area: [==============================]                                  │
│                                                                            │
│ Camera        [ Camera push ..................... ]                         │
│ Product       [ Product spin ............................... ]              │
│ Title         [ Title in ..... ]                                            │
│ Audio         ~~~~~~~~~~~~ waveform ~~~~~~~~~~~~                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Transport:** play/pause, step, go to start/end, timecode, fps, loop/play
  mode, snap, zoom, fit.
- **Ruler:** frame ticks at high zoom, second ticks otherwise; work-area handles;
  playhead.
- **Track headers:** name, target node, mute, lock, color chip. Track color is
  derived from the target node type, not stored.
- **Clip blocks:** clip name, trim handles, keyframe diamonds, overlap badge,
  muted/locked styling.
- **Audio lane:** waveform, gain, fades (Phase 2).
- **Playhead:** one global playhead for the active scene. It snaps to the frame
  grid when snap is on.

### 9.2 Adapter changes for v4

The current adapter assumes one scene, no trim, and `loop`. The v4 adapter takes
a scene and uses placement trim:

```ts
export function toTimelineModel(doc: MotionDocument, sceneId: string): TimelineModel {
  const scene = doc.scenes.find((candidate) => candidate.id === sceneId);
  if (!scene) throw new Error(`Scene "${sceneId}" does not exist.`);
  const clipsById = new Map(scene.timeline.clips.map((clip) => [clip.id, clip]));
  const items: TimelineItem[] = [];

  for (const [rowIndex, track] of scene.timeline.tracks.entries()) {
    for (const placement of track.placements) {
      const clip = clipsById.get(placement.clipId);
      if (!clip) continue;

      const visibleStart = placement.start;
      const visibleEnd = placement.start + placement.duration;

      items.push({
        id: placement.id,
        rowId: track.id,
        label: clip.name,
        start: visibleStart,
        duration: placement.duration,
        tone: TONES[rowIndex % TONES.length],
        locked: track.locked,
        dimmed: track.muted,
        channels: clip.channels.map((channel) => ({
          id: channel.id,
          label: channel.property,
          keys: channel.keyframes
            .filter(
              (key) =>
                key.time >= placement.trimIn &&
                key.time <= placement.trimIn + placement.duration,
            )
            .map((key) => ({
              id: motionKeyId(placement.id, channel.id, key.id),
              channelId: channel.id,
              time: placement.start + (key.time - placement.trimIn),
            })),
          trimmedKeyCount: channel.keyframes.filter(
            (key) =>
              key.time < placement.trimIn ||
              key.time > placement.trimIn + placement.duration,
          ).length,
        })),
      });
    }
  }

  return {
    duration: scene.timeline.duration,
    fps: doc.meta.output.fps,
    workArea: scene.timeline.workArea.enabled
      ? { start: scene.timeline.workArea.start, end: scene.timeline.workArea.end }
      : null,
    playMode: scene.timeline.playMode,
    rows: scene.timeline.tracks.map((track) => ({
      id: track.id,
      name: track.name,
      muted: track.muted,
      locked: track.locked,
    })),
    items,
  };
}
```

The adapter takes the whole document plus a scene id because fps and brand live
at the document root, not on the scene. It resolves the scene internally.

**Key time conversion** is the subtle part:

```
sceneTime = placement.start + (key.time - placement.trimIn)
key.time  = placement.trimIn + (sceneTime - placement.start)
```

Both directions must be implemented once, in the adapter, and tested. A key
outside the visible range is hidden from the main lane and counted in
`trimmedKeyCount`; the clip block shows a small “3 keys trimmed” badge. Do not
silently move keys when trimming. The user can expand the trim to reveal them.

### 9.3 Trim, split, and move

**Trim** changes `trimIn` and/or `duration` without touching keyframes.

- Left handle: drag right increases `trimIn` and `start` by the same delta,
  keeping the visible content anchored. Drag left decreases both, bounded by
  `trimIn >= 0`.
- Right handle: drag changes `duration`, bounded by
  `trimIn + duration <= clip.duration`.
- Holding `Alt` while dragging the left handle changes `start` only (slip the
  placement without trimming).
- Trimming never deletes keys. The badge tells the user how many are hidden.

Op:

```ts
'placement.trim': {
  trackId: string;
  placementId: string;
  start?: number;
  trimIn?: number;
  duration?: number;
};
```

The op validates the final values, not a delta. The UI computes the final values
from the drag, so a dropped event cannot leave a half-applied trim.

**Split** at the playhead:

```ts
'placement.split': {
  trackId: string;
  placementId: string;
  atTime: number;
  newPlacementId: string;
};
```

`atTime` is scene time, strictly inside the placement. The first placement keeps
the id and gets `duration = atTime - start`. The second gets
`start = atTime`, `trimIn = old.trimIn + firstDuration`,
`duration = old.duration - firstDuration`. Keyframes are shared through the
clip, so the split is non-destructive: both halves reference the same clip.

**Move** keeps the current `placement.move` semantics: horizontal changes
`start`, vertical changes the track. Moving to a locked track is rejected. A
move that would create an overlap is allowed; the overlap badge appears.

**Ripple delete** is Phase 2. Phase 1 delete leaves a gap. Ripple is a
surprising default for users who do not know the term.

### 9.4 Snapping

Snap is a user preference, not a document property. It defaults on.

Targets, in priority order:

1. The playhead.
2. The work-area start/end.
3. Scene start/end.
4. Other placement edges on any track.
5. The current placement’s own opposite edge.
6. The frame grid (only if “snap to frames” is on; default on at ≤ 60s).

Threshold: 8 screen pixels, converted to seconds using `pxPerSecond`. Hold `Alt`
to temporarily disable. The snap indicator is a thin vertical line with a label
(“Clip edge,” “Playhead,” “Frame 42”).

Do not implement a magnetic timeline. Clips should stay where the user puts
them; snapping is assistance, not a constraint.

### 9.5 Keyframes

**Adding**

- Every animatable property row in the inspector has a diamond button.
- Clicking the diamond adds a key at the playhead with the current value.
- If a key already exists at that time, the button is filled and clicking it
  removes the key (toggle).
- `keyframe.add` at an existing time replaces the existing keyframe’s value and
  easing, keeping the existing key id. This is one undo entry.
- Auto-key is **off by default**. When on, changing an animatable value at a
  time with no key creates one. The toggle lives in the timeline toolbar and is
  persisted per user, not per project.

**Selecting and editing**

- Click a diamond to select. `Shift+click` selects a range; `Cmd/Ctrl+click`
  toggles.
- Drag horizontally to change time. The op clamps to `[0, clip.duration]`.
- Values are edited in the inspector, not by vertical dragging on the diamond.
  Vertical dragging is a common source of accidental value changes.
- Easing is edited per keyframe (outgoing segment) with presets: Linear, Ease
  In, Ease Out, Ease In Out, Smooth, Step, Custom. The custom editor is a cubic
  bezier with two handles.
- `Delete` removes selected keys (destructive, one confirm if more than one).
- Copy/paste preserves relative times and values; pasting at the playhead offsets
  the group.

**Visual language**

- Keyframe diamond: filled when selected, hollow when not.
- A key on the playhead is outlined.
- A channel with no keys shows a flat line and a “+ key” affordance.
- A property animated on another clip is not shown on this clip; the inspector
  shows “animated in 2 clips” with a jump list.

### 9.6 Work area and play modes

- The work area is the shaded region on the ruler. Drag its handles to set it.
- “Set work area to selection” uses the selected clip or key range.
- “Clear work area” disables it and restores the full scene.
- The loop button toggles `workArea.enabled`; the play-mode dropdown chooses
  `once`, `loop`, or `ping-pong`.
- `loop` without an enabled work area loops the full scene. This is a valid
  state; the UI shows “Looping full scene.”
- Export has a “Range” choice: Full scene, Work area, or Sequence (Phase 2).
  The default is Full scene, even if a work area is enabled. A work area is an
  authoring aid; it should not silently change the export.

### 9.7 Audio (Phase 2)

Audio is a timeline lane, not a scene node.

- Import audio through the asset library. The waveform is generated once and
  cached next to the asset (`assets/<id>/waveform.json`), not stored in the
  document.
- Drag the asset onto the audio lane to create a placement.
- Trim with the same left/right handle semantics as clips.
- Gain is a linear multiplier `[0, 2]`, default `1`.
- Fade in/out are seconds, drawn as ramps on the waveform.
- Mute is per placement; track-level mute is a future addition.
- Preview plays through an `AudioContext`; the visual clock is authoritative.
  If the audio context is suspended (autoplay policy), show a “Click to enable
  audio” badge rather than silently muting.
- Export mixes all unmuted placements, applies gain/fades, and encodes AAC
  (MP4) or Opus (WebM). If audio encoding is unavailable, export video-only and
  warn; do not fail the whole render.

### 9.8 Timeline performance

- The canvas timeline already draws only visible rows/keys. Keep that.
- Track headers are DOM; virtualize above 100 tracks with
  `@tanstack/react-virtual` if profiling shows a problem. Do not add
  virtualization preemptively; it complicates drag-and-drop.
- Keyframe hit-testing uses the canvas’s spatial index, not a DOM node per key.
- Dragging emits preview state at 60fps and commits one op on pointer-up. Do not
  push a history entry per pointermove.
- Scrubbing evaluates at most once per animation frame. The clock already
  coalesces; keep it.
- A 200-key, 20-track scene should scrub under 16ms on the target hardware.

### 9.9 Timeline acceptance criteria

- A clip can be trimmed on both edges without moving or deleting keyframes.
- A split produces two placements that reference the same clip and play the same
  content across the cut.
- A key outside the trim range is hidden, counted, and restored when the trim is
  expanded.
- Moving a key updates the underlying clip-local time correctly after trimming.
- Work area and play mode survive save/reload.
- Undo after a trim restores the previous trim and the key visibility.
- Snapping can be disabled, and `Alt` temporarily disables it.
- The timeline never mutates the document directly; every edit is an op.

---

## 10. No-code authoring UX

### 10.1 Principles

1. **The first five minutes decide everything.** A new user must see a finished
   composition, change one thing, and export it before they learn the interface.
2. **Plain language.** “Fade in,” not “opacity channel with cubic-bezier
   interpolation.” “Turn,” not “rotate around the Y axis.” The inspector can
   show the technical name in a tooltip.
3. **Direct manipulation first, numbers second.** Drag the object; type a value
   when precision matters. Both paths produce the same op.
4. **Never punish exploration.** Undo is reliable, autosave is invisible, and
   destructive actions are recoverable or confirmed with consequences.
5. **Show, don’t explain.** Templates, presets, and inline previews beat a
   documentation link.
6. **The copilot is optional.** Every task must be completable by hand. A user
   who never opens the copilot should not feel like a second-class citizen.

### 10.2 First run and templates

The first visit to `/motion` shows the project browser with a template hero and
an empty-state card. It does not auto-create a project; creating a project is a
deliberate action with a name and an aspect ratio.

**Template gallery** (Phase 1):

| Template | Aspect | Duration | Scenes | What it teaches |
| --- | --- | --- | --- | --- |
| **Product launch hero** | 16:9 | 15s | 2 | Device + screen, camera push, title, end card |
| **Feature spotlight** | 16:9 | 10s | 1 | Screen close-up, callout text, accent light |
| **App Store preview** | 9:16 | 30s | 3 | Vertical framing, rapid cuts, captions |
| **Social loop** | 1:1 | 6s | 1 | Seamless loop, bold type, product spin |
| **Model reveal** | 16:9 | 12s | 1 | GLB import, turntable, rim light |
| **Logo sting** | 16:9 | 4s | 1 | Shape animation, brand colors, audio hit (Phase 2) |

Each template is a project bundle with:

- a `template.json` manifest (name, description, category, aspect, duration,
  scene count, thumbnail, required asset slots);
- a v4 `project.json`;
- placeholder assets (generated or licensed), clearly marked “Replace me”;
- a `README.md` for maintainers, not users.

Applying a template:

1. Copies the bundle into a new project folder.
2. Replaces the project id and timestamps.
3. Opens a “Make it yours” panel with brand colors, logo, headline, and product
   screen slots.
4. Does not modify the template on disk.

Templates are data, not code. A template cannot execute scripts. This keeps the
gallery safe and makes community templates possible later without a plugin
sandbox.

**Blank project** still includes a camera, key/fill lights, ground, and a title.
The title says “Your headline here” and is selected on open, so the first action
is obvious: type.

### 10.3 New project flow

```
New project
┌─────────────────────────────────────────────────────────────┐
│  Template    Blank                                           │
│                                                             │
│  [ Product launch ]  [ Feature spotlight ]  [ Social loop ] │
│                                                             │
│  Name: [ Untitled motion                    ]               │
│  Size: [ 16:9 ▾ ]   Duration: [ 15s ▾ ]   FPS: [ 30 ▾ ]    │
│                                                             │
│                              [ Cancel ]  [ Create project ] │
└─────────────────────────────────────────────────────────────┘
```

- Aspect presets: 16:9 (1920×1080), 9:16 (1080×1920), 1:1 (1080×1080), 4:5
  (1080×1350), 4:3 (1440×1080), custom.
- Duration presets: 4s, 6s, 10s, 15s, 30s, custom.
- FPS: 24, 30, 60. Default 30.
- “Create” is disabled until the name is non-empty. The name is trimmed.
- The new project is written to disk before navigation. If the write fails, the
  dialog stays open with the error; do not navigate to an unsaved editor.

### 10.4 Staging: direct manipulation

**Adding objects**

- Drag an asset from the library into the viewport. The drop target decides the
  parent:
  - over a device screen → `screen.image` child of that device;
  - over the ground → root-level `screen.image` standing upright;
  - over empty space → root-level object at the cursor’s ground-plane
    intersection.
- Drop a GLB → `model.gltf` at the cursor, auto-scaled to a sensible size based
  on its bounding box.
- “Add” menu → choose a node type; it appears at the scene origin and is
  selected.
- Double-click an asset → add at origin.

**Selection**

- Click selects. `Shift+click` adds. `Cmd/Ctrl+click` toggles.
- Clicking empty space clears selection.
- Double-click a node in the viewport focuses it (camera frames it) but does not
  enter an edit mode.
- Hover shows a subtle outline; selection shows a brighter outline and a label
  with the node name.
- Locked nodes are not selectable in the viewport; select them in the hierarchy.

**Gizmos**

- Translate (`G`), rotate (`R`), scale (`S`). Click a gizmo axis to constrain.
- World/local space toggle in the viewport toolbar. Default: local for objects,
  world for groups.
- Snapping: grid (0.1 units), 15° rotation, 0.1 scale. Hold `Alt` to disable.
- Numeric fields in the inspector stay in sync during the drag.
- A drag commits one op on pointer-up. Escape cancels and restores the original
  transform.

**Camera**

- “Look through camera” toggles between the scene camera and an orbit view.
- Orbit view is editor-only and never exports.
- “Frame selection” (`F`) moves the orbit camera to fit the selection; it does
  not move the scene camera. A separate “Align camera to view” action moves the
  scene camera, with a confirmation because it changes the document.
- Safe-area overlay shows the brand safe area and title-safe guides.
- Camera presets: Wide, Medium, Close, Top, Low Angle. Applying one writes a
  transform op.

**Viewport chrome**

- Grid toggle, background tone, zoom, camera view, quality badge.
- “Focus mode” dims everything except the selection and its children.
- “Isolate” hides everything else; it is editor-only and does not change
  visibility flags.
- A bottom-left badge shows the active scene, fps, and duration.
- A bottom-right badge shows the current selection and a warning count.

### 10.5 Inspector

The inspector is generated from the node registry. It has a stable order:

1. **Header** — node name, type label, visibility/lock, “Go to timeline.”
2. **Transform** — position, rotation (degrees in UI, radians in document),
   scale, reset.
3. **Content** — type-specific props (asset, text, dimensions, fit, color).
4. **Layout** — alignment, spacing, max width, safe-area snap.
5. **Material** — opacity, roughness, metalness, tint, shadows.
6. **Animation** — animated properties, keyframe count, “Animate” buttons.
7. **Advanced** — node id (copyable), parent, render order, warnings.

**Controls**

- **Number field:** drag the label to scrub; `Shift` = ×10, `Alt` = ×0.1; type
  to enter; `Enter` commits; `Escape` reverts.
- **Vector3:** three number fields with a link toggle for uniform scale.
- **Color:** swatch + hex input + brand swatches. Alpha is separate.
- **Asset:** thumbnail, name, “Replace,” “Relink,” “Reveal.” Drag an asset onto
  the field to replace.
- **Select:** plain-language options with a short description.
- **Toggle:** switch, not a checkbox, for binary states.
- **Slider:** only where a range is meaningful (opacity, intensity). Always
  paired with a number field.
- **Mixed values:** multi-select shows “Mixed” and editing applies to all.
- **Reset:** per-field reset to the type default; per-section reset with
  confirmation if it would remove animation.

**Animation affordance**

Every animatable property row has a diamond:

- Hollow: not animated.
- Filled: animated and a key exists at the playhead.
- Half: animated but no key at the playhead.
- Clicking adds/removes a key at the playhead.
- Right-click opens “Add key,” “Remove all keys,” “Show in timeline.”

The inspector never shows raw JSON. A read-only “Copy node JSON” action exists
for debugging and agent handoff.

### 10.6 Animation workflow

**The three ways to animate**

1. **Diamond button** — explicit, precise, recommended.
2. **Auto-key** — off by default; when on, changing a value creates a key at the
   playhead.
3. **Recipe** — a one-click common animation (“Fade in,” “Slide up,” “Scale
   pop,” “Turntable,” “Camera push,” “Type on”). A recipe is a batch of normal
   ops, previewed before apply. It is not a special document feature.

**The loop**

1. Select a node.
2. Move the playhead to the start time.
3. Click the property diamond (or turn on auto-key).
4. Move the playhead.
5. Change the value.
6. Press Space to preview.

The timeline shows the new key immediately. The viewport updates while
scrubbing. There is no “apply animation” step.

**Common recipes**

| Recipe | What it inserts |
| --- | --- |
| Fade in | `opacity` 0→1 over 0.6s with ease-out |
| Slide up | `position.y` −0.4→0 over 0.6s with ease-out |
| Scale pop | `scale` 0.8→1.05→1 over 0.5s |
| Turntable | `rotation.y` 0→2π over the clip duration, linear |
| Camera push | camera `position.z` −15% over the scene duration, ease-in-out |
| Type on | text `maxWidth` or a reveal mask; Phase 2 for true per-character reveal |

Recipes operate on the selected node/clip and are previewed in a small dialog
with a duration field. They are implemented as op batches, so they are undoable
and agent-callable.

**Do not**

- Do not auto-key by default.
- Do not create a key on every property when a node is added.
- Do not silently retime keys when the scene duration changes.
- Do not hide the fact that a property is animated on multiple clips.

### 10.7 Multi-scene workflow

- The scene switcher is always visible in the top bar.
- “New scene” creates a blank scene with the same camera/light rig as the
  current scene, but no content. “Duplicate scene” copies content and timeline.
- Scene thumbnails are rendered on demand (first frame or poster frame) and
  cached; they are not stored in the document.
- Reordering scenes changes the master sequence order in Phase 2; in Phase 1 it
  only changes the switcher order.
- Deleting a scene is destructive and confirmed with its name and duration. The
  last scene cannot be deleted.
- Switching scenes preserves the playhead time, clamped to the new scene’s
  duration.
- The timeline always edits the active scene. There is no “all scenes” timeline
  in Phase 1; that is the master sequence in Phase 2.

### 10.8 Asset library UX

- Grid default, list toggle. Thumbnails for images/video/models; icons for
  audio/fonts.
- Search by name, filter by kind, sort by name/recent/size.
- Usage count badge; hover shows which scenes/nodes use it.
- Missing badge with “Relink.”
- Drag to viewport or timeline (audio).
- Multi-select for delete/cleanup; delete is refused while referenced.
- Import button and drag-and-drop from the OS. Show per-file progress and a
  summary (“3 imported, 1 skipped: unsupported format”).
- Duplicate detection by hash: “This file is already in the project as
  ‘hero.png.’ Use existing / Import anyway.”
- “Replace everywhere” opens a picker, updates all references in one op batch,
  and keeps the old asset until the batch succeeds.

**Supported formats (Phase 1)**

| Kind | Formats |
| --- | --- |
| Image | PNG, JPEG, WebP, AVIF, SVG (rasterized at import), GIF (first frame only; use sequence for animation) |
| Image sequence | PNG/JPEG/WebP folder, numbered frames |
| Video | MP4 (H.264/HEVC), WebM (VP8/VP9/AV1), MOV (H.264) |
| Audio | WAV, MP3, M4A/AAC, OGG/Opus |
| Font | WOFF2, WOFF, TTF, OTF |
| Model | GLB, GLTF (with sidecar files) |
| Environment | HDR, EXR |

Unsupported formats are rejected at import with a plain-language reason and a
suggestion (“Convert to GLB and try again”).

### 10.9 Autosave, recovery, and save status

- Autosave debounces 500ms after the last change and writes at most every 2s.
- The status chip in the top bar shows: Saved, Saving…, Unsaved changes, Save
  failed.
- Writes are atomic (`write-file-atomic`) to `project.json`, with the previous
  version kept as `backups/project-<revision>.json` (last 10).
- A sidecar `project.autosave.json` is written first, then the canonical file.
  On startup, if the sidecar is newer than the canonical file, offer recovery.
- Recovery dialog: “Motion closed unexpectedly. Recover 3 unsaved changes from
  14:32?” with “Recover” and “Discard.”
- If the project file is corrupt, never overwrite it. Show the error, the
  backup list, and “Open folder.”
- Autosave pauses during export? No. Export reads a snapshot at start; edits
  during export do not affect the running render. The export summary says which
  revision was rendered.
- “Save a copy” writes a new project bundle with a new id and leaves the current
  project untouched.

### 10.10 Undo, redo, copy, paste

- Undo is whole-document snapshots, 200 entries. Documents are small and
  structurally shared; this is simpler and more reliable than inverse ops.
- One user gesture = one history entry. Drags coalesce until pointer-up.
- Selection, playhead, camera orbit, panel sizes, and scene switches are not
  undoable. They are view state, not document state.
- Undo after a destructive confirmed action restores the document; the
  confirmation is not repeated.
- History is session-only. Reopening a project starts a fresh history; the
  document is already saved.
- Copy/paste nodes: copy the node, its descendants, and their channels. Paste
  creates new ids and offsets the position by a small amount. “Paste in place”
  keeps the transform.
- Copy/paste keys: relative times and values preserved; paste at the playhead.
- Duplicate (`Cmd/Ctrl+D`) is copy+paste in one op batch.
- Deleting a node with children and animation shows the count in the
  confirmation: “Delete ‘Product’ and 2 children? This also removes 12
  keyframes.”

### 10.11 Error prevention and inline validation

- Disable invalid actions instead of showing an error after the click. The
  tooltip explains why (“This node can only be parented to a device or group”).
- Validate on blur, not on every keystroke, for text/number fields. Show the
  error inline; keep the last valid value.
- Never silently clamp. If a value is clamped, show a toast: “Trimmed to the
  clip length (5.0s).”
- Missing assets show a persistent banner in the editor and a per-node badge.
  Export is blocked with a list, not a generic “export failed.”
- Unsupported node types are read-only placeholders, not deleted. The project
  opens; the user can still export if the node is hidden.
- A failed op leaves the document unchanged. The store surfaces the error and
  keeps the previous snapshot.
- Destructive confirmations name the object and the consequence. “Are you
  sure?” is not a confirmation.

### 10.12 Accessibility

- All panels are keyboard reachable. The hierarchy supports arrow keys
  (up/down to move, left/right to collapse/expand).
- The timeline canvas has a keyboard mode: `Tab` focuses it, arrow keys move the
  playhead, `[`/`]` set work area, `K` adds a key.
- Focus rings use the app’s ring token; do not remove them.
- Color is never the only indicator: keys have shapes, warnings have icons,
  muted tracks have a label.
- `prefers-reduced-motion` pauses decorative UI animation and template
  autoplay. It does not change the user’s project playback unless they press
  play.
- Screen-reader announcements for op results: “Added keyframe at 2.4 seconds,”
  “Export complete: launch-hero.mp4.”
- Contrast: use semantic tokens; the canvas timeline must meet 3:1 for essential
  lines and 4.5:1 for text.
- The viewport is inherently visual. Provide a “Scene summary” panel (node list,
  animation summary, warnings) as a non-visual fallback.

### 10.13 Command palette

`Cmd/Ctrl+K` opens a command palette with:

- Add node types.
- Switch scene.
- Import asset.
- Apply template/recipe.
- Toggle panels, grid, safe area, quality.
- Export.
- Search assets and nodes.
- “Explain this selection” (copilot context, no mutation).

The palette does not run arbitrary JavaScript, shell commands, or URLs. It is a
typed action list backed by the same ops and UI commands as the menus.

### 10.14 Acceptance criteria

- A new user can apply a template, change the headline and brand color, and
  export without opening documentation.
- Every persistent edit made through the UI produces an op and is undoable.
- Auto-key is off by default and its state is visible.
- Trimming a clip never deletes keyframes.
- Multi-select edits apply in one undo step.
- A missing asset blocks export with an actionable list.
- Autosave survives a forced quit; recovery restores the last change.
- The editor is usable at 1100×720 with the inspector collapsed.
- No destructive action is possible without a confirmation that names the
  consequence.

---

## 11. Asset pipeline

### 11.1 Project bundle layout

A Motion project is a folder, not a row in a database. The database indexes
projects for the browser; the folder is the source of truth.

```
<userData>/motion/projects/<projectId>/
  project.json                 # canonical v4 document
  project.autosave.json        # newer than project.json only during recovery
  project.lock                 # advisory lock, removed on clean close
  editor-state.json            # per-user view state; not portable
  backups/
    project-000001.json
    project-000002.json
    ...
  assets/
    <assetId>/
      source.<ext>             # original bytes, normalized name
      thumbnail.webp           # generated preview
      waveform.json            # audio only
      meta.json                # probe output, optional cache
  renders/
    2026-10-30T14-32-00-launch-hero.mp4
  .staging/                    # in-flight imports; 24h retention
  .trash/                      # deleted assets awaiting GC
```

- `project.json` is the only file the document loader reads. Everything else is
  derived, cache, or recovery.
- `editor-state.json` stores camera orbit, zoom, timeline scroll, panel sizes,
  active panel, and last selection. Losing it is annoying, not destructive.
- `renders/` is user-visible output. Do not delete it during cache cleanup.
- The folder name is the project id. Renaming a project changes `meta.name`, not
  the folder. Moving the folder is supported via “Locate project folder.”

### 11.2 Import flow

**Entry points**

- Asset library “Import” button.
- Drag-and-drop from the OS onto the library or viewport.
- “Import model…” in the Add menu.
- Copilot `motion.importAsset` tool (Phase 1.5), which calls the same service.

**Steps**

1. Renderer sends absolute paths (from the native dialog or
   `webUtils.getPathForFile`) to main via `motion:import-assets`.
2. Main validates each path: exists, is a file, size within limit (2 GB),
   extension/MIME allowed. It never trusts a renderer-supplied path without
   `fs.stat`.
3. Main creates a staging folder under the project’s `.staging/<importId>/` and
   copies the file with a streaming hash. It does not move the original.
4. Main probes metadata:
   - images: `image-size` for dimensions; decode check with `sharp`? No —
     `sharp` is deliberately avoided. Use `image-size` for header dimensions and
     a renderer `createImageBitmap` decode check for validity.
   - image sequences: count matching files, probe the first frame, require a
     frame rate (default 30, user-editable).
   - models: `@gltf-transform/core` `NodeIO` for scene/animation/bounding-box
     metadata; `gltf-validator` for validation. If the model is `.gltf` with
     external resources, copy the whole folder and rewrite relative URIs.
   - video/audio: probe duration, dimensions, codec, and audio channels in the
     renderer with `HTMLVideoElement`/`AudioContext` (or Mediabunny container
     parsing where available). The editor is open during import, so a renderer
     probe is acceptable. A future headless import uses the same probe module in
     a utility window.
   - fonts: read the sfnt header for format; family/weight extraction is
     best-effort via `fontkit` (optional dependency). If it fails, the user can
     name the font.
   - environments: read the header and dimensions if available; HDR/EXR decode
     is validated on first use.
5. Main computes the final bundle path `assets/<assetId>/source.<ext>`, moves
   the staged file into place atomically, and generates a thumbnail (images:
   downscale; models: first-frame render is Phase 2, use an icon for now).
6. Main returns `MotionAsset` descriptors (without adding them to the document).
7. Renderer confirms metadata (sequence fps, model scale) and commits one
   `asset.add` batch. If the user cancels, main moves the staged folder to
   `.trash/` for GC.
8. The asset appears in the library, selected, with a “Drag to scene” hint.

**Why the document is updated in the renderer:** the document is editor-owned
and autosaved by the renderer. Main owns bytes and metadata; the renderer owns
document mutations. This keeps one writer for `project.json`.

### 11.3 Metadata and probing

```ts
export type MotionAssetProbe = {
  kind: MotionAssetKind;
  mimeType: string;
  width?: number;
  height?: number;
  duration?: number;
  frameCount?: number;
  fps?: number;
  hasAudio?: boolean;
  animations?: string[];
  boundingBox?: { min: MotionVector3; max: MotionVector3 };
  warnings: string[];
};
```

- Probe failures do not silently import a broken asset. The import summary says
  which file failed and why.
- A model with no animations is valid; the animation dropdown shows “None.”
- A model with animations stores their names in `metadata.animations`. The
  `model.gltf` node defaults to the first animation only if the user chooses
  “Play on import”; otherwise `animationMode: 'none'`.
- Video with no audio is valid. Audio-only files are valid.
- An image sequence with a missing frame is rejected; do not import a sequence
  with gaps, because frame-exact playback would drift.

### 11.4 Thumbnails and previews

- Images: generate a 320px WebP thumbnail at import.
- Video: extract a poster frame at 0.1s (renderer) and store it.
- Models: Phase 1 uses a type icon; Phase 2 renders a turntable thumbnail in the
  hidden render window.
- Fonts: render a specimen (“Aa Bb 123”) in the library.
- Audio: waveform peaks (min/max per bucket) stored in `waveform.json`, not in
  the document.
- Thumbnails are cache. If missing, regenerate; never block project open.

### 11.5 Asset resolution in the renderer

The renderer never sees a filesystem path. It builds:

```
qeda-media://motion/<projectId>/<assetId>
qeda-media://motion/<projectId>/<assetId>/<frameIndex>
```

The main protocol handler:

1. Parses the URL.
2. Resolves `projectId` through the Motion project index.
3. Resolves `assetId` through the project’s `assets[]` (not an arbitrary path).
4. Joins the bundle root with `asset.path`, normalizes, and asserts the result is
   inside the bundle.
5. Serves the file with Range support and the correct MIME type.

This is the same trust model as `studio-media.ts`. Do not add a `?path=` query
parameter. Do not serve arbitrary `file://` URLs. A malicious project file must
not be able to read `~/.ssh`.

**Caching.** Add `Cache-Control: no-cache` for project assets during editing so a
relink is visible immediately. Add an ETag based on the asset hash. For renders,
use a long cache.

### 11.6 Relink and missing assets

An asset is missing when `project.json` references it but the file at `path` is
absent or its hash does not match.

- Missing assets do not prevent the project from opening.
- The node renders a magenta placeholder with the asset name and a “Relink”
  button.
- The asset library shows a “Missing” filter and a banner with “3 assets need
  attention.”
- Relink flow: choose a file, main hashes it, compares with the stored hash. If
  it matches, update the path. If it differs, ask: “This file is different from
  the original. Relink anyway?” Relinking keeps the asset id and all references.
- Relink is an `asset.relink` op, so it is undoable and agent-callable.
- Export preflight blocks on missing assets, with a list and a “Relink all”
  action.

### 11.7 Asset removal and garbage collection

- `asset.remove` is destructive and refuses while referenced. The error lists
  the referencing nodes/scenes.
- “Replace references…” runs `asset.replace` for each reference, then removes
  the old asset in the same batch.
- Unused assets are not deleted automatically. Undo may still need them, and a
  user may be experimenting.
- “Clean unused assets” is an explicit maintenance action:
  1. Compute reachable assets from the document.
  2. Show the count and total size.
  3. Move unreachable files to `.trash/`.
  4. Keep `.trash/` for 7 days, then delete on app start.
- Hash deduplication: if two assets share a hash, they may share a file. GC must
  count references by path/hash, not by asset id alone.

### 11.8 Import limits and security

- Max file size: 2 GB per asset; max 500 assets per project (warn at 400).
- Max image dimension: 16384 px; downscale above 8192 px for preview, keep the
  original for export.
- Max model: 200 MB or 2 million triangles; warn above, do not block.
- Reject path traversal, symlinks that escape the bundle, and executable
  extensions.
- Never execute a model, font, or SVG. SVG is rasterized at import; scripts and
  external references are stripped.
- `.gltf` external URIs are rewritten only for files inside the imported folder.
  Remote URLs are rejected.
- Import runs off the UI thread for hashing/copying; the renderer shows progress
  per file.

### 11.9 Asset acceptance criteria

- Importing a PNG creates a bundle file, a thumbnail, and one `asset.add` op.
- No document field contains `blob:`, `data:`, `http:`, `file:`, or an absolute
  path.
- Reloading the project resolves every asset through `qeda-media://`.
- Moving the project folder and using “Locate project folder” restores all
  assets.
- A missing asset opens the project, shows a placeholder, and blocks export with
  an actionable list.
- A GLB with Draco/KTX2/Meshopt loads with the decoders bundled in `three`.
- A `.gltf` with sidecar textures imports as a folder and renders identically.
- Deleting a referenced asset is refused; replacing it updates every reference
  in one undo step.

---

## 12. Export pipeline

### 12.1 Output contract

Motion’s primary output is a video file with:

- a container (MP4 or WebM),
- a video track encoded from the deterministic frame sequence,
- an optional audio track mixed from timeline audio,
- a duration equal to the selected range, within one frame,
- a frame rate equal to the project’s output fps,
- a resolution equal to the export preset,
- no editor chrome, grid, gizmos, or safe-area overlays.

The export reads a **snapshot** of the project at a specific revision. Editing
during a render does not change the running render.

### 12.2 Presets

| Preset | Container | Codec | Size | FPS | Bitrate | Audio |
| --- | --- | --- | --- | --- | --- | --- |
| **Launch 1080p** | MP4 | H.264 High | 1920×1080 | 30 | 12 Mbps | AAC 192k |
| **Launch 4K** | MP4 | H.264 High | 3840×2160 | 30 | 35 Mbps | AAC 192k |
| **Social vertical** | MP4 | H.264 High | 1080×1920 | 30 | 10 Mbps | AAC 192k |
| **Social square** | MP4 | H.264 High | 1080×1080 | 30 | 10 Mbps | AAC 192k |
| **WebM VP9** | WebM | VP9 | source | source | 8 Mbps | Opus 128k |
| **WebM AV1** | WebM | AV1 | source | source | 6 Mbps | Opus 128k |
| **GIF** | GIF | GIF | 800px wide | 15 | — | none |
| **PNG sequence** | folder | PNG | source | source | — | none |

- “Source” means the project output size/fps.
- GIF and PNG sequence are Phase 2. GIF uses the existing ffmpeg path and is
  explicitly optional; it is not the default and does not block the primary
  pipeline.
- AV1 is opt-in because encode time can be much higher than VP9.
- 60fps export is allowed at any preset; it doubles frame count and render time.

**Codec fallback.** If H.264 High is unavailable, offer VP9/WebM. If neither is
available, show a blocking error with the probe results and a “Copy diagnostics”
action. Do not silently produce a file with the wrong extension.

### 12.3 Export dialog

```
Export
┌──────────────────────────────────────────────────────────────┐
│  Format:   (•) MP4   ( ) WebM   ( ) GIF                     │
│  Range:    [ Full scene ▾ ]                                  │
│  Size:     [ 1920 × 1080 ▾ ]   FPS: [ 30 ▾ ]                │
│  Quality:  [ High ▾ ]                                        │
│  Audio:    [x] Include audio                                 │
│                                                              │
│  File:     [ launch-hero.mp4              ]  [ Choose… ]     │
│                                                              │
│  Estimated: 15.0s · 1920×1080 · 30fps · ~24 MB · ~45s       │
│                                                              │
│  ⚠ 2 warnings: missing font "Söhne"; transparent background │
│                                                              │
│                              [ Cancel ]  [ Export ]          │
└──────────────────────────────────────────────────────────────┘
```

- Range options: Full scene, Work area, Sequence (if a sequence exists), Active
  scene (if the active scene is not the sequence).
- Size presets follow the project aspect; custom sizes warn if they change the
  aspect ratio by more than 1%.
- FPS options: 24, 30, 60. Exporting at a higher fps than the project’s output
  duplicates frames; warn.
- Quality: Draft, Standard, High, Master. Draft renders at half resolution and
  lower bitrate for quick review; it is labeled “Draft” in the filename.
- Audio: include/mute. If there is no audio, the toggle is disabled with “No
  audio in this range.”
- File: default `renders/<project-slug>-<preset>-<timestamp>.mp4`. The user can
  choose a different folder.
- Estimated size/time are estimates, not promises. Show a range (“~20–30 MB”)
  when uncertain.
- Warnings are listed before export; blocking issues disable the Export button
  and link to the fix.

### 12.4 Preflight

Run before creating a job.

**Blocking**

- Missing assets or fonts that are used in the selected range.
- Unsupported node types that are visible in the selected range.
- No video codec available.
- Output resolution/fps invalid.
- Disk space < 2× estimated output size.
- Project revision cannot be snapshotted (I/O error).
- Sequence has an unresolved scene reference or invalid overlap.

**Warning**

- Transparent background with MP4 (will composite onto brand background).
- Audio encode unavailable (video-only output).
- Exporting at a higher fps than the project output.
- Exporting a range with no animated content.
- Duration > 5 minutes or resolution > 4K (long render).
- Font substitution (missing font asset, system fallback).
- Frame-approximated video surfaces.

Preflight returns a structured list:

```ts
type MotionPreflightIssue = {
  severity: 'blocking' | 'warning';
  code: string;
  message: string;
  sceneId?: string;
  nodeId?: string;
  assetId?: string;
  action?: { label: string; kind: 'relink' | 'replace' | 'open-scene' | 'settings' };
};
```

### 12.5 Render pipeline

1. **Snapshot.** Main copies `project.json` to
   `render-jobs/<jobId>/project.json` and records `revision`. The render window
   loads the snapshot, not the live project.
2. **Preflight.** Re-run in the render window against the snapshot. If it fails,
   abort before allocating GPU resources.
3. **Prepare.** Load all assets, fonts, models, and environment maps referenced
   by the selected range. Decode audio. Compile shaders by rendering one warm-up
   frame at time 0.
4. **Probe.** Confirm the chosen codec with `VideoEncoder.isConfigSupported` or
   Mediabunny’s `canEncodeVideo`. If unsupported, choose the fallback before the
   first frame.
5. **Open output.** Create a `StreamTarget` that sends chunks to main; main
   appends to `<output>.part`.
6. **Render frames.** For `i` in `0..frameCount-1`:
   - `time = rangeStart + i / fps`
   - `frame = runtime.sample(time)`
   - update the Three.js scene from `frame`
   - render to the offscreen canvas
   - `await source.add(time - rangeStart, frameDuration)`
   - report progress every 10 frames or 250ms
   - check cancel flag
   - yield to the event loop every frame (or every N frames) so IPC and cancel
     are responsive.
7. **Finalize.** `await output.finalize()`; main flushes and fsyncs the `.part`
   file.
8. **Verify.** Open the file with Mediabunny `Input` and assert duration within
   one frame, video track present, expected dimensions, and frame count. If
   verification fails, keep the `.part` file and report the path.
9. **Commit.** Rename `.part` to the final path atomically. Write a render
   record to `renders/index.json`.
10. **Cleanup.** Destroy the hidden window, release GPU resources, delete the
    job snapshot after 24 hours.

**Frame count**

```ts
const duration = Math.max(0, rangeEnd - rangeStart);
const frameCount = Math.max(1, Math.ceil(duration * fps - 1e-9));
for (let i = 0; i < frameCount; i += 1) {
  const time = rangeStart + i / fps;
  const frameDuration = Math.min(1 / fps, duration - i / fps);
  // ...
}
```

This produces a file whose duration is within one frame of the requested range.
Do not use `Math.round(duration * fps)` for the last frame; it can truncate a
partial frame and make the video shorter than the work area.

### 12.6 Mediabunny integration

Mediabunny is MPL-2.0, zero-dependency, tree-shakable, and supports MP4, WebM,
MKV, MOV, AVC, HEVC, VP8, VP9, AV1, AAC, and Opus (subject to WebCodecs support).
It supersedes the deprecated `mp4-muxer` and `webm-muxer` packages.

Sketch:

```ts
import {
  Output,
  Mp4OutputFormat,
  WebMOutputFormat,
  CanvasSource,
  StreamTarget,
  canEncodeVideo,
} from 'mediabunny';

const format = preset.container === 'webm'
  ? new WebMOutputFormat()
  : new Mp4OutputFormat();

const target = new StreamTarget({
  onData: (data) => {
    // Send a copy to main. Do not await inside the muxer callback if it can
    // stall the encoder; buffer and flush on a microtask.
    void sendChunk(jobId, data);
  },
});

const output = new Output({ format, target });
const video = new CanvasSource(canvas, {
  codec: preset.codec,          // 'avc' | 'vp9' | 'av1'
  bitrate: preset.videoBitrate,
  keyFrameInterval: 2,          // seconds
});

output.addVideoTrack(video, { frameRate: fps });
if (audioTrack) output.addAudioTrack(audioSource);

await output.start();
for (const frame of frames) {
  await video.add(frame.timestamp, frame.duration);
}
await output.finalize();
```

Notes:

- `CanvasSource` reads the canvas at `add()` time. Render the frame immediately
  before `add()`; do not reuse a canvas that is still being painted.
- Keep `preserveDrawingBuffer: true` on the export renderer. Without it, reading
  the canvas after the frame can return an empty buffer.
- Chunk size is controlled by the muxer. Main appends in order; if a chunk
  arrives out of order, fail the job rather than corrupt the file.
- For large files, use a `MessageChannelMain` instead of `ipcRenderer.invoke` if
  profiling shows IPC overhead. The contract stays the same: ordered chunks,
  one writer.
- Keep Mediabunny unmodified. MPL-2.0 is file-level copyleft; linking to it from
  proprietary app code is fine, but changes to Mediabunny files must be
  published. Do not vendor a modified copy.

### 12.7 Audio

- Decode each audio asset once per job to an `AudioBuffer` at 48kHz stereo.
- Mix placements in scene time:
  `sample = assetSample(trimIn + (t - start)) * gain * fade(t)`.
- Fade in/out are linear ramps; no curve editor in Phase 2.
- Sum overlapping placements; clamp to `[-1, 1]` only at the final stage, not
  per placement, to avoid distortion.
- Encode AAC for MP4, Opus for WebM. If the encoder is unavailable, export
  video-only and add a warning; do not fail the video.
- Master sequence audio is offset by each item’s `start`. Crossfades apply the
  same alpha curve to audio as video, unless the transition is a `cut`.
- Do not resample pitch. Time-stretching audio is out of scope.

### 12.8 Master sequence rendering

A sequence frame may need two scenes at once (crossfade/dip). The renderer:

1. Finds the active item(s) at output time.
2. For each active item, computes the scene-local time:
   `sceneTime = itemStartOffset + (t - item.start)` (clamped to the item
   duration).
3. Samples each scene with its own `TimelineRuntime`.
4. Renders each scene to an offscreen canvas at the output size.
5. Composites:
   - `cut`: the incoming scene only.
   - `crossfade`: `mix(outgoing, incoming, alpha)`.
   - `dip`: outgoing → transition color → incoming.
6. Draws the composite to the output canvas and encodes.

Scene cameras and backgrounds are per scene. The sequence does not inherit a
camera. A transition cannot blend two different resolutions; all scenes render
at the output resolution.

If two items overlap without a transition, preflight warns and the later item
wins. Do not invent a crossfade.

### 12.9 Progress, cancel, and recovery

- Progress events: `{ jobId, phase, frame, frameCount, fraction, etaSeconds }`.
- Phases: `snapshot`, `preflight`, `prepare`, `render`, `finalize`, `verify`,
  `done`, `failed`, `cancelled`.
- Cancel sets a flag; the renderer checks it each frame, finalizes nothing, and
  exits. Main deletes the `.part` file after the window closes.
- If the app quits during a render, the job is marked interrupted on next start.
  The `.part` file is kept for 24 hours with a “Recover render” action if it is
  playable; otherwise it is deleted.
- Do not block the editor during export. The editor shows a non-modal job chip
  with progress and a cancel button.
- Only one export runs at a time in Phase 1. A queue is Phase 2.

### 12.10 Failure modes and messages

| Code | User message | Action |
| --- | --- | --- |
| `MOTION_CODEC_UNSUPPORTED` | “This machine cannot encode H.264. Try WebM/VP9.” | Switch format |
| `MOTION_ASSET_MISSING` | “3 assets are missing. Relink them to export.” | Open asset panel |
| `MOTION_FONT_MISSING` | “The brand font is missing; text will use a fallback.” | Relink font |
| `MOTION_DISK_FULL` | “Not enough disk space. Free space or choose another folder.” | Choose folder |
| `MOTION_RENDER_FAILED` | “Rendering stopped at frame 142 (4.7s).” | Copy diagnostics |
| `MOTION_CANCELLED` | “Export cancelled.” | Dismiss |
| `MOTION_VERIFY_FAILED` | “The file was written but could not be verified.” | Reveal `.part` |
| `MOTION_REVISION_CONFLICT` | “The project changed while the render was starting.” | Retry |

Never delete the project or the last successful render on failure. Never claim
success before verification.

### 12.11 Post-export

- Toast: “Export complete · 15.0s · 24 MB” with Open, Reveal, Render again.
- The project browser shows the latest render thumbnail and “Export last render.”
- `renders/index.json` stores filename, preset, revision, duration, size, and
  createdAt. It is not part of the document and can be rebuilt by scanning the
  folder.
- “Export frame” writes a PNG of the current playhead at output resolution. It
  uses the same renderer and is useful for thumbnails and docs.
- “Copy settings” copies the preset as JSON for support/debugging.

### 12.12 Export acceptance criteria

- A 15s 1080p30 project exports to MP4 with H.264 High on this machine.
- If H.264 is unavailable, the same project exports to WebM/VP9 without changing
  the document.
- The exported duration is within one frame of the selected range.
- Audio stays in sync with video within 1 frame over 60s.
- Cancel stops within 2 seconds and leaves no `.part` file.
- A missing asset blocks export with a list, not a generic failure.
- Exporting while editing uses the snapshot revision and does not include later
  edits.
- The exported file contains no grid, gizmos, selection outlines, or safe-area
  guides.
- Transparent scenes warn on MP4 and do not silently render black.

---

## 13. Copilot

### 13.1 What the copilot is

The copilot is a **planning and editing assistant**, not an autonomous editor.
It can read the project, propose changes, explain them, and apply them only after
the user approves. It cannot silently mutate the document, run shell commands,
access the filesystem, or call arbitrary tools.

The copilot is also not the only way to use Motion. Every action it can take has
a manual equivalent in the UI. If the copilot is unavailable, the product still
works.

### 13.2 Why the contract comes before the UI

Phase 1.5 ships the tool contract before Phase 3 ships the chat drawer. This
ordering is deliberate:

- The agent cannot invent a second mutation API if the only API is the op
  registry.
- The plan/diff/approval envelope can be tested without an LLM.
- The UI can be built against a stable contract instead of a moving prompt.
- A future MCP server, CLI, or external agent can reuse the same surface.

### 13.3 Tools

The copilot has exactly these tools. Each is a thin wrapper over the same
services the UI uses.

| Tool | Purpose | Mutates document? |
| --- | --- | --- |
| `motion.describe` | Return the engine manifest: node types, ops, JSON Schemas, schema version, contract version. | No |
| `motion.getDocument` | Return the document, optionally scoped to a scene or node subtree. | No |
| `motion.getContext` | Return selection, active scene, playhead, work area, warnings, recent edits, and project summary. | No |
| `motion.query` | Search nodes, assets, clips, tracks, and keyframes by id/name/type/property. | No |
| `motion.plan` | Validate a proposed op batch and return a preview, diff, risk, warnings, and `baseRevision`. | No |
| `motion.apply` | Apply a previously planned batch, guarded by plan id, base revision, and approval. | Yes |
| `motion.focus` | Select a scene/node/asset and move the playhead. UI-only. | No |
| `motion.importAsset` | Import files through the asset service and return descriptors. | No (until `asset.add` is planned) |
| `motion.lint` | Return document issues without changing anything. | No |
| `motion.recipe` | List recipes or expand a recipe into primitive ops for planning. | No |
| `motion.render` | Start an export job after preflight and explicit user action. | No (writes a render file) |

**`motion.getDocument` scope.** Sending the whole document for a 10-scene project
is wasteful and increases hallucination. The tool accepts:

```ts
{
  scope: 'summary' | 'scene' | 'node' | 'selection';
  sceneId?: string;
  nodeId?: string;
  includeAssets?: boolean;
  includeBrand?: boolean;
  includeTimeline?: boolean;
}
```

- `summary` returns project metadata, scene list, node counts, asset counts,
  warnings, and the active scene id.
- `scene` returns the scene’s nodes, timeline summary, and clip names.
- `node` returns the node, its ancestors/children, and its animated channels.
- `selection` returns the current selection and the surrounding context.

**`motion.query`** is read-only and returns compact results, not full documents.
Example filters: `{ kind: 'node', sceneId, type: 'model.gltf' }`,
`{ kind: 'asset', missing: true }`, `{ kind: 'channel', targetId }`.

**`motion.lint`** returns:

```ts
type MotionLintIssue = {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  sceneId?: string;
  nodeId?: string;
  assetId?: string;
  fix?: { label: string; ops: MotionOpRequest[] };
};
```

The copilot must call `motion.lint` before proposing a plan. A plan with lint
errors is rejected by `motion.plan`.

**`motion.recipe`** returns recipe metadata or expands a recipe:

```ts
motion.recipe({ action: 'list' })
motion.recipe({ action: 'expand', recipeId: 'fade-in', sceneId, targetId, options: { duration: 0.6 } })
```

Expansion returns primitive ops. Recipes are not a separate mutation path.

**`motion.render`** is explicit. The copilot can prepare an export plan and ask
the user to confirm, but it cannot start a render without the user clicking
Export. The tool is available for a future “render this” command after
confirmation.

### 13.4 Plan lifecycle

```
User: "Make the intro feel more premium."
        │
        ▼
Copilot: getContext → getDocument(scope: scene) → query → lint
        │
        ▼
Copilot: plan({ summary, ops })
        │
        ▼
Engine: validate ops → apply to clone → diff → risk → warnings → baseRevision
        │
        ▼
UI: plan card (summary, changes, risk, warnings, preview)
        │
        ├── Cancel → discard plan, no mutation
        │
        └── Apply → (destructive? second confirm) → apply({ planId, baseRevision, approvalToken })
                              │
                              ▼
                        revision guard → apply ops → new revision → undo entry
```

**Plan card contents**

- One-sentence summary in plain language.
- “What will change” list grouped by scene/node.
- Diff counts: “3 nodes updated, 1 clip added, 2 keyframes moved.”
- Risk badge: Safe / Changes / Destructive.
- Warnings: overlap, trimmed keys, missing font, performance.
- Optional preview: a still frame or a short low-res loop. Phase 3 may render a
  preview; Phase 1.5 returns the preview document only.
- Buttons: Apply, Cancel, “Show me” (focus), “Why?” (explanation).

**Approval rules**

- Every plan requires an explicit Apply. There is no auto-apply, no “apply all,”
  and no timeout that applies.
- Destructive plans require a second confirmation. The dialog names the
  entities and counts: “Delete 2 nodes and 14 keyframes? This cannot be undone
  except with Undo.”
- The agent cannot set `approved: true`, `confirmedDestructive: true`, or
  `approvalToken`. Those fields are stripped from tool input and added by the
  renderer after user action.
- A plan is single-use and expires after 10 minutes.
- If the document revision changed since the plan, `apply` fails with
  `MOTION_REVISION_CONFLICT`. The copilot must re-read context and re-plan. It
  must not retry blindly.
- Applying a plan creates one undo entry, even if it contains 40 ops.

### 13.5 Context assembly

The copilot’s context is assembled by the main process, not by the model. The
model cannot request arbitrary files.

**Always included**

- The engine manifest summary (node types, op ids, schema version).
- Project summary: name, output, scene count, duration, brand colors/fonts.
- Active scene summary: node tree (names/types/parents), track/clip names,
  timeline duration, work area, play mode.
- Current selection and playhead.
- Lint summary (errors/warnings).
- The user’s instruction.

**Included on demand**

- Full node props for the selected node and its children.
- Animated channels for the selected node.
- Asset metadata (names, kinds, dimensions, missing flags).
- Brand kit.
- Recent op history (last 10 labels, not full documents).
- A compact list of other scenes (names/durations), not their contents.

**Never included**

- Binary asset bytes.
- Absolute filesystem paths.
- API keys, settings, or unrelated project data.
- Full documents for every scene by default.

**Token budget.** Keep the system prompt + manifest under ~6k tokens; context
under ~20k; leave room for the plan. If the project is too large, summarize and
ask the user to narrow the scope (“Which scene?”).

### 13.6 Prompt and behavior rules

The copilot’s system prompt should encode:

- “You are a motion design copilot inside Qeda. You propose edits, you do not
  apply them.”
- “Use the op registry. Never invent an op, node type, or property.”
- “Prefer small, reversible changes. Explain the creative intent.”
- “Ask before destructive changes.”
- “If the user’s request is ambiguous, ask one clarifying question or propose
  two directions.”
- “Do not claim a render exists unless `motion.render` returned a completed job.”
- “Do not invent asset ids, node ids, or clip ids. Query first.”
- “If lint reports an error, fix it or explain why you cannot.”
- “Keep summaries short; the diff is the detail.”

**Common intents → tools**

| User says | Copilot does |
| --- | --- |
| “Make it more premium” | Reads scene, proposes slower camera, softer light, more negative space, easing changes. |
| “Add a call to action” | Adds a text node, fades it in, places it in the safe area. |
| “Fix the timing” | Reads clips/keys, proposes trims/moves, shows a diff. |
| “Use our brand” | Reads brand, proposes color/font updates to selected nodes. |
| “Make a 9:16 version” | Duplicates the project/scene, changes output, reframes camera, warns about layout. |
| “Why is export blocked?” | Calls lint/preflight, explains missing assets/fonts. |
| “Render it” | Prepares a render plan, asks for confirmation, calls `motion.render` only after. |

### 13.7 Copilot UI (Phase 3)

The copilot is a right-side drawer, not a separate page.

```
┌──────────────────────────────────────────────┐
│ Copilot                             [×] [⋮]  │
├──────────────────────────────────────────────┤
│ You: Make the intro feel more premium.       │
│                                              │
│ Copilot: I’ll slow the camera push, soften   │
│ the key light, and add a beat before the     │
│ title.                                       │
│                                              │
│ ┌──────────────────────────────────────────┐ │
│ │ Plan · Changes · 7 edits                 │ │
│ │ • Camera push: 4.5s → 5.2s               │ │
│ │ • Key light: 2.2 → 1.8                   │ │
│ │ • Title: fade starts 0.2s later          │ │
│ │ ⚠ 1 warning: title overlaps safe area    │ │
│ │ [ Show me ]  [ Why? ]  [ Cancel ] [Apply]│ │
│ └──────────────────────────────────────────┘ │
├──────────────────────────────────────────────┤
│ [ Ask about this scene…             ] [Send] │
└──────────────────────────────────────────────┘
```

- The drawer does not cover the inspector permanently; it overlays and can be
  pinned.
- Plan cards are persistent in the conversation until applied/cancelled.
- “Show me” focuses the affected nodes and seeks the playhead to the first
  changed key. It does not mutate.
- “Why?” expands the reasoning and the op list.
- After Apply, the card becomes “Applied · Undo” with a link to the undo action.
- Errors are shown in the card, not as a generic toast.
- The copilot never streams partial ops into the document. It streams text and
  then a complete plan.

### 13.8 Safety and privacy

- The copilot has no filesystem, shell, network, or Electron APIs. Its only tools
  are the list in §13.3.
- Asset import is user-initiated or explicitly confirmed. The copilot cannot
  read an arbitrary path.
- Render is user-initiated.
- The copilot cannot disable lint, approval, or revision guards.
- Tool inputs are validated against JSON Schema and the op registry. Unknown
  fields are rejected.
- Prompt injection from project text (node names, asset names) is treated as
  data, not instructions. The system prompt says so, and the tool layer does not
  grant extra capability based on text.
- The project is local. If the user has configured a cloud model provider, the
  context described above is sent to that provider. The UI states this in
  Settings; Motion does not add a second cloud path.

### 13.9 Evaluation

Track, locally and anonymously if the user opts in:

- Plan acceptance rate (applied / proposed).
- Immediate undo rate after apply.
- Lint errors per plan.
- Revision conflicts per session.
- Median time from request to plan.
- Token usage per request.
- “Show me” usage (a proxy for trust).
- Failed tool calls (unknown ids, invalid ops).

A plan that is applied and then undone within 10 seconds is a failure. Review
those transcripts first.

### 13.10 Copilot acceptance criteria

- The copilot cannot change the document without `motion.apply`.
- Every plan has a diff, risk, warnings, and `baseRevision`.
- A destructive plan requires two user actions.
- A stale plan is rejected, not merged.
- The copilot can complete “add a call to action” and “fix the timing” on the
  starter project without inventing ids.
- The copilot can explain why export is blocked using `motion.lint`/preflight.
- With the copilot disabled, every one of those tasks is still possible by hand.

---

## 14. Operation contract v2

### 14.1 Principles

1. **The op registry is the only mutation API.** The UI, tests, recipes, and
   copilot all produce the same serializable ops. A UI path that mutates the
   document directly is a bug.
2. **No generic setter.** There is no `document.set`, `scene.setNodes`, or
   `node.setProps` that can launder a destructive change into the `safe` tier.
3. **Ids are parameters.** Reducers never generate ids. The caller generates
   them and passes them in, so replay is deterministic.
4. **Reducers are pure.** They take `(document, params)` and return a new
   document or the same reference for a no-op.
5. **Batches are atomic.** If any op fails, the caller’s document is unchanged.
6. **Risk is declared, not inferred from the UI.** A destructive op is
   destructive whether it comes from a menu or the copilot.
7. **Scene-scoped.** Every operation that touches a scene includes `sceneId`.
   Node ids are unique within a scene, not globally.

### 14.2 Result envelope

```ts
export type MotionOpRisk = 'safe' | 'mutating' | 'destructive';

export type MotionPlanWarning = {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  sceneId?: string;
  nodeId?: string;
  assetId?: string;
};

export type MotionChange = {
  action: 'add' | 'remove' | 'update' | 'move';
  entity:
    | 'document'
    | 'scene'
    | 'node'
    | 'track'
    | 'clip'
    | 'placement'
    | 'channel'
    | 'keyframe'
    | 'asset'
    | 'brand'
    | 'sequence'
    | 'audio';
  id: string;
  label: string;
  sceneId?: string;
  path?: string;
  before?: unknown;
  after?: unknown;
};

export type MotionDocumentDiff = {
  changes: MotionChange[];
  counts: Record<string, number>;
};

export type MotionPlan = {
  planId: string;
  /** Revision the plan was built against. */
  baseRevision: number;
  summary: string;
  ops: MotionOpRequest[];
  /** The document after applying the ops, for UI preview. */
  preview: MotionDocument;
  diff: MotionDocumentDiff;
  risk: MotionOpRisk;
  requiresApproval: boolean;
  warnings: MotionPlanWarning[];
  createdAt: string;
  expiresAt: string;
};

export type MotionApplyResult = {
  document: MotionDocument;
  revision: number;
  applied: number;
  diff: MotionDocumentDiff;
  warnings: MotionPlanWarning[];
};
```

**`requiresApproval`** is `risk === 'destructive'`. A mutating plan still requires
an explicit Apply in the copilot UI; the flag only controls the second
confirmation.

**`baseRevision`** is the document revision at plan time. `apply` rejects if the
document has changed since. This is the revision guard.

**`preview`** is a full document because the UI needs to render it. The copilot
tool result can omit it and return `diff` + counts; the model does not need the
whole document.

### 14.3 Diff

`diffMotionDocuments(before, after)` returns a stable, ordered list of changes.
It is computed from the documents, not from the ops, because recipes expand and
because an op can produce multiple entity changes.

Rules:

- Omit unchanged entities.
- Order: document, brand, sequence, scenes (by id), nodes (by scene then id),
  assets (by id).
- For updates, include only changed fields in `before`/`after` when possible;
  for simplicity, the first implementation may include the whole entity.
- Labels are human-readable: node name, clip name, asset name.
- Counts are keyed by `${action}:${entity}` (e.g. `update:node`).

The UI renders the diff as a list, not a raw JSON patch. A “View JSON” toggle is
for debugging.

### 14.4 Risk classes

| Risk | Meaning | Examples |
| --- | --- | --- |
| `safe` | Additive or trivially reversible; no existing content is lost. | Add node, add keyframe, create clip, add asset, set active scene. |
| `mutating` | Changes existing content but is fully reversible with Undo. | Move node, trim placement, set value, rename, reorder, change camera. |
| `destructive` | Deletes or rewrites content in a way that is easy to regret. | Remove node/scene/clip/track/asset/keyframe, quantize, replace asset, clear sequence. |

`batchRisk` is the maximum risk in the batch. `requiresApproval` is true only
for `destructive`.

**`timeline.quantizeToFps` is destructive.** It merges keys that collapse onto
one frame. The current implementation marks it `mutating`; v2 changes it to
`destructive` and requires confirmation.

**`asset.replace` is destructive.** It rewrites every reference and removes the
old asset. The diff lists every affected node.

### 14.5 Op reference

`sceneId` is required on every scene-scoped op. It is omitted from the table’s
params for brevity but is always present in the type. Document-level ops below
list all their params; `document.setActiveScene` takes a scene id as its
*value*, not as scope.

#### Document

| Op | Params | Risk |
| --- | --- | --- |
| `document.rename` | `{ name }` | mutating |
| `document.updateMeta` | `{ name?, description? }` | mutating |
| `document.setOutput` | `{ fps?, width?, height? }` | mutating |
| `document.updateBrand` | `{ name?, colors?: Partial<Record<MotionBrandColorToken, string>>, fonts?: Partial<MotionBrand['fonts']>, logoAssetId?, safeArea?, cornerRadius?, defaults? }` | mutating |
| `document.setActiveScene` | `{ sceneId }` | safe |
| `document.setSequence` | `{ sequence: MotionSequence \| null }` | destructive |

`document.setSequence(null)` removes the master sequence. Marking the op
destructive covers both set and clear; setting a new sequence is also a
structural change worth reviewing.

#### Scene

| Op | Params | Risk |
| --- | --- | --- |
| `scene.add` | `{ sceneId, name, fromSceneId? }` | safe |
| `scene.duplicate` | `{ sceneId, newSceneId, name?, idMap }` | safe |
| `scene.remove` | `{ sceneId }` | destructive |
| `scene.rename` | `{ sceneId, name }` | mutating |
| `scene.setCamera` | `{ sceneId, cameraId: string \| null }` | mutating |
| `scene.setBackground` | `{ sceneId, background?: MotionBackground }` | mutating |
| `scene.reorder` | `{ sceneId, toIndex }` | mutating |

`scene.duplicate` requires an `idMap` covering every node, track, clip,
placement, channel, keyframe, and audio placement copied. The caller generates
the ids. This avoids random id generation inside a reducer and makes the
duplicate replayable.

#### Node

| Op | Params | Risk |
| --- | --- | --- |
| `scene.node.add` | `{ sceneId, nodeId, type, name?, parentId?, transform?, props? }` | safe |
| `scene.node.update` | `{ sceneId, nodeId, name?, visible?, locked?, transform?, props? }` | mutating |
| `scene.node.remove` | `{ sceneId, nodeId }` | destructive |
| `scene.node.reparent` | `{ sceneId, nodeId, parentId, preserveWorld? }` | mutating |
| `scene.node.reorder` | `{ sceneId, nodeId, toIndex }` | mutating |
| `scene.node.duplicate` | `{ sceneId, nodeId, newRootId, idMap, includeAnimation? }` | safe |

`scene.node.reparent` validates parent type, prevents cycles, and (by default)
compensates the local transform so the node does not jump in world space.
`scene.node.remove` removes the subtree, channels targeting removed nodes, and
tracks scoped only to removed nodes; it nulls camera references.

`idMap` shape:

```ts
export type MotionIdMap = {
  nodes?: Record<string, string>;
  tracks?: Record<string, string>;
  clips?: Record<string, string>;
  placements?: Record<string, string>;
  channels?: Record<string, string>;
  keyframes?: Record<string, string>;
  audio?: Record<string, string>;
};
```

Every entity the op creates must have an entry. The op rejects missing or
duplicate mappings.

#### Assets

| Op | Params | Risk |
| --- | --- | --- |
| `asset.add` | `MotionAsset` (v4 fields) | safe |
| `asset.rename` | `{ assetId, name }` | mutating |
| `asset.relink` | `{ assetId, path, hash, byteSize, metadata? }` | mutating |
| `asset.replace` | `{ assetId, withAssetId }` | destructive |
| `asset.remove` | `{ assetId }` | destructive |

`asset.remove` refuses while referenced. `asset.replace` rewrites every
reference in one batch and then removes the old asset; if any reference cannot
be rewritten (wrong kind), the whole batch fails.

#### Timeline

| Op | Params | Risk |
| --- | --- | --- |
| `timeline.setDuration` | `{ sceneId, duration }` | mutating |
| `timeline.setWorkArea` | `{ sceneId, enabled?, start?, end? }` | mutating |
| `timeline.setPlayMode` | `{ sceneId, playMode }` | mutating |
| `timeline.quantizeToFps` | `{ sceneId, fps? }` | destructive |
| `timeline.addAudio` | `{ sceneId, placement: MotionAudioPlacement }` | safe |
| `timeline.updateAudio` | `{ sceneId, audioId, patch }` | mutating |
| `timeline.removeAudio` | `{ sceneId, audioId }` | destructive |
| `timeline.setLoop` | `{ sceneId, enabled?, start?, end? }` | mutating (deprecated alias) |

`timeline.setDuration` does not move keys. Placements may extend past the new
duration; the renderer clips them. If the new duration is shorter than the work
area, the work area is clamped and a warning is added.

`timeline.setLoop` is a compatibility alias that writes `workArea` and
`playMode` together. New code uses the two explicit ops.

#### Track

| Op | Params | Risk |
| --- | --- | --- |
| `track.add` | `{ sceneId, trackId, name, targetId? }` | safe |
| `track.remove` | `{ sceneId, trackId }` | destructive |
| `track.update` | `{ sceneId, trackId, name?, muted?, locked? }` | mutating |
| `track.reorder` | `{ sceneId, trackId, toIndex }` | mutating |

`track.remove` deletes the track and its placements. Clips remain in the
library.

#### Clip

| Op | Params | Risk |
| --- | --- | --- |
| `clip.create` | `{ sceneId, clipId, name, duration }` | safe |
| `clip.remove` | `{ sceneId, clipId }` | destructive |
| `clip.rename` | `{ sceneId, clipId, name }` | mutating |
| `clip.setDuration` | `{ sceneId, clipId, duration }` | mutating |
| `clip.duplicate` | `{ sceneId, clipId, newClipId, idMap }` | safe |

`clip.setDuration` rejects if any placement’s `trimIn + duration` would exceed
the new clip duration. The error lists the offending placements; the user can
trim them first. Keys past the new end are kept (not deleted) but are hidden;
this matches the current behavior and avoids data loss.

`clip.duplicate` requires an `idMap` for every channel and keyframe.

#### Placement

| Op | Params | Risk |
| --- | --- | --- |
| `placement.add` | `{ sceneId, trackId, placementId, clipId, start, trimIn?, duration? }` | safe |
| `placement.move` | `{ sceneId, trackId, placementId, start, toTrackId? }` | mutating |
| `placement.trim` | `{ sceneId, trackId, placementId, start?, trimIn?, duration? }` | mutating |
| `placement.split` | `{ sceneId, trackId, placementId, atTime, newPlacementId }` | mutating |
| `placement.remove` | `{ sceneId, trackId, placementId }` | destructive |

`placement.add` defaults `trimIn` to `0` and `duration` to the clip duration.

#### Channel

| Op | Params | Risk |
| --- | --- | --- |
| `channel.add` | `{ sceneId, clipId, channelId, targetId, property }` | safe |
| `channel.remove` | `{ sceneId, clipId, channelId }` | destructive |
| `channel.retarget` | `{ sceneId, clipId, channelId, targetId, property? }` | mutating |

`channel.add` validates the target node exists in the scene and the property is
animatable for that node type. `channel.retarget` validates the new target and
property and keeps the keyframes (values may be out of range; the op warns).

#### Keyframe

| Op | Params | Risk |
| --- | --- | --- |
| `keyframe.add` | `{ sceneId, clipId, channelId, keyframeId, time, value, easing? }` | safe |
| `keyframe.move` | `{ sceneId, clipId, channelId, keyframeId, time }` | mutating |
| `keyframe.setValue` | `{ sceneId, clipId, channelId, keyframeId, value }` | mutating |
| `keyframe.setEasing` | `{ sceneId, clipId, channelId, keyframeId, easing }` | mutating |
| `keyframe.remove` | `{ sceneId, clipId, channelId, keyframeId }` | destructive |

`keyframe.add` at an existing time replaces the existing key’s value/easing but
keeps its id. `keyframe.move` clamps to `[0, clip.duration]`; if it lands on an
existing key, the two merge (the moved key wins). `keyframe.setValue` is a no-op
if the value is unchanged.

#### Recipe (meta-op)

| Op | Params | Risk |
| --- | --- | --- |
| `recipe.apply` | `{ sceneId, recipeId, targetId?, options? }` | computed |

`recipe.apply` is not a primitive document op. It expands into a batch of
primitive ops before validation and application. The plan diff shows the
primitives, not the recipe. This keeps recipes out of the persisted document and
prevents a second mutation path.

### 14.6 Batch semantics

```ts
export function planMotionCommand(
  doc: MotionDocument,
  requests: readonly MotionOpRequest[],
  options: { now?: string; summary?: string } = {},
): MotionPlan {
  const risk = batchRisk(requests);
  const preview = applyMotionOps(doc, requests, options);
  return {
    planId: createMotionId('plan'),
    baseRevision: doc.revision,
    summary: options.summary ?? summarizeOps(requests),
    ops: [...requests],
    preview,
    diff: diffMotionDocuments(doc, preview),
    risk,
    requiresApproval: risk === 'destructive',
    warnings: collectPlanWarnings(doc, preview, requests),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  };
}
```

- `applyMotionOps` is pure and immutable. It does not mutate `doc`; if an op
  throws, the caller still holds the original.
- `applyMotionCommand` re-checks `baseRevision`, plan expiry, and approval, then
  applies the plan. It increments `revision` exactly once, not once per op.
- A no-op batch returns the same document reference and does not increment
  `revision` or create a history entry.
- `applyMotionOp(doc, request)` is `applyMotionOps(doc, [request])`.
- Timestamps: `meta.updatedAt` is set to `now` if the document changed.
- Validation: in development/test, `validateMotionDocument(result)` runs after
  the batch. In production, it runs before save and before export, not after
  every op. Ops still validate their own references.

### 14.7 Errors

```ts
export class MotionOpError extends Error {
  code:
    | 'MOTION_OP_UNKNOWN'
    | 'MOTION_OP_PARAMS'
    | 'MOTION_OP_NOT_FOUND'
    | 'MOTION_OP_INVALID_REFERENCE'
    | 'MOTION_OP_CONFLICT'
    | 'MOTION_OP_INVARIANT';
  op: string;
  path?: string;
}
```

- Unknown op → `MOTION_OP_UNKNOWN`.
- Zod failure or unknown parameter → `MOTION_OP_PARAMS` with the first path.
- Missing node/clip/track/asset → `MOTION_OP_NOT_FOUND`.
- Wrong parent, wrong asset kind, missing camera → `MOTION_OP_INVALID_REFERENCE`.
- Duplicate id, overlapping split, invalid trim → `MOTION_OP_CONFLICT`.
- Result would violate a document invariant → `MOTION_OP_INVARIANT`.

Errors are user-facing strings with context, not stack traces. The UI shows the
message and keeps the document unchanged.

### 14.8 Revision guard and approval

- `plan` stores `baseRevision`.
- `apply` requires `planId`, `baseRevision`, and `approvalToken`.
- If `doc.revision !== baseRevision`, reject with `MOTION_REVISION_CONFLICT`.
- If `requiresApproval` and `confirmedDestructive !== true`, reject with
  `MOTION_APPROVAL_REQUIRED`.
- `approvalToken` is minted by the editor store when a plan is presented to the
  user, bound to `planId` + `baseRevision`, and **never returned to the model**.
  It is not part of `MotionPlan`, not a document field, and not persisted. The
  copilot's `motion.apply` schema has no token field; the renderer attaches it
  when the user clicks Apply.
- `force: true` is accepted only from the editor UI, after showing the diff. It
  is stripped from copilot tool inputs.
- A plan is single-use. Re-applying returns `MOTION_PLAN_CONSUMED`.
- Undo after apply restores the previous content and increments revision again;
  the old plan cannot be re-applied.

### 14.9 Discovery

```ts
export type MotionEngineManifest = {
  contractVersion: 2;
  engine: 'qeda-motion';
  documentSchemaVersion: 4;
  nodes: MotionNodeTypeDescription[];
  operations: Array<{
    id: string;
    summary: string;
    risk: MotionOpRisk;
    sceneScoped: boolean;
    parameters: Record<string, unknown>; // JSON Schema
    since: string;
    deprecated?: boolean;
  }>;
  recipes: Array<{
    id: string;
    label: string;
    description: string;
    params: Record<string, unknown>;
  }>;
};
```

- `parameters` is generated with Zod 4 `z.toJSONSchema()` and
  `additionalProperties: false`.
- `sceneScoped` tells the agent to include `sceneId`.
- `since` is the phase/version that introduced the op.
- `deprecated` marks aliases like `timeline.setLoop`.
- The manifest is cached per app version; it is deterministic and safe to send
  to a model.

### 14.10 Compatibility

- v1 contract clients (the current `describeMotionEngine`) get a v2 manifest
  with a `contractVersion: 2` field. They must handle the new envelope; there
  are no external clients yet.
- v3 documents migrate to v4 before any op runs.
- `timeline.setLoop` remains as a deprecated alias for one release. New code and
  prompts use `timeline.setWorkArea` + `timeline.setPlayMode`.
- `asset.add` no longer accepts `uri`; v4 requires `path`, `hash`, and
  `byteSize`.
- `scene.node.add` and all scene ops require `sceneId`. The v3 signature is not
  accepted.
- `screen.image.props.source` is rejected; use `assetId`.

### 14.11 Op acceptance criteria

- Every op has a Zod schema, a risk class, a summary, and a test.
- Unknown parameters are rejected, not ignored.
- A batch with one invalid op leaves the document unchanged.
- No-op batches do not increment revision or create history.
- A destructive op is held for approval in the store and by the copilot.
- A stale plan is rejected with `MOTION_REVISION_CONFLICT`.
- Applying a 40-op plan creates one undo entry.
- `motion.describe` returns JSON Schema for every op and node type.
- `recipe.apply` expands to primitive ops and is not stored in the document.

---

## 15. Persistence and recovery

### 15.1 Source of truth

The **project bundle folder is the source of truth**. SQLite is an index, not
storage. If the database is deleted, the project list rebuilds by scanning
`<userData>/motion/projects/*/project.json`. If the folder is deleted, the
project is gone; the index must not pretend otherwise.

This is a deliberate departure from how tasks and documents are stored. Motion
projects contain multi-megabyte binary assets and are the kind of thing users
back up, move to a NAS, or put in Dropbox. A SQLite blob or a row that points at
`userData` would make that impossible without an export step.

```
<userData>/motion/
  projects/
    <projectId>/
      project.json
      project.autosave.json
      project.lock
      editor-state.json
      backups/
      assets/
      renders/
      .staging/
      .trash/
  templates/            # read-only, shipped with the app
  cache/
    thumbnails/
    fonts/
```

`projectId` is a ULID-ish id from `ids.ts` (`prj_...`), not a slug. Renaming a
project must not break links, bookmarks, or the index.

### 15.2 Index schema

```sql
CREATE TABLE IF NOT EXISTS motion_projects (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  path           TEXT NOT NULL,
  scene_count    INTEGER NOT NULL DEFAULT 1,
  duration       REAL NOT NULL DEFAULT 0,
  width          INTEGER NOT NULL DEFAULT 1920,
  height         INTEGER NOT NULL DEFAULT 1080,
  fps            INTEGER NOT NULL DEFAULT 30,
  thumbnail_path TEXT,
  last_opened_at TEXT,
  updated_at     TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  missing        INTEGER NOT NULL DEFAULT 0
);
```

- The table is added to `MIGRATION_STATEMENTS` in `src/main/db/schema.ts`. It is
  a new table, so it needs no `ALTER TABLE` back-fill guard — but every column
  added to it *later* does (see `AGENTS.md`).
- The index is written on create, open, save, rename, duplicate, delete, and on
  a successful rescan. It is never the only record of anything.
- `missing = 1` means the folder was not found at the recorded path. The browser
  shows the card greyed out with “Locate…” instead of hiding it, because hiding
  it looks like data loss.
- A background rescan runs on app start, at most once per 24h, and on demand
  from the browser footer. It reconciles the index with the folders and never
  deletes a folder.

### 15.3 Write protocol

Every write to `project.json` follows the same order. Skipping a step is how
projects get corrupted.

1. **Acquire the project lock.** `proper-lockfile` on the bundle directory, with
   `stale: 30_000`, `update: 5_000`, `retries: 0`. Failure means another window
   or another app instance has the project open: “This project is open in
   another window.”
2. **Serialize deterministically.** `serializeMotionDocument(doc)` builds the
   JSON object in a fixed key order and writes 2-space indentation with a
   trailing newline. `JSON.stringify(doc)` alone is not enough, because object
   key order follows insertion order and would make every save a spurious diff.
3. **Compute the hash.** SHA-256 over the UTF-8 bytes. Store it in the sidecar
   header.
4. **Write the sidecar** `project.autosave.json` atomically:
   `{ format: 1, revision, savedAt, sha256, document }`.
5. **Write the canonical file** atomically with `write-file-atomic` (same
   directory, so the rename is on the same filesystem).
6. **Verify** by reading the file back and comparing the hash. A mismatch
   aborts before step 7 and leaves the sidecar in place.
7. **Delete the sidecar.** It is the dirty marker; its absence means “canonical
   file is the newest known good state.”
8. **Release the lock.**

The sidecar contains the full document, not a delta. Documents are small (tens
to low hundreds of KB without assets), and a full copy makes recovery a single
read instead of a replay.

**Backups.** Before step 5, copy the current canonical file to
`backups/project-<revision>.json` when any of these is true:

- it has been more than 5 minutes since the last backup;
- `revision` advanced by more than 20 since the last backup;
- the save follows a migration;
- the save follows a destructive op batch.

Keep the newest 10, delete older ones. A backup is never written for a document
that failed validation.

**Write queue.** Main serializes saves per `projectId` with an in-memory promise
chain. Two autosaves 40ms apart must not interleave, even though the renderer
debounces.

**Failure behaviour.** If step 4 or 5 fails (disk full, permission denied), the
sidecar stays, the status chip shows “Save failed,” and the editor keeps
working. It does not close, and it does not retry in a tight loop — retry on the
next change or on `Cmd/Ctrl+S`, with backoff.

### 15.4 Crash recovery

On open, before the editor mounts:

```
sidecar exists?
  ├── no            → open canonical
  ├── sidecar.revision == canonical.revision
  │                   → delete sidecar, open canonical
  ├── sidecar.revision > canonical.revision
  │                   → offer recovery
  └── sidecar.revision < canonical.revision
                      → delete sidecar, open canonical
```

If the canonical file is missing or unparseable but the sidecar is valid, the
recovery prompt is the only path that preserves the user’s work; show it with a
warning that the main file is damaged.

Recovery dialog:

```
Motion closed unexpectedly.
Recover 3 unsaved changes from 14:32?
  [ Discard ]  [ Recover ]
```

- **Recover** writes the sidecar document to `project.json` through the normal
  write protocol, assigns `revision = max(sidecar, canonical) + 1`, and opens.
- **Discard** deletes the sidecar and opens the canonical file. It does not
  delete backups.
- Recovery never happens silently, even when the sidecar is newer. The user
  needs to know that a crash occurred.
- If the sidecar fails validation, show the error and offer “Download for
  inspection” (writes a copy next to the project) rather than deleting it.

### 15.5 Concurrent access

- The lock is advisory and only meaningful for the same machine and user. That
  is the supported case.
- Two windows of the same app opening the same project is prevented by the lock
  and, in the UI, by a “Focus existing window” action in the browser.
- A project on a network share may not support atomic rename. Detect `EXDEV`
  and `EPERM` and fall back to write-temp-in-same-dir + rename; if that also
  fails, warn that the location is not safe for autosave and offer “Save a copy
  locally.”
- Read-only folders: open in read-only mode, disable autosave and export to that
  folder, and show a banner. Never fail to open because saving is impossible.

### 15.6 Corrupt and unreadable projects

| Situation | Behaviour |
| --- | --- |
| JSON parse error | Error page. Do not overwrite. Offer backups, “Open folder,” “Duplicate for repair.” |
| Zod/validation error | Same, but show the first 5 issues with paths. |
| `schemaVersion` > 4 | “This project was made with a newer version of Motion.” Refuse to open; offer “Open folder.” |
| Missing `project.json` | Treat as missing project; offer “Locate…” |
| Assets missing | Open normally, placeholders, export blocked. Not corruption. |
| `meta.id` mismatch with folder name | Open with a warning; do not rename the folder silently. |

“Duplicate for repair” creates a new bundle containing `assets/` copied by hash
and a fresh blank document, so the user can rebuild the timeline without losing
their imagery. It never touches the original folder.

### 15.7 Migration on open

- `schemaVersion < 4` → migrate in memory, open as dirty (“Unsaved changes”),
  and write a backup of the original file before the first save. The migration
  itself is not a save.
- Migration failure → error page with the migration error and the backup path.
  Never open a partially migrated document.
- `schemaVersion == 4` → open directly.
- After a successful migration, the next save writes v4. There is no
  “downgrade” path; older builds must refuse newer files, which is why the
  version check is strict.
- Migrations are pure functions in `lib/motion/migrations/` and are covered by
  fixtures. They do not import Electron, the filesystem, or the clock.

### 15.8 Moving and relocating

- **Move the folder** in the OS, then “Locate project folder” in the browser.
  Main validates `project.json` exists and that `meta.id` matches the index row
  (or the folder name). It updates the index path, not the document.
- **Move the folder while the app is closed**: the rescan marks the old path
  missing and shows “Locate…”. It does not auto-match by name, because two
  projects can share a name.
- **Duplicate** copies the bundle, rewrites `meta.id`, `meta.createdAt`,
  `meta.updatedAt`, clears `renders/`, and leaves asset hashes intact so
  deduplication still works.
- **Delete** moves the bundle to the OS trash (`shell.trashItem`), not
  `rm -rf`. The index row is removed only after the trash call succeeds.
- **Import an existing bundle** (e.g. from a colleague) is Phase 2: copy into
  `projects/`, and if the id collides, assign a new id and rewrite references.

### 15.9 Retention and cleanup

| Item | Retention | Trigger |
| --- | --- | --- |
| `project.autosave.json` | Until the next successful save or recovery | Write protocol |
| `backups/` | Newest 10 | After each save |
| `.staging/` | 24h | App start |
| `.trash/` | 7 days | App start |
| `renders/` | Forever | User-owned output |
| `render-jobs/` | 24h after completion | App start |
| `cache/thumbnails/` | Rebuildable; delete on demand | Settings |

Cleanup never runs during an export and never deletes a file that the current
document references. When in doubt, keep the file and log it.

### 15.10 Persistence acceptance criteria

- Killing the app mid-edit and reopening offers recovery with the last change.
- A failed save leaves the editor usable and the sidecar intact.
- A save interrupted between the sidecar and canonical write recovers cleanly.
- Two saves 40ms apart produce one coherent file, not an interleaved one.
- Serializing the same document twice produces byte-identical output.
- Opening a v3 fixture migrates, marks dirty, and writes a backup before saving.
- Opening a `schemaVersion: 5` file refuses and does not modify it.
- A read-only project opens, warns, and does not attempt to write.
- Deleting a project uses the OS trash and removes the index row only on
  success.
- The project list rebuilds correctly from folders with the database deleted.

---

## 16. IPC surface

### 16.1 Rules

These are the existing rules from `AGENTS.md`, restated because Motion is the
largest surface added since they were written.

- Every channel is declared in `src/main/ipc/channels.ts` with `req`/`res`
  types. Events have a payload type and no `req`/`res`.
- The renderer calls `window.electron.ipc.invoke<T>(name, payload)` and
  subscribes with `window.electron.ipc.on(name, listener)`, which returns a
  cleanup function. Every `useEffect` subscription returns it.
- The renderer never imports Node or Electron. Paths never cross IPC in either
  direction except as opaque strings the main process validates.
- Handler modules live in `src/main/ipc/handlers/` and export one
  `register<Domain>Handlers(...)`. `ipc/index.ts` is the only composition root.
- `ipcMain.handle` is not typed against `IpcChannels`, so a typo compiles.
  `python3 scripts/verify-ipc-split.py` must be run after touching this layer.
- Binary media never crosses IPC. Assets are served over `qeda-media://`;
  export chunks are the one exception and are one-way, ordered, and main-owned.

### 16.2 Channel table

**Projects**

| Channel | Req | Res |
| --- | --- | --- |
| `motion:list-projects` | `{ includeMissing?: boolean }` | `{ projects: MotionProjectSummary[] }` |
| `motion:create-project` | `{ name, templateId?, output, duration?, background? }` | `{ projectId, path }` |
| `motion:open-project` | `{ projectId }` | `{ document, path, recovery: MotionRecoveryInfo \| null, issues: MotionLintIssue[] }` |
| `motion:save-project` | `{ projectId, document, expectedRevision }` | `{ revision, savedAt, bytes }` |
| `motion:rename-project` | `{ projectId, name }` | `{ name }` |
| `motion:duplicate-project` | `{ projectId, name? }` | `{ projectId }` |
| `motion:delete-project` | `{ projectId }` | `{ trashed: boolean }` |
| `motion:locate-project` | `{ projectId }` | `{ path } \| null` |
| `motion:reveal-project` | `{ projectId }` | `void` |
| `motion:recover-project` | `{ projectId, action: 'recover' \| 'discard' }` | `{ document, path }` |
| `motion:list-templates` | `void` | `{ templates: MotionTemplateSummary[] }` |
| `motion:read-editor-state` | `{ projectId }` | `{ state: unknown \| null }` |
| `motion:write-editor-state` | `{ projectId, state }` | `void` |
| `motion:changed` | event | `void` |

`motion:changed` fires after create/rename/duplicate/delete/locate/recover so the
browser refetches. It is not fired on every save — the editor already owns the
document and the browser does not need to re-render per keystroke. The browser
refetches on focus and on `motion:changed`.

**Assets**

| Channel | Req | Res |
| --- | --- | --- |
| `motion:stage-assets` | `{ projectId, paths: string[] }` | `{ items: MotionStagedAsset[], errors: MotionImportError[] }` |
| `motion:commit-assets` | `{ projectId, items: MotionAssetCommit[] }` | `{ assets: MotionAsset[], errors: MotionImportError[] }` |
| `motion:cancel-import` | `{ projectId, importIds: string[] }` | `void` |
| `motion:relink-asset` | `{ projectId, assetId, path }` | `{ hash, byteSize, matches: boolean }` |
| `motion:reveal-asset` | `{ projectId, assetId }` | `void` |
| `motion:delete-asset-file` | `{ projectId, assetId }` | `{ trashed: boolean }` |

**Export**

| Channel | Req | Res |
| --- | --- | --- |
| `motion:probe-codecs` | `void` | `{ video: Record<string, boolean>, audio: Record<string, boolean> }` |
| `motion:export-preflight` | `{ projectId, options }` | `{ issues: MotionPreflightIssue[], estimate: MotionExportEstimate }` |
| `motion:export-start` | `{ projectId, revision, options, acknowledgeWarnings: boolean }` | `{ jobId }` |
| `motion:export-cancel` | `{ jobId }` | `void` |
| `motion:export-chunk` | event: `{ jobId, seq, data: Uint8Array }` | — |
| `motion:export-progress` | event: `{ jobId, phase, frame, frameCount, fraction, etaSeconds }` | — |
| `motion:export-done` | event: `{ jobId, filePath, duration, bytes, warnings }` | — |
| `motion:export-failed` | event: `{ jobId, code, message, frame? }` | — |
| `motion:list-renders` | `{ projectId }` | `{ renders: MotionRenderRecord[] }` |
| `motion:export-frame` | `{ projectId, revision, time, path }` | `{ filePath }` |

`motion:export-chunk` is the only channel that carries binary data. It is sent
from the hidden render window, validated by `event.sender.id`, and appended in
strict `seq` order. Out-of-order chunks fail the job rather than corrupt the
file. If profiling shows IPC overhead, move it to `MessageChannelMain`; the
contract does not change.

**Copilot (Phase 1.5 contract, Phase 3 UI)**

| Channel | Req | Res |
| --- | --- | --- |
| `motion:copilot-context` | `{ projectId, scope, sceneId?, nodeId? }` | `{ context: MotionCopilotContext }` |
| `motion:copilot-plan` | `{ projectId, baseRevision, request, selection? }` | `{ plan: MotionPlan, message: string }` |
| `motion:copilot-apply` | `{ projectId, planId, baseRevision, approvalToken, confirmedDestructive? }` | `MotionApplyResult` |
| `motion:copilot-cancel` | `{ planId }` | `void` |
| `motion:copilot-stream-text` | event: `{ requestId, delta }` | — |
| `motion:copilot-stream-tool` | event: `{ requestId, tool, status, summary? }` | — |
| `motion:copilot-stream-error` | event: `{ requestId, code, message }` | — |

The plan/apply split is enforced in main: `motion:copilot-plan` never mutates,
and `motion:copilot-apply` validates the token, the revision, and the plan’s
single-use state before returning a new document. The renderer applies the
returned document through the store, which creates one undo entry.

**Shell**

| Channel | Req | Res |
| --- | --- | --- |
| `shell:open-path` | `{ path: string }` | `boolean` |

`shell:open-path` is the generic replacement for `studio:open-path`. Keep the
studio channel as a deprecated alias for one release; do not add a second
Motion-specific copy.

### 16.2.1 Types referenced by the channel table

```ts
export type MotionProjectSummary = {
  id: string;
  name: string;
  path: string;
  sceneCount: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
  thumbnailUrl: string | null;
  updatedAt: string;
  createdAt: string;
  lastOpenedAt: string | null;
  missing: boolean;
  latestRender: { filePath: string; createdAt: string } | null;
};

export type MotionTemplateSummary = {
  id: string;
  name: string;
  description: string;
  category: 'launch' | 'feature' | 'app-store' | 'social' | 'model';
  width: number;
  height: number;
  duration: number;
  sceneCount: number;
  thumbnailUrl: string;
};

export type MotionRecoveryInfo = {
  /** Revision of the sidecar that can be recovered. */
  revision: number;
  savedAt: string;
  /** Revision of the canonical file, when it is readable. */
  canonicalRevision: number | null;
  /** True when the canonical file is missing or unparseable. */
  canonicalDamaged: boolean;
};

export type MotionStagedAsset = {
  importId: string;
  name: string;
  sourceName: string;
  /** Absolute path stays in main; the renderer only sees this URL. */
  probeUrl: string;
  /** Best-effort guess from extension + header sniff. */
  kind: MotionAssetKind | 'unknown';
  mimeType: string;
  byteSize: number;
  /** Present when the probe could determine it without decoding. */
  width?: number;
  height?: number;
};

export type MotionAssetCommit = {
  importId: string;
  kind: MotionAssetKind;
  /** Required for image sequences. */
  fps?: number;
  frameCount?: number;
  /** User-supplied overrides, e.g. a font family name. */
  metadata?: Record<string, unknown>;
};

export type MotionImportError = {
  /** Original path basename, never the full path. */
  name: string;
  code:
    | 'MOTION_IMPORT_UNSUPPORTED'
    | 'MOTION_IMPORT_TOO_LARGE'
    | 'MOTION_IMPORT_UNREADABLE'
    | 'MOTION_IMPORT_PROBE_FAILED'
    | 'MOTION_IMPORT_SEQUENCE_GAP'
    | 'MOTION_IMPORT_LIMIT';
  message: string;
};

export type MotionExportEstimate = {
  durationSeconds: number;
  frameCount: number;
  width: number;
  height: number;
  fps: number;
  estimatedBytes: number;
  estimatedSeconds: number;
};

export type MotionRenderRecord = {
  filePath: string;
  presetId: string;
  revision: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
  bytes: number;
  createdAt: string;
};

export type MotionCopilotContext = {
  project: {
    id: string;
    name: string;
    output: MotionOutputSettings;
    sceneCount: number;
    duration: number;
  };
  brand: MotionBrand;
  activeSceneId: string;
  scenes: Array<{ id: string; name: string; duration: number; nodeCount: number }>;
  selection: MotionSelection;
  playhead: number;
  workArea: MotionWorkArea;
  assets: Array<{
    id: string;
    name: string;
    kind: MotionAssetKind;
    missing: boolean;
  }>;
  lint: MotionLintIssue[];
  recentOps: Array<{ label: string; at: string }>;
  /** Only populated for `scope: 'scene' | 'node' | 'selection'`. */
  nodes?: MotionNode[];
  timeline?: { tracks: number; clips: number; keys: number };
};
```

`MotionAsset` has no `missing` field on disk — it is computed by the asset store
and added to the summary shape only. Keep it out of the document so a stale flag
can never be persisted.

### 16.3 `qeda-media://` extension

The scheme already has two hosts (`studio`, `overlay`). Motion adds two more:

```
qeda-media://motion/<projectId>/<assetId>
qeda-media://motion/<projectId>/<assetId>/<frameIndex>
qeda-media://motion-staging/<importId>
```

- `motion` resolves through the project index and the project’s `assets[]`. The
  handler joins the bundle root with `asset.path`, normalizes, and rejects any
  result outside the bundle (path traversal, symlink escape).
- `motion-staging` serves files from `.staging/<importId>/` for the duration of
  an import so the renderer can probe video/audio/fonts without receiving a
  filesystem path. The allowlist is in memory, keyed by import id, and expires
  after 10 minutes or on `motion:cancel-import`.
- Range requests are supported for video and audio. Images and fonts can be
  served whole.
- `Cache-Control: no-cache` while editing; `ETag` from the asset hash; long
  cache for renders.
- The MIME type comes from the asset record, not the file extension.

The host constants live in `src/lib/studio/media.ts` today. Rename that module
to `src/lib/media/scheme.ts` when Motion lands, and keep re-exports so the
studio code does not churn. The main-process handler stays one file
(`src/main/media-protocol.ts`) so the trust model is reviewable in one place.

### 16.4 Module layout

```
src/main/motion/
  project-store.ts        # bundle CRUD, write protocol, lock, recovery
  project-index.ts        # SQLite index read/write, rescan
  asset-store.ts          # staging, hashing, probe commit, relink, GC
  asset-probe.ts          # header parsing (image-size, gltf-transform)
  render-host.ts          # hidden BrowserWindow lifecycle
  render-jobs.ts          # job state machine, chunk sink, verify, rename
  templates.ts            # template discovery and instantiation

src/main/ipc/handlers/
  motion-projects.ts
  motion-assets.ts
  motion-export.ts
  motion-copilot.ts
```

`serialize.ts` and `preflight.ts` live in `src/lib/motion/`, not
`src/main/motion/`, because both the editor and the render page need them and
both must stay Electron-free. `project-store.ts` imports them; it does not own
them.

- `preflight.ts` and `serialize.ts` are unit tested like the rest of
  `lib/motion`.
- `project-store.ts` owns the only code allowed to write `project.json`.
  Everything else calls it.
- `render-host.ts` owns the hidden window and nothing else. It does not know
  about formats or codecs; that is the render page’s job.

### 16.5 Render window

- A second renderer entry: `src/renderer/motion-render.html` →
  `release/app/dist/renderer/motion-render.js`.
- `electron.vite.config.ts` gains it as an additional `rollupOptions.input` for
  the renderer build. This is a build-config change and must be verified in both
  dev (Vite serves it at `http://localhost:1212/motion-render.html`) and
  packaged builds (`file://.../renderer/motion-render.html`).
- `webPreferences`: `contextIsolation: true`, `sandbox: true`,
  `nodeIntegration: false`, same preload, `backgroundThrottling: false`,
  `offscreen` not used (we need a real WebGL context).
- The window is `show: false`, sized to the output resolution, and destroyed
  after the job.
- Main rejects export channels from any sender other than the current render
  window id.
- The page renders nothing but the export driver: no app shell, no router, no
  providers. It must not import `src/renderer/App.tsx`.

### 16.6 Security checklist

- Every path from the renderer is validated with `fs.realpath` + a bundle-root
  prefix check. Reject symlinks that resolve outside the bundle.
- No channel accepts an arbitrary URL to fetch. `qeda-media://` resolution is
  the only read surface, and it is index-backed.
- The render window loads only the local render page. Navigation and
  `window.open` are blocked with `will-navigate` / `setWindowOpenHandler`.
- CSP for the render page: `default-src 'self'; script-src 'self'; img-src
  'self' data: blob: qeda-media:; media-src qeda-media:; connect-src 'self'`.
  No `unsafe-eval`.
- Project text (node names, asset names) is untrusted input. It is rendered as
  text, never as HTML. No `dangerouslySetInnerHTML` in Motion.
- SVG import rasterizes and strips scripts/external references; the original
  SVG is not served to the renderer.
- Import rejects executables and unknown extensions before copying.
- The copilot has no channel that can read arbitrary files. `motion:stage-assets`
  requires a path the user chose in a native dialog or dropped onto the window.

### 16.7 IPC acceptance criteria

- Every channel in the table is declared in `channels.ts` and has a handler.
- `python3 scripts/verify-ipc-split.py` passes.
- A channel called from a window that does not own the job is rejected.
- No renderer module imports `node:fs`, `node:path`, or `electron`.
- Asset bytes never appear in an `invoke` payload.
- Export chunks arrive in order and the final file verifies.
- A cancelled export leaves no `.part` file and no orphan render window.
- The render window is destroyed on success, failure, and cancel.

---

## 17. Package plan

### 17.1 Adopt now

Versions are pinned exactly. Licenses were read from the published package
metadata while writing this spec; re-verify on upgrade and before any
distribution build.

| Package | Version | License | Phase | Why |
| --- | --- | --- | --- | --- |
| `mediabunny` | 1.64.0 | MPL-2.0 | 1 | MP4/WebM muxing and demuxing over WebCodecs. Replaces the deprecated `mp4-muxer`/`webm-muxer`. Zero dependencies, tree-shakable. |
| `@gltf-transform/core` | 4.5.1 | MIT | 2 | Read glTF/GLB documents, inspect scenes, animations, and bounds without a browser. |
| `@gltf-transform/extensions` | 4.5.1 | MIT | 2 | Understand Draco, KTX2, and Meshopt extensions during import and validation. |
| `@gltf-transform/functions` | 4.5.1 | MIT | 2 | Prune, dedup, and resize textures at import; keep bundles small. |
| `gltf-validator` | 2.0.0-dev.3.10 | Apache-2.0 | 2 | Validate a model before it enters a project. Errors block import, warnings do not. |
| `@react-three/drei` | 10.7.9 | MIT | 1 | `TransformControls`, `OrbitControls`, `useGLTF`, `Html`, `Environment`, `ContactShadows`. Removes hand-rolled gizmo code. |
| `@react-three/test-renderer` | 9.1.1 | MIT | 1 | Test node renderers and scene composition without a real WebGL context. |
| `troika-three-text` | 0.52.5 | MIT | 1 | SDF text with font assets, wrapping, and alignment. Replaces the canvas-texture title. |
| `@dnd-kit/core` | 6.3.1 | MIT | 1 | Hierarchy drag-to-reparent and asset drag-to-viewport. |
| `@dnd-kit/sortable` | 10.0.0 | MIT | 1 | Reordering scenes, tracks, and nodes. |
| `@dnd-kit/modifiers` | 9.0.0 | MIT | 1 | Axis locking and boundary clamping for drags. |
| `@tanstack/react-virtual` | 3.14.24 | MIT | 1 (conditional) | Track and asset virtualization. **Install now, wire only when profiling shows a problem** — see §9.8. |
| `write-file-atomic` | 8.0.0 | ISC | 1 | Atomic project saves. Node 24 (Electron 44) satisfies its engine range. |
| `proper-lockfile` | 4.1.2 | MIT | 1 | Single-writer project lock with stale detection. |
| `image-size` | 2.0.4 | MIT | 1 | Image dimensions from the header without decoding or a native dependency. |

**No new native modules.** Everything above is pure JavaScript or WASM, so
`release/app/package.json` does not change and `bun run rebuild` is unaffected.
If that ever stops being true, the module goes in `release/app/package.json`,
not the root manifest.

### 17.2 Deferred / optional

| Package | Version | License | Phase | Condition |
| --- | --- | --- | --- | --- |
| `draco3dgltf` | 1.5.9 | Apache-2.0 | 2 | Only if the Draco decoder bundled with `three` proves unusable in the render window. `three@0.186.1` ships `examples/jsm/libs/draco/gltf/`. |
| `meshoptimizer` | 1.3.0 | MIT | 2 | Same condition; `three` ships `libs/meshopt_decoder.module.js`. |
| `fflate` | 0.8.3 | MIT | 2 | Zip/unzip for image-sequence import and “export project bundle.” Not needed until those ship. |
| `fontkit` | 2.0.4 | MIT | 2 | Best-effort family/weight extraction on font import. Without it, the user names the font. |
| `@react-three/postprocessing` | 3.2.2 | MIT | 3 | Bloom/DOF presets. Only after the core render is color-correct; post-processing hides color bugs. |
| `@react-three/uikit` | 1.0.78 | MIT | 4 | In-scene UI for interactive artifacts. Useless before the runtime exists. |
| `@react-three/rapier` | 2.2.0 | MIT | 4 | Physics for interactive scenes. Explicitly out of scope for video-first Motion 2.0. |
| `xstate` | 5.33.3 | MIT | 4 | State-machine runtime. Configs are serializable when actions/guards are referenced by name. |
| `@xstate/react` | 6.1.0 | MIT | 4 | React bindings for the runtime player. |

### 17.3 Rejected

| Package | Reason |
| --- | --- |
| `mp4-muxer`, `webm-muxer` | Deprecated by their author in favour of Mediabunny. Do not start a new pipeline on them. |
| `@theatre/studio` | AGPL-3.0-only. Incompatible with shipping a proprietary desktop app, even as a dev dependency that ends up in a bundle. |
| `@theatre/core` | A second sequencing model next to the existing timeline kit. The kit already does canvas rendering, hit-testing, and selection. |
| `remotion` | Custom license with a company-size threshold, and a React-renderer architecture that conflicts with deterministic frame stepping. |
| `ffmpeg-static` | Ships a GPL-3.0 binary. Distribution would force the whole app’s licensing conversation. |
| `@ffmpeg/ffmpeg` (WASM) | ~30 MB of WASM and a second decode/encode path. Keep the system `ffmpeg` (`FFMPEG_PATH`) for GIF only; do not make it the default pipeline. |
| `@autoform/shadcn` | Peer range stops at React 18, and a generic form generator cannot express asset pickers, brand tokens, vector3 scrubbing, or “animate this property.” |
| `react-arborist` | Drags in `react-dnd` and a redux store for a tree we can build with `@dnd-kit` and the existing row components. |
| `sharp` | Native binary per platform, packaging complexity, and a libvips license review for no gain: `image-size` gives dimensions and `createImageBitmap` validates decodability. |
| `probe-image-size` | Unmaintained; `image-size` covers the same ground. |
| `file-type` | Magic-byte sniffing is not a security boundary. Use an extension allowlist plus a real decode check. |

### 17.4 ESM and Jest consequences

`mediabunny`, `troika-three-text`, `@react-three/drei`, and the `@dnd-kit/*`
packages are ESM-first. Per `AGENTS.md`, an ESM-only package that Jest
`require`s fails the entire suite. Adding any of them to a module that tests
import requires **both** a mock in `.erb/mocks/` and a `moduleNameMapper` entry
in `jest.config.js`.

Plan:

- `mediabunny` → mocked. It is only used in the render page and the export
  verifier; tests assert against a fake `Output`/`CanvasSource`, not real
  muxing. Real muxing is covered by the export smoke test, which runs outside
  Jest.
- `troika-three-text` → mocked as a component that renders its `text` prop.
- `@react-three/drei` → mocked narrowly (`TransformControls`, `OrbitControls`)
  for component tests; the R3F test-renderer does not need the real package.
- `@dnd-kit/*` → mocked in hierarchy tests; drag behaviour is covered by a
  small integration test with synthetic pointer events where feasible.
- `@gltf-transform/*` and `gltf-validator` → **not imported statically by any
  module under test.** `asset-probe.ts` loads them through a dynamic `import()`
  behind a `ModelProbe` interface, and unit tests inject a fake prober. This
  keeps the ESM problem out of Jest entirely and makes the probe testable
  without a 4 MB parser.

Do not add a package to `src/lib/motion` or `src/main/db` unless it is CJS or
already mapped. `lib/motion` must stay runnable in plain jsdom.

### 17.5 Bundle and startup budget

- The editor route is lazy-loaded. Motion must not be in the initial bundle.
- `mediabunny` is imported only by the render page, never by the editor.
- `@gltf-transform/*` is main-process only.
- `troika-three-text` and `drei` are editor-only and lazy.
- Budget: the Motion editor chunk should stay under +250 KB gzip over the
  current bundle. Measure with `bun run build` and the Vite output; if it
  exceeds the budget, the cause is almost always a barrel import
  (`import { X } from '@react-three/drei'` pulling the whole package). Import
  from the specific module path where the package supports it.
- Project open budget: < 2s to first paint with 100 assets, because assets are
  lazy and the document is a single small JSON read.

### 17.6 Dependency acceptance criteria

- `bun install` succeeds with no peer warnings that affect React 19.
- `bun run build` succeeds in dev and packaged modes, including the second
  renderer entry.
- `bun test` passes with the new mocks; no ESM `require` failures.
- `bun run lint` passes; no new `@typescript-eslint/no-explicit-any` escapes in
  adapter code.
- `bunx tsc --noEmit` passes.
- `release/app/package.json` is unchanged.
- Every adopted package appears in the license inventory used for distribution.

---

## 18. Testing strategy

### 18.1 Shape of the suite

Motion is a deterministic document engine with a renderer on top, so the test
pyramid is unusually bottom-heavy and that is correct.

| Layer | Tool | Runs in | Speed |
| --- | --- | --- | --- |
| Document, ops, sampling, migration | Jest + jsdom | `bun test` | ms |
| Serialization, preflight, diff | Jest + jsdom | `bun test` | ms |
| React components (panels, dialogs) | Testing Library + jsdom | `bun test` | tens of ms |
| Node renderers | `@react-three/test-renderer` | `bun test` | tens of ms |
| Golden frames | Hidden render window | `bun run test:golden` | seconds |
| Export smoke | Hidden render window + Mediabunny `Input` | `bun run test:export` | seconds |
| Manual OS matrix | Human | Release checklist | minutes |

The first four run on every change. The last three are opt-in because they need
a GPU, a display server, or a codec that may not exist on the machine.

### 18.2 Unit tests (`src/lib/motion`)

**Schema and invariants**

- One fixture per rule in §6.4, each asserting the specific error `code` and
  `path`. A rule without a fixture is not implemented.
- Round-trip: `parse(serialize(doc))` deep-equals `doc` for the starter
  document, a 3-scene fixture, and a fixture with every node type.
- Strict parsing: an unknown top-level key is rejected, not dropped. A
  `schemaVersion: 5` document is rejected with a newer-version error.
- Deterministic serialization: `serialize(doc) === serialize(parse(serialize(doc)))`
  as bytes.

**Ops**

- Every op: happy path, not-found path, invalid-reference path, and a no-op
  path where one exists.
- Batch atomicity: `[valid, invalid]` leaves the input document reference
  unchanged.
- No-op batch returns the same reference and does not bump `revision`.
- Risk classes match the table in §14.5; a test asserts the full map so a new
  op cannot ship without a declared risk.
- `scene.node.remove` cascade: children, channels, scoped tracks, camera
  reference, and model references all resolved; no dangling ids.
- `placement.trim` / `placement.split`: keys outside the window are preserved
  and reported, never deleted.
- `keyframe.add` at `duration + 0.1` throws; at exactly `duration` succeeds.
- `asset.remove` while referenced throws with the reference list.
- `asset.replace` rewrites every reference in one batch and fails atomically on
  a kind mismatch.

**Sampling and evaluation**

- Boundary behaviour: before the first key, after the last key, exactly on a
  key, and at the half-open placement end.
- Trim mapping: `sceneTime = start + (local - trimIn)` in both directions.
- Track order: later track wins; muted contributes nothing; locked still
  evaluates.
- Determinism: sampling the same time twice returns deep-equal frames.
- Purity: evaluation does not mutate the input scene (deep-freeze the fixture
  and assert no throw).
- Missing camera returns a synthetic camera plus a `missing-camera` warning
  rather than throwing.

**Migration**

- v1 → v4, v2 → v4, v3 → v4 fixtures.
- Idempotence: migrating a v4 document is a no-op.
- A v3 loop becomes `workArea` + `playMode`; invalid loop ranges converge to a
  valid work area.
- A v3 blob asset is dropped and its node is marked missing.
- Migration never throws on a document that passed its own schema.

**Recipes and diff**

- Every recipe expands to primitive ops and the expansion is stable.
- `diffMotionDocuments` is ordered and omits unchanged entities.
- Applying a plan then undoing produces a diff that is the inverse set (by
  entity and action), not necessarily the same order.

### 18.3 Component tests

- The inspector is generated from the registry: for each node type, every
  declared prop renders a control of the hinted type, and every animatable prop
  has a diamond.
- Editing a field emits exactly one op on blur/Enter, not per keystroke.
- The hierarchy renders nested nodes, respects `visible`/`locked`, and shows
  warning badges.
- The timeline adapter maps trim windows and key ids correctly (pure function
  tests, no canvas).
- The export dialog disables Export on blocking issues and lists warnings.
- The recovery dialog appears only when the sidecar is newer.
- The copilot plan card renders diff counts, risk, warnings, and requires a
  second confirm for destructive plans.

Use `fireEvent`, not `userEvent` (not installed). Import
`@testing-library/jest-dom` explicitly at the top of component test files.

### 18.4 Renderer tests

`@react-three/test-renderer` mounts the node renderers without WebGL:

- Each node type renders without throwing for its default props.
- Transform composition matches the document for a parent/child pair.
- Opacity inheritance multiplies.
- A missing asset renders the placeholder and a warning, not a crash.
- Disposal: unmounting a node disposes its geometry/material (spy on
  `dispose`).

This catches the class of bug that the current `MotionSceneCanvas` mock hides
(see D1) without needing a GPU.

### 18.5 Golden frames

Opt-in (`bun run test:golden`), because they need a real GL context.

- Fixtures: starter scene at t = 0, 1.0, 2.5; a model scene; a text scene.
- Render at 320×180, read pixels, hash.
- Compare hashes on the same machine. Cross-machine comparison uses a
  perceptual diff with a documented threshold and is advisory, not blocking.
- Store expected hashes in `src/__tests__/fixtures/motion/golden.json` with a
  `renderer` field (GPU vendor + driver) so a hash mismatch is explainable.
- A failed golden test prints the actual PNG next to the expected one. Do not
  overwrite expectations automatically; a human updates them.

### 18.6 Export smoke

Opt-in (`bun run test:export`):

1. Build a 12-frame, 320×180 fixture project.
2. Run the real render host and Mediabunny pipeline.
3. Open the output with Mediabunny `Input`.
4. Assert: one video track, expected width/height, duration within one frame,
   frame count, and a decodable first frame.
5. Assert the file is not a `.part` and the render window is destroyed.

This is the only test that proves the product can produce its primary output.
It must run before any release, even if it is too slow for the inner loop.

### 18.7 Manual release matrix

| Axis | Values |
| --- | --- |
| OS | macOS (arm64), Windows 11, Ubuntu 24.04 |
| GPU | Apple, NVIDIA, Intel integrated |
| Codec | H.264 available / unavailable |
| Display | 100%, 150%, 200% scaling |
| Project | 1 scene / 10 scenes / 100 assets / 4K |
| Input | mouse, trackpad, keyboard-only |

Checklist: create from template → edit → autosave → kill → recover → export →
play the file in QuickTime/VLC/Chrome → verify duration, audio sync, and that
no chrome is visible.

### 18.8 Jest configuration additions

```
moduleNameMapper:
  '^mediabunny$'            → '<rootDir>/.erb/mocks/mediabunny.ts'
  '^troika-three-text$'     → '<rootDir>/.erb/mocks/troika-three-text.tsx'
  '^@react-three/drei$'     → '<rootDir>/.erb/mocks/react-three-drei.tsx'
  '^@dnd-kit/(.*)$'         → '<rootDir>/.erb/mocks/dnd-kit.ts'
```

Every mock exports the minimum surface the app imports, and the mock file
carries a comment naming the real package and the reason. A mock that silently
returns `undefined` for a used export turns a real bug into a passing test.

Add two scripts to `package.json` that launch the built app with a test-only
entry point (a small `--motion-test=<suite>` flag read in `main.ts`):

```
test:golden   → build, then run the golden-frame suite in a real window
test:export   → build, then run the export smoke suite
```

They are deliberately **not** part of `bun test`. `bun test` stays jsdom-only so
it keeps working on a machine with no GPU and no display server. The flag opens
a test entry instead of the app shell; it adds no renderer API.

### 18.9 What is deliberately not tested

- Pixel-identical output across GPU vendors. Documented as an allowed
  difference.
- OS file dialogs and the trash. They are Electron/OS behaviour; test the
  handler boundary with a fake.
- Codec availability. Probe at runtime; do not assert a machine has H.264.
- The LLM itself. Test the tool contract, the plan envelope, and the guards,
  not the model’s prose.

### 18.10 Test acceptance criteria

- Every op, node type, and invariant rule has at least one test.
- `bun test` stays under 60s on the target laptop.
- A deliberate bug in `evaluate.ts` (wrong trim offset) fails at least three
  tests.
- Golden and export tests are documented in the README and run in the release
  checklist.
- No test depends on the wall clock, the network, or a real user directory.

---

## 19. Roadmap

Sizes are relative (S / M / L / XL), not a schedule. Each phase ends with a
demoable artifact and a written exit criterion; a phase that cannot be demoed
is not done.

### Phase 0 — Foundation (S)

**Goal:** make the existing code trustworthy before adding features.

| Work | Deliverable |
| --- | --- |
| P0-1 … P0-8 | The eight defects in §3.2, each with a test. |
| P0-9 | Scene-aware evaluator seam; `MotionFrame` shape. |
| P0-10 | Document v4 types, schema, migration, defaults. |
| Tooling | `bun run build`, `bun test`, `bun run lint`, `bunx tsc --noEmit` all green. |

**Exit:** 39 existing Motion tests still pass; a v3 fixture migrates; the editor
still opens, plays, scrubs, undoes, and redoes.

**Explicitly not in Phase 0:** persistence, export, new node types, UI redesign.

### Phase 1 — No-code core and the first export (XL)

**Goal:** a new user can pick a template, edit it, and get an MP4.

| Area | Deliverable |
| --- | --- |
| Routing | `/motion` browser + `/motion/:projectId` editor; editor split out of `Motion.tsx`. |
| Persistence | Bundle layout, index, atomic save, lock, autosave, recovery, backups. |
| Assets | Stage/commit import, `qeda-media://motion`, thumbnails, relink, missing-asset UI. |
| Scenes | Multi-scene create/duplicate/delete/switch; scene background; camera selection. |
| Inspector | Registry-driven inspector with hints, animation diamonds, multi-select. |
| Viewport | Gizmos via drei, drag-to-place, frame selection, grid/safe area. |
| Hierarchy | dnd-kit reparent/reorder, inline rename, visibility/lock. |
| Timeline | Trim, split, snapping, work area, play modes, key editing. |
| Brand | Brand colors and fonts in the document and inspector; apply-to-selection. |
| Text | troika text replacing the canvas-texture title. |
| Node types | `device.phone`, `device.laptop`, `device.monitor`, `text.body`, `shape.rect`, `shape.ellipse`, `stage.ground`, `screen.video` (preview only). |
| Export | Hidden render window, Mediabunny, H.264 → VP9 fallback, preflight, progress, cancel, verify. |
| Templates | Six templates from §10.2 with a “Make it yours” panel. |

**Exit:** template → edit → export in under 15 minutes; project survives a
forced quit; no document field contains a blob or absolute path.

**Dependencies:** Phase 0. `mediabunny`, `drei`, `troika`, `dnd-kit`,
`write-file-atomic`, `proper-lockfile`, `image-size`.

### Phase 1.5 — Agent contract (M)

**Goal:** the copilot can propose and apply edits through a tested contract,
before any chat UI exists.

| Area | Deliverable |
| --- | --- |
| Ops v2 | Scene-scoped ops, `idMap` duplicates, trim/split, audio ops, brand ops. |
| Plan envelope | `MotionPlan`, diff, risk, warnings, `baseRevision`, expiry. |
| Guards | Revision conflict, approval token, single-use plans, destructive confirm. |
| Manifest | `contractVersion: 2`, JSON Schema per op, `sceneScoped`, `since`. |
| Tools | `describe`, `getDocument`, `getContext`, `query`, `plan`, `apply`, `focus`, `importAsset`, `lint`, `recipe`, `render` — callable without UI. |
| Lint | Document and export lint with stable codes and optional fixes. |
| Recipes | The six recipes from §10.6, expanded to primitives. |

**Exit:** an integration test drives a scripted “add a call to action” through
the tools, applies it, and gets one undo entry. A stale plan is rejected.

**Dependencies:** Phase 1 (needs persistence and the op registry).

### Phase 2 — Production video (L)

**Goal:** the output is good enough to ship a launch film.

| Area | Deliverable |
| --- | --- |
| Master sequence | Sequence items, cuts, crossfades, dips, sequence export. |
| Audio | Import, waveform, placements, gain, fades, mix, AAC/Opus. |
| glTF | Import with validation, animations, Draco/KTX2/Meshopt, turntable thumbnails. |
| Environments | HDR/EXR backgrounds and lighting. |
| Node types | `camera.orthographic`, `light.spot`, `text.badge`. |
| Color | Explicit sRGB/ACES pipeline, transparent-background handling. |
| Render | Queue, 4K, 60fps, PNG sequence, GIF via ffmpeg. |
| Brand | Logo placement, safe-area overlays, “apply brand to scene.” |

**Exit:** a 30s, 3-scene, scored film exports at 1080p30 with audio in sync
within one frame and no visible color shift versus preview.

**Dependencies:** Phase 1. `@gltf-transform/*`, `gltf-validator`, optional
`fflate`/`fontkit`.

### Phase 3 — Copilot UI (M)

**Goal:** the agent contract gets a face.

| Area | Deliverable |
| --- | --- |
| Drawer | Right-side copilot with context chips and scope. |
| Plan cards | Summary, diff, risk, warnings, Show me / Why / Apply / Cancel. |
| Streaming | Text and tool-status streams; no partial ops. |
| Undo | “Applied · Undo” on every applied plan. |
| Guardrails | Destructive second confirm; revision conflicts explained. |
| Settings | Provider/model selection, token budget, “send project context” disclosure. |

**Exit:** ≥ 40% of active users open the copilot; < 5% of applied plans are
undone within 10s.

**Dependencies:** Phase 1.5. Optional `@react-three/postprocessing` for preview
polish, not required.

### Phase 4 — Interactive runtime foundation (L)

**Goal:** the same document can run, not just render.

| Area | Deliverable |
| --- | --- |
| State machines | Serializable XState configs, compile, named actions/guards. |
| Runtime | `StateMachineRuntime`, `send()`, `MotionFrame` unchanged. |
| Actions | Play clip, set visibility, set property, emit event. |
| Present mode | Full-screen player in the editor. |
| Inputs | Pointer/keyboard mappings as document data, not code. |

**Exit:** a two-state button interaction runs in Present mode from the same
document that exports video.

**Dependencies:** Phase 2. `xstate`, `@xstate/react`.

### Phase 5 — Runtime export and polish (M)

**Goal:** ship an interactive artifact and close the remaining gaps.

| Area | Deliverable |
| --- | --- |
| Web export | Self-contained HTML + assets, or a runtime bundle. |
| Batch variants | One project → 16:9, 9:16, 1:1 renders. |
| Templates | Import/export template bundles; community pack format. |
| Performance | Virtualized lists if needed, asset cache tuning. |
| Polish | Command palette coverage, accessibility pass, shortcut sheet. |

**Exit:** a project exports to a folder that runs in a browser without Qeda.

**Dependencies:** Phase 4. Optional `@react-three/uikit`, `@react-three/rapier`.

### Cross-phase rules

- A phase does not start until the previous phase’s exit criteria are met **or**
  the team explicitly records the deferral in this document.
- Every phase adds tests for what it ships. “Tests in the next phase” is how the
  current defects happened.
- No phase adds a second mutation path. If a feature cannot be expressed as
  ops, the op registry is wrong, not the feature.
- No phase ships a destructive action without a confirmation that names the
  consequence.

---

## 20. Risks and open questions

### 20.1 Risk register

Likelihood and impact are judged for the Phase 1–2 window.

| ID | Risk | Likelihood | Impact | Mitigation | Early warning |
| --- | --- | --- | --- | --- | --- |
| R-01 | WebCodecs H.264 is unavailable or broken on a supported machine, so the primary export fails. | Medium | High | Runtime probe; VP9 fallback; preflight blocks before rendering; “Copy diagnostics.” | Export smoke test fails on a tester’s machine. |
| R-02 | Frames differ across GPUs enough that a brand team notices. | Medium | Medium | Deterministic stepping, explicit color management, golden tests, documented allowed differences. | Golden diffs cluster on one vendor. |
| R-03 | The hidden render window exhausts GPU memory on 4K or long projects. | Medium | High | One job at a time, destroy the window, cap resolution, warn above 4K, free textures per frame where possible. | Render crashes at frame N with a GPU reset. |
| R-04 | glTF import accepts a model that renders differently than the designer’s DCC. | High | Medium | `gltf-validator`, explicit warnings, animation names in the inspector, no silent material rewriting. | “It looks wrong” reports on imported models. |
| R-05 | Motion drifts toward a general 3D editor and never finishes. | High | High | Non-goals in §2.6 are normative; new node types need a product justification, not a technical one. | A phase plan contains “sculpt” or “shader graph.” |
| R-06 | The copilot invents ids or ops and produces plans that fail. | High | Medium | Manifest + JSON Schema, `query` before plan, lint gate, revision guard, evaluation metrics. | Failed tool calls above 5% of requests. |
| R-07 | Large projects make the editor sluggish. | Medium | Medium | Lazy assets, canvas timeline, virtualization only when measured, budgets in §7.8. | Scrub above 16ms at 200 keys. |
| R-08 | Autosave or migration loses work. | Low | Critical | Write protocol, sidecar, backups, never-overwrite-corrupt, recovery prompt, migration fixtures. | Any report of a missing change. |
| R-09 | R3F / three / drei versions drift and break renderers. | Medium | Medium | Pin exact versions; upgrade in a dedicated change with golden tests; do not mix `three` copies. | Two `three` versions in the lockfile. |
| R-10 | The canvas timeline is inaccessible to keyboard and screen-reader users. | High | Medium | Keyboard mode, announcements, non-visual scene summary; test with keyboard only. | Accessibility audit finds no focus path. |
| R-11 | A dependency’s license contaminates distribution. | Low | Critical | License column in §17, no AGPL/GPL binaries, re-verify on upgrade, inventory before release. | A new transitive dependency is copyleft. |
| R-12 | Renders and backups consume the disk. | Medium | Low | Retention table §15.9, show cache size, never auto-delete renders. | Disk-full reports. |
| R-13 | ESM-only packages slow development because Jest cannot load them. | High | Low | Mock + map up front (§17.4), keep ESM packages out of `lib/motion`. | “Cannot use import statement outside a module” in CI-less runs. |
| R-14 | Users do not understand relinking and think their project is broken. | Medium | Medium | Plain-language banner, thumbnails, hash match explanation, “Relink all.” | Support requests mentioning “missing.” |
| R-15 | Templates are mediocre, so first-run success collapses. | Medium | High | Treat templates as product surface with design review; test with five external users. | Users create blank projects instead of templates. |
| R-16 | Network drives break atomic rename and locking. | Medium | Medium | Detect `EXDEV`/`EPERM`, warn, offer “Save a copy locally”; read-only mode. | Save failures only on NAS paths. |

### 20.2 Open questions

Each question has a recommendation and a deadline. An unanswered question at
its deadline becomes the recommendation, recorded in the decision log.

| ID | Question | Recommendation | Decide by |
| --- | --- | --- | --- |
| OQ-1 | Do we need a software H.264 encoder for machines without hardware support? | Not in 2.0. VP9 covers the fallback, and a WASM encoder is a large dependency with poor speed. Revisit if > 10% of users hit R-01. | Phase 2 exit |
| OQ-2 | Should the master sequence move into Phase 1.5? | No. Phase 1 can export the active scene and “all scenes as cuts.” Sequence UI is a Phase 2 feature, but the schema ships now. | Phase 1 kickoff |
| OQ-3 | Should assets be shared across projects in a global library? | No for 2.0. Project-local bundles are portable and make deletion safe. A shared library needs reference counting and a migration story. | Phase 3 |
| OQ-4 | Is the brand kit per project or global? | Per project in 2.0, with “import brand from another project” in Phase 2. Global brand is a team feature, and there are no teams. | Phase 2 |
| OQ-5 | Multi-window editing (same project in two windows)? | No. One writer, enforced by the lock. “Focus existing window” instead. | Phase 2 |
| OQ-6 | Autosave cadence for projects over 50 MB of document JSON? | Documents should never reach that size; assets are separate files. If they do, switch to a debounce of 2s and a diff-based sidecar. Measure first. | Phase 1 |
| OQ-7 | How are templates distributed? | Bundled with the app in Phase 1; downloadable packs in Phase 5 with a signed manifest. Never execute template code. | Phase 5 |
| OQ-8 | Should Rive be used for 2D overlays? | Not in 2.0. It would add a proprietary editor dependency and a second runtime for a use case the scene graph already covers. Revisit only if 2D vector animation becomes a top request. | Phase 4 |
| OQ-9 | Which model/provider is the default copilot? | Whatever the user configured for chat; no Motion-specific default. If none is configured, the copilot is hidden with a “Set up a provider” link. | Phase 3 |
| OQ-10 | Do we need 4:5 and 4:3 presets? | Yes, as output presets, not as separate templates. Cheap to add once the aspect-ratio math is centralized. | Phase 1 |
| OQ-11 | Can a scene override the project fps or resolution? | No. Output is a project setting; per-scene overrides make the sequence ambiguous and break frame-exact export. | Phase 2 |
| OQ-12 | Does undo cross scene switches? | Yes. Switching scenes does not clear history and is not itself an undo entry; undoing an edit made in another scene restores that scene’s state and selects it. Test this explicitly. | Phase 1 |

### 20.3 Assumptions that would invalidate parts of this spec

- **Electron stays on Chromium with WebCodecs and WebGL2.** If a future Electron
  drops WebCodecs, the export pipeline needs a new encoder.
- **Projects stay local and single-writer.** Cloud sync or multiplayer would
  replace `revision` with a CRDT and invalidate §15.5.
- **Video remains the primary output.** If interactive becomes primary, the
  timeline/state-machine split and the render host need rethinking.
- **The app remains a desktop app.** A web version changes the filesystem,
  protocol, and native dialog assumptions throughout §11 and §16.

---

## 21. Appendices

### Appendix A — Glossary

| Term | Meaning |
| --- | --- |
| **Project** | A folder containing `project.json`, assets, backups, and renders. The unit a user opens. |
| **Scene** | A self-contained 3D composition with nodes, timeline, camera, and background. |
| **Sequence** | The optional master edit that places scenes on a project timeline with transitions. |
| **Node** | An entry in a scene graph: camera, light, device, surface, model, group, or ground. |
| **Clip** | A reusable animation asset: channels with keyframes on a local timeline. |
| **Placement** | An occurrence of a clip on a track, with `start`, `trimIn`, and `duration`. |
| **Channel** | One animatable property of one node, with keyframes. |
| **Keyframe** | A value at a time, with easing for the outgoing segment. |
| **Work area** | An authoring range inside a scene used for loop preview and “export range.” |
| **Asset** | An imported file plus metadata, addressed by id and stored in the bundle. |
| **Brand kit** | Project-level colors, fonts, logo, safe area, and defaults. |
| **Op** | A serializable, validated, risk-classified document mutation. |
| **Plan** | A validated batch of ops plus preview, diff, risk, warnings, and `baseRevision`. |
| **Frame** | The evaluated scene at a time: nodes, camera, background, audio, warnings. |
| **Runtime** | The interface that produces a `MotionFrame` from a scene and a time. |
| **Preflight** | Blocking and warning checks run before an export. |
| **Bundle** | The project folder on disk. |
| **Sidecar** | `project.autosave.json`, the dirty marker used for crash recovery. |

### Appendix B — Target file map

New or substantially rewritten files. Existing files that are only extended are
not listed.

```
src/lib/motion/
  types.ts                 # v4 document, frame, runtime types
  schema.ts                # Zod schemas + validateMotionDocument
  migrations/
    v1-to-v4.ts
    v2-to-v4.ts
    v3-to-v4.ts
    index.ts
  defaults.ts              # blank project, starter project, default brand
  node-registry.ts         # v2 registry with hints and allowedParents
  nodes/
    devices.ts
    surfaces.ts
    lights.ts
    stage.ts
    models.ts
    cameras.ts
  ops.ts                   # op registry v2
  ops/
    document.ts
    scene.ts
    node.ts
    asset.ts
    timeline.ts
    track.ts
    clip.ts
    placement.ts
    channel.ts
    keyframe.ts
  evaluate.ts              # evaluateMotionFrame(scene, time, context)
  runtime.ts               # MotionRuntime, TimelineRuntime
  diff.ts                  # diffMotionDocuments
  plan.ts                  # plan/apply envelope, revision guard
  lint.ts                  # document + export lint
  recipes.ts               # recipe definitions + expansion
  serialize.ts             # deterministic JSON + hash
  preflight.ts             # Electron-free export checks
  assets.ts                # asset helpers, frame URL/index
  timeline-adapter.ts      # v4 projection with trim

src/hooks/
  use-motion-store.ts      # MotionCommitResult, revision, history
  use-motion-project.ts    # load/save/recovery lifecycle
  use-motion-assets.ts     # import/relink/missing state
  use-motion-export.ts     # job progress/cancel
  use-motion-copilot.ts    # plan/apply/stream (Phase 3)

src/components/motion/
  editor/MotionEditorShell.tsx
  editor/MotionTopBar.tsx
  editor/MotionSceneSwitcher.tsx
  browser/MotionBrowser.tsx
  browser/ProjectCard.tsx
  browser/NewProjectDialog.tsx
  browser/TemplateGallery.tsx
  hierarchy/SceneTree.tsx
  hierarchy/TreeRow.tsx
  inspector/MotionInspector.tsx
  inspector/controls/*.tsx
  assets/AssetLibrary.tsx
  assets/AssetPicker.tsx
  assets/RelinkDialog.tsx
  timeline/MotionTimeline.tsx
  export/ExportDialog.tsx
  export/ExportJobChip.tsx
  recovery/RecoveryDialog.tsx
  copilot/CopilotDrawer.tsx
  copilot/PlanCard.tsx
  scene/MotionSceneCanvas.tsx
  scene/MotionNodeRenderers.tsx
  scene/nodes/*.tsx

src/main/motion/
  project-store.ts
  project-index.ts
  asset-store.ts
  asset-probe.ts
  render-host.ts
  render-jobs.ts
  templates.ts

src/main/ipc/handlers/
  motion-projects.ts
  motion-assets.ts
  motion-export.ts
  motion-copilot.ts

src/main/
  media-protocol.ts        # replaces/absorbs studio-media.ts

src/renderer/
  pages/MotionBrowser.tsx
  pages/MotionEditorPage.tsx
  motion-render.html
  motion-render.tsx

src/__tests__/
  motion-schema.test.ts
  motion-ops.test.ts
  motion-ops-cascade.test.ts
  motion-evaluate.test.ts
  motion-migrations.test.ts
  motion-serialize.test.ts
  motion-diff.test.ts
  motion-plan.test.ts
  motion-recipes.test.ts
  motion-preflight.test.ts
  motion-timeline-adapter.test.ts
  motion-assets.test.ts
  motion-store.test.ts
  motion-inspector.test.tsx
  motion-hierarchy.test.tsx
  motion-export-dialog.test.tsx
  motion-node-renderers.test.tsx
  fixtures/motion/*.json
```

Note the Tailwind rule from `AGENTS.md`: if a new top-level directory under
`src/` is created, add a matching `@source` line in
`src/renderer/index.css`. The directories above are all under existing sources,
so no change is needed — but `src/components/motion/**` must stay under the
already-registered `@source '../components'`.

### Appendix C — Research notes

**WebCodecs probe (Electron 44.10.0, Chromium 152.0.7977.169, Node 24.22.1,
Linux).** Run from a secure context (`http://127.0.0.1`); a `data:` URL is not
a secure context and `VideoEncoder.isConfigSupported` fails there.

| Config | Result |
| --- | --- |
| `avc1.640028` (H.264 High) | supported |
| `avc1.42001E` (H.264 Baseline) | not supported |
| `avc1.4D401F` (H.264 Main) | not supported |
| `hvc1.1.6.L93.B0` (HEVC Main) | not supported |
| `vp09.00.10.08` (VP9 Profile 0) | supported |
| `av01.0.04M.08` (AV1 Main) | supported |

Conclusion: default to H.264 High, fall back to VP9, offer AV1 as opt-in. Probe
at runtime; this table is a data point, not a contract.

**Mediabunny.** MPL-2.0, zero dependencies, tree-shakable. Relevant API:
`Output`, `Mp4OutputFormat`, `WebMOutputFormat`, `CanvasSource`,
`StreamTarget`, `FilePathTarget`, `Input`, `canEncodeVideo`,
`getFirstEncodableVideoCodec`. Supports MP4, WebM, MKV, MOV containers and
AVC/HEVC/VP8/VP9/AV1 video plus AAC/Opus audio, subject to WebCodecs. It
supersedes `mp4-muxer` and `webm-muxer`, which are deprecated.

**glTF decoders bundled with `three@0.186.1`.**

```
node_modules/three/examples/jsm/libs/draco/gltf/
node_modules/three/examples/jsm/libs/basis/
node_modules/three/examples/jsm/libs/meshopt_decoder.module.js
```

Wire them through `GLTFLoader.setDRACOLoader` / `setKTX2Loader` /
`setMeshoptDecoder`. Do not fetch from a CDN: the app is local-first and may be
offline.

**XState v5 serializability.** Configs are serializable when `actions`,
`guards`, and `delays` are referenced by name rather than inlined. Compile with
`setup({ actions, guards }).createMachine(config)`. This is what makes
`scene.stateMachines` storable as JSON. XState is not used for timeline
evaluation: the timeline is deterministic and time-driven, XState is
event-driven.

**`write-file-atomic@8.0.0`** requires a Node version satisfied by Electron 44’s
Node 24.22.1. It writes a temp file in the same directory and renames, which is
what makes the sidecar/canonical protocol safe.

**`@autoform/react@5.0.0`** supports React 19, but `@autoform/shadcn@1.0.1`
peers to React ≤ 18. This is one of the reasons the inspector is registry-driven
(§8.2), not generated by AutoForm.

### Appendix D — Decision log

| ID | Decision | Rationale | Reversible? |
| --- | --- | --- | --- |
| D-01 | Rive is a design reference, not an engine. | Proprietary editor, 2D runtime, wrong medium. | Yes, but costly. |
| D-02 | Video-first; interactive runtime reserved. | The product’s job is launch films; the seam keeps Phase 4 possible. | Yes. |
| D-03 | Multiple scenes in v4, master sequence optional. | Multi-beat stories without forcing a sequence editor in Phase 1. | Yes. |
| D-04 | Seconds authoritative; frames at the boundary. | Re-rendering at a different fps must not retime authored work. | No. |
| D-05 | Ops are the only mutation API. | Agent-native, undoable, testable. | No. |
| D-06 | No generic setter op. | A setter launders destructive changes into `safe`. | No. |
| D-07 | Every copilot plan needs explicit Apply. | The agent is a copilot, not an editor. | No. |
| D-08 | Destructive plans need a second confirm. | Reversibility is not obvious to no-code users. | No. |
| D-09 | Project bundle on disk is the source of truth. | Portability, backup, no database lock-in. | Costly. |
| D-10 | Assets are bundle-relative and hash-addressed; never blob URLs. | Blob URLs die on reload. | No. |
| D-11 | Export uses a hidden `BrowserWindow`, not Node. | WebGL, WebCodecs, and font shaping live in Chromium. | Costly. |
| D-12 | Mediabunny over mp4-muxer/webm-muxer. | The latter are deprecated; Mediabunny is maintained and broader. | Yes. |
| D-13 | Registry-driven inspector, not AutoForm. | Generic forms cannot express asset/brand/animation affordances. | Yes. |
| D-14 | Trim is non-destructive; keys are never deleted by trimming. | Data loss is the worst failure mode in a creative tool. | No. |
| D-15 | Work area is separate from scene duration; export defaults to full scene. | An authoring aid must not silently change output. | Yes. |
| D-16 | One writer, revision-based optimistic concurrency. | Single-user desktop app; CRDTs are unjustified complexity. | Costly. |
| D-17 | `sceneId` is required on scene-scoped ops. | Node ids are scene-local; implicit “active scene” is a bug factory. | No. |
| D-18 | Audio is timeline-level, not a scene node. | Audio must not be parented to a camera or inherit transforms. | No. |
| D-19 | State machines are reserved in the schema, implemented in Phase 4. | Avoids a breaking migration later at near-zero cost now. | No (schema). |
| D-20 | No new native modules. | Keeps packaging and `rebuild` unchanged. | Yes. |
| D-21 | Quantize is destructive. | It merges keys; treating it as `mutating` hides data loss. | No. |
| D-22 | Templates are data, not code. | Safe distribution, community packs later. | No. |
| D-23 | `device.tablet` keeps its name. | Renaming requires a data migration for zero user benefit. | Yes, but not worth it. |
| D-24 | Brand tokens are copied, not live-linked. | Automatic propagation destroys deliberate exceptions. | Yes. |

### Appendix E — References

- `docs/motion-studio-spec.md` — the Phase 1 spec, kept as historical record.
- `src/lib/motion/*` — current v3 implementation and the seed of v4.
- `src/lib/timeline/*`, `src/components/timeline/*` — the neutral timeline kit.
- `src/main/studio-media.ts` — the `qeda-media://` trust model Motion extends.
- `src/main/studio-export.ts` — the existing ffmpeg path, retained for GIF only.
- `AGENTS.md` — build order, IPC rules, schema rules, Tailwind `@source` rule.
- Mediabunny documentation — output formats, sources, codec probing.
- `@gltf-transform` documentation — `NodeIO`, extensions, `prune`/`dedup`.
- XState v5 documentation — `setup()`, serializable configs, named actions.
- Rive documentation — used for authoring ergonomics only, not implementation.

---

*End of spec.*
