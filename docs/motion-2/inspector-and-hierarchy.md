# Inspector and hierarchy

**Phase:** 1
**Dependencies:** `scenes-and-nodes.md`, `assets.md`
**Master spec:** §8.5, §10.4–§10.5
**Goal:** a generated, selection-driven inspector and a direct-manipulation
viewport that make the scene editable without hunting through menus.

## Inspector (generated from the registry)

The inspector is selection-driven. With no selection it shows scene settings,
brand, and output. Stable order:

1. Header — node name, type label, visibility/lock, "Go to timeline."
2. Transform — position, rotation (degrees in UI, radians in document), scale,
   reset.
3. Content — type-specific props (asset, text, dimensions, fit, color).
4. Layout — alignment, spacing, max width, safe-area snap.
5. Material — opacity, roughness, metalness, tint, shadows.
6. Animation — animated properties, keyframe count, "Animate" buttons.
7. Advanced — node id (copyable), parent, render order, warnings.

Controls:
- Number field: drag label to scrub; `Shift` = ×10, `Alt` = ×0.1; type to
  enter; `Enter` commits; `Escape` reverts.
- Vector3: three number fields with a link toggle for uniform scale.
- Color: swatch + hex input + brand swatches. Alpha separate.
- Asset: thumbnail, name, "Replace", "Relink", "Reveal". Drag an asset onto the
  field to replace.
- Select: plain-language options with a short description.
- Toggle: switch, not checkbox.
- Slider: only where a range is meaningful (opacity, intensity); always paired
  with a number field.
- Mixed values: multi-select shows "Mixed"; editing applies to all.
- Reset: per-field to type default; per-section with confirmation if it would
  remove animation.

Animation affordance: every animatable property row has a diamond. Hollow = not
animated; filled = animated with a key at the playhead; half = animated, no key
at playhead. Click adds/removes a key at the playhead. Right-click: "Add key",
"Remove all keys", "Show in timeline."

The inspector never shows raw JSON. A read-only "Copy node JSON" action exists
for debugging and agent handoff. Every field edits on blur, not per keystroke;
errors shown inline; last valid value kept. No silent clamping — a clamped value
shows a toast.

## Viewport direct manipulation

Adding objects:
- Drag an asset from the library into the viewport. Drop target decides parent:
  over a device screen → `screen.image` child of that device; over ground →
  root-level `screen.image` upright; over empty space → root-level at the
  ground-plane intersection.
- Drop a GLB → `model.gltf` at cursor, auto-scaled to a sensible size from its
  bounding box.
- "Add" menu → node type appears at scene origin, selected.
- Double-click an asset → add at origin.

Selection: click selects; `Shift+click` adds; `Cmd/Ctrl+click` toggles; click
empty space clears. Double-click in viewport frames the node (does not enter an
edit mode). Hover shows a subtle outline; selection shows a brighter outline +
label. Locked nodes are not selectable in the viewport (select in hierarchy).

Gizmos: translate (`G`), rotate (`R`), scale (`S`). Click an axis to constrain.
World/local space toggle (default: local for objects, world for groups). Snapping:
grid 0.1 units, 15° rotation, 0.1 scale. Hold `Alt` to disable. Numeric fields
stay in sync during drag. A drag commits one op on pointer-up. `Escape` cancels
and restores the original transform.

Camera: "Look through camera" toggles scene camera vs orbit view (orbit is
editor-only, never exports). "Frame selection" (`F`) moves the orbit camera to
fit; "Align camera to view" moves the scene camera with confirmation. Safe-area
overlay shows brand safe area + title-safe guides. Camera presets: Wide,
Medium, Close, Top, Low Angle (writes a transform op).

Viewport chrome: grid toggle, background tone, zoom, camera view, quality badge.
"Focus mode" dims everything except the selection and its children. "Isolate"
hides everything else (editor-only, does not change visibility flags). Bottom-left
badge: active scene, fps, duration. Bottom-right: selection + warning count.

## Hierarchy

Rows show: disclosure triangle, type icon, name (inline rename on
double-click), visibility eye, lock, warning badge for missing assets, colored
dot for animated nodes.

Drag-to-reparent uses `@dnd-kit/core` + `@dnd-kit/sortable`. Drop targets show a
line between rows; holding `Alt` drops as a child. Invalid parents disabled
with a tooltip explaining why.

Keyboard: arrow keys up/down to move, left/right to collapse/expand.

## Files to touch

- `src/components/motion/inspector/MotionInspector.tsx`
- `src/components/motion/inspector/controls/*.tsx`
- `src/components/motion/hierarchy/SceneTree.tsx`, `TreeRow.tsx`
- `src/components/motion/scene/MotionSceneCanvas.tsx` (gizmos, selection)
- `src/components/motion/MotionViewport.tsx`

## Acceptance criteria

- Every node type's props render a control of the hinted type; every animatable
  prop has a diamond.
- Editing a field emits exactly one op on blur/Enter.
- Multi-select shows "Mixed" and applies to all in one undo step.
- Drag-to-reparent preserves world transform by default.
- `Escape` cancels a gizmo drag and restores the transform.
- Locked nodes are selectable only in the hierarchy.
- The inspector is usable at 1100×720 with the timeline collapsed.
