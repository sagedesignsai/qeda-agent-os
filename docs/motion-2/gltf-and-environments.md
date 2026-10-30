# glTF and environments

**Phase:** 2
**Dependencies:** `assets.md`, `scenes-and-nodes.md`, `export-pipeline.md`
**Master spec:** §6.7 (model/environment), §8.4 (model), §11.2
**Goal:** import, validate, and render glTF/GLB models and HDR/EXR
environments with deterministic animation playback.

## glTF import

- Primary path is a single `.glb`. A `.gltf` with external buffers/textures is
  imported into a folder and its relative URIs rewritten to bundle-relative
  paths.
- Validate with `gltf-validator`; errors block import, warnings shown but do
  not block.
- Draco, KTX2/Basis, and Meshopt decoders ship with `three` and are wired
  through `GLTFLoader` (`setDRACOLoader`, `setKTX2Loader`,
  `setMeshoptDecoder`). Do not fetch decoders from a CDN.
- Metadata stored: scene graph, animation names, bounding box.
- `model.gltf` node props: `assetId` (required), `animationName`,
  `animationMode` (none/clip/loop), `animationSpeed`, `castShadow`,
  `receiveShadow`, `opacity`.
- Load once per asset id, clone the scene per node. Drive `AnimationMixer`
  with `mixer.setTime(sceneTime)` so scrubbing and export are deterministic.
  Never use `useFrame` delta time.
- Auto-scale on import based on the bounding box so the model fits the scene.
- Animation dropdown shows "None" if the model has no animations.

## Environments

- `environment` assets are HDR/EXR. Optional.
- A scene background can reference one:
  `{ type: 'environment', assetId, intensity?, blur? }`.
- Renderer uses `RGBELoader`/`EXRLoader` and sets `scene.environment`.
- Cache the decoded texture per asset id; dispose on project close.
- Environment maps are expensive; only load when referenced.

## Node type additions (Phase 2)

- `camera.orthographic` — `zoom`, `near`, `far`, `lookAt`.
- `light.spot` — `intensity`, `color`, `angle`, `penumbra`, `distance`,
  `castShadow`.
- `text.badge` — text props + `backgroundColor`, `paddingX`, `paddingY`.

## Thumbnails

- Models: Phase 1 uses a type icon. Phase 2 renders a turntable thumbnail in
  the hidden render window.

## Acceptance criteria

- A GLB with Draco/KTX2/Meshopt loads with the decoders bundled in `three`.
- A `.gltf` with sidecar textures imports as a folder and renders identically.
- Animations play deterministically: scrubbing and export agree frame-for-frame.
- An environment map lights the scene and is cached/disposed correctly.
- A model with no animations shows "None" and holds the bind pose.

## Files to touch

- `src/lib/motion/asset-probe.ts` — glTF metadata via `@gltf-transform/core`.
- `src/components/motion/scene/*Model*.tsx` — GLTFLoader bindings.
- `src/components/motion/scene/*Environment*.tsx` — RGBE/EXR loader.
- `src/main/motion/asset-store.ts` — folder import, URI rewriting.

## Tests

- `motion-assets.test.ts` — glTF probe (mocked).
- R3F test-renderer: model node renders without throwing.
- Golden-frame test for a model scene.
- Export smoke with a model scene.
