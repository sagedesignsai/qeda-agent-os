# Phase 0 — Foundation

**Phase:** 0 (S)
**Dependencies:** none
**Master spec:** §3.2, §3.4
**Goal:** make the existing Motion code trustworthy before any feature work lands.

## Scope

Fix the 10 defects in §3.2. Each is one PR-sized change with a test. Do **not**
bundle these with feature work. Phase 0 ends when `bun run build`, `bun test`,
`bun run lint`, and `bunx tsc --noEmit` all pass, the 39 existing Motion tests
still pass, and the manual smoke path (open `/motion`, play, scrub, undo, redo)
works.

## Work items

### P0-1 — Missing `SRGBColorSpace` import
- **File:** `src/components/motion/scene/MotionSceneCanvas.tsx`
- **Fix:** import `SRGBColorSpace` from `three` alongside `Color` and
  `PerspectiveCamera`.
- **Test:** add a module test that imports the module and asserts the exported
  component is defined (the existing test mocks the canvas and cannot catch this);
  or remove the mock and render with a stubbed R3F `Canvas`. At minimum,
  `bunx tsc --noEmit` must pass.

### P0-2 — Remove blob/data URLs from persisted assets; narrow asset kind
- **Files:** `MotionScenePanel.tsx`, `types.ts`, `schema.ts`, `ops.ts`
- **Fix:** asset import moves to main (Phase 1). Until then, remove the blob
  URL from persisted state and keep imported files in an in-memory map keyed by
  asset id, or disable the import button behind a flag. The document model must
  never contain `blob:` or `data:` URLs. Narrow `asset.kind` to
  `'image' | 'image-sequence'`.
- **Test:** schema round-trip rejects `blob:`/`data:` in `asset.path` and in
  `screen.image.props.assetId`; an import op returns a bundle-relative path.

### P0-3 — No-op commits must not create history entries
- **File:** `src/hooks/use-motion-store.ts`
- **Fix:** apply first, compare references, push history only if the document
  changed. `applyMotionOps` already returns the same reference for no-ops in
  most reducers; the store must respect it.
- **Test:** commit a no-op op, assert `canUndo` unchanged and the document
  reference identical.

### P0-4 — Pending-approval lifecycle is incomplete
- **File:** `src/hooks/use-motion-store.ts`
- **Fix:** introduce `MotionCommitResult`:
  `{ status: 'applied' | 'unchanged' | 'pending' | 'rejected'; document; error? }`.
  Keep the pending request until explicitly confirmed or cancelled. On a failed
  confirmed apply, restore the pending request and surface the error.
- **Test:** destructive op → pending; confirm with an op that throws → pending
  restored; cancel clears it.

### P0-5 — Central `validateMotionDocument()`
- **Files:** `schema.ts`, `ops.ts`, tests
- **Fix:** move validation into `validateMotionDocument(doc)` with a stable,
  ordered error list (`code` + `path`). `parseMotionDocument` calls it after Zod
  parsing. Ops call the same validator on the result in dev/test builds.
- **Test:** one fixture per invariant, each asserting a specific error path.

### P0-6 — Node-removal cascade helper
- **Files:** `ops.ts`, tests
- **Fix:** define `collectNodeCascade(scene, nodeId)` returning removed node
  ids, affected track ids, affected clip ids, affected camera ids. Used by both
  `scene.node.remove` and `scene.remove`. Default: delete tracks scoped only to
  the removed node; keep unscoped tracks.
- **Test:** remove a parent with children, a scoped track, and channels; assert
  no dangling ids and no camera pointing at a removed node.

### P0-7 — Keyframe time bounds
- **Files:** `ops.ts`, tests
- **Fix:** validate `0 <= time <= clip.duration` in `keyframe.add`; reject
  rather than clamp on add. `keyframe.move` keeps clamping (continuous gesture).
- **Test:** add at `duration + 0.1` → `MotionOpError`; add at exactly
  `duration` → accepted.

### P0-8 — Asset kind-specific validation
- **Files:** `schema.ts`, `ops.ts`, tests
- **Fix:** discriminated validation by `kind` (image / image-sequence / video /
  audio / font / model / environment). `MotionAsset` becomes a union or a single
  type with `superRefine`.
- **Test:** table-driven invalid-asset cases.

### P0-9 — Scene-aware evaluator seam
- **Files:** `evaluate.ts`, `sample.ts`, tests
- **Fix:** `evaluateMotionFrame` takes a scene, not a whole document. Shape:
  `evaluateMotionFrame(scene, time, context) → MotionFrame`. See
  `document-model-v4.md` §7.2 for the full pipeline.
- **Test:** update existing evaluator tests to the new signature.

### P0-10 — Document v4 skeleton behind a migration
- **Files:** `types.ts`, `schema.ts`, `defaults.ts`
- **Fix:** v3 project migrates to a single-scene v4 project; all tests pass.
  See `document-model-v4.md` §6.11.
- **Test:** migration fixtures and idempotence.

## Exit criteria

- `bun run build`, `bun test`, `bun run lint`, `bunx tsc --noEmit` all pass.
- 39 existing Motion tests still pass.
- Manual smoke path works.
- `python3 scripts/verify-ipc-split.py` passes (no IPC changes expected here,
  but run it anyway).

## What is NOT in Phase 0

Persistence, export, new node types, UI redesign, IPC changes. Those are Phase 1+.
Do not let Phase 0 creep into feature work; the point is to make the foundation
trustworthy.
