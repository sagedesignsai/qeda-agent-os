# Scenes and nodes

**Phase:** 1 (multi-scene + new node types), 2 (camera.orthographic, light.spot,
text.badge)
**Dependencies:** `document-model-v4.md`
**Master spec:** §6.6, §8.1–§8.4
**Goal:** a scene graph that supports multiple scenes, a registry-driven node
library, and the new node types Motion 2.0 needs.

## Multi-scene

- A project has `scenes: MotionScene[]` and `activeSceneId`. At least one scene.
- Scene switcher in the top bar: name, duration, thumbnail, active check mark,
  "+ New scene", "Duplicate scene", "Manage scenes…".
- "New scene" creates a blank scene with the same camera/light rig as the
  current scene but no content.
- "Duplicate scene" copies content and timeline (needs an `idMap`).
- Scene thumbnails rendered on demand (first frame) and cached; not stored in
  the document.
- Reordering scenes changes switcher order in Phase 1; master sequence order in
  Phase 2.
- Deleting a scene is destructive and confirmed with name + duration. The last
  scene cannot be deleted.
- Switching scenes preserves the playhead time, clamped to the new scene's
  duration.
- The timeline always edits the active scene.

Ops: `scene.add`, `scene.duplicate`, `scene.remove`, `scene.rename`,
`scene.setCamera`, `scene.setBackground`, `scene.reorder`,
`document.setActiveScene`.

## Transform semantics

Every node has a local transform: `position [x,y,z]`, `rotation` Euler radians
XYZ order, `scale [x,y,z]` (default `[1,1,1]`). World transform composes
parent-to-child. `visible` hides the node and descendants. `locked` blocks
selection/manipulation but not rendering.

Opacity inherits multiplicatively (group 0.5 × child 0.8 = 0.4). The renderer
walks the Three.js tree; keep and test this.

Parenting rules are declared by the registry via `allowedParents`. Reparenting
preserves world transform by default (compensate local transform), with a
modifier to preserve local. The op records the resulting local transform.

## Node registry v2

`src/lib/motion/node-registry.ts`. Single source of truth for what can be added,
props, animatable paths, inspector hints, icon/category, allowed parents.

```ts
export type MotionPropertyHint = {
  label?: string;
  control?: 'text' | 'number' | 'slider' | 'color' | 'vector3' | 'asset' | 'select' | 'toggle';
  min?: number; max?: number; step?: number;
  group?: string;            // inspector group: "Transform", "Material", "Layout"
  assetKind?: MotionAssetKind; // for 'asset' control
  options?: Array<{ value: string; label: string }>; // for 'select'
};

export type MotionNodeTypeDefinition = {
  id: string; label: string; category: MotionNodeCategory;
  description: string; icon: string; // lucide icon name
  propsSchema: z.ZodType<Record<string, unknown>>;
  defaultProps: Record<string, unknown>;
  animatableProperties: Readonly<Record<string, { description: string }>>;
  defaultTransform?: Partial<MotionNodeTransform>;
  defaultName: string;
  allowedParents?: readonly string[];
  propertyHints?: Readonly<Record<string, MotionPropertyHint>>;
};
```

The inspector is generated from `propsSchema` + `propertyHints`. There is no
hand-written form per node type. A new node type ships with its inspector for
free.

Categories: `scene`, `camera`, `geometry`, `surface`, `lighting`, `model`,
`stage`.

## Built-in node types

**Existing (keep, extend):** `scene.group`, `camera.perspective`,
`device.tablet`, `screen.image`, `text.title`, `light.ambient`,
`light.directional`, `light.point`.

**New in Phase 1:**
- `device.phone`, `device.laptop`, `device.monitor` — geometry frames.
- `text.body` — supporting copy.
- `shape.rect`, `shape.ellipse` — solid/rounded shapes.
- `stage.ground` — ground plane (replaces the hardcoded canvas ground).
- `model.gltf` — imported glTF/GLB (Phase 1 node; import is Phase 2).
- `screen.video` — video surface (preview in Phase 1; exact export in Phase 2).

**New in Phase 2:**
- `camera.orthographic`, `light.spot`, `text.badge`.
- `model.gltf` gains animation props (`animationName`, `animationMode`,
  `animationSpeed`).

