# Export pipeline

**Phase:** 1 (H.264/VP9), 2 (sequence, audio, GIF/PNG, 4K, queue)
**Dependencies:** `document-model-v4.md`, `persistence.md`, `assets.md`,
`scenes-and-nodes.md`, `timeline.md`
**Master spec:** §7.5–§7.9, §12
**Goal:** frame-exact video output through a hidden render window and Mediabunny,
with runtime codec probing and a clear fallback path.

## Output contract

A video file with a container (MP4 or WebM), a video track encoded from the
deterministic frame sequence, an optional audio track mixed from timeline audio,
a duration equal to the selected range within one frame, a frame rate equal to
the project's output fps, a resolution equal to the export preset, and no editor
chrome.

The export reads a **snapshot** of the project at a specific revision. Editing
during a render does not change the running render.

## Presets

| Preset | Container | Codec | Size | FPS | Bitrate | Audio |
| --- | --- | --- | --- | --- | --- | --- |
| Launch 1080p | MP4 | H.264 High | 1920×1080 | 30 | 12 Mbps | AAC 192k |
| Launch 4K | MP4 | H.264 High | 3840×2160 | 30 | 35 Mbps | AAC 192k |
| Social vertical | MP4 | H.264 High | 1080×1920 | 30 | 10 Mbps | AAC 192k |
| Social square | MP4 | H.264 High | 1080×1080 | 30 | 10 Mbps | AAC 192k |
| WebM VP9 | WebM | VP9 | source | source | 8 Mbps | Opus 128k |
| WebM AV1 | WebM | AV1 | source | source | 6 Mbps | Opus 128k |
| GIF | GIF | GIF | 800px wide | 15 | — | none |
| PNG sequence | folder | PNG | source | source | — | none |

"Source" = project output size/fps. GIF and PNG are Phase 2. AV1 opt-in (slow).
60fps export allowed at any preset; doubles frame count and render time.

Codec fallback: if H.264 High is unavailable, offer VP9/WebM. If neither is
available, show a blocking error with probe results and "Copy diagnostics." Never
silently produce a file with the wrong extension.

## Export dialog

Format (MP4/WebM/GIF), Range (Full scene/Work area/Sequence/Active scene), Size
presets + custom, FPS (24/30/60), Quality (Draft/Standard/High/Master), Audio
include/mute, File path, estimated size/time, warnings list. Blocking issues
disable Export and link to the fix.

## Preflight

Blocking: missing assets/fonts used in range; unsupported node types visible in
range; no video codec; invalid resolution/fps; disk space < 2× estimated;
snapshot failure; unresolved sequence reference/invalid overlap.

Warning: transparent background with MP4 (composites onto brand background);
audio encode unavailable (video-only); exporting at higher fps than project
output; range with no animated content; duration >5 min or resolution >4K; font
substitution; frame-approximated video surfaces.

Returns `MotionPreflightIssue[]` with `severity`, `code`, `message`,
`sceneId?`, `nodeId?`, `assetId?`, `action?`.

## Render pipeline

1. Snapshot: copy `project.json` to `render-jobs/<jobId>/project.json`, record
   revision. Render window loads the snapshot.
2. Preflight in the render window against the snapshot.
3. Prepare: load all assets, fonts, models, environments for the selected range.
   Decode audio. Compile shaders by rendering one warm-up frame at time 0.
4. Probe: confirm codec with Mediabunny `canEncodeVideo` /
   `getFirstEncodableVideoCodec`. Choose fallback before the first frame.
5. Open output: `StreamTarget` sends chunks to main; main appends to
   `<output>.part`.
6. Render frames: for `i` in `0..frameCount-1`:
   - `time = rangeStart + i / fps`
   - `frame = runtime.sample(time)`
   - update Three.js scene from frame
   - render to offscreen canvas
   - `await source.add(time - rangeStart, frameDuration)`
   - report progress every 10 frames or 250ms
   - check cancel flag
   - yield to the event loop
7. Finalize: `await output.finalize()`; main flushes and fsyncs.
8. Verify: open with Mediabunny `Input`; assert duration within one frame, video
   track present, expected dimensions, frame count. Keep `.part` on failure.
9. Commit: atomic rename `.part` → final path. Write render record to
   `renders/index.json`.
10. Cleanup: destroy hidden window, release GPU, delete job snapshot after 24h.

Frame count:
```ts
const duration = Math.max(0, rangeEnd - rangeStart);
const frameCount = Math.max(1, Math.ceil(duration * fps - 1e-9));
for (let i = 0; i < frameCount; i += 1) {
  const time = rangeStart + i / fps;
  const frameDuration = Math.min(1 / fps, duration - i / fps);
}
```

## Mediabunny integration

Mediabunny is MPL-2.0, zero-dependency, tree-shakable. Sketch:

```ts
const format = preset.container === 'webm'
  ? new WebMOutputFormat() : new Mp4OutputFormat();
const target = new StreamTarget({ onData: (data) => { void sendChunk(jobId, data); } });
const output = new Output({ format, target });
const video = new CanvasSource(canvas, { codec: preset.codec, bitrate, keyFrameInterval: 2 });
output.addVideoTrack(video, { frameRate: fps });
if (audioTrack) output.addAudioTrack(audioSource);
await output.start();
for (const frame of frames) await video.add(frame.timestamp, frame.duration);
await output.finalize();
```

- `CanvasSource` reads the canvas at `add()` time. Render immediately before.
- `preserveDrawingBuffer: true` on the export renderer.
- Chunks in strict order; out-of-order fails the job.
- Use `MessageChannelMain` if IPC overhead shows up in profiling.
- Keep Mediabunny unmodified (MPL-2.0 file-level copyleft).

