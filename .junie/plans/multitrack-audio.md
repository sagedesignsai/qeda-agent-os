---
sessionId: session-261120-073513-s2cf
---

# Multitrack Audio Playback and Export

## Current State

### What exists
- **Audio track model**: `TimelineTrack` with `type: 'audio'` exists, with `muted` and `volume` properties on clips via `StudioClipPayload.volume`.
- **Audio clip creation**: `buildAudioClips()` in `convert.ts` creates audio clips that mirror video clips from the original recording.
- **Waveform rendering**: `TimelineCanvasViewport.tsx` renders audio waveforms using `audioPeaks` from `useTimelineMedia`.
- **Audio context**: Shared `AudioContext` in `src/lib/audio/context.ts` with a mixer bus in `src/lib/audio/mixer.ts` (for music/soundscape/UI).
- **Export audio**: The export renderer produces a **muted video-only WebM**. Audio is merged later by ffmpeg from the original recording file via `audioInputPath`.
- **Imported audio skipped**: `export-renderer.ts` line 290 explicitly skips `asset.kind === 'audio'`. No audio decoding, mixing, or encoding for imported audio.

### What's missing
1. **No audio playback mixing**: During preview, all video elements are muted. No Web Audio API mixing of timeline audio tracks.
2. **No imported audio decoding**: Audio-only assets placed on the timeline are never loaded or played.
3. **No multitrack audio export**: Export uses only the original recording audio. Imported audio clips and per-track volume/mute are ignored.
4. **No audio encoding in export**: The export renderer never encodes an audio stream — it relies entirely on ffmpeg to merge the original recording's audio.

## Delivery Steps

### ✓ Step 1: Audio playback mixing in preview
Add real-time audio mixing of all active audio tracks during Studio preview playback.

- Create `src/lib/studio/audio/mixer.ts` — a Web Audio API mixer that:
  - Creates `AudioBufferSourceNode` instances for each active audio clip at the current playhead position.
  - Crossfades between overlapping clips on adjacent tracks.
  - Respects per-track `muted` and per-clip `volume` properties.
  - Cross-seeks audio when the playhead scrubs.
  - Connects to the shared `AudioContext` destination.
- Integrate with `StudioCanvas.tsx` playback loop:
  - On play, start the audio mixer.
  - On each frame, update the mixer with currently active audio clips from `evaluateEditorTimeline().audio`.
  - On pause/stop, stop the mixer cleanly.
- Handle audio-only assets: load audio files via `fetch()` + `decodeAudioData()` into `AudioBuffer` instances.
- Handle video clip audio: extract audio from video elements via `createMediaElementSource()`.

### ✓ Step 2: Multitrack audio export encoding
Encode a mixed audio stream during export so the final video contains all timeline audio.

- In `export-renderer.ts`:
  - Decode all audio clips on the timeline into `AudioBuffer` instances before the frame loop.
  - For each frame, sample the active audio clips at the current composition time.
  - Mix samples from all active audio tracks, applying per-clip volume and per-track mute.
  - Write mixed samples to an `AudioEncoder` (Opus) and feed chunks to the `WebMMuxer`.
  - Handle imported audio-only assets by loading and decoding them.
  - Handle video clip audio by extracting audio tracks from video elements.
- Update `WebMMuxer` to accept audio codec chunks alongside video chunks.
- After export, the rendered WebM contains both video and mixed audio.
- Update `studio-export.ts` to handle the case where the rendered WebM already has audio (skip `audioInputPath` merge if the composed render has audio).

### ✓ Step 3: Audio track UI controls
Add volume and mute controls per audio track in the timeline.

- In `TimelineTrackHeaders.tsx`:
  - Add a volume slider for audio tracks (0-100%, default 100%).
  - Add a mute toggle button (already partially implemented via `track.muted`).
- In `ClipPropertiesSection.tsx`:
  - Show volume control for audio clips.
  - Show waveform preview for audio clips.
- Wire controls to `updateTrack()` and `updateClip()` in the timeline store.

### ✓ Step 4: Tests for audio mixing
Add tests for the audio mixing pipeline.

- Test `evaluateEditorTimeline()` returns correct audio clips at various playhead positions.
- Test audio clip volume application.
- Test track mute behavior.
- Test overlapping audio clips on multiple tracks.
- Test audio-only asset decoding.
