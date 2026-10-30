# Asset marketplace

**Phase:** 2 (after `assets.md` import pipeline)
**Dependencies:** `assets.md`, `persistence.md`, `document-model-v4.md`
**Master spec:** §6.7, §11.2–§11.9, §16.2
**Goal:** let a user search a public 3D catalog and import a model or environment
into the current project bundle — without making the project depend on the
network after import.

## Why this is separate from `assets.md`

`assets.md` scopes the bundle pipeline and explicitly defers "cloud assets,
global library (OQ-3)". This brief picks that up narrowly: **download at import
time, bundle afterwards**. Nothing in `project.json` may reference a remote URL.

That gives one hard rule which every decision below follows:

> After `asset.add`, the asset is a normal bundle file. Opening the project
> offline, moving it, or duplicating it must not touch the network.

The marketplace is a *source of bytes*, not a new kind of asset.

## Scope

In scope:

- A provider interface in main and the first provider (Poly Haven).
- Search, variant selection, download, validation, and staging into the existing
  `assets/<assetId>/` layout.
- Provenance recorded in `MotionAsset.metadata` and surfaced as credits.
- A dialog in the editor that searches and imports.

Out of scope:

- Cloud-hosted project assets, cloud sync, shared team libraries.
- Sketchfab. Their Download API requires the end user to authenticate with a
  Sketchfab account inside the app, plus license display and creator
  attribution in every downstream surface. That is a product decision, not an
  integration detail; treat it as a separate brief if it is ever wanted.
- Paid catalogs, AI generation, marketplace publishing.
- Background prefetch or a persistent global cache across projects.

## Providers

| Provider | Kinds | Formats | Auth | License | Status |
| --- | --- | --- | --- | --- | --- |
| **Poly Haven** | model, environment | `.gltf` (+ bin/textures), `.hdr`, `.exr` | none; unique `User-Agent` required | CC0 | Phase 2 — first provider |
| ambientCG | environment | `.exr` in ZIP | none | CC0 | Later; needs ZIP extraction |
| Poly Pizza | model | `.glb` | free API key | CC0 + CC-BY (+ NC/ND) | Later; needs license filtering |
| Khronos sample assets | model | `.glb`, `.gltf` | none | per-model CC0/CC-BY | Optional bundled seed, not a live search |

Only CC0 and CC-BY are importable. NC/ND assets are filtered out of search
results rather than imported with a warning, because the export pipeline cannot
enforce a non-commercial restriction later.

### Poly Haven specifics

- `GET https://api.polyhaven.com/assets?type=hdris|models` — full catalog,
  ~1 MB / ~0.5 MB. Fetch once, cache in memory for 30 minutes, and serve search
  from the cache so typing does not hit the API per keystroke.
- `GET https://api.polyhaven.com/files/{id}` — per-asset file tree, cached for
  10 minutes. HDRI variants are `hdri/<res>/hdr|exr`; model variants are
  `gltf/<res>/gltf` with an `include` map of `.bin` and texture files.
- Requests send `User-Agent: Qeda Motion Asset Browser/<version>`; the API terms
  require a unique agent. 429 responses honour `Retry-After`.
- The UI credits "Powered by Poly Haven" in the dialog footer, as the API terms
  require. The assets themselves are CC0 and need no attribution.
- Asset pages are `https://polyhaven.com/a/<id>`.

## Provider contract

```ts
export type MotionRemoteAssetKind = 'model' | 'environment';

export type MotionRemoteAssetHit = {
  provider: MotionRemoteProviderId;
  id: string;
  name: string;
  kind: MotionRemoteAssetKind;
  creator?: string;
  license: string;              // SPDX identifier
  attribution?: string;         // required for CC-BY
  thumbnailUrl?: string;
  pageUrl: string;
  description?: string;
  popularity?: number;
};

export type MotionRemoteVariant = {
  id: string;                   // provider-scoped, e.g. "2k-exr"
  label: string;                // "2K · EXR"
  format: 'hdr' | 'exr' | 'glb';
  byteSize?: number;
  resolution?: number;
};
```

A provider implements:

```ts
interface MotionRemoteProvider {
  id: MotionRemoteProviderId;
  credit: string;
  search(query: string, kind: MotionRemoteAssetKind, limit: number): Promise<{ hits: MotionRemoteAssetHit[]; total: number }>;
  variants(assetId: string, kind: MotionRemoteAssetKind): Promise<MotionRemoteVariant[]>;
  resolve(assetId: string, kind: MotionRemoteAssetKind, variantId: string): Promise<{
    files: Array<{ url: string; relativePath: string }>;
    entry: string;          // bundle-facing file name
    pack: 'none' | 'gltf-to-glb';
    expectedBytes: number;
    provenance: MotionRemoteProvenance;
  }>;
}
```