## Audio (Phase 2)

Decode each audio asset once per job to an `AudioBuffer` at 48kHz stereo. Mix
placements in scene time: `sample = assetSample(trimIn + (t - start)) * gain *
fade(t)`. Linear fades. Sum overlapping; clamp only at the final stage. Encode
AAC for MP4, Opus for WebM; if unavailable, video-only + warning. Master
sequence audio offset by item start; crossfades apply the same alpha to audio
unless the transition is a `cut`.

## Master sequence rendering (Phase 2)

A sequence frame may need two scenes (crossfade/dip). Renderer finds active
item(s), computes scene-local time `itemStartOffset + (t - item.start)` clamped,
samples each scene with its own `TimelineRuntime`, renders each to an offscreen
canvas at output size, composites (cut: incoming only; crossfade: alpha mix;
dip: outgoing → color → incoming), draws composite to output canvas, encodes.
Scene cameras/backgrounds are per scene. If two items overlap without a
transition, preflight warns and the later item wins.

## Progress, cancel, recovery

- Progress: `{ jobId, phase, frame, frameCount, fraction, etaSeconds }`.
- Phases: snapshot, preflight, prepare, render, finalize, verify, done, failed,
  cancelled.
- Cancel sets a flag; renderer checks each frame, finalizes nothing, exits. Main
  deletes `.part` after the window closes.
- App quit during render → job marked interrupted on next start. `.part` kept
  24h with "Recover render" if playable.
- Editor not blocked; non-modal job chip with progress + cancel.
- One export at a time in Phase 1; queue in Phase 2.

## Failure modes

See master spec §12.10 for the code/message/action table (`MOTION_CODEC_UNSUPPORTED`,
`MOTION_ASSET_MISSING`, `MOTION_FONT_MISSING`, `MOTION_DISK_FULL`,
`MOTION_RENDER_FAILED`, `MOTION_CANCELLED`, `MOTION_VERIFY_FAILED`,
`MOTION_REVISION_CONFLICT`).

## Post-export

Toast "Export complete · 15.0s · 24 MB" with Open, Reveal, Render again.
Browser shows latest render thumbnail + "Export last render." `renders/index.json`
stores filename, preset, revision, duration, size, createdAt (rebuildable by
scanning). "Export frame" writes a PNG of the current playhead. "Copy settings"
copies the preset as JSON.

## Hidden render window

- Second renderer entry: `src/renderer/motion-render.html` →
  `release/app/dist/renderer/motion-render.js`.
- `electron.vite.config.ts` gains it as an additional `rollupOptions.input`.
- `webPreferences`: `contextIsolation: true`, `sandbox: true`,
  `nodeIntegration: false`, same preload, `backgroundThrottling: false`.
- Window `show: false`, sized to output resolution, destroyed after the job.
- Main rejects export channels from any sender other than the current render
  window id.
- The page renders nothing but the export driver: no app shell, no router, no
  providers. It must not import `src/renderer/App.tsx`.

## Color, transparency, codecs

Local probe (Electron 44 / Chromium 152 / Linux): H.264 High (`avc1.640028`)
supported; Baseline/Main not; HEVC not; VP9 supported; AV1 supported. Probe at
runtime via `VideoEncoder.isConfigSupported` or Mediabunny's
`canEncodeVideo`/`getFirstEncodableVideoCodec`. Preset order: H.264 High MP4 →
H.264 video-only + warning → VP9 WebM → AV1 WebM (opt-in) → error.

Transparent: WebM/VP9 supports alpha in some configs; MP4 does not. Transparent
background + MP4 preset → composite onto brand background + warning. Do not
silently produce black.

Color: screen textures sRGB, not tone-mapped twice. 3D materials ACES
tone-mapped. Canvas sRGB; encoder receives sRGB frames; no second gamma. HDR out
of scope.

Determinism: fixed timestep `i / fps`; all async resources loaded before frame 0;
no `Math.random()` in evaluation (seeded PRNG if needed); no `Date.now()` in
evaluation; camera aspect from output settings; `SRGBColorSpace` output.

## Acceptance criteria

- A 15s 1080p30 project exports to MP4 with H.264 High on this machine.
- If H.264 is unavailable, the same project exports to WebM/VP9 without
  changing the document.
- Exported duration within one frame of the selected range.
- Audio stays in sync within 1 frame over 60s.
- Cancel stops within 2s and leaves no `.part` file.
- A missing asset blocks export with a list, not a generic failure.
- Exporting while editing uses the snapshot revision.
- Exported file contains no grid, gizmos, selection outlines, or safe-area
  guides.
- Transparent scenes warn on MP4 and do not silently render black.

## Files to touch

- `src/main/motion/render-host.ts` — hidden window lifecycle.
- `src/main/motion/render-jobs.ts` — job state machine, chunk sink, verify,
  rename.
- `src/main/motion/preflight.ts` — document-level checks (Electron-free).
- `src/main/ipc/handlers/motion-export.ts`.
- `src/renderer/motion-render.html`, `src/renderer/motion-render.tsx`.
- `src/hooks/use-motion-export.ts`.
- `src/components/motion/export/*`.

## Tests

- `motion-preflight.test.ts` — blocking/warning cases.
- `bun run test:export` (opt-in) — 12-frame smoke, verify with Mediabunny
  `Input`.
- Golden frames (opt-in) — see `testing-and-qa.md`.
