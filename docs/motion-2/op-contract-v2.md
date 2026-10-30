# Operation contract v2

**Phase:** 1.5
**Dependencies:** `document-model-v4.md`, `persistence.md`, `scenes-and-nodes.md`,
`timeline.md`, `assets.md`
**Master spec:** §14
**Goal:** every persistent edit is a serializable, validated, risk-classified op
with a plan/apply envelope, a diff, a revision guard, and a single undo entry
per batch.

## Principles

1. The op registry is the only mutation API. UI, tests, recipes, and the copilot
   all produce the same serializable ops. A UI path that mutates the document
   directly is a bug.
2. No generic setter. No `document.set`, `scene.setNodes`, or `node.setProps`
   that can launder a destructive change into `safe`.
3. Ids are parameters. Reducers never generate ids. Replay is deterministic.
4. Reducers are pure. They take `(document, params)` and return a new document
   or the same reference for a no-op.
5. Batches are atomic. If any op fails, the caller's document is unchanged.
6. Risk is declared, not inferred from the UI.
7. Scene-scoped. Every op touching a scene includes `sceneId`. Node ids are
   unique within a scene, not globally.

## Result envelope

```ts
export type MotionOpRisk = 'safe' | 'mutating' | 'destructive';

export type MotionPlan = {
  planId: string;
  baseRevision: number;
  summary: string;
  ops: MotionOpRequest[];
  preview: MotionDocument;
  diff: MotionDocumentDiff;
  risk: MotionOpRisk;
  requiresApproval: boolean;   // risk === 'destructive'
  warnings: MotionPlanWarning[];
  createdAt: string;
  expiresAt: string;            // createdAt + 10 minutes
};

export type MotionApplyResult = {
  document: MotionDocument;
  revision: number;
  applied: number;
  diff: MotionDocumentDiff;
  warnings: MotionPlanWarning[];
};
```

`baseRevision` is the document revision at plan time. `apply` rejects if the
document has changed since (`MOTION_REVISION_CONFLICT`).

`preview` is a full document (the UI needs to render it). The copilot tool
result may omit it and return `diff` + counts.

`requiresApproval` only controls the second confirmation; every plan still needs
an explicit Apply in the copilot UI.

## Diff

`diffMotionDocuments(before, after)` returns a stable, ordered list of
`MotionChange` (`action`, `entity`, `id`, `label`, `sceneId?`, `path?`,
`before?`, `after?`) plus counts keyed by `${action}:${entity}`.

Order: document, brand, sequence, scenes (by id), nodes (by scene then id),
assets (by id). Omit unchanged entities. Labels are human-readable.

## Risk classes

| Risk | Meaning | Examples |
| --- | --- | --- |
| `safe` | Additive or trivially reversible; no content lost. | Add node, add keyframe, create clip, add asset, set active scene. |
| `mutating` | Changes existing content but fully reversible with Undo. | Move node, trim placement, set value, rename, reorder, change camera. |
| `destructive` | Deletes or rewrites content in a way that is easy to regret. | Remove node/scene/clip/track/asset/keyframe, quantize, replace asset, clear sequence. |

`batchRisk` is the maximum risk in the batch. `timeline.quantizeToFps` is
**destructive** (it merges keys). `asset.replace` is destructive.

## Op reference

`sceneId` is required on every scene-scoped op and is omitted from the table's
params for brevity. Document-level ops list all their params;
`document.setActiveScene` takes a scene id as its *value*, not as scope.

Full table in master spec §14.5. Summary by group:

**Document:** `document.rename`, `document.updateMeta`, `document.setOutput`,
`document.updateBrand`, `document.setActiveScene`, `document.setSequence`.

**Scene:** `scene.add`, `scene.duplicate`, `scene.remove`, `scene.rename`,
`scene.setCamera`, `scene.setBackground`, `scene.reorder`.

**Node:** `scene.node.add`, `scene.node.update`, `scene.node.remove`,
`scene.node.reparent`, `scene.node.reorder`, `scene.node.duplicate`.

**Assets:** `asset.add`, `asset.rename`, `asset.relink`, `asset.replace`,
`asset.remove`.

**Timeline:** `timeline.setDuration`, `timeline.setWorkArea`,
`timeline.setPlayMode`, `timeline.quantizeToFps`, `timeline.addAudio`,
`timeline.updateAudio`, `timeline.removeAudio`, `timeline.setLoop` (deprecated
alias).

**Track:** `track.add`, `track.remove`, `track.update`, `track.reorder`.

**Clip:** `clip.create`, `clip.remove`, `clip.rename`, `clip.setDuration`,
`clip.duplicate`.

**Placement:** `placement.add`, `placement.move`, `placement.trim`,
`placement.split`, `placement.remove`.

**Channel:** `channel.add`, `channel.remove`, `channel.retarget`.

**Keyframe:** `keyframe.add`, `keyframe.move`, `keyframe.setValue`,
`keyframe.setEasing`, `keyframe.remove`.

**Recipe (meta-op):** `recipe.apply` expands into primitive ops before validation
and application. Not a primitive document op; not stored in the document.

`scene.node.duplicate` and `scene.duplicate` and `clip.duplicate` require an
`idMap` covering every entity created. The caller generates the ids. The op
rejects missing or duplicate mappings.

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

## Batch semantics

```ts
export function planMotionCommand(
  doc: MotionDocument,
  requests: readonly MotionOpRequest[],
  options?: { now?: string; summary?: string },
): MotionPlan;
```