The renderer never sees a URL it can pass back. Search and import requests carry
`provider` + `assetId` only; main resolves the URL from its own provider table.

## Download and import flow

1. **Search.** Renderer debounces, then calls `motion:search-remote-assets`.
   Main answers from the cached catalog and ranks locally.
2. **Variant.** Selecting a result calls `motion:remote-asset-variants`. This is
   the first call that fetches `/files/{id}`, so browsing stays cheap.
3. **Download.** `motion:import-remote-assets` resolves the variant and streams
   each file into a temporary directory outside the project. Every file is
   downloaded with a byte cap, a timeout, and a progress event.
4. **Normalize.** Models arrive as `.gltf` + `.bin` + textures. Main packs them
   to a single `.glb` with `@gltf-transform/core` `NodeIO.read()` /
   `writeBinary()` before staging. This keeps the bundle free of relative-URI
   resolution and reuses the existing GLB probe. Environments stay `.hdr` or
   `.exr`.
5. **Stage + commit.** The temporary file is handed to the existing
   `MotionAssetStore.stageAssets()`, so hashing, probing, staging TTL,
   `probeUrl`, and the 500-asset limit all behave exactly as for a local import.
   The renderer commits `asset.add` with the provenance in `metadata`.
6. **Cleanup.** The temporary directory is removed in `finally`, including on
   failure and on cancellation.

Downloads are serialized per import request and capped at two concurrent
requests across the app. A 2 GB asset is already refused by the staging layer;
models are additionally capped at 200 MB, per `assets.md`.

### Why pack glTF to GLB

Remote models are packed to GLB to produce one deterministic, self-contained
file and avoid carrying provider-specific directory layouts into the bundle.
The local importer separately supports `.gltf` files with relative sidecars;
packing keeps the remote path independent of that folder-import behavior.

## Provenance

Recorded on the imported asset, so it survives save, duplicate, and export:

```ts
metadata: {
  source: 'polyhaven',
  sourceAssetId: 'potted_plant_02',
  sourceUrl: 'https://polyhaven.com/a/potted_plant_02',
  license: 'CC0-1.0',
  creator: 'Rohit Seervi',
  attribution?: '…',            // present for CC-BY
  providerCredit: 'Powered by Poly Haven',
  retrievedAt: '2026-10-30T12:00:00.000Z',
  variant: '2k',
  upstreamUrl: 'https://dl.polyhaven.org/…',   // audit only, not resolved at runtime
}
```

`retrievedAt` makes it possible to explain an asset's origin years later; the
export credits manifest reads these fields and never the network.

## Security

- **Allowlist, not user URLs.** `provider` + `assetId` resolve to a URL inside a
  hard-coded per-provider host set. Unknown hosts, non-HTTPS schemes, explicit
  ports, and URLs containing userinfo are rejected.
- **Redirects.** Follow at most 3 hops, validating the host on every hop.
- **Content.** Reject `text/html` and unknown `Content-Type`; conclude the file
  type from the staged extension and the existing probe, never from the header
  alone.
- **Size.** `Content-Length` is advisory; the stream enforces the cap and aborts
  when exceeded, so a lying header cannot fill the disk.
- **Timeouts.** 30 s to first byte, 5 min total per file, abortable from the UI.
- **No execution.** Nothing downloaded is executed. `@gltf-transform` parses
  the document and rewrites buffers; a parse failure rejects the import.
- **Temporary files** live under the OS temp root with `mkdtemp`, never inside
  the project, and are removed even when the import fails.
- **SSRF.** Because URLs come from the provider table, not from renderer input,
  there is no path to an arbitrary host or a private address.

## UI

Entry point: the editor's **Add** menu → "Browse asset library…", plus a search
dialog that can be reopened from the asset panel once that lands.

```
┌ Asset library ─────────────────────────────── ✕ ┐
│ [ Search models and environments… ]  Models | Env │
│                                                  │
│  [thumb] Potted Plant 02       CC0   2K ▾ Import │
│  [thumb] Sunset JHB Central    CC0   2K ▾ Import │
│  …                                               │
│                                                  │
│  Assets by Poly Haven · CC0 · Download only      │
└──────────────────────────────────────────────────┘
```

