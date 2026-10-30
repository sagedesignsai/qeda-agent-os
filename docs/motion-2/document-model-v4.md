# Document model v4

**Phase:** 0/1
**Dependencies:** `phase-0-foundation.md` (P0-9, P0-10)
**Master spec:** §6.1–§6.12
**Goal:** replace the single-scene v3 document with a multi-scene, asset-backed,
versioned v4 document that can carry Motion 2.0 through Phase 5 without another
breaking migration.

## Principles (normative)

1. The document is the product. Editor, copilot, renderer, and tests all read and
   write the same versioned JSON. No parallel editor state that can drift.
2. Seconds are authoritative. Frames are a boundary constraint, not a storage
   unit. Changing `fps` must not silently rewrite authored timing.
3. Every id is stable and globally unique within its namespace. Ops take ids as
   parameters; replaying a batch produces the same document.
4. The document is renderer-independent. `src/lib/motion` stays free of React,
   Electron, DOM, and WebGL.
5. Reserved fields are honest: parsed, validated, round-tripped, ignored by the
   runtime. Not a promise that the feature works today.
6. Strict parsing, loud failure. A document written by a newer build fails with
   an actionable message instead of dropping fields.

## Schema version

```ts
export const MOTION_SCHEMA_VERSION = 4;
```

## Core types

The full type definitions live in `src/lib/motion/types.ts`. The normative
shapes are in master spec §6.2. Summary of the root:

```ts
export type MotionDocument = {
  schemaVersion: 4;
  revision: number;              // monotonic edit counter
  meta: MotionMeta;             // id, name, createdAt, updatedAt, output (fps/w/h)
  brand: MotionBrand;           // project-level brand kit
  assets: MotionAsset[];        // imported files, bundle-relative
  scenes: MotionScene[];        // >= 1
  activeSceneId: string;
  sequence?: MotionSequence;     // optional master sequence (Phase 2)
};
```

Each `MotionScene`:

```ts
export type MotionScene = {
  id: string;
  name: string;
  nodes: MotionNode[];
  timeline: MotionTimeline;
  cameraId: string | null;      // null = first camera node
  background?: MotionBackground;
  stateMachines?: MotionStateMachineDefinition[];  // reserved, Phase 4
};
```

## What changed from v3 (and why)

| Change | Reason |
| --- | --- |
| `scene` → `scenes[]` + `activeSceneId` | Multiple beats, reusable scenes, master sequence. |
| `revision` at root | Optimistic concurrency for autosave and the copilot. |
| `brand` at root | One brand kit per project; assets shared. |
| `assets[].path` + `hash` | Durable, relocatable, verifiable. Blob URLs cannot survive reload. |
| `timeline.loop` → `workArea` + `playMode` | Loop is one play mode, not the timeline's identity. |
| `placement.trimIn` + `duration` | Non-destructive trimming; a clip can be placed multiple times. |
| `timeline.audio[]` | Audio is not a scene node; must not be parented to a camera. |
| `scene.background` | Transparent for overlays or environment map. |
| `sequence` optional | Phase 1–1.5 projects don't need a master sequence. |
| `stateMachines` optional | Reserving now avoids a breaking migration in Phase 4. |

## Invariants

`validateMotionDocument(doc)` enforces these. Each rule has a stable `code`.
Full list in master spec §6.4. Summary by group:

**Document:** `schemaVersion === 4`; `revision` non-negative integer;
`meta.name` non-empty after trim; `meta.output.fps ∈ [1,240]`;
`meta.output.width/height ∈ [16,16384]` integers; `scenes.length >= 1`; scene ids
unique; `activeSceneId` resolves; sequence items reference scenes.

**Scene:** node ids unique; every `parentId` resolves in-scene; parent graph
acyclic; node types registered; props validate against `propsSchema`; `cameraId`
resolves to a camera node; state machine ids unique with valid targets.

**Timeline:** `duration > 0`; work area `0 <= start < end <= duration` when
enabled; track/clip/placement/channel/keyframe/audio ids unique; placements
reference clips; `targetId` resolves or null; `placement.start >= 0`,
`trimIn >= 0`, `duration > 0`, `trimIn + duration <= clip.duration + 1e-9`;
placements may extend past `timeline.duration` (renderer clips, UI shows
overflow badge); audio placements reference audio assets; audio gain `[0,2]`,
fades non-negative and `fadeIn + fadeOut <= duration`.

**Clips/channels:** one channel per `(targetId, property)` per clip; keyframe
times strictly ascending; every keyframe time in `[0, clip.duration]`; cubic
control points in the unit square.

**Assets:** ids unique; `path` relative with `/`, no `..`, no scheme; `hash`
64 lowercase hex except `builtin` assets (`hash === 'builtin'`,
`path` starts with `builtin/`) and legacy (`hash === ''`, blocks export); kind
rules (image: 1 frame; image-sequence: >1 frame + fps; video: duration + dims;
audio: duration; font: format; model: glb/gltf; environment: hdr/exr); every
asset reference resolves.

