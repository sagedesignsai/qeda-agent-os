---
sessionId: session-261105-204226-7pb7
---

# Replace music-metadata with music-tag-native for faster scanning

## Overview

The current scanner takes **1h15min for ~3000 tracks** because `music-metadata` (pure JavaScript) parses each audio file at ~2.5s/file. Replacing it with `music-tag-native` — a Rust-based native module (napi-rs + lofty) — will reduce tag parsing to ~50-100ms/file, bringing a full scan of 3000 tracks down to **under 2 minutes**.

## Current Implementation

### Bottleneck: `src/main/music/metadata.ts` (108 lines)

The `readTrackMetadata()` function calls `music-metadata`'s `parseFile()`, which:
- Reads the file through a Node.js stream
- Parses container format headers in JavaScript (MP4 atoms, ID3 frames, Vorbis comments, etc.)
- Decodes codec info, duration, bitrate, and tags
- At `PARSE_CONCURRENCY = 12`, processes ~12 files in parallel, but each takes ~2s

### What `music-tag-native` provides instead

- `MusicFile.loadSync(path)` — synchronous native parse (Rust → napi-rs)
- Same fields: `title`, `artist`, `album`, `albumArtist`, `genre`, `year`, `trackNumber`, `discNumber`, `duration` (ms), `bitRate` (kbps)
- Read-only audio properties: `quality` (HQ/SQ/HiRes), `bitDepth`, `sampleRate`, `channels`, `tagType`
- No `codec` string — instead we infer playability from file extension + whether parsing succeeds

### Key difference: codec detection

The current code detects unplayable codecs (ALAC, WMA, APE, etc.) from `meta.format.codec`. `music-tag-native` doesn't expose a codec string. Instead:
- **Playable extensions** remain the gate: `.mp3`, `.m4a`, `.m4b`, `.aac`, `.flac`, `.ogg`, `.oga`, `.opus`, `.wav`, `.webm`
- **ALAC detection**: `music-tag-native` can parse ALAC tags. We detect ALAC by checking if the file has an `.m4a`/`.m4b` extension AND `quality === 'HiRes'` (ALAC is classified as HiRes). This preserves the current behavior of skipping provisional rows for `.m4a`/`.m4b` and checking after parsing.
- **Other unplayable formats** (WMA, APE, DSD, WavPack, TTA) aren't in the playable extensions list, so they're never walked.

## Execution Steps

### ✓ Step 1: Update package.json dependencies
Remove `music-metadata` from root `package.json`, add `music-tag-native` to `release/app/package.json`.

### ✓ Step 2: Rewrite `src/main/music/metadata.ts`
Replace `parseFile()` with `MusicFile.loadSync()`, map fields, add codec inference and ALAC detection.

### ✓ Step 3: Check for other imports of music-metadata
No remaining code references to `music-metadata` found. Test comment updated.

### ✓ Step 4: Verify tests still work
The mock in `music-scan.test.ts` mocks at the module level — no changes needed. No Jest config or `.erb/mocks/` entry for music-metadata existed.

## Scope

### In Scope
- Replace `music-metadata` with `music-tag-native` in `src/main/music/metadata.ts`
- Update `readTrackMetadata()` to use `MusicFile.loadSync()`
- Update `readArtwork()` to use `music-tag-native` picture extraction
- Remove `music-metadata` from `package.json` dependencies
- Add `music-tag-native` to `release/app/package.json` (native module)
- Update `src/__tests__/music-scan.test.ts` mock to match the new interface
- Keep the same `ScannedTrack` return type — no changes to the DB layer or scanner

### Out of Scope
- Changing the scanner's concurrency model, batching, or progress reporting
- Modifying the DB layer (`music-store.ts`)
- Changing the file watcher
- Modifying IPC handlers or renderer hooks

## Technical Design

### File: `src/main/music/metadata.ts`

Replace the `parseFile()` call with `MusicFile.loadSync()`. Map the fields:

