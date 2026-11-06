# NovaTrace runtime: frame sampler and document v2

**Status:** proposed
**Phase:** 0 (foundation). Prerequisite for state machines (Phase 1), data binding
(Phase 2), layout (Phase 3) and rigging (Phase 4).
**Dependencies:** `src/lib/trace/types.ts`, `src/lib/trace/migrate.ts`,
`src/lib/trace/runtime/resolve-element.ts`, `src/lib/trace/serialize/svg-markup.ts`,
`src/main/trace/trace-project-store.ts`
**Goal:** one document format that supports several named animations per artboard,
and one pure evaluation path — `sampleFrame` — that every renderer and exporter
consumes. Migration from the current single-timeline document is automatic,
lossless and idempotent.

## 1. Why

Nova Trace evaluates the document in four independent places today:

| Path | File | Consumes |
| --- | --- | --- |
| Editor stage | `runtime/dom-renderer.ts` | `resolveElementAtTime` + raw `element.tracks` |
| Static markup | `serialize/svg-markup.ts` | `resolveElementAtTime` |
| SMIL export | `export/animated-svg.ts` | its own track walk |
| GSAP export | `export/gsap-code.ts` | its own track walk |

They agree by convention, not by construction. `resolve.ts` adds a second copy of
the attribute-overlay loop, and three separate functions compute the same
`baseX/baseY` + offset transform. Every advanced feature (state blending, view-model
bindings, layout, bones) has to land *between* evaluation and output, so the seam
must exist before those features start.

The invariant this spec buys:

> For a document `D` and time `t`, `sampleFrame(D, { timeMs: t })` is the single
> source of truth for what is visible, where it is, and what it looks like.
> Renderers project a frame; they never read tracks.

## 2. Document model v2

### 2.1 Root

#### Transitional naming (PR 1–3)

The v2 root type is `TraceDocument`. During the migration window the editor still
stores the v1 `TraceProject`, so both live in `types.ts`: `TraceProject` is the
single-timeline shape (`elements` at the root), `TraceDocument` is the artboard
shape. Field names are identical, so PR 4 flips the store's document type and
deletes `TraceProject` mechanically. `PropertyTrack.animationId` is optional until
that flip; `migrateTraceDocument` fills it.

```ts
export const TRACE_SCHEMA_VERSION = 2;

export interface TraceDocument {
  id: string;
  schemaVersion: 2;          // absent in v1 documents
  name: string;
  width: number;             // program/publish size
  height: number;
  durationMs: number;        // program duration; see programDurationOf()
  fps: number;

  artboards: Record<string, TraceArtboard>;
  artboardOrder: string[];
  activeArtboardId: string;

  storyboard?: TraceStoryboard;   // unchanged: a cut list over program time
  audioTracks?: AudioTrack[];
  defs?: string;                  // document-level defs, merged after artboard defs

  // Reserved for later phases. Persisted and round-tripped from v2.0 onward;
  // never evaluated until the phase that owns them lands.
  inputs?: TraceInput[];
  stateMachines?: TraceStateMachine[];
  viewModels?: TraceViewModel[];
  bindings?: TraceBinding[];
  components?: Record<string, TraceComponent>;
}

export interface TraceArtboard {
  id: string;
  name: string;
  width: number;
  height: number;
  background?: string;
  elements: Record<string, TraceElement>;
  rootElementIds: string[];
  defs?: string;
  gradients?: Record<string, TraceGradient>;
  animations: TraceAnimation[];
  animationOrder: string[];
  defaultAnimationId: string;
  /** Reserved: set when this artboard is a reusable component definition. */
  componentId?: string;
}

export interface TraceAnimation {
  id: string;
  name: string;
  durationMs: number;
  loop: 'none' | 'loop' | 'pingpong';
  /** Playback multiplier used by the runtime; 1 = authored speed. */
  speed?: number;
  /** Reserved: names a state machine can listen for while this animation plays. */
  events?: string[];
}
```

`TraceElement`, `PropertyTrack`, `Keyframe`, `TraceScene`, `TraceStoryboard`,
`AudioTrack`, `TraceGradient` keep their current shape, with one addition:

```ts
export interface PropertyTrack {
  id: string;
  animationId: string;   // NEW: the animation that owns these keyframes
  property: AnimatableProperty;
  label: string;
  keyframes: Keyframe[];
}
```

### 2.2 Ownership rules

1. An element belongs to exactly one artboard (implicit: the artboard it lives in).
2. A track belongs to exactly one animation, in the same artboard as its element.
3. Keyframe times are animation-local milliseconds, clamped to
   `[0, animation.durationMs]` on write, not on sample.
4. Scenes are a document-level cut list over `project.durationMs`. They do **not**
   filter rendering: today's stage renders every element regardless of scene, and
   v2 preserves that (see §3.4).
5. `project.durationMs` remains stored (browsers, publish, index rows and embeds
   read it), but it is derived: `programDurationOf(project)` = max over artboards of
   `max(animation.durationMs)` when a storyboard is absent, else
   `max(storyboardDuration, max(animation.durationMs))`. The store writes the derived
   value on every save. v3 may drop the stored copy.

### 2.3 Reserved shapes

Declared now so Phases 1–3 need no second migration. Only the field names are
committed here; their internal shape is owned by the phase that implements them.

```ts
export interface TraceInput {
  id: string; name: string;
  type: 'bool' | 'number' | 'trigger';
  defaultValue: boolean | number;
}

export interface TraceStateMachine { id: string; name: string; /* Phase 1 */ }
export interface TraceViewModel { id: string; name: string; /* Phase 2 */ }
export interface TraceBinding { id: string; /* Phase 2 */ }
export interface TraceComponent { id: string; artboardId: string; /* Phase 3 */ }
```

## 3. Frame sampler

### 3.1 Types

```ts
export type FrameTransform = {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  originX: number;
  originY: number;
};

export type FrameElement = {
  id: string;
  artboardId: string;
  type: TraceElementType;
  name: string;
  parentId: string | null;
  childrenIds: string[];
  visible: boolean;
  opacity: number;
  transform: FrameTransform;
  /** Resolved base attributes overlaid by tracks and bindings. */
  attributes: Record<string, unknown>;
};

export type TraceFrame = {
  artboardId: string;
  animationId: string;
  timeMs: number;
  durationMs: number;
  width: number;
  height: number;
  background?: string;
  elements: Record<string, FrameElement>;
  rootElementIds: string[];
  defs?: string;
  gradients?: Record<string, TraceGradient>;
};

/** One animation contributing to a frame. Phase 1 uses more than one. */
export type FrameLayer = {
  animationId: string;
  timeMs: number;
  weight: number;
  speed?: number;
};

export type SampleOptions = {
  timeMs: number;
  /** Single-animation sampling. Mutually exclusive with `layers`. */
  animationId?: string;
  layers?: readonly FrameLayer[];
  /** Sample a specific artboard instead of `activeArtboardId`. */
  artboardId?: string;
  /** Optional: restrict to one scene plus scene-less elements. Never implicit. */
  sceneId?: string | null;
  /** Phase 2 hook. Ignored in v2.0. */
  bindings?: Readonly<Record<string, unknown>>;
};

export function sampleFrame(
  project: TraceDocument,
  options: SampleOptions,
): TraceFrame;
```

`sampleFrame` runs `migrateTraceDocument` on its input first (single choke point),
so a v1 document handed to a v2 player still evaluates correctly.

### 3.2 Evaluation order

1. Resolve artboard: `project.activeArtboardId`; unknown id → first in
   `artboardOrder`; empty artboard list is a lint error, not a throw.
2. Resolve animation: `options.animationId` → `artboard.defaultAnimationId` → first
   in `animationOrder`.
3. Clamp `timeMs` to `[0, animation.durationMs]`. Never wrap; looping is the
   caller's job.
4. Walk `artboard.elements`. Skip elements whose `sceneId` is set and differs from
   `options.sceneId` **only when `options.sceneId` is provided**.
5. Overlay tracks whose `animationId` is in the active layer set (one layer today),
   in `element.tracks` order, last write wins. A layer with weight 0 contributes
   nothing; a property absent from a layer falls through to the base attribute.