**Sequence (Phase 2):** `duration > 0`; item ids unique; `start >= 0`,
`duration > 0`, `start + duration <= sequence.duration`; sorted by start;
transitions valid.

**Brand:** colors valid CSS hex; safe area `[0,0.5]`; cornerRadius >= 0;
defaults.duration > 0.

## Timeline semantics

- **Clips are reusable; placements are occurrences.** A clip owns keyframes on
  `[0, clip.duration]`. A placement says where it appears and which slice is
  used: `visible local range = [trimIn, trimIn + duration]`; scene time `t`
  maps to local time `trimIn + (t - placement.start)`.
- **Half-open placement end.** Active when `start <= t < start + duration`.
  Avoids double-applying a value at a cut.
- **Overlaps allowed.** Later in the `placements` array wins. Ops sort by
  `start` then id. UI shows an overlap badge and offers "trim to remove
  overlap"; never silently deletes keys.
- **Tracks evaluated in document order.** Later track overrides earlier for the
  same `(node, property)`. Muted contributes nothing; locked still evaluates.
  No solo in v4 (UI filter only).
- **Work area vs. scene duration.** `duration` is authored length; work area is
  the focused range driving loop playback and "export work area." Default work
  area is full scene, `enabled: false`. Enabling never changes keyframe times.
- **Play modes.** `once` plays to the end and stops. `loop` wraps to work-area
  start (or full scene if disabled). `ping-pong` reverses at the ends.
  Ping-pong is preview-only in Phase 1; export uses `once`.
- **Audio.** Mixed over the scene timeline; does not affect visual evaluation.
  Preview plays through an `AudioContext` slaved to the playback clock; visual
  clock wins on drift.
- **Quantization.** `timeline.quantizeToFps` snaps every keyframe to the output
  frame grid and merges keys that collapse onto one frame (later wins). Explicit,
  destructive, confirmed. Changing `fps` does not quantize.

## Scene model

- One camera active at a time via `cameraId`. A scene may contain multiple
  camera nodes; switching is an editor action changing `cameraId`, not a cut.
  `cameraId` is not animatable. To cut, use two scenes (Phase 1) or two
  sequence items (Phase 2).
- Background optional; absence means the renderer uses the project default stage
  color (graphite). `transparent` only meaningful for overlays and WebM/PNG;
  MP4 composites onto the brand background and warns.
- Scenes are independent: no implicit parent, no shared node graph, no
  cross-scene channel targeting. Duplicate a scene or use a template to reuse.
- Scene duration is independent. The master sequence gives the project a total
  duration.

## Assets

Full detail in `assets.md`. Key points:

- An asset is a file the project owns plus metadata. `path` is bundle-relative
  POSIX, always `/`, no `..`, no scheme. The renderer never sees a filesystem
  path; it receives `qeda-media://motion/<projectId>/<assetId>`.
- Hash is SHA-256 over the file bytes. Import computes it while copying.
- Built-in assets: `metadata.builtin = true`, `path: 'builtin/<name>'`,
  `hash: 'builtin'`. Resolved through the renderer, not the filesystem (keeps
  the starter project self-contained).
- Image sequences: a directory of numbered frames plus a manifest. Frame index
  via `motionAssetFrameIndex(asset, time)`; URL via `motionAssetFrameUrl(...)`.
- Models: GLB primary; `.gltf` with sidecars imported into a folder with
  rewritten relative URIs. Validated with `gltf-validator`.
- Fonts: loaded via troika; missing font → system fallback + warning.
- Environments: HDR/EXR, optional, cached per asset id.
- Lifecycle: import, use (id only), rename (display name), relink (new file,
  same id), remove (refused while referenced), clean unused (explicit), missing
  (placeholder + block export).

## Brand kit

Project-level. Default brand in `src/lib/motion/defaults.ts` (see master spec
§6.8). Tokens are copied into node props when applied; changing the brand kit
does not retroactively restyle nodes unless the user chooses "Update from
brand." Phase 1 exposes colors and fonts; Phase 2 adds logo, safe-area
overlays, apply-to-scene.

## Master sequence (Phase 2)

Optional `sequence` on the document. Items reference scenes, with `start`,
`duration`, and optional `transitionIn`/`transitionOut` (`cut`, `crossfade`,
`dip`). Items sorted by start; gaps allowed; overlaps only with a covering
transition. Audio lives on each scene's timeline and is offset by item start.
When `sequence` is absent, the editor shows a single-item sequence for the
active scene and export defaults to the active scene.

## State machines (reserved, Phase 4)

