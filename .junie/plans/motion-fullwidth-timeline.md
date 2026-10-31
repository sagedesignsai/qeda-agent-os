---
sessionId: session-261031-153021-1103
---

# Requirements

### Overview
Redesign the Motion Editor layout so the timeline spans the full width of the editor (across all three columns: scene panel, viewport, inspector) with a collapsible behavior. When collapsed, only the essential playback transport controls remain visible as a compact bar.

### Current State
The timeline lives inside the center workspace panel, stacked below the viewport in a vertical split. It only occupies the center column width (~58% of the editor), leaving the left scene panel and right inspector columns unused for timeline context.

### Goals
1. **Full-width timeline**: The timeline canvas should span the entire editor width, sitting below all three columns (scene panel, viewport, inspector).
2. **Collapsible**: A toggle button collapses the timeline to a slim transport bar showing playback controls (play/pause, step, timecode, zoom, loop, snap).
3. **Resizable**: When expanded, the timeline height should remain resizable via the existing `ResizableHandle`.
4. **Preserve all existing functionality**: row headers, canvas, transport, editing buttons, keyboard shortcuts, status bar — nothing is lost.

### Design Direction

**Expanded state:**
```
┌─────────────────────────────────────────────────────┐
│  Scene Panel  │  Viewport  │  Inspector  │          │
│              │            │             │          │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│  ▲ Collapse btn   Transport  │  Editing toolbar    │
│  ─────────────────────────────────────────────────  │
│  [Row Headers]  │  Canvas timeline (full width)    │
│  ─────────────────────────────────────────────────  │
│  Status bar: tracks · clips · resolution · zoom    │
└─────────────────────────────────────────────────────┘
```

