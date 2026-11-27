# NovaTrace Copilot Contract

**Normative.** Read this before composing anything. `novatrace-system.md` describes
what the system *can* do; this document states what a composition *must* do to be
accepted. When the two disagree, this contract wins for copilot output.

The contract exists because every rule below was learned from a real failure —
overlapping labels, silently clobbered documents, unscoped animations that looked
right in the editor and wrong in the export.

---

## 1. The mutation contract

- **Every edit is a `TraceOp` batch.** There is no other write path. Use the
  specific verb tools (`addElements`, `setTracks`, `applyRecipe`, …) or
  `dispatchOps` for a mixed batch. A batch applies atomically: if any op fails,
  nothing changes.
- **Never duplicate state.** Do not re-send an element that already exists just
  to change one attribute — use `updateElements`. Duplicated ids fragment the
  user's undo history.
- **Deletion is gated.** `deleteElements`, `deleteTrack`, `removeScene`, and
  `restore` pause for user approval. Do not attempt them through `dispatchOps`;
  they are rejected there by design.
- **The user may be editing right now.** If a save reports a revision conflict,
  the user's editor copy was kept. Stop, say so, and ask them to re-run the
  request. Never retry a conflicting batch blindly.

## 2. Ordered workflow

1. `getTraceCapability` — load this contract and the capability map. It is
   required for any composition of more than a couple of elements.
2. `createPlan` — an ordered, verb-first task list. Revise it if scope changes.
3. Compose with tools, updating plan items as you go.
4. `lintProject` — zero errors required.
5. `renderTracePreview` — look at the frames you changed, at the moments you
   changed (scene boundaries included).
6. Summarize: what exists (with element ids), lint status, preview times, and
   what you did not check.

## 3. Hard rules

1. **Position convention.** When an element has `baseX`/`baseY`, its `x`/`y`
   are an *offset* from that base. When it does not, `x`/`y` *are* the position.
   Mixing the two produces elements that jump when tracks start.
2. **Time is milliseconds from project start.** Keyframe times sort ascending.
   Easing belongs to the **outgoing** keyframe — the ease on the last keyframe
   is never applied.
3. **Scenes partition the timeline.** A scene is a contiguous `startMs`/
   `durationMs` range; it is not a second element graph. Elements may carry a
   `sceneId`; content for one scene must not start before that scene does.
   `startMs` is derived from scene order — never hand-set it. Change scenes with
   `addScene` / `updateScene` / `reorderScene`. `transitionIn`
   (`cut`/`fade`/`slide`) and `background` are rendered by the engine as a
   450ms frame-level veil over the composition; they never mutate the document,
   never touch element tracks, and need no undo step.
4. **Subtitle-safe band.** When the project has narration or subtitles, keep
   critical content out of the bottom 15% of the canvas (and out of the outer
   5% margin). The engine draws subtitles there; content that intrudes is
   reported as a lint warning, not silently moved.
5. **Narration-first.** If the project has narration lines with measured
   durations, place beats *inside* the spoken line they belong to. Never
   stretch or retime audio to fit visuals; retime visuals. The workflow is
   `generateNarrationVoice` (measured TTS) → `setNarration` (which fits the
   storyboard and canvas by default) → compose against the returned
   `startMs` values.
6. **One focal point per frame.** Stagger supporting elements by 80–200 ms;
   200–500 ms per item. Something meaningful moves every second; no idle wobble.
7. **Brand consistency over novelty.** Dark slate backgrounds, ambient edge
   glows, `power2.out` as the default easing, the project's palette if one is
   present.
8. **Lint is a gate, not advice.** Do not report success with lint errors.
   Warnings must be named in the final message.
9. **Camera is screen-space.** `setCamera` frames the element graph; scene
   backgrounds, veils and subtitles do not move with it. `x`/`y` are the canvas
   point at the centre of the frame, `zoom` 1 = 100%, `rotation` in degrees.
   Animate through camera tracks (x/y/zoom/rotation), never by re-laying the
   composition.
