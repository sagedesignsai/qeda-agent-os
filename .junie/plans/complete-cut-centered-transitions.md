---
sessionId: session-261120-073513-s2cf
---

# Studio Editor — PR3 & PR4: Export Parity and Camera Parity

## PR Status Summary

| PR | Name | Status | Notes |
|----|------|--------|-------|
| PR1 | Layer order | ✅ Done | `layers.ts`, `reorderTrack()`, chevron buttons, 12 tests |
| PR2 | Preview audio mixer | ✅ Done | `schedule.ts`, `sync()` API, drift guard, 11 tests |
| PR3 | Export parity | ✅ Done | `mixAudioSamples` is pure array math, typed `track.volume`, silence emission, frame count fixed, 6 tests |
| PR4 | Camera parity | ✅ Done | Shared `stepCameraWithDelta`, frame-rate independent, preview/export convergence, 6 tests |

### What's already done (PR1 + PR2)
- **Layer ordering**: `timeline/layers.ts` with `TRACK_LANE_RANK`, `sortTracksForTimeline()`, `trackPaintOrder()`, `moveTrackWithinType()`. `zIndex` removed from `StudioTrack`. `reorderTrack()` in store with undo/redo. Chevron buttons in track headers. 12 tests.
- **Preview audio mixer**: `audio/schedule.ts` with `planAudioSchedule()`. `StudioAudioMixer` uses `sync()` API with structured params. Drift guard resyncs at 120ms. StudioCanvas wired to call `sync()`. 11 tests.
- **Core features**: Cut-centered transitions, multitrack audio, ripple operations, waveforms, multi-select, cross-track drag, transition hover preview — all complete and tested.

## PR3 — Export Audio Parity

### Current Issues
1. **`mixAudioSamples()` depends on `getAudioContext()`** (`mixer.ts:133`) — export runs headless; `AudioContext` may not be available. The function only uses it to check availability, then does pure array math.
2. **`(track as any).volume`** (`mixer.ts:163`) — `TimelineTrack` already has a typed `volume?: number` field. The cast is unnecessary.
3. **No silence emission for empty audio frames** (`export-renderer.ts:751`) — when `audioClips.length === 0`, no `AudioData` is encoded, leaving timestamp gaps in the Opus stream.
4. **Extra frame rendered** (`export-renderer.ts:581`) — `frameIndex <= totalFrames` renders one frame beyond the composition duration.

### Changes
- **`src/lib/studio/audio/mixer.ts`**:
  - Remove `getAudioContext()` call from `mixAudioSamples()` — the function is pure array math.
  - Replace `(track as any).volume` with typed `track.volume`.
  - Add `sourceRate` parameter for proper speed-adjusted sample reading (currently reads 1:1, ignoring clip speed).
- **`src/lib/studio/render/export-renderer.ts`**:
  - Emit silence `AudioData` (zeros) when no audio clips are active at a frame.
  - Change `frameIndex <= totalFrames` → `frameIndex < totalFrames`.
  - Reuse `sourceRateForClip` from `evaluate.ts` for speed-adjusted mixing.

### Tests
- `mixAudioSamples` without `AudioContext` returns valid samples.
- Silence emission produces continuous timestamps across empty regions.
- Frame count equals `ceil(duration / interval)` without the extra frame.
- Speed-adjusted clips mix at correct source offsets.

## PR4 — Camera Parity

### Current Issues
1. **Export has private `stepCameraWithAlpha`** (`export-renderer.ts:527-537`) — duplicates `camera.ts` logic with raw alpha instead of easing name.
2. **`CAMERA_SMOOTHING_60FPS` duplicated** (`export-renderer.ts:115-118`) — mirrors values from `camera.ts` instead of importing.
3. **Preview doesn't use frame delta** — calls `stepCamera()` with fixed smoothing every frame. On 120 Hz displays, camera moves twice as fast. Export handles this via `adaptSmoothing()` but preview doesn't.

### Changes
- **`src/lib/studio/render/camera.ts`**:
  - Export `CAMERA_SMOOTHING_60FPS` constant for reuse.
  - Add `stepCameraWithDelta(current, target, easing, dtMs)` with frame-rate-independent smoothing: `alpha = 1 - (1 - smoothing)^(dtMs / 16.667)`.
  - Keep `stepCamera()` as a convenience wrapper with `dtMs = 16.667`.
- **`src/components/studio/StudioCanvas.tsx`**:
  - Pass measured frame delta (`elapsed` from `now - previousFrame`) to `stepCameraWithDelta()`.
- **`src/lib/studio/render/export-renderer.ts`**:
  - Remove private `stepCameraWithAlpha()` and `CAMERA_SMOOTHING_60FPS`.
  - Import `stepCameraWithDelta` from `camera.ts`.
  - Call `stepCameraWithDelta(camera, target, easing, 1000 / fps)`.

### Tests
- `stepCameraWithDelta` at 16.67ms and 33.3ms produce equivalent motion over equal wall time.
- Export and preview converge to the same camera state from the same start.
- No regression in existing camera tests.

# Delivery Steps

### ✓ Step 1: Fix all 8 failing tests
Update stale test expectations to match current component text and behavior.

### ✓ Step 2: Fix stereo audio export
Extend the export renderer to encode both audio channels instead of mono.

### ✓ Step 3: Mix original recording audio into export
**Resolution**: Already handled by existing pipeline. No code changes needed.

### ✓ Step 4: Add ripple delete and trim operations
Auto-close gaps when clips are deleted or trimmed.

### ✓ Step 5: Add audio waveform visualization
Render audio clip waveforms in the timeline canvas.

### ✓ Step 6: Add transition hover preview
Show a subtle transition indicator when hovering over adjacent clip cuts.

### ✓ Step 7: Add multi-clip selection
Enable shift-click and drag-select for batch operations.

### ✓ Step 8: Add drag-and-drop between tracks
Allow clips to be moved between tracks via drag.

### ✓ Step 9: Final verification and cleanup
End-to-end verification of all implemented features.

### ✓ Step 10: PR3 — Export audio parity
Remove `AudioContext` dependency from `mixAudioSamples`, fix typed track volume, emit silence for empty frames, and fix the extra-frame bug.

- Remove `getAudioContext()` call from `mixAudioSamples()` in `mixer.ts` — the function is pure array math.
- Replace `(track as any).volume` with typed `track.volume` in `mixer.ts`.
- Add `sourceRate` parameter to `mixAudioSamples()` for proper speed-adjusted sample reading.
- In `export-renderer.ts`, emit silence `AudioData` (zeros) when no audio clips are active at a frame.
- Change `frameIndex <= totalFrames` → `frameIndex < totalFrames` to avoid rendering one extra frame.
- Add tests: `mixAudioSamples` without AudioContext, silence emission, frame count, speed-adjusted mixing.

### ✓ Step 11: PR4 — Camera parity
Unify preview and export camera stepping into a single frame-rate-independent function.

- Export `CAMERA_SMOOTHING_60FPS` from `camera.ts` for reuse.
- Add `stepCameraWithDelta(current, target, easing, dtMs)` to `camera.ts` with frame-rate-independent smoothing.
- Keep `stepCamera()` as a convenience wrapper with `dtMs = 16.667`.
- In `StudioCanvas.tsx`, pass measured frame delta to `stepCameraWithDelta()`.
- In `export-renderer.ts`, remove private `stepCameraWithAlpha()` and `CAMERA_SMOOTHING_60FPS`.
- Import and call `stepCameraWithDelta(camera, target, easing, 1000 / fps)` in the export loop.
- Add tests: frame-rate independence, preview/export convergence.