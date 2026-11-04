---
sessionId: session-261104-165703-25ym
---

# Requirements

### Overview
The `model.gltf` node currently renders an imported glTF model as a single opaque object. Users cannot inspect which parts (meshes) and materials make up the model, nor can they bind surfaces (images/videos) to specific parts — such as placing a dashboard image on a TV screen — or animate individual parts independently.

This feature transforms the `model.gltf` node into a **structured model** that:
1. Parses the loaded glTF scene graph to extract named parts (meshes) and materials
2. Stores this structure as asset-sidecar metadata so it travels with the asset across nodes
3. Allows binding surfaces (images/videos) to specific model parts in either **replace** or **decal** mode
4. Allows overriding material properties (color, roughness, metalness) per material
5. Allows animating individual parts: visibility, opacity, position, rotation, and scale

### Scope

**In Scope:**
- Runtime glTF parser that extracts parts (meshes) and materials from a loaded model
- Asset metadata storage: `asset.metadata.parts[]` and `asset.metadata.materials[]`
- Node props: `surfaceBindings`, `materialOverrides`, and `partOverrides`
- Inspector UI: Parts panel listing all meshes/materials with inline controls
- Surface binding modes: replace (swap material) and decal (overlay texture plane)
- Part animation: keyframe visibility, opacity, position, rotation, scale per part
- Renderer changes: apply bindings and overrides when cloning the glTF scene

**Out of Scope:**
- glTF animation clip playback (not supported yet)
- glTF-Transform compression pipeline (gltfjsx `--transform`)
- Instancing/merging optimizations from gltfjsx
- Bone/skeleton animation extraction
- Multi-model part linking (one part → one binding)

### User Stories
- As a user, when I import a 3D model, I want to see a list of its parts and materials in the Inspector so I know what I can customize.
- As a user, I want to bind an image or video to a specific mesh (e.g., a TV screen) so the model displays dynamic content.
- As a user, I want to choose between replacing a material entirely or overlaying a decal so I can handle both screens and logos.
- As a user, I want to animate individual parts (show/hide, move, rotate) so I can create dynamic product reveals.
- As a user, I want to override material colors so I can recolor model parts without re-importing.

### Acceptance Criteria
1. Importing a glTF model → parts and materials are extracted and stored in `asset.metadata`
2. Inspector shows a "Parts" section listing all meshes with their names, materials, and type
3. Each part row has controls for: surface binding (asset picker + mode), material override, visibility, opacity
4. Binding an image to a part in "replace" mode → the part's material is replaced with a texture
5. Binding an image to a part in "decal" mode → a texture plane is overlaid on the part
6. Part transforms (position, rotation, scale) can be keyframed via the timeline
7. Part visibility and opacity can be keyframed
8. The same model used in two nodes shares the parts metadata but has independent bindings

# Technical Design

### Current Implementation

**Model node definition** (`src/lib/motion/nodes/model.ts`):
- Props: `assetId`, `missingAsset`, `opacity`, `castShadow`, `receiveShadow`
- No knowledge of internal model structure

**Model renderer** (`src/components/motion/scene/nodes/model.tsx`):
- Loads glTF via `GLTFLoader`, caches in `modelCache`
- Clones the scene (`gltf.scene.clone(true)`) and clones materials per-instance
- Applies `castShadow`/`receiveShadow` to all meshes
- No per-part customization

**Product nodes** (`src/lib/motion/nodes/product.ts` + `src/components/motion/scene/nodes/product.tsx`):
- Procedural meshes with `PrintDecal` — a `<mesh>` with `planeGeometry` and `meshBasicMaterial` overlaid at a fixed position
- `PrintDecal` resolves an image asset to a texture and renders it as a decal
- This pattern will be adapted for model part bindings

**Asset metadata** (`src/lib/motion/types.ts`, line 157):
- `MotionAsset.metadata?: Record<string, unknown>` — already exists but unused for models

