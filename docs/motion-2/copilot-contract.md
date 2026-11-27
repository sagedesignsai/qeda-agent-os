# Motion Copilot Contract

**Normative.** Read this before composing anything. `docs/motion-2-spec.md` and
its briefs describe what Motion *is*; this document states what a copilot
composition *must* do to be accepted. When they disagree, the spec wins for the
document model and this contract wins for agent conduct.

Every rule below exists because a real scene failed without it: invisible
lighting, clips that drifted when retimed, a copilot turn that overwrote an
editor save.

---

## 1. The mutation contract

- **Every scene change is a `MotionOpRequest` plan applied atomically.** There
  is no generic "set document" op. Use the specific tools (`sceneDirector`,
  `keyframe`, `nodeBuilder`, `proceduralModeling`, recipes) so risk classes and
  undo stay intact.
- **Destructive batches pause for user approval.** Do not route a removal
  through a "safe" tool to avoid the gate.
- **Time is stored in seconds everywhere.** `fps` is applied only at UI/render
  boundaries. Never author in frames.
- **Clips are a library.** A placement references `clipId`; it does not inline
  keyframes. Editing a shared clip affects every placement — say so before
  changing one.
- **The user may be editing right now.** The renderer passes a document
  snapshot per turn. If saving back reports a conflict, the user's editor copy
  wins. Do not retry blindly; tell the user their version was kept and ask them
  to re-run.

## 2. Ordered workflow

1. `getMotionCapability` — load this contract, patterns, matching node types,
   and recipes. Required for any new scene or multi-node change.
2. `createPlan` — ordered, verb-first task list.
3. Build with tools; group related changes in one atomic batch.
4. `lintMotionProject` — fix blocking issues before summarizing.
5. `renderMotionPreview` — look at what you changed. Previews are a verification
   step, not a browsing tool.
6. Summarize: nodes added/changed, lint status, preview result, and what you did
   not check.

## 3. Hard rules

1. **A 3D scene needs a key light.** Probes alone read flat; add a directional
   key with shadows and an ambient fill. Rim light for hero products.
2. **One focal point per scene.** Name nodes meaningfully (`Hero`, `Rim Light`,
   `Bar 1`) so the user can find them in the hierarchy.
3. **Procedural counts are bounded.** ≤ 5,000 instances per batch; expose the
   parameters in `props` so the user can edit them without new ops.
4. **Cameras and lights are explicit nodes.** Never fake a camera move with
   object transforms; the user must be able to retime the camera.
5. **Scenes are independent.** Changes for the active scene stay in the active
   scene unless the user asked for a sequence change. The master sequence
   (`document.sequence`) is only edited on explicit request.
6. **Assets resolve through the document.** Never invent an asset path; use
   `assets` entries or import through the asset tools. The export window renders
   a document that is not loaded in the editor, so any path that only works in
   the editor is a bug.
7. **Lint is a gate.** Do not report success with blocking lint issues.
8. **Post "look" nodes are a fixed pipeline** (`lens-distortion → bloom → grade
   → chroma → vignette → scanline → grain → letterbox`). Add a look node; do not
   try to reorder the pipeline from the copilot.

## 4. Budgets

| Budget | Limit | Why |
| --- | --- | --- |
| Nodes per scene | ~200 soft | Editor and evaluation performance |
| Procedural instances | 5,000 per batch | Hard runtime cap |
| Preview renders per turn | 6 | Each preview is a headless render |
| Keyframes per channel | ~40 soft | Prefer clip reuse for repeated motion |

## 5. Explicitness

- **Preview renders** only when verifying a change the user asked for or the plan
  requires.
- **Export / video render** only when the user explicitly asks. It is the most
  expensive operation in the product.
- **Do not end a turn with a vague success.** If the deliverable does not exist,
  state the exact blocker.

## 6. Done means

- `lintMotionProject` reports no blocking issues.
- The changed scene has been preview-rendered (or the tool reported why it could
  not be), and the result is described honestly.
- The final message lists: nodes created or changed, lint status, preview
  outcome, and **anything you could not check** (motion feel, timing rhythm,
  audio, lighting taste). Never claim a check you did not run.