**Collapsed state:**
``
┌─────────────────────────────────────────────────────┐
│  Scene Panel  │  Viewport (taller)  │  Inspector  │
│              │                     │             │
│              │                     │             │
│              │                     │             │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│  ▼ Expand   ⏮ ◀ ▶ ⏭  00:00:00:12 / 30.0s  Loop Snap Zoom │
└─────────────────────────────────────────────────────┘
```

### Out of Scope
- Changing the Scene Panel or Inspector behavior
- Modifying the timeline canvas rendering itself
- Changing keyboard shortcuts

# Technical Design

### Current Implementation

**`MotionEditor.tsx`** uses a horizontal `ResizablePanelGroup` with three panels:
1. Scene Panel (left, 20%, collapsible)
2. Workspace Panel (center, 58%) — contains a **nested vertical** `ResizablePanelGroup`:
   - Viewport Panel (top, 66%)
   - Timeline Panel (bottom, 34%) — this is what we need to extract
3. Inspector Panel (right, 22%, collapsible)

**`MotionTimeline.tsx`** is a self-contained component with:
- A toolbar row (`h-10`) containing `TimelineTransport` + editing buttons
- An optional pending approval bar
- Row headers + canvas body (fills remaining space)
- A status bar (`h-6`)

### Key Decisions

1. **Extract timeline from nested workspace panel** — Move the timeline `ResizablePanel` out of the center workspace's vertical group and into a new top-level vertical `ResizablePanelGroup` wrapping the entire editor body. This gives it full width.

2. **Collapse via `collapsedSize` on ResizablePanel** — Use the existing `react-resizable-panels` collapsible pattern (already used by scene/inspector panels). Set a small `collapsedSize` (e.g., `48px`) so the transport bar remains visible. The editing toolbar and canvas hide in collapsed mode.

3. **Conditional rendering in `MotionTimeline`** — Add a `collapsed` prop. When collapsed, only render the transport bar (playback + timecode + essential controls). When expanded, render the full timeline.

4. **Collapse toggle in transport bar** — Add a chevron button (like the panel toggles in the editor header) to the left of the transport controls.

### Proposed Changes

**`MotionEditor.tsx`:**
- Wrap the entire editor body in a vertical `ResizablePanelGroup` (using the existing `verticalLayout` persistence)
- The top panel (larger, ~66%) contains the existing horizontal group (scene | viewport | inspector)
- The bottom panel (~34%) contains `MotionTimeline`, now full-width
- Make the timeline panel collapsible with `collapsedSize="48px"`
- Pass `collapsed` state to `MotionTimeline`

**`MotionTimeline.tsx`:**
- Accept a `collapsed?: boolean` prop
- When collapsed: render only a compact transport bar with `TimelineTransport` (playback, timecode, zoom, loop, snap) + expand button
- When expanded: render the full current layout (toolbar + headers + canvas + status bar)
- Move the collapse/expand toggle button to the left of the transport controls

### File Structure

Modified files:
- `src/components/motion/MotionEditor.tsx` — restructure panel nesting
- `src/components/motion/MotionTimeline.tsx` — add collapsed mode

No new files needed.

### Risks
- **Layout persistence**: The `verticalLayout` key is shared between the current nested vertical split and the new top-level vertical split. Need to use a new persistence key (e.g., `motion-layout-vertical-v2`) to avoid corrupting saved layouts.
- **Viewport sizing**: When the timeline collapses, the viewport panel should grow to fill the space. The horizontal panel group's center panel needs to be a `ResizablePanel` in the vertical group so it can resize.

# Delivery Steps

### ✓ Step 1: Restructure MotionEditor panel layout
Move the timeline out of the nested workspace panel into a full-width bottom panel.
- Wrap the editor body in a vertical `ResizablePanelGroup` with a new persistence key `motion-layout-vertical-v2`.
- Top panel (~66%): the existing horizontal group (scene panel | viewport | inspector). The viewport panel becomes the full content of the center column (no longer nested vertically).
- Bottom panel (~34%): `MotionTimeline`, now spanning full width. Make it collapsible with `collapsedSize="48px"`.
- Add `timelineCollapsed` state and a toggle button in the editor header bar.
- Pass `collapsed` prop to `MotionTimeline`.

### ✓ Step 2: Add collapsed mode to MotionTimeline
Make MotionTimeline render a compact transport-only bar when collapsed.
- Accept `collapsed?: boolean` prop on `MotionTimeline`.
- When collapsed: render only a slim bar (`h-12`) with a collapse toggle button (chevron-down to expand), `TimelineTransport` (play/pause, step, timecode, zoom, loop, snap), and nothing else.
- When expanded: render the full current layout (toolbar with transport + editing buttons, pending approval bar, row headers + canvas, status bar).
- Place the collapse toggle (chevron-up icon) at the far left of the toolbar row, before the transport controls.

---

## Context Menus — Delivery Steps

### ✓ Step 3: Create shared context menu hook and types
Add `src/hooks/use-motion-context-menu.ts` with the `MotionContextTarget` union type.
- Define discriminators: `scene-node`, `scene-track`, `viewport`, `timeline-key`, `timeline-item`, `timeline-row`, `timeline-ruler`.
- Each panel uses ShadCN ContextMenu primitives directly (no wrapper hook needed).

### ✓ Step 4: Add context menus to Scene Panel nodes and tracks
Wrap scene node rows and track rows in `ContextMenu` triggers with context-specific menus.
- In `MotionScenePanel.tsx`, wrap each `SceneNodeRow` div in `ContextMenu` + `ContextMenuTrigger`.
- On `onContextMenu`, capture the node ID via `setTarget({ type: 'scene-node', nodeId })`.
- Menu items: Rename (triggers inline rename), Duplicate (calls existing `duplicateNode`), Delete (new `deleteNode` op), Toggle Visibility, Toggle Lock, Focus in Viewport (selects node).
- Similarly wrap track rows with track-specific items: Rename, Duplicate Track, Delete Track, Toggle Mute, Toggle Lock.
- Use the existing action functions (duplicateNode, etc.) rather than duplicating logic.

### ✓ Step 5: Add context menu to Viewport 3D canvas
Wrap the viewport canvas container in a `ContextMenu` with viewport-specific actions.
- In `MotionViewport.tsx`, wrap the canvas container div in `ContextMenu` + `ContextMenuTrigger`.
- On `onContextMenu`, capture context from the current `selection` state (selected node ID).
- Menu items: Reset Camera (reset viewMode to perspective and zoom to 1), Toggle Grid (toggles `gridVisible`), Focus Selected Object (selects the node if not already selected), Add Node submenu with node types from `listMotionNodeTypes()`.
- Since react-three-fiber consumes pointer events, attach the context menu to the container div and use the current selection as context rather than hit-testing the 3D scene.

### ✓ Step 6: Add context menu to Timeline canvas
Add `onContextMenu` handler to the timeline canvas that uses `hitTestTimeline` for context-aware menus.
- In `MotionTimeline.tsx`, add an `onContextMenu` prop to `CanvasTimeline` that calls `hitTestTimeline()` with the click coordinates.
- Pass the hit result to `setTarget` with the appropriate type discriminator.
- Menu items by hit type:
  - **Ruler**: Go to Start/End, Zoom In/Out/Fit, Set Work Area Here
  - **Item (clip)**: Split at Playhead, Trim In/Out, Copy, Delete
  - **Keyframe**: Add Keyframe, Copy/Paste Keyframe, Delete Keyframe
  - **Row (track)**: Add Keyframe at Playhead, Toggle Mute/Lock, Delete Track
  - **Empty**: Add Keyframe at Playhead, Zoom Fit
- Reuse existing handlers (splitSelection, deleteSelection, copyKeyframes, etc.) rather than duplicating logic.

---

## Dope Sheet View Mode — Requirements

### Overview
Add a **Dope Sheet** view mode to the timeline, alongside the existing **Timeline** (clip-based) mode. A toggle button in the timeline toolbar switches between the two. The data model and edit handlers remain unchanged — only the visual representation and row structure differ.

### Current State
The timeline always renders in **clip-based** mode: each track row shows clip blocks (rounded rectangles) with keyframe diamonds inside. Rows are flat — one row per track, one clip block per placement. Keyframes are secondary visual elements nested inside clips.

### Goals
1. **View mode toggle**: A button in the timeline toolbar switches between Timeline (clip blocks) and Dope Sheet (keyframe bars) modes.
2. **Dope Sheet mode**: Each animated property channel gets its own row. Rows are grouped hierarchically by node (collapsible). Each row shows a thin horizontal bar spanning from the first to the last keyframe, with diamond keyframes on top.
3. **Compact rows**: Dope Sheet rows use a smaller `ROW_HEIGHT` (24px vs 64px) to fit more channels on screen.
4. **Preserve all interactions**: Keyframe drag, scrub, zoom, select, and edit handlers work identically in both modes.
5. **Persist view mode**: The selected view mode is saved in `localStorage` so it survives reloads.

### Design Direction

**Timeline Mode (current — unchanged):**
```
┌─────────────────────────────────────────────────────┐
│  Track 1  │  [clip block ────────]  ◆◆◆            │
│  Track 2  │            [clip block ──]  ◆◆          │
└─────────────────────────────────────────────────────┘
```

**Dope Sheet Mode (new):**
```
┌─────────────────────────────────────────────────────┐
▸ Button                                             │
  tint         │  ◆━━━━━━━━━━━━━━━━━━━━◆             │
