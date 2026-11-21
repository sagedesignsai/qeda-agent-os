# Motion System: Quick Reference Card

**One-page cheat sheet for developers working with Motion.**

---

## What is Motion?

3D scene editor with timeline animation, 50+ node types, AI copilot, and op-based mutations.

**Key fact:** All document changes are serializable operations → enables undo/redo, agent integration, approval gating.

---

## Architecture in 30 Seconds

```
User Action
    ↓
motionStore.commit(label, ops[])
    ↓
applyMotionOps(doc, ops) → new doc
    ↓
React re-renders (if doc changed)
    ↓
R3F frame loop (60fps, independent of React)
    ↓
evaluateMotionFrame(scene, time)
    ↓
Three.js updates + Canvas renders
```

**Key:** Clock is external, so playback doesn't cause React renders.

---

## Most Common Tasks

### Add a Node Programmatically

```typescript
motionStore.commit('Add camera', [
  {
    op: 'scene.node.add',
    nodeId: createMotionId('scene'),
    type: 'camera.perspective',
    props: { fov: 50 },
  },
]);
```

### Animate a Property

```typescript
motionStore.commit('Add keyframe', [
  {
    op: 'keyframe.add',
    clipId: 'clip-1',
    channelId: createMotionId('channel'),
    keyframeId: createMotionId('keyframe'),
    time: 5.0,                    // seconds (clip-local)
    value: 100,                   // property value
    easing: { type: 'linear' },   // or cubic with x1, y1, x2, y2
  },
]);
```

### Get Current Selection

```typescript
const { selection } = useMotionSnapshot();

if (selection?.kind === 'node') {
  const nodeId = selection.nodeId;
  const multiSelected = selection.selectedNodeIds ?? [nodeId];
}
```

### Subscribe to Document Changes

```typescript
const { doc } = useMotionSnapshot();
// Re-renders when doc changes (via useSyncExternalStore)
```

### Execute a Copilot Tool

```typescript
const result = await copilot.sceneDirector({
  ops: [
    { op: 'scene.node.add', nodeId, type: 'light.directional' },
  ],
  reason: 'Add key light for hero shot',
});
```

---

## File Locations (Memory Map)

```
src/components/motion/
  MotionEditor.tsx          Main editor shell + layout
  MotionViewport.tsx        Live 3D preview
  MotionInspector.tsx       Properties panel
  MotionTimeline.tsx        Animation editor
  MotionScenePanel.tsx      Hierarchy tree
  MotionCopilotPanel.tsx    AI chat
  scene/
    MotionSceneCanvas.tsx   R3F host
    nodes/                  50+ node renderers

src/lib/motion/
  types.ts                  MotionDocument, MotionNode, etc.
  ops.ts                    Operation definitions + risks
  evaluate.ts               evaluateMotionFrame()
  node-registry.ts          Node type lookup, registration
  schema.ts                 Zod schemas, migrations
  nodes/                    Node definitions (16 category files)

src/hooks/
  use-motion-store.ts       MotionStore + useMotionSnapshot()
  use-motion-export.ts      Export state machine
  use-motion-copilot.ts     Copilot streaming hook
  use-motion-project.ts     Project load/save

src/main/ai/
  motion-copilot-agent.ts   AI agent configuration

src/main/tools/
  motion.ts                 Core tools (scene, keyframe, etc.)
  motion-recipe-tool.ts     Pre-built design patterns
  motion-verify-tool.ts     Linting + preview rendering
  motion-capability-tool.ts Node/recipe discovery
```

---

## Key Objects & Their Purpose

| Object | Purpose | Mutability |
|--------|---------|-----------|
| `MotionDocument` | Root data structure | Immutable |
| `MotionScene` | Scene graph container | Immutable (in doc) |
| `MotionNode` | 3D object (camera, light, geometry) | Immutable (in doc) |
| `MotionTimeline` | Clips, tracks, keyframes | Immutable (in doc) |
| `MotionClip` | Reusable animation (channels of keyframes) | Immutable (in doc) |
| `MotionChannel` | Property animation (position.x, opacity, etc.) | Immutable (in doc) |
| `MotionKeyframe` | Single keyframe (time, value, easing) | Immutable (in doc) |
| `MotionOpRequest` | Single operation (validated by Zod) | Serializable |
| `MotionSelection` | UI state (currently selected node) | Mutable (in store) |
| `MotionStore` | State manager (doc, selection, history) | Subscription |

---

## Node Types by Category

**Cameras:** camera.perspective, camera.orthographic

**Lights:** light.directional, light.point, light.spot, light.ambient

**Geometry:** geometry.box, sphere, cylinder, plane, cone, torus, lathe, extrude

**Text:** text.3d, text.billboard

**Procedural:** procedural.array, radial-array, grid, scatter, curve, clone

**Data-Viz:** data.bar-chart, pie-chart, scatter-plot

**Primitives:** shapes.rectangle, circle, polygon, star, line

**Media:** video.playback, graphics.canvas

**UI:** ui.billboard

**Surfaces:** surfaces.material, binding

**Stage:** stage.ground, environment, skybox

**Plus:** procedure, product, lighting combinations...

---

## Keyboard Shortcuts (Must Know)