6. Resolve motion path (see §3.3). Motion path overrides `x`/`y`; it never overrides
   `rotation`, `scaleX`, `scaleY` or `opacity`.
7. Apply bindings — no-op in v2.0.
8. Compose the transform using the document convention: `baseX/baseY` is layout,
   `x`/`y` is an animated offset; without a base pair `x`/`y` is the position.
9. Coerce: opacity clamped to `[0, 1]`, non-finite numbers replaced by their
   defaults (`scale` 1, everything else 0), `visible` defaults to `true`.
10. Deep-copy attribute bags. Returned frames never alias document objects.

### 3.3 Motion path and the `pathProgress` split

`pathProgress` currently means two different things: motion-path position in
`resolve-element.ts` and `textPath` `startOffset` in `dom-renderer.ts`. v2 splits
them:

- `pathProgress` — **text on path offset**, percent `0..100`, applied to
  `textPath.startOffset`. Unchanged semantics.
- `motionPathProgress` — **position along a motion path**, percent `0..100`.

Sampling rules for `motionPathProgress`:

- Path source: `attributes.motionPathData`, else the element's own `d` when
  `type === 'path'`, else no path (track is inert).
- Sample by arc length over flattened anchors/segments from `path/model.ts`, not the
  current M/L-only estimator. Curves must contribute their real length.
- `x`/`y` become the sampled point with the `baseX/baseY` convention preserved
  (base untouched, offset recomputed).
- `autoRotate: true` sets `rotation = tangentAngle(point) + rotationOffset`. The
  current implementation adds `rotationOffset` without ever computing the tangent —
  this spec fixes that defect deliberately.

`motionPathProgress` must be added to `AnimatableProperty` and to the element
registry for `path`, `circle`, `rect`, `image`, `text` and `group`.

The compatibility wrapper (`resolveElementAtTime`) keeps legacy all-track
evaluation but shares this motion maths, so the tangent fix reaches the editor as
soon as the sampler lands. No shipped template or recipe uses `autoRotate`, so
the parity tests are unaffected.

### 3.4 Blending (the state-machine seam)

One layer is exact evaluation. Multiple layers normalize their weights and combine:

| Value kind | Rule |
| --- | --- |
| number | `Σ (w · v)` over layers that define the property |
| color | channel-wise lerp over layers that define it |
| discrete (`text`, `points`, `d`, `href`) | value from the highest-weight layer; ties go to the earlier layer |

A property is "defined" by a layer only when that layer's animation has a track for
it on that element. Undefined contributes nothing; if no layer defines it, the base
attribute wins. Single-layer frames must be bit-identical to today's output — the
parity test in §8 enforces that.

Color parsing becomes strict at the sampler boundary: hex3, hex4, hex6, hex8,
`rgb()`, `rgba()` and the named list. Unparseable colors fall back to the
dominant layer's value. The current 50 % jump in `animation/color-math.ts` is a
bug for `rgba()` templates and must not survive into blending.

### 3.5 Purity, determinism, budget

- No `Date.now()`, `Math.random()`, DOM, `Intl`, or locale-dependent formatting
  inside `sampleFrame` or anything it calls.
- Same document + options → deep-equal frames, every time, in every process.
- No linting, no diffs, no JSON serialization per frame.
- Budget: ≤ 1 ms for 200 elements / 600 tracks in Node (sampler only); ≤ 4 ms for a
  full stage frame including DOM writes in the Electron renderer.
- A dev-only `assertFrameFrozen` may deep-freeze returned frames; production must
  not pay for it.

### 3.6 Backends

| Backend | Consumer | Notes |
| --- | --- | --- |
| `SvgDomBackend` | editor stage | mutates mounted nodes by `#trace-elem-<id>`, keyed diff per frame |
| `StaticSvgBackend` | poster, thumbnail, publish | `staticSvgMarkup(frame)` |
| `SmilBackend` | animated SVG export | samples per keyframe edge, emits `<animate>` |
| `GsapBackend` | code export | samples poster frame + timeline |
| `Canvas2DBackend` | Phase 1 player, video export | `Path2D` cache, same frame contract |