**Deprecated aliases (keep):** `device.tablet` (starter scene uses it).
`screen.image.props.source` is replaced by `assetId` in v4; migration rewrites
it; the op rejects `source` in v4.

## Node prop details

**`screen.image`** — `assetId` (required), `width`, `height`, `fit`
(contain/cover/stretch), `opacity`, `cornerRadius`, `tint`. Renders a plane with
`MeshBasicMaterial` (UI, not lit), `toneMapped: false`, sRGB texture. `fit`
maps to UV cropping.

**`model.gltf`** — `assetId` (required), `animationName`, `animationMode`
(none/clip/loop), `animationSpeed`, `castShadow`, `receiveShadow`, `opacity`.
Load once per asset id, clone per node, drive `AnimationMixer` with
`mixer.setTime(sceneTime)` (deterministic; never delta time).

**`text.title` / `text.body`** — use `troika-three-text` for SDF text. Props:
`text`, `fontAssetId`, `fontFamily`, `fontSize`, `color`, `align`,
`letterSpacing`, `lineHeight`, `maxWidth`, `opacity`. `maxLines` truncates with
ellipsis in the layout pass.

**`stage.ground`** — `size`, `color`, `roughness`, `metalness`, `opacity`,
`shadow`. Starter/blank scenes include one. Editor grid is separate chrome and
never exports.

**`screen.video`** — `assetId`, `width`, `height`, `fit`, `opacity`, `muted`,
`loop`, `playbackRate`. Preview: `VideoTexture` with a muted `HTMLVideoElement`
slaved to the clock. Export: exact frames in Phase 2; until then export uses the
nearest decoded frame + `frame-approximated` warning.

## Add menu and hierarchy

Add menu groups by category with search:
- Scene: Group, Ground.
- Camera: Perspective, Orthographic (Phase 2).
- Devices: Tablet, Phone, Laptop, Monitor.
- Surfaces: Image, Video, Title, Body, Rectangle, Ellipse.
- Models: Import model… (file dialog).
- Lights: Ambient, Key, Point, Spot (Phase 2).

Adding a node: create at scene root (or child of selected group), select it,
frame it in the viewport if off-screen, one undo entry.

Hierarchy rows: disclosure triangle, type icon, name (inline rename on
double-click), visibility eye, lock, warning badge for missing assets, colored
dot for animated nodes.

Drag-to-reparent uses `@dnd-kit/core` + `@dnd-kit/sortable`. Drop targets show a
line between rows; holding `Alt` drops as a child. Invalid parents disabled with
a tooltip explaining why.

Multi-select (Phase 1): `Shift+click` range, `Cmd/Ctrl+click` toggle. Inspector
shows primary selection; shared properties show mixed values. Ops emitted per
node in one batch → one undo step.

## Ops

`scene.node.add`, `scene.node.update`, `scene.node.remove`, `scene.node.reparent`,
`scene.node.reorder`, `scene.node.duplicate`. Plus `scene.add`, `scene.duplicate`,
etc. Full table in `op-contract-v2.md`.

`scene.node.remove` removes the subtree, channels targeting removed nodes, and
tracks scoped only to removed nodes; nulls camera references. Uses
`collectNodeCascade`.

## Acceptance criteria

- A scene can be created, duplicated, renamed, reordered, deleted (last scene
  protected).
- Every built-in node type can be added, edited, reparented, duplicated, and
  removed without dangling ids.
- Invalid parents are disabled with an explanatory tooltip.
- Multi-select edits apply in one undo step.
- A missing-asset node shows a placeholder and a warning badge.
- Transform changes commit one op on pointer-up; Escape cancels.

## Files to touch

- `src/lib/motion/types.ts` — `MotionScene`, `MotionNode`, `MotionNodeTransform`.
- `src/lib/motion/node-registry.ts` — v2 registry with hints/allowedParents.
- `src/lib/motion/nodes/*.ts` — per-category definitions.
- `src/lib/motion/ops.ts` — scene/node ops.
- `src/components/motion/scene/MotionNodeRenderers.tsx` — Three.js bindings.
- `src/components/motion/scene/*.tsx` — per-type renderers.
- `src/components/motion/hierarchy/*`.

## Tests

- `motion-ops.test.ts` — node add/update/remove/reparent/reorder/duplicate.
- `motion-node-renderers.test.tsx` — R3F test-renderer, each type renders.
- Component tests for hierarchy and add menu.