- `applyMotionOps` is pure and immutable. If an op throws, the caller still
  holds the original.
- `applyMotionCommand` re-checks `baseRevision`, plan expiry, approval, then
  applies. Increments `revision` exactly once, not once per op.
- A no-op batch returns the same document reference and does not increment
  `revision` or create a history entry.
- `applyMotionOp(doc, request)` is `applyMotionOps(doc, [request])`.
- `meta.updatedAt` is set to `now` if the document changed.
- In dev/test, `validateMotionDocument(result)` runs after the batch. In
  production, it runs before save and before export, not after every op. Ops
  still validate their own references.

## Errors

```ts
export class MotionOpError extends Error {
  code: 'MOTION_OP_UNKNOWN' | 'MOTION_OP_PARAMS' | 'MOTION_OP_NOT_FOUND'
      | 'MOTION_OP_INVALID_REFERENCE' | 'MOTION_OP_CONFLICT'
      | 'MOTION_OP_INVARIANT';
  op: string;
  path?: string;
}
```

Unknown op → `MOTION_OP_UNKNOWN`. Zod failure or unknown parameter →
`MOTION_OP_PARAMS` with the first path. Missing entity → `MOTION_OP_NOT_FOUND`.
Wrong parent / wrong asset kind / missing camera →
`MOTION_OP_INVALID_REFERENCE`. Duplicate id / overlapping split / invalid trim →
`MOTION_OP_CONFLICT`. Result would violate an invariant →
`MOTION_OP_INVARIANT`.

Errors are user-facing strings with context, not stack traces. The UI shows the
message and keeps the document unchanged.

## Revision guard and approval

- `plan` stores `baseRevision`.
- `apply` requires `planId`, `baseRevision`, and `approvalToken`.
- `doc.revision !== baseRevision` → `MOTION_REVISION_CONFLICT`.
- `requiresApproval` and `confirmedDestructive !== true` →
  `MOTION_APPROVAL_REQUIRED`.
- `approvalToken` is minted by the editor store when a plan is presented to the
  user, bound to `planId` + `baseRevision`, and never returned to the model. It
  is not part of `MotionPlan`, not a document field, not persisted. The
  copilot's `motion.apply` schema has no token field; the renderer attaches it
  on Apply.
- `force: true` accepted only from the editor UI after showing the diff. Stripped
  from copilot tool inputs.
- A plan is single-use. Re-applying → `MOTION_PLAN_CONSUMED`.
- Undo after apply restores the previous content and increments revision again;
  the old plan cannot be re-applied.

## Discovery (manifest)

```ts
export type MotionEngineManifest = {
  contractVersion: 2;
  engine: 'qeda-motion';
  documentSchemaVersion: 4;
  nodes: MotionNodeTypeDescription[];
  operations: Array<{
    id: string; summary: string; risk: MotionOpRisk;
    sceneScoped: boolean; parameters: Record<string, unknown>;
    since: string; deprecated?: boolean;
  }>;
  recipes: Array<{ id: string; label: string; description: string; params: Record<string, unknown> }>;
};
```

`parameters` generated with Zod 4 `z.toJSONSchema()` and
`additionalProperties: false`. `sceneScoped` tells the agent to include
`sceneId`. `since` is the phase/version that introduced the op. `deprecated`
marks aliases like `timeline.setLoop`.

## Compatibility

- v1 contract clients get a v2 manifest with `contractVersion: 2`. No external
  clients yet.
- v3 documents migrate to v4 before any op runs.
- `timeline.setLoop` remains as a deprecated alias for one release.
- `asset.add` no longer accepts `uri`; v4 requires `path`, `hash`, `byteSize`.
- `scene.node.add` and all scene ops require `sceneId`. The v3 signature is not
  accepted.
- `screen.image.props.source` is rejected; use `assetId`.

## Acceptance criteria

- Every op has a Zod schema, a risk class, a summary, and a test.
- Unknown parameters are rejected, not ignored.
- A batch with one invalid op leaves the document unchanged.
- No-op batches do not increment revision or create history.
- A destructive op is held for approval in the store and by the copilot.
- A stale plan is rejected with `MOTION_REVISION_CONFLICT`.
- Applying a 40-op plan creates one undo entry.
- `motion.describe` returns JSON Schema for every op and node type.
- `recipe.apply` expands to primitive ops and is not stored in the document.

## Files to touch

- `src/lib/motion/ops.ts` — op registry v2.
- `src/lib/motion/ops/*.ts` — per-group reducers.
- `src/lib/motion/plan.ts` — plan/apply envelope, revision guard.
- `src/lib/motion/diff.ts` — `diffMotionDocuments`.
- `src/lib/motion/lint.ts` — document + export lint.
- `src/lib/motion/recipes.ts` — recipe definitions + expansion.
- `src/lib/motion/engine-contract.ts` — manifest v2.
- `src/hooks/use-motion-store.ts` — `MotionCommitResult`, pending lifecycle.
- `src/main/ipc/handlers/motion-copilot.ts` — plan/apply IPC.

## Tests

- `motion-ops.test.ts` — every op, happy + failure + no-op.
- `motion-plan.test.ts` — plan envelope, revision guard, approval, expiry.
- `motion-diff.test.ts` — ordering, counts, omitted unchanged.
- `motion-recipes.test.ts` — expansion stability.