Backends receive `TraceFrame` only. `elementBodyMarkup(elementLike, attributes)`
stays the shared body builder so bodies cannot drift between stage and export.

## 4. Ops

Existing ops keep their names; they become artboard/animation scoped. `applyOps`
stays atomic and keeps returning `inverse` via a `restore` snapshot.

New and changed ops:

```ts
| { type: 'addArtboard'; artboardId?: string; name?: string; width?: number; height?: number }
| { type: 'renameArtboard'; id: string; name: string }
| { type: 'removeArtboard'; id: string }
| { type: 'setActiveArtboard'; id: string }
| { type: 'setArtboardBackground'; id: string; background?: string }
| { type: 'addAnimation'; artboardId?: string; animationId?: string; name?: string; durationMs?: number; loop?: TraceAnimation['loop'] }
| { type: 'renameAnimation'; artboardId?: string; id: string; name: string }
| { type: 'setAnimationDuration'; artboardId?: string; id: string; durationMs: number }
| { type: 'removeAnimation'; artboardId?: string; id: string }
| { type: 'duplicateAnimation'; artboardId?: string; id: string; animationId?: string; name?: string }
```

Changed:

- `setTrack` gains `animationId?: string` (defaults to the artboard's default
  animation); the op writes `track.animationId`.
- `setCanvas` gains `artboardId?: string`; document-level `durationMs`/`fps` remain
  document-scoped and re-derive `programDurationOf`.
- `restore` snapshot gains `artboards`, `artboardOrder`, `activeArtboardId` and drops
  the flat element fields. Snapshots are version-tolerant: a v1 snapshot restores by
  migration.
- `addElement`, `duplicateElement`, `insertFragment`, `applyRecipe` accept
  `artboardId?: string`, defaulting to the active artboard.

Invariants enforced by ops (each maps to a lint code in §5):

1. At least one artboard; removing the last artboard fails with
   `ARTBOARD_LAST_REMOVED`.
2. At least one animation per artboard; removing the last fails with
   `ANIMATION_LAST_REMOVED`.
3. Element and track ids are unique **within an artboard**; ids remain globally
   unique by construction (`trc_`/recipe prefixes), which keeps DOM ids stable.
4. A track's `animationId` must exist in the element's artboard.
5. `setAnimationDuration` shorter than a keyframe time clamps keyframes and emits a
   warning diagnostic — it does not silently drop them.

## 5. Lint

Add to `DiagnosticCode` (codes are a stable agent contract):

```
ARTBOARD_NOT_FOUND
ARTBOARD_EMPTY
ARTBOARD_LAST_REMOVED
ANIMATION_NOT_FOUND
ANIMATION_EMPTY
ANIMATION_LAST_REMOVED
ANIMATION_DURATION_INVALID
TRACK_ANIMATION_MISMATCH
MOTION_PATH_INVALID
SCENE_OVERFLOW
```

- `SCENE_OVERFLOW` (`info`) replaces the current misuse of `SCENE_NOT_FOUND` for
  "scene ends after the program duration". `SCENE_NOT_FOUND` keeps its original
  meaning: an element references a scene id that does not exist.
- `TRACK_ANIMATION_MISMATCH` (`error`): a track whose `animationId` is not in its
  artboard, or whose element is in another artboard.
- `MOTION_PATH_INVALID` (`warning`): `motionPathProgress` with no resolvable path.
- `ANIMATION_EMPTY` (`info`) for an animation with no tracks; `ARTBOARD_EMPTY`
  (`info`) likewise.

Lint stays out of the sampler and out of `sampleFrame`'s call graph.

## 6. Migration

### 6.1 Where it runs

One function, used by the store, publish, export and the sampler:

```ts
export type TraceMigration = {
  project: TraceDocument;
  changed: boolean;
  from: 1 | 2;
};

export function migrateTraceDocument(input: unknown): TraceMigration;
export class TraceSchemaNewerError extends Error {
  code: 'TRACE_SCHEMA_NEWER';
}
```

- `schemaVersion` missing or `1` → migrate.
- `schemaVersion === 2` → legacy element pass only.
- `schemaVersion > 2` → throw `TRACE_SCHEMA_NEWER`. Callers show "made with a newer
  version" and offer the project folder instead of overwriting.