**gltfjsx parser** (`/data/projects/clean-room/gltfjsx/src/utils/parser.js`):
- Traverses `gltf.scene`, collects meshes and materials
- Generates JSX referencing `nodes.PartName.geometry` and `materials.MaterialName`
- We'll adapt the traversal logic but store results as structured metadata instead of generating code

### Key Decisions

1. **Asset-sidecar metadata**: Parsed parts/materials stored in `asset.metadata.parts[]` and `asset.metadata.materials[]`. This metadata travels with the asset across nodes. If the same model is used in two nodes, both get the parts list automatically.

2. **Node props for bindings**: `surfaceBindings`, `materialOverrides`, and `partOverrides` are stored in node props. Each node independently configures how it uses the model's parts.

3. **Both replace and decal modes**: Replace mode swaps the mesh's material entirely with a texture material. Decal mode adds an overlay plane (like `PrintDecal`) positioned on the mesh surface.

4. **Full part transform animation**: Each part can have its own position, rotation, scale (relative to the model root), visibility, and opacity — all keyframable.

5. **Runtime parsing**: The glTF is parsed when first loaded (in `loadMotionModel`), not at import time. Results are persisted to `asset.metadata` so subsequent loads don't need to re-parse.

### Data Models / Contracts

#### Asset Metadata Schema
```typescript
// Stored in asset.metadata (MotionAsset.metadata)
type GltfAssetMetadata = {
  parts: GltfPart[];
  materials: GltfMaterial[];
};

type GltfPart = {
  name: string;           // mesh name from glTF
  type: 'mesh' | 'instancedMesh' | 'bone' | 'primitive';
  materialName?: string;  // material name if the mesh has one
  geometryUuid?: string;  // three.js geometry UUID for dedup
};

type GltfMaterial = {
  name: string;
  type: string;           // material class name (e.g., 'MeshStandardMaterial')
};
```

#### Node Props Extensions
```typescript
// New props added to model.gltf node definition:

type SurfaceBinding = {
  assetId: string;        // image or video asset
  mode: 'replace' | 'decal';
  fit?: 'contain' | 'cover' | 'stretch';  // for replace mode
  tint?: string;          // color tint
};

type MaterialOverride = {
  color?: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
};

type PartOverride = {
  visible?: boolean;
  opacity?: number;
  position?: [number, number, number];  // relative to model root
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
};

// In node.props:
surfaceBindings?: Record<string, SurfaceBinding>;  // partName → binding
materialOverrides?: Record<string, MaterialOverride>;  // materialName → override
partOverrides?: Record<string, PartOverride>;  // partName → override
```

#### Property Hints (Inspector Controls)
```typescript
// New hints for model.gltf node:
surfaceBindings: { label: 'Surface bindings', control: 'part-bindings', group: 'Parts' },
materialOverrides: { label: 'Material overrides', control: 'material-overrides', group: 'Materials' },
partOverrides: { label: 'Part overrides', control: 'part-overrides', group: 'Parts' },
```

### Proposed Changes

#### 1. glTF Structure Parser (`src/lib/motion/gltf-structure.ts`)
A pure function that takes a loaded `GLTF` object and extracts parts and materials metadata. Adapted from gltfjsx's traversal logic but returns structured data instead of generating JSX.

- Traverse `gltf.scene` collecting all meshes, their names, materials, and types
- Collect unique materials by name
- Return `{ parts: GltfPart[], materials: GltfMaterial[] }`
- Filter out empty groups and bones (unless `--bones` flag equivalent)
- This module is pure and testable in jsdom (no WebGL)

#### 2. Asset Metadata Update (`src/lib/motion/ops.ts` + `src/main/motion/asset-store.ts`)
When a model asset is committed, parse its structure and update `asset.metadata`.

- In `asset.add` op reducer: after adding a model asset, if `asset.metadata` doesn't have `parts`, trigger a parse
- The parse happens in the renderer (where GLTF is loaded) and writes back to `asset.metadata` via a new op `asset.update-metadata`
- Store parsed metadata in the document so it persists across sessions

#### 3. Model Node Definition Update (`src/lib/motion/nodes/model.ts`)
Extend the `modelGltf` definition with new props and property hints.

