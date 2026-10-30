# Timeline

**Phase:** 1 (trim/split/snap/work area), 2 (audio)
**Dependencies:** `document-model-v4.md`, `scenes-and-nodes.md`
**Master spec:** §6.5, §9
**Goal:** a timeline that supports non-destructive trim, split, snapping, work
area, play modes, and key editing — without forking the neutral timeline kit.

## Adapter (v4)

`src/lib/motion/timeline-adapter.ts` projects a scene into the neutral
`TimelineModel`. New signature:

```ts
toTimelineModel(doc: MotionDocument, sceneId: string): TimelineModel
```

It takes the whole document (fps and brand live at the root) and resolves the
scene internally. Trim-aware mapping:

```
visibleStart = placement.start
visibleEnd   = placement.start + placement.duration
sceneTime    = placement.start + (key.time - placement.trimIn)
key.time     = placement.trimIn + (sceneTime - placement.start)
```

Keys outside `[trimIn, trimIn + duration]` are hidden from the main lane and
counted in `trimmedKeyCount`; the clip block shows a "N keys trimmed" badge.
Do not silently move keys when trimming.

## Transport

Play/pause, step, go to start/end, timecode, fps, loop/play-mode dropdown,
snap, zoom, fit. `Space` play/pause, `Shift+Space` play from start, `,`/`.`
step one frame, `Home`/`End` go to start/end.

## Tracks and clip blocks

- Track headers: name, target node, mute, lock, color chip (derived from node
  type, not stored).
- Clip blocks: clip name, trim handles, keyframe diamonds, overlap badge,
  muted/locked styling.
- Audio lane: waveform, gain, fades (Phase 2).

## Trim

Changes `trimIn`/`duration`/`start` without touching keyframes.

- Left handle: drag right increases `trimIn` and `start` together (content
  anchored). Drag left decreases both, bounded by `trimIn >= 0`.
- Right handle: drag changes `duration`, bounded by
  `trimIn + duration <= clip.duration`.
- Hold `Alt` while dragging the left handle changes `start` only (slip without
  trim).
- Trimming never deletes keys; the badge reports how many are hidden.

Op: `placement.trim` with final `start?`, `trimIn?`, `duration?`. The op
validates the final values; the UI computes them from the drag so a dropped
event cannot leave a half-applied trim.

## Split

Op `placement.split` at the playhead (scene time, strictly inside the
placement). First placement keeps the id, `duration = atTime - start`. Second
gets `start = atTime`, `trimIn = old.trimIn + firstDuration`,
`duration = old.duration - firstDuration`. Both reference the same clip
(non-destructive). Keyframes shared through the clip.

## Move

`placement.move`: horizontal changes `start`, vertical changes the track. Locked
track rejected. Overlap allowed with badge.

## Snapping

User preference, default on. Targets in priority order:
1. Playhead.
2. Work-area start/end.
3. Scene start/end.
4. Other placement edges on any track.
5. The current placement's own opposite edge.
6. Frame grid (only if "snap to frames" on; default on at ≤ 60s).

Threshold 8 screen pixels converted to seconds via `pxPerSecond`. Hold `Alt`
to temporarily disable. Snap indicator: thin vertical line with label
("Clip edge", "Playhead", "Frame 42"). No magnetic timeline.

## Keyframes

Adding:
- Every animatable property row in the inspector has a diamond.
- Clicking adds a key at the playhead with the current value; if one exists,
  the button is filled and clicking removes it (toggle).
- `keyframe.add` at an existing time replaces the existing key's value/easing,
  keeping the id. One undo entry.
- Auto-key is **off by default**, persisted per user. When on, changing an
  animatable value at a time with no key creates one. Toggle in the timeline
  toolbar.

Selecting/editing:
- Click selects; `Shift+click` range; `Cmd/Ctrl+click` toggles.
- Drag horizontally to change time; clamps to `[0, clip.duration]`.
- Values edited in the inspector, not by vertical dragging.
- Easing per keyframe (outgoing segment): Linear, Ease In, Ease Out, Ease In
  Out, Smooth, Step, Custom (cubic bezier with two handles).
- `Delete` removes selected keys (destructive, one confirm if more than one).
- Copy/paste preserves relative times and values; paste at playhead offsets the
  group.

Visual language: filled diamond when selected, hollow otherwise; key on playhead
outlined; channel with no keys shows a flat line + "+ key" affordance; a
property animated on another clip shows "animated in N clips" with a jump list.

## Work area and play modes

- Work area is the shaded region on the ruler; drag handles to set it.
- "Set work area to selection" uses the selected clip or key range.
- "Clear work area" disables it and restores the full scene.
- Loop button toggles `workArea.enabled`; play-mode dropdown chooses `once`,
  `loop`, `ping-pong`.
- `loop` without an enabled work area loops the full scene ("Looping full
  scene").
- Export has a "Range" choice: Full scene, Work area, Sequence (Phase 2).
  Default Full scene even if a work area is enabled.

## Audio (Phase 2)

Audio is a timeline lane, not a scene node. Import through the asset library;
waveform generated once and cached next to the asset. Drag the asset onto the
audio lane to create a placement. Trim with the same handle semantics. Gain
linear `[0,2]`, default 1. Fade in/out in seconds, drawn as ramps. Mute per
placement. Preview plays through an `AudioContext` slaved to the visual clock;
if suspended, show "Click to enable audio." Export mixes all unmuted placements,
applies gain/fades, encodes AAC (MP4) or Opus (WebM); if audio encoding is
unavailable, export video-only and warn.

## Performance

- Canvas timeline already draws only visible rows/keys; keep it.
- Track headers are DOM; virtualize above 100 tracks with
  `@tanstack/react-virtual` only if profiling shows a problem.
- Keyframe hit-testing uses the canvas spatial index, not a DOM node per key.
- Dragging emits preview state at 60fps and commits one op on pointer-up. No
  history entry per pointermove.
- Scrubbing evaluates at most once per animation frame.
- 200-key, 20-track scene should scrub under 16ms.

## Acceptance criteria

- A clip can be trimmed on both edges without moving or deleting keyframes.
- A split produces two placements referencing the same clip playing the same
  content across the cut.
- A key outside the trim range is hidden, counted, and restored when the trim
  is expanded.
- Moving a key updates the underlying clip-local time correctly after trimming.
- Work area and play mode survive save/reload.
- Undo after a trim restores the previous trim and key visibility.
- Snapping can be disabled; `Alt` temporarily disables it.
- The timeline never mutates the document directly.

## Files to touch

- `src/lib/motion/timeline-adapter.ts` — v4 projection with trim.
- `src/components/motion/MotionTimeline.tsx` — binding.
- `src/components/timeline/*` — kit (extended, not forked).

## Tests

- `motion-timeline-adapter.test.ts` — trim mapping, key ids, trimmed count.
- Component tests for snap, trim, split interactions.
