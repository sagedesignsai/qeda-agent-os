# Asset pipeline

**Phase:** 1 (import/resolution), 2 (glTF/env thumbnails)
**Dependencies:** `persistence.md`, `document-model-v4.md`
**Master spec:** §6.7, §11.2–§11.9
**Goal:** every piece of media a project uses is a file in the bundle, addressed
by id, with a hash, and resolvable offline.

## Scope

In scope: bundle-relative paths, hashing, dedup, import flow (stage/commit),
metadata probing, thumbnails, `qeda-media://motion` resolution, relink, missing
assets, removal/GC, limits, security. Out of scope: cloud assets, global library
(OQ-3).

## Asset type (v4)

```ts
export type MotionAsset = {
  id: string;
  name: string;
  kind: MotionAssetKind;        // image | image-sequence | video | audio | font | model | environment
  mimeType: string;
  path: string;                 // bundle-relative POSIX, e.g. "assets/ab12/hero.png"
  hash: string;                 // SHA-256 hex, or 'builtin', or '' (legacy)
  byteSize: number;
  width?: number; height?: number;
  frameCount?: number; fps?: number; duration?: number;
  sourceName?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};
```

Rules: `path` relative, `/`, no `..`, no scheme. `hash` 64 lowercase hex except
builtins (`hash === 'builtin'`, `path` starts with `builtin/`) and legacy
(`hash === ''`, blocks export). Kind-specific field rules in §6.4.

## Bundle-relative resolution

The renderer never sees a filesystem path. It builds:
```
qeda-media://motion/<projectId>/<assetId>
qeda-media://motion/<projectId>/<assetId>/<frameIndex>
```
The main handler resolves `projectId` through the index, `assetId` through the
project's `assets[]`, joins the bundle root with `asset.path`, normalizes, and
rejects any result outside the bundle. Range requests for video/audio. MIME from
the asset record, not the extension. `Cache-Control: no-cache` while editing;
ETag from hash; long cache for renders.

## Import flow (two-phase)

1. **Stage.** Renderer sends absolute paths (from native dialog or
   `webUtils.getPathForFile`) to main via `motion:stage-assets`. Main validates
   each path (`fs.stat`, size ≤ 2 GB, allowed extension/MIME), creates a staging
   folder under `.staging/<importId>/`, copies with a streaming hash, probes
   metadata, and returns `{ importId, name, kind, mimeType, byteSize, probeUrl }`
   per file. `probeUrl` is `qeda-media://motion-staging/<importId>` so the
   renderer can probe video/audio/fonts without receiving a path.
2. **Probe (renderer).** For video/audio, probe duration/dimensions/codec via
   `HTMLVideoElement`/`AudioContext`. For fonts, optional `FontFace`. For
   sequences, count frames.
3. **Commit.** Renderer sends `motion:commit-assets` with `{ importId, kind,
   fps?, frameCount?, metadata? }` overrides. Main moves the staged file to
   `assets/<assetId>/source.<ext>` atomically, generates a thumbnail, and
   returns `MotionAsset` descriptors (without adding them to the document).
4. **Document.** Renderer commits one `asset.add` batch. If the user cancels,
   main moves staged folders to `.trash/` via `motion:cancel-import`.

Why the document is updated in the renderer: the document is editor-owned and
autosaved by the renderer. Main owns bytes and metadata; the renderer owns
document mutations. One writer for `project.json`.

## Metadata probing

```ts
export type MotionAssetProbe = {
  kind: MotionAssetKind;
  mimeType: string;
  width?: number; height?: number;
  duration?: number; frameCount?: number; fps?: number;
  hasAudio?: boolean; animations?: string[];
  boundingBox?: { min: MotionVector3; max: MotionVector3 };
  warnings: string[];
};
```

- Images: `image-size` for dimensions; `createImageBitmap` decode check for
  validity. No `sharp`.
- Image sequences: count matching files, probe first frame, require a frame
  rate (default 30, user-editable). Reject sequences with gaps.
- Models: `@gltf-transform/core` `NodeIO` for scene/animation/bounds; `gltf-validator`
  for validation. `.gltf` with sidecars: copy the whole folder and rewrite
  relative URIs to bundle-relative paths. Errors block import; warnings shown.
