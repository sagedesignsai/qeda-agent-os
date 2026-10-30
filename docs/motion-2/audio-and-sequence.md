# Audio and sequence

**Phase:** 2
**Dependencies:** `timeline.md`, `document-model-v4.md`, `export-pipeline.md`
**Master spec:** §6.9, §9.7, §12.7–§12.8
**Goal:** scored, multi-scene films — audio placements on the timeline and a
master sequence that cuts scenes together.

## Audio placements

Audio is a timeline lane, not a scene node.

```ts
export type MotionAudioPlacement = {
  id: string;
  assetId: string;        // audio asset
  start: number;          // scene time
  trimIn: number;
  duration: number;
  gain: number;           // [0,2], default 1
  muted: boolean;
  fadeIn: number;         // seconds, clamped to duration
  fadeOut: number;
};
```

- Import audio through the asset library. Waveform generated once and cached
  next to the asset (`assets/<id>/waveform.json`), not stored in the document.
- Drag the asset onto the audio lane to create a placement.
- Trim with the same left/right handle semantics as clips.
- Mute per placement.
- Preview plays through an `AudioContext`; the visual clock is authoritative.
  If the audio context is suspended (autoplay policy), show "Click to enable
  audio."
- Export mixes all unmuted placements, applies gain/fades, encodes AAC (MP4)
  or Opus (WebM). If audio encoding is unavailable, export video-only and warn.

Ops: `timeline.addAudio`, `timeline.updateAudio`, `timeline.removeAudio`.

## Master sequence

Optional `sequence` on the document:

```ts
export type MotionSequence = { duration: number; items: MotionSequenceItem[] };
export type MotionSequenceItem = {
  id: string; sceneId: string; start: number; duration: number;
  transitionIn?: MotionTransition; transitionOut?: MotionTransition;
};
export type MotionTransition = {
  type: 'cut' | 'crossfade' | 'dip';
  duration: number;
  color?: string;   // required for 'dip'
};
```

Semantics:
- Items sorted by `start`.
- A gap renders the project background for that interval. Gaps allowed; warn on
  export if > 0.5s.
- A scene can appear more than once.
- `duration` can be shorter than the scene's timeline duration (clip, not
  stretch).
- `transitionIn` belongs to the incoming item; `transitionOut` to the outgoing.
  If both present on an overlap, incoming wins.
- `crossfade` renders both scenes with alpha. `dip` renders outgoing →
  transition color → incoming. `cut` is a hard switch.
- Audio lives on each scene's timeline; the sequence mixes scene audio at the
  item's offset.

When `sequence` is absent: the editor shows a "Sequence" tab with a single item
for the active scene; export defaults to the active scene; "Export all scenes"
builds a temporary in-memory sequence (cuts, no transitions) and does not write
it back unless the user clicks "Save as master sequence."

Op: `document.setSequence({ sequence: MotionSequence | null })` (destructive).

## Sequence rendering (export)

A sequence frame may need two scenes at once (crossfade/dip). Renderer:
1. Find active item(s) at output time.
2. For each, compute scene-local time `itemStartOffset + (t - item.start)`
   clamped to item duration.
3. Sample each scene with its own `TimelineRuntime`.
4. Render each to an offscreen canvas at output size.
5. Composite per transition type.
6. Draw composite to output canvas and encode.

Scene cameras and backgrounds are per scene. All scenes render at output
resolution. If two items overlap without a transition, preflight warns and the
later item wins (no invented crossfade).

## Acceptance criteria

- Audio placements play in preview and export with gain/fades.
- Audio stays in sync within 1 frame over 60s.
- A 3-scene sequence exports with cuts and crossfades.
- Gaps render the project background and warn if > 0.5s.
- `document.setSequence(null)` removes the master sequence (destructive, confirm).
- A scene can appear more than once in a sequence.

## Files to touch

- `src/lib/motion/ops.ts` — audio ops, `document.setSequence`.
- `src/main/motion/render-jobs.ts` — sequence compositing.
- `src/components/motion/timeline/*` — audio lane.
- `src/components/motion/export/*` — range selection.

## Tests

- `motion-ops.test.ts` — audio add/update/remove, setSequence.
- `motion-preflight.test.ts` — overlap without transition, gap warning.
- Export smoke with audio and a sequence.