- Results show a thumbnail, name, creator, license badge, and variant picker.
- The variant picker defaults to **2K** to keep downloads small; 8K+ HDRIs are
  labelled with their size so the choice is informed.
- Import shows a progress row per asset and never blocks the dialog close.
- Failures are listed inline (`MotionImportError`), not thrown.
- The footer always states the provider and that assets are downloaded once and
  then bundled locally.

## IPC

| Channel | Request | Response |
| --- | --- | --- |
| `motion:search-remote-assets` | `{ provider, query, kind, limit? }` | `{ hits, total, providerCredit }` |
| `motion:remote-asset-variants` | `{ provider, assetId, kind }` | `{ variants, license, attribution?, pageUrl }` |
| `motion:import-remote-assets` | `{ projectId, provider, assetId, kind, variantId, requestId? }` | `{ items, errors, provenance }` |
| `motion:remote-import-progress` | event | `{ requestId?, assetId, receivedBytes, totalBytes? }` |
| `motion:cancel-remote-import` | `{ requestId }` | `void` |

`motion:import-remote-assets` returns the same `MotionStagedAsset` shape as
`motion:stage-assets`, so commit, cancel, and error handling are shared. The
`provenance` map is keyed by `importId`; the renderer folds it into the
`asset.add` metadata.

## Failure behaviour

- Search failure → inline "Couldn't reach Poly Haven", retry button, no dialog
  close.
- Variant failure → that result's Import button shows the error; other results
  stay usable.
- Partial file-set failure → the whole asset fails; the temporary folder is
  discarded; no orphan staged import is registered.
- Import failure after staging → `motion:cancel-import` is called for the
  returned ids, moving them to `.trash/`.
- Rate limit → honour `Retry-After` and show "Try again in Ns".
- Offline → search and import fail cleanly; already-imported assets keep working
  because they are bundle files.

## Tests

Main, with an injected `fetch` and an injected packer (no network, no real glTF
work):

- Catalog ranking prefers name matches over description matches and filters by
  kind.
- Empty query returns the most downloaded assets, capped by `limit`.
- Variant mapping: HDRI resolutions/formats and model resolutions are ordered
  and labelled.
- Import downloads every declared file into the temp tree, packs once, and
  passes exactly one path to `stageAssets`.
- A non-allowlisted host, `http:`, a redirect to an unknown host, and a
  `text/html` body are rejected.
- A stream that exceeds the cap aborts and cleans up the temp directory.
- Provenance carries license, creator, source URL, and `retrievedAt`.
- Import failure leaves no staged import and removes the temp directory.

Component (once the asset panel exists):

- Search debounces; selecting a variant imports once; progress and errors render.

## Acceptance criteria

- Searching "sunset" returns environments; searching "plant" returns models,
  without a request per keystroke.
- Importing an HDRI at 2K produces one bundle file, one `asset.add` op, and
  opens offline afterwards.
- Importing a model produces a single `.glb` whose scene matches the preview,
  with textures embedded.
- `project.json` contains no URL for the asset — only bundle-relative paths.
- Killing the network after import does not affect open, scrub, or export.
- Every imported asset carries `metadata.source`, `license`, and `retrievedAt`.
- Re-importing the same asset deduplicates by hash through the existing
  `commitAssets` path.
- A CC-BY asset cannot be imported without its attribution string.

## Files

- `src/main/motion/remote-assets.ts` — provider contract, Poly Haven client,
  download/pack, provenance.
- `src/main/ipc/handlers/motion-projects.ts` — three handlers plus progress
  broadcast.
- `src/hooks/use-motion-remote-assets.ts` — search, variants, import, progress.
- `src/components/motion/assets/MotionAssetMarketplaceDialog.tsx` — the dialog.
- `src/components/motion/MotionEditor.tsx` — "Browse asset library…" entry.
- `src/__tests__/motion-remote-assets.test.ts` — provider and download tests.

## Open questions

- **OQ-M1.** Should imported assets be deduplicated across projects by hash, or
  only within one project? Current answer: within a project, via
  `commitAssets`. A global content-addressed store is Phase 3+.
- **OQ-M2.** Do we want a persistent catalog cache on disk? Current answer: no.
  In-memory only; a stale catalog is cheap to refetch and avoids a second
  invalidation surface.
- **OQ-M3.** Should the dialog offer Sketchfab's "open in browser" fallback?
  Current answer: not in this brief.