`migrateTraceProject` (the existing compound-element expansion) stays exactly as it
is and always runs first: `counter`, `progress-ring`, `bar-chart`, `kinetic-text`,
`lower-third`, `shape`, `star` and `spline-tracer` must keep expanding to primitives
before the structural wrap, because expansion creates tracks that need an
`animationId`.

### 6.2 v1 → v2 algorithm

Deterministic and allocation-light. Ids are fixed literals so tests and snapshots
are stable.

1. `project = migrateTraceProject(input)` (legacy element expansion).
2. `storyboard = ensureStoryboard(project)`.
3. Create artboard `ab-default`, name `"Artboard 1"`, `width`/`height` copied from
   the document, `background` from the active scene's background when present.
4. Move `elements`, `rootElementIds`, `defs`, `gradients` into the artboard. The
   document keeps `defs` only if it already had document-level defs outside an
   artboard; otherwise it is left undefined.
5. Create animation `anim-default`, name `"Animation 1"`,
   `durationMs = project.durationMs || TRACE_DEFAULT_DURATION_MS`,
   `loop: 'loop'`.
6. For every element, every track: set `animationId = 'anim-default'` when missing.
7. Split ambiguous `pathProgress` tracks:
   - no `motionPathData` → leave as `pathProgress` (text-on-path offset).
   - `motionPathData` and no `textPathTargetId` → rename the track to
     `motionPathProgress`, keep its id and keyframes.
   - both `motionPathData` and `textPathTargetId` → keep `pathProgress` for the text
     offset and append a duplicate track with id `${track.id}__motion` and property
     `motionPathProgress`, so both authored behaviours survive.
8. Set `artboardOrder: ['ab-default']`, `activeArtboardId: 'ab-default'`,
   `artboards: { 'ab-default': artboard }`, `schemaVersion: 2`.
9. `durationMs`, `fps`, `width`, `height` stay on the document so index rows,
   thumbnails, publish and embeds keep reading them.
10. Preserve unknown fields verbatim on both the document and each element/artboard,
    so a v2 file written by a newer minor version survives a round-trip.

### 6.3 Idempotency

`migrateTraceDocument` returns `changed: false` **and the same object reference**
when: `schemaVersion === 2`, no legacy element types exist, every track has a valid
`animationId`, no `pathProgress` track is left on an element that has
`motionPathData` but no `textPathTargetId`, and every artboard has a valid
`defaultAnimationId`. This is the same early-return discipline
`migrateTraceProject` already uses (`if (legacyElements.length === 0) return
project`), and tests should assert identity with `toBe`.

### 6.4 Persistence

The bundle envelope and the document version are separate numbers and must not be
confused:

```ts
type ProjectFile = {
  format: 2;          // envelope: 1 today; 2 adds schemaVersion + backup discipline
  schemaVersion: 2;   // document
  revision: number;
  savedAt: string;
  project: TraceDocument;   // v1 payloads migrate on read, before this type applies
};
```

- Read accepts `format: 1` (no `schemaVersion`) and `format: 2`; writes `format: 2`.
- First time a v1 bundle is written as v2, write `project.v1.json` beside it, once,
  before the atomic `project.json` write. Backups are never overwritten.
- `readBundle` runs `migrateTraceDocument`; `TRACE_SCHEMA_NEWER` surfaces as
  `TRACE_SCHEMA_NEWER` (not `TRACE_PROJECT_UNREADABLE`) so the UI can distinguish
  "corrupt" from "newer".
- The index (`trace_projects`) gains `schema_version`, `artboard_count`,
  `animation_count` via `CREATE_TRACE_PROJECTS` migration; the table stays
  rebuildable by scanning. `scene_count` keeps its current meaning.
- `normalizeTraceProjectForPublish` migrates and writes the derived
  `programDurationOf` into `durationMs`, so a published embed carries a v2 document
  with a stable duration.

### 6.5 Compatibility guarantees

1. A v1 project opens, migrates in memory, and is written as v2 on the next save.
2. A v1 published embed keeps playing: players call `migrateTraceDocument` before
   sampling.