▸ Airplane                                         │
  position.x   │  ◆━━━━━━━━━━◆                     │
  position.y   │        ◆━━━━━━━━━━◆               │
  rotation.z   │  ◆━━━━━━━━━━━━━━━━━━━━━━◆         │
▸ Dust                                               │
  opacity      │  ◆━━━━━━━━━━━━━━━━━━━━━━━━━━◆     │
└─────────────────────────────────────────────────────┘
```

### Out of Scope
- Changing the data model (clips, tracks, keyframes remain the same)
- Adding new edit operations
- Changing keyboard shortcuts
- Modifying the collapsed transport bar

---

## Dope Sheet View Mode — Technical Design

### Current Implementation

**`lib/timeline/types.ts`** defines `TimelineRow`, `TimelineItem`, `TimelineChannel`, and `TimelineKey`. The model is flat: rows contain items, items contain channels, channels contain keys.

**`lib/timeline/layout.ts`** produces `LaidOutRow`, `LaidOutItem`, and `LaidOutKey` arrays. Each row is 64px (`ROW_HEIGHT`). Items are painted as rounded rectangles; keys as rotated squares (diamonds) inside items.

**`components/timeline/CanvasTimeline.tsx`** paints the base layer (rows, items, keys) and overlay layer (playhead, drag ghosts). The `paintBase` function iterates `layout.rows`, `layout.items`, `layout.keys`.

**`components/timeline/TimelineRowHeaders.tsx`** renders one DOM row header per `model.rows`, each 64px tall. Shows track name, mute/lock/delete buttons.

**`lib/motion/timeline-adapter.ts`** projects Motion documents into the timeline model: tracks → rows, placements → items, clip channels → channels with keys.

### Key Decisions

1. **`dopeSheet` flag on `TimelineModel`** — Add an optional `dopeSheet?: boolean` field to `TimelineModel`. When true, the layout and painting logic switch to dopesheet mode. The flag is set by `MotionTimeline` based on the user's view mode toggle.

2. **Dope Sheet transforms rows into property channels** — In dopesheet mode, `layoutTimeline` flattens the hierarchy: each clip channel becomes a separate row. Rows are grouped by node (via a new `LaidOutRow.groupId` and `groupName` field). The node group row is collapsible (toggled in row headers).

3. **Dope Sheet items become thin bars** — Instead of painting clip blocks, paint a thin 2px horizontal bar from the first keyframe time to the last keyframe time. Keyframes are painted as diamonds on the bar center line, not inside a clip block.

4. **Smaller row height for Dope Sheet** — Use `DOPE_ROW_HEIGHT = 24` (vs `ROW_HEIGHT = 64`) in dopesheet mode. The bar is centered vertically in the row. Keyframes are small diamonds (radius 3.5 vs 4.5).

5. **Row headers adapt to hierarchy** — In dopesheet mode, `TimelineRowHeaders` renders collapsible node group headers (with chevron toggle) and indented property channel rows. The node group row shows the node name and a collapse/expand chevron. Property rows show the property path (e.g., `position.x`).

6. **Hit testing adapts to dopesheet rows** — `hitTestTimeline` already tests keys first, then items, then rows. In dopesheet mode, items are thin bars (still hit-testable), but the primary interaction is keyframe-level. Row hits select the property channel.

### Proposed Changes

**New file: `src/lib/timeline/dopesheet.ts`**
- Export `layoutDopeSheet()` — alternative layout function that flattens channels into rows, groups by node, and produces `TimelineLayout` with dopesheet-specific geometry.
- Export `DOPE_ROW_HEIGHT = 24` constant.
- Export `DopeSheetRow` type: extends `LaidOutRow` with `groupId`, `groupName`, `property`, `isGroupHeader`.

**Modified: `src/lib/timeline/layout.ts`**
- Add `dopeSheet?: boolean` to `TimelineLayoutInput`.
- When `dopeSheet` is true, call `layoutDopeSheet()` instead of the standard layout.
- Add `DOPE_ROW_HEIGHT` export.

**Modified: `src/lib/timeline/types.ts`**
- Add `dopeSheet?: boolean` to `TimelineModel`.

**Modified: `src/components/timeline/CanvasTimeline.tsx`**
- In `paintBase`, check `layout.dopeSheet` flag. If true, use dopesheet painting: thin bars instead of clip blocks, centered keyframe diamonds, smaller row height.
- Add `paintDopeSheetBase()` function that paints dopesheet-style rows, bars, and keys.
- Update drag state: in dopesheet mode, item drags are disabled (bars are not draggable — only keyframes are). Row drags select the property channel.

**Modified: `src/components/timeline/TimelineRowHeaders.tsx`**
- Accept `dopeSheet?: boolean` prop.
- When true, render collapsible node group headers with indented property rows.
- Use `DOPE_ROW_HEIGHT` for row height.
- Add `onToggleGroup` callback for collapsing/expanding node groups.

**Modified: `src/components/motion/MotionTimeline.tsx`**
- Add `dopeSheet` state (persisted in `localStorage`, key `motion.timeline.dopesheet`).
- Add toggle button in the toolbar (next to the view controls).
- Pass `dopeSheet` flag to `toTimelineModel()` → `TimelineModel`.
- Pass `dopeSheet` prop to `TimelineRowHeaders`.
- In dopesheet mode, disable item-related toolbar buttons (Split, Trim) since clips are not visible.

**Modified: `src/lib/motion/timeline-adapter.ts`**
- In `toTimelineModel()`, pass through the `dopeSheet` flag from a new parameter.
- When `dopeSheet` is true, also include `targetId` (node ID) on each row so the layout can group by node.

### File Structure

New files:
- `src/lib/timeline/dopesheet.ts` — Dope sheet layout logic and types

Modified files:
- `src/lib/timeline/types.ts` — Add `dopeSheet` flag to `TimelineModel`
- `src/lib/timeline/layout.ts` — Route to dopesheet layout when flag is set
- `src/components/timeline/CanvasTimeline.tsx` — Dopesheet painting mode
- `src/components/timeline/TimelineRowHeaders.tsx` — Hierarchical row headers
- `src/components/motion/MotionTimeline.tsx` — View mode toggle, state, adapter
- `src/lib/motion/timeline-adapter.ts` — Pass `dopeSheet` flag, include `targetId`

### Architecture Diagram

``` mermaid
graph LR
  MT[MotionTimeline] -->|dopeSheet state| TA[timeline-adapter]
  TA -->|TimelineModel{dopeSheet}| LT[layout.ts]
  LT -->|dopeSheet=true| DS[dopesheet.ts]
  LT -->|dopeSheet=false| SL[standard layout]
  DS -->|TimelineLayout| CT[CanvasTimeline]
  SL -->|TimelineLayout| CT
  CT -->|paintBase| PB[paintBase]
  PB -->|dopeSheet| PDB[paintDopeSheetBase]
  PB -->|!dopeSheet| PIB[paintItemsBase]
  MT -->|dopeSheet| RH[TimelineRowHeaders]
  RH -->|dopeSheet| HR[Hierarchical Rows]
  RH -->|!dopeSheet| FR[Flat Rows]