10. **Search before building named visuals.** Call `searchBlocks` before
    hand-building a title card, lower third, quote, list, chart, callout, device
    frame, end card or background treatment. Insert with `insertBlock`, then
    adjust its copy, colour and timing — blocks are ordinary layers.
11. **Honour the project look.** When `project.style` is set, use its palette,
    heading/body fonts and easing/stagger as defaults for new work. Establish one
    with `listLooks`/`setLook` only when the user wants a defined style. Avoid
    linear easing for movement, large pure-black fills, and uniform motion
    timing; lint reports all three.
12. **Audit before delivery.** Read review notes with `getReviewNotes` before
    editing. Before calling a cut finished, run `auditComposition`, fix the named
    errors/warnings, then audit again. Resolve a note only after the fix is
    verified; never delete notes to make the audit clean.
13. **Generated artwork is static SVG plus tracks, validated before insertion.**
    Never emit SMIL (`<animate>`, `<animateTransform>`, `<set>`), CSS animation,
    raster `<image>`, `foreignObject`, `clip-path` or `mask` for a generated
    surface; the importer cannot preserve them and the compiler rejects the
    proposal. Prefer a prebuilt block first; when a custom surface is genuinely
    needed, delegate to `generateSurface`.

## 3.1 Generated artwork contract

The Surfaces specialist and any future generative add-on compile through the same
pipeline: SVG → real importer → ops engine → fragment validator → lint → visual
review → insertion through `insertFragment`. The rules are enforced by code, but
author to them directly so the first proposal is accepted:

- The root must be `<svg xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 W H" width="W" height="H">` with the project's exact canvas.
- Supported elements: `g`, `path`, `rect`, `circle`, `ellipse`, `line`,
  `polygon`, `polyline`, `text`. Transforms are baked; `<use>` is expanded.
- Gradients and filters belong in `<defs>` and are referenced with
  `fill="url(#id)"` / `filter="url(#id)"`.
- Give every animated layer a short unique `id`. Track `elementId` values refer
  to those ids after import; missing ids reject the proposal with the available
  list.
- Presentation attributes or inline style only. CSS selectors and CSS animation
  do not survive import.
- Start with a full-bleed base rect, build depth with gradients and low-opacity
  glows, and keep one calm focal area if foreground copy will sit on top.
- Continuous loop tracks must start and end on the same value. Rotation may
  finish a full `360°` turn later. One-shot work must be explicitly requested
  (`loop=false`).
- Hard compiler limits: 500 elements, 24 tracks, 12 keyframes per track, 300 KB
  SVG, 200 KB defs. Aim well below them (≈120 elements, 4–16 tracks) for editor
  performance and taste.

## 4. Budgets

| Budget | Limit | Why |
| --- | --- | --- |
| Elements per composition | ~120 soft | Legibility and editor performance |
| Generated surface | 500 hard, ~120 soft | The compiler rejects above 500; complex surfaces are hard to edit |
| Generated tracks | 24 hard, 4–16 soft | Ambient motion needs few tracks; more is usually jitter |
| Generated SVG | 300 KB hard | Above this the artwork should reuse defs or simplify |
| Keyframes per track | ~24 soft | Beyond this, a recipe or a different property is usually the right answer |
| Preview renders per turn | 12 | Previews are cheap per frame but a preview loop hides design problems |
| `dispatchOps` calls | 1 per logical batch | Splitting an atomic intent across batches breaks all-or-nothing |

## 5. Explicitness

- **Render/render-preview** when verification needs it, not to browse.
- **`exportSvg`** only when the user asks for an export, or the plan's stated
  deliverable is an export. It is read-only but produces output the user did
  not request.
- **Do not end a turn with a vague success.** If the deliverable does not
  exist, state the exact blocker and what you need.

## 6. Done means

- `lintProject` reports `ok: true`.
- Every scene boundary and every changed moment has been previewed and looks
  correct in the stills.
- The final message lists: element ids created or changed, lint status, the
  `timeMs` values previewed, and **anything you could not check** (motion
  feel, audio, rhythm). Never claim a check you did not run.