- Video/audio: probe in the renderer (or a utility window for headless later).
- Fonts: read sfnt header for format; family/weight via `fontkit` (optional);
  fall back to user naming.
- Environments: read header/dimensions; decode validated on first use.

Probe failures do not silently import a broken asset. The import summary says
which file failed and why.

## Thumbnails

- Images: 320px WebP at import.
- Video: poster frame at 0.1s.
- Models: type icon in Phase 1; turntable thumbnail in Phase 2 (hidden render
  window).
- Fonts: specimen "Aa Bb 123".
- Audio: waveform peaks (min/max per bucket) in `waveform.json`, not the
  document.
- Thumbnails are cache. If missing, regenerate; never block project open.

## Built-in assets

A small set of generated assets (starter dashboard, default environment) ship in
code as assets with `metadata.builtin = true`, `path: 'builtin/<name>'`,
`hash: 'builtin'`. Resolved through the renderer, not the filesystem. Keeps the
starter project self-contained without embedding a PNG in JSON.

## Relink and missing assets

An asset is missing when `project.json` references it but the file at `path` is
absent or its hash does not match.

- Missing assets do not prevent the project from opening.
- Node renders a magenta placeholder with the asset name and a "Relink" button.
- Asset library shows a "Missing" filter and a banner.
- Relink flow: choose a file, main hashes it, compares with stored hash. Match →
  update path. Differ → ask "This file is different from the original. Relink
  anyway?" Relink keeps the asset id and all references.
- Relink is an `asset.relink` op (undoable, agent-callable).
- Export preflight blocks on missing assets with a list and "Relink all."

## Removal and garbage collection

- `asset.remove` refuses while referenced; error lists referencing nodes/scenes.
- "Replace references…" runs `asset.replace` for each reference, then removes
  the old asset in the same batch.
- Unused assets are not deleted automatically (undo may need them).
- "Clean unused assets" is explicit: compute reachable assets, show count and
  size, move unreachable to `.trash/`, keep 7 days.
- Hash deduplication: GC counts references by path/hash, not asset id alone.

## Import limits and security

- Max 2 GB per asset; max 500 assets per project (warn at 400).
- Max image dimension 16384 px; downscale above 8192 px for preview, keep
  original for export.
- Max model 200 MB or 2M triangles; warn above, do not block.
- Reject path traversal, symlinks escaping the bundle, executables, unknown
  extensions.
- Never execute a model, font, or SVG. SVG is rasterized at import; scripts and
  external references stripped.
- `.gltf` external URIs rewritten only for files inside the imported folder;
  remote URLs rejected.
- Import runs off the UI thread for hashing/copying; renderer shows per-file
  progress.

## IPC channels

`motion:stage-assets`, `motion:commit-assets`, `motion:cancel-import`,
`motion:relink-asset`, `motion:reveal-asset`, `motion:delete-asset-file`. Plus
`qeda-media://motion` and `qeda-media://motion-staging`.

## Acceptance criteria

- Importing a PNG creates a bundle file, thumbnail, and one `asset.add` op.
- No document field contains `blob:`, `data:`, `http:`, `file:`, or an absolute
  path.
- Reloading resolves every asset through `qeda-media://`.
- Moving the project folder and "Locate project folder" restores all assets.
- A missing asset opens the project, shows a placeholder, blocks export with an
  actionable list.
- A GLB with Draco/KTX2/Meshopt loads with decoders bundled in `three`.
- A `.gltf` with sidecar textures imports as a folder and renders identically.
- Deleting a referenced asset is refused; replacing updates every reference in
  one undo step.

## Files to touch

- `src/lib/motion/assets.ts` — helpers (frame index/URL).
- `src/main/motion/asset-store.ts` — staging, hashing, commit, relink, GC.
- `src/main/motion/asset-probe.ts` — header parsing (image-size, gltf-transform).
- `src/main/ipc/handlers/motion-assets.ts`.
- `src/hooks/use-motion-assets.ts`.
- `src/components/motion/assets/*`.

## Tests

- `motion-assets.test.ts` — helpers, kind validation, frame index.
- `motion-project-store.test.ts` — import integration (staging/commit/cancel).
- Component tests for the asset library and relink dialog.