- Add `surfaceBindings`, `materialOverrides`, `partOverrides` to `propsSchema`
- Add corresponding `propertyHints` for the Inspector
- Add animatable properties for part overrides: `partOverrides.*.visible`, `partOverrides.*.opacity`, `partOverrides.*.position.x`, etc.

#### 4. ModelRenderer Rewrite (`src/components/motion/scene/nodes/model.tsx`)
Extend the renderer to apply bindings and overrides when cloning the glTF scene.

- After cloning the scene, traverse cloned meshes by name
- For each mesh, check `surfaceBindings[meshName]`:
  - **Replace mode**: replace the mesh's material with a `meshBasicMaterial` using the bound texture
  - **Decal mode**: add a `PrintDecal`-like overlay plane positioned on the mesh
- For each mesh, check `materialOverrides[materialName]` and apply color/roughness/metalness
- For each mesh, check `partOverrides[meshName]` and apply visibility, opacity, position, rotation, scale
- Use `useMotionAssetTexture` (from `./asset-texture`) to resolve bound assets to textures

#### 5. Inspector Parts Panel (`src/components/motion/inspector/MotionPropertyFields.tsx` + new component)
Add a new inspector section that shows when a `model.gltf` node is selected.

- Read `asset.metadata.parts` and `asset.metadata.materials` from the document
- Render a collapsible "Parts" section listing all meshes
- Each part row shows: name, material, visibility toggle, opacity slider
- Expandable part details: surface binding (asset picker + mode select), material override, transform controls
- Render a "Materials" section listing all materials with override controls

#### 6. Animatable Part Properties (`src/lib/motion/node-registry.ts`)
Register dynamic animatable properties for part overrides.

- Extend `hasAnimatableProperty` to handle `partOverrides.*.visible`, `partOverrides.*.opacity`, `partOverrides.*.position.x`, etc.
- Extend `applyNodeProperty` to update nested `partOverrides` values

### Architecture Diagram

``` mermaid
graph LR
    A[glTF Asset File] --> B[GLTFLoader]
    B --> C[GLTF object]
    C --> D[gltf-structure parser]
    D --> E[asset.metadata.parts + materials]
    E --> F[Document persisted]
    
    G[model.gltf Node] --> H[ModelRenderer]
    H --> C
    H --> I[Clone scene]
    I --> J{Apply surfaceBindings}
    J --> K[Replace material]
    J --> L[Add decal overlay]
    I --> M{Apply materialOverrides}
    M --> N[Update color/roughness/metalness]
    I --> O{Apply partOverrides}
    O --> P[Set visible/opacity/transform]
    
    Q[Inspector Parts Panel] --> R[Read asset.metadata]
    Q --> S[Edit node props bindings]
    S --> G
    
    T[Timeline] --> U[Keyframe part properties]
    U --> G
```

### File Structure

**New files:**
- `src/lib/motion/gltf-structure.ts` — pure glTF parser, extracts parts/materials metadata
- `src/components/motion/inspector/ModelPartsPanel.tsx` — inspector UI for parts/materials
- `src/__tests__/motion-gltf-structure.test.ts` — tests for glTF parser

**Modified files:**
- `src/lib/motion/nodes/model.ts` — extended props schema, hints, animatable properties
- `src/lib/motion/types.ts` — add `GltfAssetMetadata`, `GltfPart`, `GltfMaterial`, `SurfaceBinding`, `MaterialOverride`, `PartOverride` types
- `src/lib/motion/ops.ts` — new `asset.update-metadata` op, update `asset.add` to trigger parse
- `src/lib/motion/node-registry.ts` — dynamic animatable properties for `partOverrides.*`
- `src/components/motion/scene/nodes/model.tsx` — apply bindings and overrides in renderer
- `src/components/motion/inspector/MotionPropertyFields.tsx` — register new control types
- `src/components/motion/scene/nodes/index.ts` — no changes (renderer registration unchanged)
- `src/main/motion/asset-store.ts` — persist metadata after parse

# Testing