3. A v2 project opened by an older build fails cleanly (`TRACE_SCHEMA_NEWER`) and is
   not modified.
4. Migration never mutates its input object graph; only changed branches are copied.

## 7. Files to touch

Ordered; each step compiles on its own.

1. `src/lib/trace/types.ts` — v2 types, `motionPathProgress`, `PropertyTrack.animationId`.
2. `src/lib/trace/schema.ts` *(new)* — `TRACE_SCHEMA_VERSION`, `isTraceDocument`,
   `TraceSchemaNewerError`.
3. `src/lib/trace/document.ts` *(new)* — `activeArtboard`, `animationOf`,
   `programDurationOf`, `elementsInScene`, `tracksOf(element, animationId)`.
4. `src/lib/trace/migrate.ts` — add `migrateTraceDocument`; keep the element pass.
5. `src/lib/trace/runtime/frame.ts` *(new)* — `sampleFrame`, layer blend, arc-length
   path sampling, strict color parsing.
6. `src/lib/trace/runtime/resolve-element.ts` — reduce to a wrapper over
   `sampleFrame` for one element; mark deprecated.
7. `src/lib/trace/runtime/dom-renderer.ts` — consume `FrameElement`; keep
   `applyTrackValue` as the projection step.
8. `src/lib/trace/serialize/svg-markup.ts` — `staticSvgMarkup(frame)`; recursive
   nesting built directly instead of `.replace('</g>', …)`.
9. `src/lib/trace/export/animated-svg.ts`, `export/gsap-code.ts` — sample frames;
   no direct track reads.
10. `src/lib/trace/ops/types.ts`, `ops/index.ts` — artboard/animation ops,
    `setTrack.animationId`, snapshot v2.
11. `src/lib/trace/lint.ts`, `lint/types.ts` — new codes, `SCENE_OVERFLOW` fix.
12. `src/lib/trace/publish.ts` — migrate + derived duration.
13. `src/stores/trace/slices/{document,tracks,storyboard}-slice.ts` — artboard and
    animation actions, animation-scoped tracks, snapshot shape.
14. `src/components/trace/TraceEditor.tsx` — artboard + animation selectors in the
    header; drop the per-edit timeline recompile (only duration changes invalidate).
15. `src/components/trace/{TraceTimeline,TraceElementsTree,TraceInspector}.tsx` —
    current animation scope; scene markers stay on the timeline.
16. `src/main/trace/trace-project-store.ts` — format 2, schema guard, backup.
17. `src/main/trace/trace-project-index.ts`, `src/main/db/schema.ts`,
    `src/main/trace/service.ts` — new columns and summary fields.
18. Tests (§8).

## 8. Tests and acceptance

New test files:

- `trace-frame.test.ts` — purity and identity of recomputation; time clamping;
  `animationId` filtering; base/offset transform convention; opacity clamp; scene
  filter optionality; motion-path precedence; `autoRotate` tangent; layer blending
  (numbers, colors, discrete dominance, missing property fallthrough); strict color
  parsing (`rgba()` no longer jumps).
- `trace-migration-v2.test.ts` — v1 → v2 structure; idempotent second call returns
  the same reference; `pathProgress` split for all three cases; legacy compound
  elements still expand; unknown fields preserved; `schemaVersion: 3` throws
  `TRACE_SCHEMA_NEWER`; input object not mutated.
- `trace-artboards.test.ts` — add/rename/remove/duplicate artboard and animation;
  last-artboard and last-animation invariants; undo restores the previous document;
  `setAnimationDuration` clamps keyframes with a warning.
- `trace-frame-parity.test.ts` *(PR 2)* — for all seven composition templates and
  the five recipes, `sampleFrame` matches `resolveElementAtTime` element by element
  at `t ∈ {0, 500, 1000, duration}`. PR 3 extends this into
  `trace-export-parity.test.ts`, comparing the DOM backend's attribute map against
  `staticSvgMarkup(sampleFrame(...))`. Together they are the gate that keeps the
  four old paths from drifting again.
- `trace-sampler-perf.test.ts` *(opt-in)* — 200 elements, 600 tracks, 600 samples
  under budget; asserts no lint call and no `JSON.stringify`.