`MotionScene.stateMachines` exists now so Phase 4 needs no schema migration.
Shape is a serializable subset of XState v5 configs: named states, transitions
referencing targets by name, actions/guards as **names** not functions, JSON
context. Validated, not executed, in Phase 1–3. Do not use XState for video
timeline evaluation.

## Migration from v3

`MIGRATIONS[3]` converts v3 → v4. Full algorithm in master spec §6.11. Key
steps:

1. `schemaVersion = 4`, `revision = 0`.
2. Wrap the single scene into `scenes = [{ id: 'scene_main', name: 'Scene 1',
   nodes, timeline: migrateTimeline(old.timeline), cameraId: firstCamera,
   background: undefined }]`.
3. `activeSceneId = 'scene_main'`.
4. `brand = DEFAULT_BRAND`.
5. `assets = old.assets.map(migrateAsset).filter(Boolean)`.
6. `sequence` absent.
7. Rewrite `screen.image.props.source` → `props.assetId` per the rules (starter
   dashboard → builtin asset; asset id → same id; uri → asset id; qeda-media
   URL → matching asset; blob/data/http/file → dropped, node marked missing).
8. Delete `scene`, `timeline.loop`.

Timeline migration: `loop` → `workArea` + `playMode`; placements get
`trimIn: 0`, `duration: clip.duration`. Invalid loop ranges converge to a valid
work area (enabled false if `start >= end`).

Asset migration: blob/data/http/file URIs are dropped (return null); qeda-media
URIs become relative paths; everything else becomes a legacy asset with
`hash: ''`, `metadata.legacy = true`, which parses but blocks export.

Migration must be idempotent and must never throw on a document that passed its
own schema. Migration failure → error page, never a partially migrated document.

## Revision and change tracking

- Every applied batch that changes the document increments `revision` by 1.
- No-op batch does not increment.
- Undo/redo restore content but assign `revision = current.revision + 1`.
- Autosave writes `{ revision, savedAt, hash }` to a sidecar.
- `plan` returns `baseRevision`. `apply` rejects with
  `MOTION_REVISION_CONFLICT` if the document's revision no longer matches,
  unless `force: true` (UI only, after showing a diff).

## Runtime seam

```ts
export type MotionFrame = {
  time: number;
  sceneId: string;
  nodes: MotionNode[];
  camera: MotionCameraFrame | null;
  background: MotionBackground;
  audio: MotionAudioSample[];
  warnings: MotionFrameWarning[];
};

export interface MotionRuntime {
  readonly kind: 'timeline' | 'state-machine';
  getDuration(): number;
  sample(time: number): MotionFrame;   // pure, no wall clock
  reset(): void;
  dispose(): void;
}
```

`TimelineRuntime` is the Phase 1 implementation. `StateMachineRuntime` is Phase 4.
Both return `MotionFrame`. The renderer never knows which produced a frame.

Evaluation pipeline (`evaluateMotionFrame(scene, time, context)`):
1. Validate time finite.
2. Clone node map.
3. Resolve active placement per track with trim semantics.
4. Sample each active channel at `trimIn + (time - placement.start)`.
5. Apply through `applyNodeProperty` (validates path, returns new node).
6. Resolve camera: `cameraId` → first camera node → synthetic default + warning.
7. Resolve background: explicit → project default (graphite) → missing
   environment falls back to color + warning.
8. Collect audio samples.
9. Collect warnings.
10. Return a new `MotionFrame`; do not mutate input.

## Acceptance criteria

- v3 fixture migrates to a valid single-scene v4 document.
- v1/v2/v3 → v4 all produce valid documents; migration is idempotent.
- `schemaVersion: 5` is rejected with a newer-version message.
- No document field contains `blob:`, `data:`, `http:`, `file:`, or an
  absolute path.
- `evaluateMotionFrame` is pure: same input → deep-equal output, no mutation.
- A node removal leaves no dangling ids, tracks, channels, or camera refs.
- `keyframe.add` at `duration + 0.1` throws; at exactly `duration` succeeds.
- Asset kind-specific validation rejects invalid combos.

## Files to touch

- `src/lib/motion/types.ts` — v4 types.
- `src/lib/motion/schema.ts` — Zod schemas + `validateMotionDocument`.
- `src/lib/motion/migrations/{v1,v2,v3}-to-v4.ts` + `index.ts`.
- `src/lib/motion/defaults.ts` — blank/starter project, default brand.
- `src/lib/motion/evaluate.ts` — scene-aware evaluator.
- `src/lib/motion/runtime.ts` — `MotionRuntime`, `TimelineRuntime`.
- `src/lib/motion/sample.ts` — trim-aware sampling.

## Tests

- `motion-migrations.test.ts` — v1/v2/v3 → v4, idempotence, invalid ranges.
- `motion-schema.test.ts` — one fixture per invariant rule.
- `motion-evaluate.test.ts` — trim mapping, track order, purity, synthetic
  camera.
- `motion-serialize.test.ts` — byte-identical round trip.