### Validation Approach
Unit tests for the glTF parser using mock GLTF objects (no WebGL needed). Integration tests for the ops layer verifying metadata persistence and binding application. Visual verification in the running app.

### Key Scenarios
1. Parse a glTF with named meshes → extracts parts and materials correctly
2. Bind an image to a part in replace mode → the part shows the image texture
3. Bind an image to a part in decal mode → an overlay plane appears on the part
4. Override a material color → the part's material changes color
5. Keyframe part visibility → the part toggles visible/invisible on the timeline
6. Keyframe part position → the part moves relative to the model root
7. Same model in two nodes → shared metadata, independent bindings

### Edge Cases
- Model with no named meshes (all unnamed) → parts listed as "Part0", "Part1", etc.
- Model with multiple materials per mesh → bind to the mesh, all materials replaced
- Binding an asset that doesn't exist → show warning, don't crash
- Decal on a non-planar mesh → position the decal at the mesh bounding box center
- Empty glTF (no meshes) → parts list is empty, no errors

# Delivery Steps

### ✓ Step 1: Clear missingAsset flag and extend validation in ops.ts
Update the `scene.node.update` reducer and `validateNodeAssetReference` in `src/lib/motion/ops.ts`.
- In the `scene.node.update` reducer: after merging `patch.props`, check if `assetId` was set to a value that is NOT a missing placeholder (`missing:*`). If so, set `missingAsset: false` in the merged props before validation.
- Extend `validateNodeAssetReference` to handle `model.gltf` nodes: check that `props.assetId` matches an asset in `doc.assets`, unless `props.missingAsset === true` (allow during creation).
- Keep the existing `screen.image` validation intact.
- Add unit tests covering: (a) clearing `missingAsset` when binding a valid asset, (b) validation error when `assetId` points to a non-existent asset and `missingAsset` is false, (c) no error when `missingAsset` is true.

### ✓ Step 2: Auto-bind imported model assets to missing nodes
Add auto-binding logic to the `asset.add` op reducer in `src/lib/motion/ops.ts`.
- After adding a model asset (`kind === 'model'`), scan `doc.scene.nodes` for nodes with type `model.gltf` and `props.missingAsset === true`.
- If exactly one such node exists, append a `scene.node.update` op that sets `assetId` to the new asset's `id` and clears `missingAsset`.
- If multiple missing-asset nodes exist, do NOT auto-bind (ambiguous) — let the user choose via the Inspector.
- This ensures the fix works for all import paths: Add Node dialog, Assets panel, marketplace, etc.
- Add unit tests for single missing node (auto-binds) and multiple missing nodes (no auto-bind).

### ✓ Step 3: Add missing asset warning indicator in scene panel
Add a visual warning in `src/components/motion/MotionScenePanel.tsx` for nodes with missing assets.
- Import a warning icon (e.g., `AlertTriangle` from lucide-react) alongside existing node icons.
- In the node row rendering, check `node.props.missingAsset === true` and display a small amber warning icon next to the node name.
- Add a tooltip: "Missing asset — bind a model in the Inspector".
- Style consistently with the existing lock icon pattern.

### ✓ Step 4: Add comprehensive tests
Add tests to `src/__tests__/motion-migrations.test.ts` (or a new `src/__tests__/motion-model-ops.test.ts`).
- Test `scene.node.update` clears `missingAsset` when `assetId` is set to a valid value.
- Test `validateNodeAssetReference` throws for model nodes with invalid `assetId` and `missingAsset: false`.
- Test `validateNodeAssetReference` allows model nodes with `missingAsset: true`.
- Test `asset.add` auto-binds to a single missing-asset model node.
- Test `asset.add` does NOT auto-bind when multiple missing-asset nodes exist.
- Run `bun run build && bun test` to verify all tests pass.

---

## New Feature: Model Parts and Surface Bindings