| Current (`music-metadata`) | New (`music-tag-native`) | Notes |
|---|---|---|
| `meta.common.title` | `musicFile.title` | Direct |
| `meta.common.artist` | `musicFile.artist` | Direct |
| `meta.common.album` | `musicFile.album` | Direct |
| `meta.common.albumartist` | `musicFile.albumArtist` | camelCase |
| `meta.common.genre?.[0]` | `musicFile.genre` | Single string |
| `meta.common.year` | `musicFile.year` | Direct |
| `meta.common.track?.no` | `musicFile.trackNumber` | Direct |
| `meta.common.disk?.no` | `musicFile.discNumber` | Direct |
| `meta.format.duration * 1000` | `musicFile.duration` | Already in ms |
| `meta.format.bitrate` | `musicFile.bitRate * 1000` | kbps → bps |
| `meta.format.codec` | inferred | See below |

**Codec inference for `ScannedTrack.codec`:** The DB stores a `codec` column. We'll derive it from `tagType` + file extension:
- `.mp3` → `'MPEG 1 Layer 3'`
- `.flac` → `'FLAC'`
- `.ogg`/`.oga` → `'Vorbis'` (or `'Opus'` for `.opus`)
- `.m4a`/`.m4b`/`.aac` → `'AAC'` (or `'ALAC'` if HiRes)
- `.wav` → `'PCM'`
- `.webm` → `'Opus'`

**Unplayable detection:** Return `null` when `musicFile.quality === 'HiRes'` AND the extension is `.m4a`/`.m4b` (ALAC in MP4 container). This preserves the current behavior of skipping ALAC files.

### File: `src/main/music/art.ts`

Replace `parseFile(filePath, { skipCovers: false })` with `MusicFile.loadSync(filePath).pictures`. The `pictures` array contains `{ data: Uint8Array, mime: string }` — same shape as the current `Artwork` interface.

### Package Changes

**`package.json`**: Remove `"music-metadata": "^12.3.4"` from dependencies.

**`release/app/package.json`**: Add `"music-tag-native": "^0.2.5"` to dependencies (native module goes in the release package per project conventions).

### Test Changes

The test mock in `src/__tests__/music-scan.test.ts` mocks `readTrackMetadata()` at the module level, so the mock doesn't need to change — it still returns a `ScannedTrack` or `null` or throws. The contract is preserved.

## Risks

1. **Native module rebuild on Electron update**: `music-tag-native` ships prebuilt binaries for common Electron/Node versions. If the Electron version changes, the binaries may need rebuilding. Mitigation: prebuilt binaries cover recent Node versions; electron-rebuild will handle it.
2. **ALAC detection heuristic**: We infer ALAC from `.m4a` + HiRes quality. If a HiRes AAC file exists (unlikely but possible), it would be incorrectly skipped. Mitigation: this is the same limitation as the current code, which also can't distinguish AAC from ALAC without parsing.
3. **`tagType` vs `codec`**: The DB `codec` column will store inferred values (e.g., `'MPEG 1 Layer 3'` for `.mp3`) rather than values read from the file. This is cosmetic — the column is not used for playback decisions.

## Data Flow (unchanged except the parser)

```
Renderer (add folder / scan-start)
  → IPC invoke
    → music:folder-add / music:scan-start
      → addMusicFolder() / scanMusicFolder()
        → walkAudioFiles() [discover]
          → statAudioFile() [parallel stat]
        → indexFiles() [reconcile + enrich]
          → getFolderTrackStates() [change detection]
          → insertProvisionalTracks() [filename-only rows]
          → readTrackMetadata() [tag parsing, bounded concurrency]
            → MusicFile.loadSync() [native Rust parse, ~50ms vs ~2s]
          → upsertScannedTracks() [batched DB writes]
        → markMissingTracks() [only if walk was complete]
      → IPC broadcast: music:scan-progress, music:changed
        → useMusicLibrary() reloads state
```