Update the existing eight `trace-*.test.ts` files to build documents through
`migrateTraceDocument(createBlankTraceProject())` or a shared
`createTestDocument()` helper.

Acceptance criteria:

1. All seven templates produce byte-identical static SVG at `t = 0` before and
   after the refactor (golden hashes committed with the change).
2. One project holds three animations on one artboard; each plays in the editor and
   exports independently.
3. `sampleFrame` is pure: two identical calls deep-equal, and a frozen document
   throws on any attempted mutation.
4. `bun run typecheck` and the Trace jest suite pass; `bun run lint` passes for
   touched files.
5. A v1 bundle opens, migrates, saves as `format: 2` with a `project.v1.json`
   backup, and reopening it is a no-op (`changed: false`).
6. A v1 published embed still plays through the v2 sampler.
7. No renderer or exporter outside the compatibility wrapper (`resolve-element.ts`)
   evaluates `element.tracks` directly; UI code may still read tracks for editing.
   Review gate: grep for `element.tracks` under `runtime/`, `serialize/` and
   `export/`.
8. Sampler budget met on the perf test document.

## 9. Rollout

Five PRs, each shippable and reversible:

1. **Types + document helpers + migration + tests.** No behaviour change; the store
   still writes `format: 1` until PR 5.
2. **`sampleFrame` + compatibility wrapper + parity tests.** Editor keeps using the
   wrapper, so output must not change.
3. **Rewire stage, static SVG, SMIL and GSAP to frames.** Delete the duplicated track
   walks in `resolve.ts`.
4. **Ops, store and editor surfaces** (artboard/animation selectors, animation-scoped
   tracks, undo snapshots).
5. **Persistence and publish** (`format: 2`, schema guard, backup, index columns,
   embed compatibility).

## 10. Decisions and rejected alternatives

| Decision | Rejected alternative | Why |
| --- | --- | --- |
| One root `TraceDocument`; the v1 `TraceProject` stays beside it until PR 4 | Rename the root in a single step | A repo-wide rename would leave every intermediate PR uncompilable; the shapes share field names, so PR 4 flips the store mechanically |
| `PropertyTrack.animationId` | `animation.tracks: Record<elementId, PropertyTrack[]>` | Keeps element-centric timeline, inspector, ops and auto-keyframe working; far smaller diff |
| Elements move into artboards | Artboards reference a shared element pool | Two sources of truth would let an element appear in two artboards and break DOM-id stability |
| Scenes stay a document-level cut list | Turn scenes into animations | A cut list and a playable clip are different objects; three animations can share one scene set |
| Sampler never filters by scene unless asked | Filter by active scene by default | Today's stage renders all elements; silent filtering would change existing projects |
| Store derived `durationMs` on save | Drop it in v2 | Index rows, publish and embeds read it; removal belongs in v3 |

## 11. Open questions

1. Should a track be allowed to exist in more than one animation (shared timing)?
   Recommendation: no — duplicate instead, revisit with component overrides.
2. Does the timeline show other animations' keyframes dimmed, or only the active
   animation? Recommendation: dimmed, read-only, in a collapsed lane.
3. Do artboards get their own program offset for the storyboard, or is the storyboard
   always artboard 1's program? Recommendation: always artboard 1 until nesting
   lands in Phase 3.
4. Is `motionPathProgress` a per-element property or a track type? Recommendation:
   property, so keyframes, inspector and export reuse existing machinery.

## 12. What this unblocks

- **Phase 1 (state machines):** `FrameLayer[]` is the blend contract; transitions
  produce layers instead of new renderers.
- **Phase 2 (data binding):** step 7 of the sampler is the binding hook; bindings
  never touch tracks.
- **Phase 3 (layout):** layout resolution slots between track overlay and transform
  composition.
- **Phase 4 (rigging):** bones are transform composition over the same
  `FrameTransform`, and `applyPose`/`setBoneRotation` stop being unsupported ops.
- **Video export:** the existing hidden-window pattern in
  `src/main/motion/render-host.ts` can drive a Trace render window that samples
  frames and encodes them, without a DOM-only renderer in the way.