```

### Risks
- **Row height mismatch**: Dope sheet uses 24px rows, standard uses 64px. The `ROW_HEIGHT` constant is imported by multiple components. Need to pass the effective row height through the layout, not hardcode it.
- **Keyframe selection in dopesheet mode**: Keys are painted on a bar, not inside a clip block. The hit test for keys must still work — keys need their own hit radius independent of item bounds.
- **Node grouping state**: Collapsed node groups need to persist their collapse state. Store in a `Set<string>` of collapsed group IDs in `MotionTimeline` state.
- **Performance**: Flattening all channels into rows can produce many more rows than tracks (a node with 10 animated properties = 10 rows + 1 group header). Virtualization in `layoutTimeline` already skips rows outside the viewport, so this should be fine.
- **Item drag in dopesheet mode**: Clip blocks don't exist in dopesheet mode, so item drag/trim handlers should be disabled. Only keyframe drag and scrub remain active.

---

## Dope Sheet View Mode — Delivery Steps

### ✓ Step 1: Create dopesheet layout logic and types
Add `src/lib/timeline/dopesheet.ts` with the core layout transformation.
- Export `DOPE_ROW_HEIGHT = 24` constant.
- Export `DopeSheetRow` type: extends `LaidOutRow` with `groupId` (node ID), `groupName` (node name), `property` (property path), `isGroupHeader` (boolean for collapsible group rows).
- Export `layoutDopeSheet()` function: takes `TimelineLayoutInput` and produces a `TimelineLayout` where each clip channel becomes a separate row, grouped by node. Group header rows are inserted before property rows. Keys are positioned on the bar center line.
- The function reuses `layoutTimeline()` as a base, then transforms the rows, items, and keys arrays.

### ✓ Stage 2: Wire dopesheet flag through the timeline pipeline
Add the `dopeSheet` flag to the data flow from `MotionTimeline` to the canvas.
- Add `dopeSheet?: boolean` to `TimelineModel` in `src/lib/timeline/types.ts`.
- Add `dopeSheet?: boolean` to `TimelineLayoutInput` in `src/lib/timeline/layout.ts`. When true, call `layoutDopeSheet()` instead of the standard layout.
- Update `toTimelineModel()` in `src/lib/motion/timeline-adapter.ts` to accept and pass through the `dopeSheet` flag. Include `targetId` (node ID) on each row when `dopeSheet` is true.
- Add `dopeSheet` state in `MotionTimeline.tsx` (persisted in `localStorage`, key `motion.timeline.dopesheet`). Add a toggle button in the toolbar (toggle group with "Timeline" and "Dope Sheet" labels). Pass the flag to `toTimelineModel()`.

### ✓ Stage 3: Implement dopesheet painting in CanvasTimeline
Make the canvas render dopesheet-style bars and keys when in dopesheet mode.
- Add `paintDopeSheetBase()` in `CanvasTimeline.tsx`: paints rows with alternating background colors, thin 2px horizontal bars (from first to last keyframe time), and diamond keyframes centered on the bar.
- Update `paintBase()` to call `paintDopeSheetBase()` when `layout.dopeSheet` is true.
- In `onPointerDown`, disable item drag and trim when in dopesheet mode — only keyframe drag and scrub are active.
- Update cursor hints: bars show `default` cursor (not draggable), keys show `grab`.

### ✓ Stage 4: Add hierarchical row headers for dopesheet mode
Make `TimelineRowHeaders` render collapsible node groups with indented property rows.
- Accept `dopeSheet?: boolean` prop and `onToggleGroup` callback in `TimelineRowHeaders.tsx`.
- When `dopeSheet` is true, group rows by `groupId`. Render a group header row (node name, chevron toggle) followed by indented property rows (property path, e.g., `position.x`).
- Use `DOPE_ROW_HEIGHT` for row height in dopesheet mode.
- Store collapsed group IDs in `MotionTimeline` state and pass to `TimelineRowHeaders` via `collapsedGroups` prop.
- In dopesheet mode, hide track-level controls (mute, lock, delete) from property rows — they remain on group headers.

---

## Dope Sheet Vertical Scrolling Fix — Delivery Steps

### ✓ Step 5: Fix dopesheet vertical scroll content height calculation
Fix the `onScrollRows` handler in `MotionTimeline.tsx` so dopesheet mode can scroll vertically.
- **Root cause**: `onScrollRows` calculated `contentHeight` as `model.rows.length * rowHeight`, but in dopesheet mode `model.rows` is the flat track list, not the expanded property channels with group headers.
- **Fix**: Added `computeDopeSheetContentHeight()` helper that counts group headers (`DOPE_GROUP_HEIGHT`) and property channel rows (`DOPE_ROW_HEIGHT`), respecting collapsed groups — matching the logic in `layoutDopeSheet()`.
- Updated `onScrollRows` to use `computeDopeSheetContentHeight()` when `dopeSheet` is true.
- Added `model.items` and `collapsedGroups` to the `handlers` dependency array so the callback updates when the dopesheet row count changes.

---

## Single Header Bar — Delivery Steps

### ✓ Step 6: Merge dual headers into one compact bar
Consolidate the `PageHeader` in `Motion.tsx` and the editor header in `MotionEditor.tsx` into a single `h-8` bar.
- Remove `PageHeader` from `Motion.tsx`, pass its unique props (`canUndo`, `canRedo`, `motionProject`) to `MotionEditor`.
- Merge all controls into one row: scene panel toggle, document name, scene selector, save status, Save, Undo/Redo, timeline collapse, Add dropdown, Export, inspector toggle.
- Reduce header height from `h-9` (36px) to `h-8` (32px) and button sizes from `size-7` to `size-6` for maximum screen real estate.
- Update tests to pass the new required props.