---
sessionId: session-261108-071320-1qsk
---

# Requirements

### Overview
The Sketchfab integration was added but has several bugs preventing it from working correctly:
- **No preview images** — thumbnails don't display because the API response structure differs from what the code expects
- **Wrong authentication** — download endpoint uses `Token` auth, not `Bearer`
- **Wrong download response parsing** — the download endpoint returns formats directly, not nested
- **Wrong archive field names** — API uses `type` not `format`, `size` not `size_bytes`
- **Wrong field naming** — API uses camelCase (`likeCount`) but code expects snake_case (`like_count`)

### Goals
- Fix all type definitions to match the actual Sketchfab API v3 response
- Fix thumbnail extraction so preview images display
- Fix download authentication and response parsing
- Fix variant detection to use correct archive field names
- Remove debug console.log statements and clean up the code

# Technical Design

### Current Issues (from API investigation)

**1. Thumbnail structure mismatch**
- API returns: `thumbnails: { images: [{url, width, height, uid, size}] }`
- Code expects: `thumbnails: [{url, width, height}]` (array directly)
- Fix: Update `SketchfabModel.thumbnails` type and `sketchfabModelToHit()` to access `thumbnails.images[0].url`

**2. Archive structure mismatch**
- API returns: `archives: { glb: {type: 'glb', size: 12345, faceCount, vertexCount, ...}, gltf: {...} }`
- Code expects: `archives: { key: {format: 'gltf', size_bytes: 12345, face_count, vertex_count} }`
- Fix: Update `SketchfabArchive` type: `type` instead of `format`, `size` instead of `size_bytes`, `faceCount`/`vertexCount` instead of snake_case

**3. Download authentication**
- API requires: `Authorization: Token <key>`
- Code sends: `Authorization: Bearer <key>`
- Fix: Change auth header in `importSketchfab()` to use `Token` scheme

**4. Download response structure**
- API returns: `{ gltf: {url, size, expires}, glb: {url, size, expires}, usdz: {...}, source: {...} }`
- Code expects: `{ gltf: {url, size, expires} }` only (missing `glb` key)
- Fix: Add `glb` to `SketchfabDownloadResponse`, prefer `glb` download over `gltf` since it's a single file (no ZIP extraction needed)

**5. Field naming (camelCase vs snake_case)**
- API uses: `likeCount`, `viewCount`, `faceCount`, `vertexCount`, `animationCount`, `commentCount`, `isDownloadable`, `isAgeRestricted`, `publishedAt`, `createdAt`
- Code uses: `like_count`, `view_count`, `face_count`, `vertex_count`, `is_age_restricted`, `published_at`
- Fix: Update all `SketchfabModel` fields to camelCase

### Proposed Changes

**`src/main/motion/remote-assets.ts`**:
1. Update `SketchfabModel` type:
   - `thumbnails?: { images?: Array<{url: string; width: number; height: number}> }`
   - Remove `thumbnail` field (not in search response)
   - `license?: { uid?: string; label: string }` (remove `slug`, `full_name`, `attribution_required`)
   - Change all snake_case fields to camelCase: `likeCount`, `viewCount`, `faceCount`, `vertexCount`, `isAgeRestricted`, `publishedAt`, `createdAt`
2. Update `SketchfabArchive` type:
   - `type: string` (was `format`)
   - `size?: number` (was `size_bytes`)
   - `faceCount?: number` (was `face_count`)
   - `vertexCount?: number` (was `vertex_count`)
3. Update `SketchfabDownloadResponse`:
   - Add `glb?: { url: string; size: number; expires: number }`
4. Fix `sketchfabModelToHit()`:
   - `model.thumbnails?.images?.[0]?.url` instead of `model.thumbnails?.[0]?.url`
   - `model.likeCount` instead of `model.like_count`
5. Fix `variantsSketchfab()`:
   - Check `archive.type` instead of `archive.format`
   - Use `archive.size` instead of `archive.size_bytes`
6. Fix `importSketchfab()`:
   - Change `Authorization: Bearer` to `Authorization: Token`
   - Prefer `glb` download (single file) over `gltf` (ZIP) — skip ZIP extraction for GLB
7. Fix `sketchfabRequest()`:
   - Change `Authorization: Bearer` to `Authorization: Token`
8. Remove all `console.log` debug statements

### Files to Modify
- `src/main/motion/remote-assets.ts` — all fixes

### Architecture
No architectural changes. All fixes are within the existing `MotionRemoteAssetClient` class in `remote-assets.ts`.
```

# Delivery Steps

### ✓ Step 1: Fix Sketchfab API type definitions
Update all Sketchfab-related types to match the actual API v3 response structure.

- Update `SketchfabModel`: `thumbnails` to `{ images?: Array<{url, width, height}> }`, remove `thumbnail`, fix `license` to `{ uid?: string; label: string }`, change all snake_case fields to camelCase (`likeCount`, `viewCount`, `faceCount`, `vertexCount`, `isAgeRestricted`, `publishedAt`).
- Update `SketchfabArchive`: `type` instead of `format`, `size` instead of `size_bytes`, `faceCount`/`vertexCount` instead of snake_case.
- Update `SketchfabDownloadResponse`: add `glb` field alongside `gltf` and `usdz`.
- Update `SketchfabSearchResponse`: add `cursors`, `next`, `previous` fields from actual response.

### ✓ Step 2: Fix thumbnail, variants, auth and download logic
Fix all runtime logic to work with the corrected type definitions.

- Fix `sketchfabModelToHit()`: access `model.thumbnails?.images?.[0]?.url` for thumbnails, use `model.likeCount` for popularity.
- Fix `variantsSketchfab()`: check `archive.type` instead of `archive.format` to find glTF/GLB archives, use `archive.size`.
- Fix `importSketchfab()`: change auth header from `Bearer` to `Token`, prefer `glb` download (single file, no ZIP extraction needed) over `gltf` (ZIP archive).
- Fix `sketchfabRequest()`: change auth header from `Bearer` to `Token`.
- Remove all `console.log` debug statements from `remote-assets.ts`, `use-motion-remote-assets.ts`, and `motion-projects.ts`.

### ✓ Step 3: Verify TypeScript compilation and test
Ensure the code compiles and the fixes are correct.

- Run `bun tsc --noEmit` to verify zero TypeScript errors.
- Verify the Sketchfab search returns results with thumbnails.
- Verify the download flow works with Token auth and GLB preference.