| Key | Action |
|-----|--------|
| `1` / `2` | Cinematic / editorial view |
| `W` / `R` / `E` | Translate / rotate / scale mode |
| `Space` | Play/pause |
| `Cmd/Ctrl+S` | Save |
| `Cmd/Ctrl+Z` | Undo |
| `Cmd/Ctrl+Shift+Z` | Redo |
| `Cmd/Ctrl+Shift+T` | Toggle timeline |
| `Shift+A` | Add node dialog |
| `Shift+Click` | Add to selection |
| `Cmd/Ctrl+Click` | Toggle in selection |

---

## Common Patterns

### Pattern: Batch Related Ops

```typescript
// ✓ GOOD: Single commit, atomic approval
motionStore.commit('Build lighting rig', [
  { op: 'scene.node.add', nodeId: 'light-1', type: 'light.directional' },
  { op: 'scene.node.add', nodeId: 'light-2', type: 'light.point' },
  { op: 'scene.node.add', nodeId: 'light-3', type: 'light.ambient' },
]);

// ✗ BAD: Three separate commits
motionStore.commit('Add directional', [{ op: ... }]);
motionStore.commit('Add point', [{ op: ... }]);
motionStore.commit('Add ambient', [{ op: ... }]);
```

### Pattern: Selection Subscription

```typescript
// ✓ GOOD: Store owns selection
const { selection } = useMotionSnapshot();

// ✗ BAD: Prop drilling
<MotionViewport selectedNodeId={state.selected} onChange={setSelected} />
```

### Pattern: Approval Gating

```typescript
// ✓ GOOD: Let store handle risk
motionStore.commit('Delete nodes', [{ op: 'scene.node.remove', nodeId }]);
// Store may hold for approval if destructive

// ✗ BAD: Try to bypass
doc.scenes[0].nodes = doc.scenes[0].nodes.filter(n => n.id !== nodeId);
```

---

## Debugging Checklist

- [ ] Is the op being recorded? (Check undo/redo stack)
- [ ] Is the document changed? (Use DevTools to inspect MotionStore)
- [ ] Is the component re-rendering? (Add console.log in component)
- [ ] Is the canvas updating? (Check R3F frame count)
- [ ] Is evaluation deterministic? (Call evaluateMotionFrame(scene, 5.0) twice, compare)
- [ ] Is the selection updating? (Check useMotionSnapshot result)
- [ ] Is the timeline synchronized? (Keyframe time matches document)

---

## Export Data

```typescript
// Get current document
const doc = motionStore.getDocument();

// Serialize to JSON
const json = JSON.stringify(doc);

// Validate schema
validateMotionDocument(doc);

// Evaluate at specific time
const frame = evaluateMotionFrame(doc.scenes[0], 5.0);

// Plan export
const renderPlan = buildRenderPlan(doc, { preset: '1920x1080' });
```

---

## AI Copilot Integration

### Call a Tool

```typescript
const result = await copilot.sceneDirector({
  ops: [
    { op: 'scene.node.add', nodeId, type, transform, props },
  ],
  reason: 'Add hero model for showcase',
});
```

### Stream a Conversation

```typescript
const { messages, sendMessage, respondToApproval } = useMotionCopilot({
  projectId,
  document: doc,
});

await sendMessage('Create a product hero animation');
// → Agent streams response, you can see it incrementally
// → If op requires approval, approval card shows up
// → User approves, stream resumes
```

### System Prompt Includes

- Current scene state (name, duration, node count)
- Project context (if scoped)
- Available node types (from registry)
- Animatable properties (from definitions)
- Available recipes (product-hero, stinger-3d, data-viz)
- Step budget (40 steps)

---

## Import/Export

### Load Document

```typescript
const doc = await motionProject.load();
motionStore.loadDocument(doc);
```

### Save Document

```typescript
await motionProject.saveNow();
// Writes to disk, updates backup versioning
```

### Export to Video

```typescript
motionProject.startExport({ preset: '1920x1080', codec: 'h264' });
// Listen for progress via useMotionExport hook
```

---

## Performance Tuning

| Issue | Solution |
|-------|----------|
| Jank during playback | ✓ By design: clock is external, no React renders |
| Slow inspector | Reduce complexity of selected node (too many keyframes?) |
| Export slow | Reduce resolution or use hardware encoding (H.264) |
| Memory high | Limit undo history (200 docs by default) |
| Scene slow to render | Check procedural instance count (max 5000) |

---

## New Feature Checklist

- [ ] Read `MOTION_PATTERNS_GUIDE.md` (find your pattern)
- [ ] Locate similar code in codebase
- [ ] Create op type (in `ops.ts`)
- [ ] Create reducer (in `ops.ts`)
- [ ] Create UI component (in `src/components/motion/`)
- [ ] Wire to `motionStore.commit()`
- [ ] Test undo/redo (should record and replay)
- [ ] Test with copilot (should be callable via tools)
- [ ] Validate (Zod schema)

---

## Reference Docs

| Document | Use For |
|----------|---------|
| `MOTION_INSPECTION_INDEX.md` | Navigation + cross-reference |
| `MOTION_SYSTEM_INSPECTION.md` | Complete system overview |
| `MOTION_ARCHITECTURE_DIAGRAM.md` | Visual architecture + data flow |
| `MOTION_PATTERNS_GUIDE.md` | Design patterns + best practices |
| `MOTION_QUICK_REFERENCE.md` | This file (quick lookup) |
| `MOTION_INSPECTION_SUMMARY.txt` | Executive summary |

---

**Last Updated:** 2026-11-21  
**Status:** Motion System production-ready

For full details, see `MOTION_INSPECTION_INDEX.md`.