### ✓ Step 5: glTF Structure Parser
Create `src/lib/motion/gltf-structure.ts` — a pure function that extracts parts and materials from a loaded GLTF object.
- Implement `parseGltfStructure(gltf: GLTF): { parts: GltfPart[], materials: GltfMaterial[] }`
- Traverse `gltf.scene`, collect all meshes with their names, material names, and types
- Collect unique materials by name and type
- Filter out empty groups and bones
- Add `src/__tests__/motion-gltf-structure.test.ts` with mock GLTF objects
- Add types to `src/lib/motion/types.ts`: `GltfPart`, `GltfMaterial`, `GltfAssetMetadata`

### ✓ Step 6: Asset Metadata and Node Props Extension
Wire up the parser to store results in `asset.metadata` and extend the model node definition.
- Update `src/components/motion/scene/nodes/model.tsx`: after loading a GLTF, call `parseGltfStructure` and commit `asset.update-metadata` op if metadata doesn't exist
- Add `asset.update-metadata` op to `src/lib/motion/ops.ts`: updates `asset.metadata` in the document
- Extend `src/lib/motion/nodes/model.ts`: add `surfaceBindings`, `materialOverrides`, `partOverrides` to `propsSchema` and `propertyHints`
- Add types to `src/lib/motion/types.ts`: `SurfaceBinding`, `MaterialOverride`, `PartOverride`

### ✓ Step 7: ModelRenderer — Apply Bindings and Overrides
Extend `src/components/motion/scene/nodes/model.tsx` to apply surface bindings, material overrides, and part overrides when rendering.
- After cloning the glTF scene, traverse cloned meshes by name
- For `surfaceBindings[meshName]` in "replace" mode: replace the mesh's material with a `meshBasicMaterial` using the bound texture (resolved via `useMotionAssetTexture`)
- For `surfaceBindings[meshName]` in "decal" mode: add a `PrintDecal`-like overlay plane positioned at the mesh's bounding box center, facing outward
- For `materialOverrides[materialName]`: update the cloned material's `color`, `roughness`, `metalness`, `emissive`, `emissiveIntensity`
- For `partOverrides[meshName]`: apply `visible`, `opacity`, `position`, `rotation`, `scale` to the cloned mesh
- Use `useMemo` to re-apply only when bindings change

### ✓ Step 8: Inspector Parts Panel
Create `src/components/motion/inspector/ModelPartsPanel.tsx` — a dedicated inspector section for model parts and materials.
- Read `asset.metadata.parts` and `asset.metadata.materials` from the document via the selected node's `assetId`
- Render a collapsible "Parts" section with a list of meshes
- Each part row: name, material badge, visibility toggle, opacity slider
- Expandable part details: Surface binding (AssetPicker + mode select: replace/decal), Material override (color, roughness, metalness), Transform controls (VectorField for position/rotation/scale)
- Render a "Materials" section listing all materials with override controls
- Wire into `MotionInspector.tsx` as a special case for `model.gltf` nodes
- Bind all changes to `updateNodeProperty` in the Inspector

### ✓ Step 9: Animatable Part Properties
Extend `src/lib/motion/node-registry.ts` to support dynamic animatable properties for part overrides.
- Extend `hasAnimatableProperty` to handle `partOverrides.*.visible`, `partOverrides.*.opacity`, `partOverrides.*.position.[xyz]`, `partOverrides.*.rotation.[xyz]`, `partOverrides.*.scale.[xyz]`
- Extend `applyNodeProperty` to update nested `partOverrides` values
- Register animatable properties in `modelGltf.animatableProperties`: dynamic patterns for part overrides
- Add tests verifying part properties can be keyframed via the timeline

### ✓ Step 10: Tests and Verification
Add comprehensive tests for the new feature.
- Test `parseGltfStructure` with mock GLTF objects (named meshes, materials, empty groups)
- Test `asset.update-metadata` op persists metadata correctly
- Test `surfaceBindings` in replace mode replaces mesh material
- Test `surfaceBindings` in decal mode adds overlay plane
- Test `materialOverrides` updates cloned material properties
- Test `partOverrides` applies transform and visibility
- Test dynamic animatable properties for `partOverrides.*`
- Visual verification: import a model, bind a surface to a part, animate part visibility