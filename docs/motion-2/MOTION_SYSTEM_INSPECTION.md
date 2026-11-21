# Motion System: Editor Implementations & Architecture

**Inspection Date:** 2026-11-21  
**Scope:** Editor components, AI copilot, rendering pipeline, data model  
**Status:** Production 3D animation editor with agent integration

---

## System Overview

The Motion System is a **document-driven 3D scene editor** with:
- **Scene-based architecture** (one document → many scenes → many objects)
- **Keyframe animation system** (per-node property channels with easing)
- **Timeline-based composition** (clips, tracks, playback)
- **AI Copilot** (ToolLoopAgent for scene operations, modeling, recipes)
- **R3F rendering** (Three.js host for live viewport preview)
- **Op-based mutations** (all changes are serializable, validated operations)

---

## Architecture Layers

### 1. Data Model (`src/lib/motion/types.ts`)

**Core document structure:**

```typescript
MotionDocument
├── meta: { name, id, output: { width, height, fps }, ... }
├── scenes[]: MotionScene
│   ├── id, name
│   ├── nodes[]: MotionNode              // Scene graph
│   │   ├── id, type, name, parentId
│   │   ├── transform: { position, rotation, scale }
│   │   ├── props: {}                    // Type-specific properties
│   │   ├── visible, locked
│   │   └── (Types: camera, light, model, primitives, text, UI, etc.)
│   ├── timeline: MotionTimeline
│   │   ├── duration, playMode, loop
│   │   ├── tracks[]
│   │   └── clips[]: MotionClip          // Reusable animation clips
│   │       ├── id, name, duration
│   │       └── channels[]: MotionChannel
│   │           ├── targetId, property   // e.g. "position.x", "opacity"
│   │           └── keyframes[]: MotionKeyframe
│   │               ├── time (seconds, local to clip)
│   │               ├── value (number)
│   │               └── easing: { type, cubic params }
│   └── background, cameraId
├── assets[]: MotionAsset                // Images, models, fonts, etc.
├── timeline: MotionTimeline             // Document-level timeline
│   ├── tracks[]: MotionTrack
│   │   ├── targetId (scoped to a node or null)
│   │   └── placements[]                 // Clip placement on track
│   └── clips[]                          // Global clip library
└── meta.id (project UUID)
```

**Time is always in seconds** (never frames). FPS applied only at render/export boundaries.

**Node Types Registry** (`src/lib/motion/node-registry.ts`):
- 50+ node types organized by category (cameras, lights, geometry, text, UI, procedural, data-viz, product showcase)
- Each type declares:
  - Default props and transform
  - Animatable properties (e.g., `position.x`, `material.emissive`)
  - JSON Schema for validation
  - Property hints (color picker, slider bounds, etc.)
- Registered in `src/lib/motion/nodes/index.ts` (one file per category)

---

### 2. Operations System (`src/lib/motion/ops.ts`)

**Every document change is an operation:**

```typescript
MotionOpRequest = one of:
  'document.rename' | 'document.setOutput' | 'document.setActiveScene'
  'asset.add' | 'asset.remove' | 'asset.relink'
  'scene.node.add' | 'scene.node.update' | 'scene.node.remove'
  'scene.node.reparent' | 'scene.node.reorder' | 'scene.node.duplicate'
  'scene.add' | 'scene.duplicate' | 'scene.remove'
  'track.add' | 'track.update' | 'track.remove'
  'clip.add' | 'clip.update' | 'clip.remove'
  'keyframe.add' | 'keyframe.update' | 'keyframe.remove'
  'timeline.setLoop' | 'timeline.setWorkArea'
  'audio.add' | 'audio.update' | 'audio.remove'
  'sequence.set'
```

**Risk classification:**
- `safe` — Non-destructive additions (add node, keyframe)
- `mutating` — Property changes (update transform, easing)
- `destructive` — Deletions, reparenting (requires UI approval)

**Application:**
- Ops are **atomic** (batch all related changes)
- **Pure reducers** (same ops → same document, always)
- **Validatedon application** (Zod schemas per op type)
- **Recorded in history** (undo/redo stack of documents)

---

### 3. Rendering Pipeline

#### A. Evaluation (`src/lib/motion/evaluate.ts`)

Deterministic, clock-independent scene evaluation:

```typescript
evaluateMotionFrame(scene, timeInSeconds) → MotionFrame
  1. Sample all channels in timeline for the given time
  2. Apply sampled values to node properties
  3. Return nodes with keyframed state baked in
```

**No side effects, no renderer dependency** — runs in Jest, Node, or browser.

#### B. Canvas Host (`src/components/motion/scene/MotionSceneCanvas.tsx`)

R3F (React Three Fiber) wrapper:

```typescript
<MotionSceneCanvas
  doc={document}
  clock={playbackClock}
  viewMode={'cinematic' | 'editorial'}    // Free orbit vs gizmo
  selectedNodeId={selection?.nodeId}
  onSelectNode={(nodeId) => ...}
  transformMode={'translate' | 'rotate' | 'scale'}
  onTransformNode={(nodeId, transform) => ...}
/>
```

**Features:**
- Live clock subscription (no React re-renders on playhead update)
- Transform gizmo in editorial view (W/R/E keys for mode)
- Multi-select with Shift/Cmd modifiers
- Grid and lighting controls
- Export-grade rendering (optional transparency, checkerboard)

#### C. Renderer Components (`src/components/motion/scene/nodes/`)

**50+ node-type renderers** (48 files):
- `scene.tsx` — Root, camera binding, stage setup
- `camera.tsx`, `light.tsx` — Lighting rigs
- `model.tsx` — glTF asset binding + parts system
- `primitives.tsx` — Box, sphere, cylinder, plane, cone
- `text.tsx` — 3D text with font loading
- `geometry.tsx` — Parametric geometry (lathe, extrude, shape)
- `surfaces.tsx` — Material bindings (color, roughness, emissive)
- `shapes.tsx` — 2D shapes (rectangle, circle, polygon, star)
- `ui.tsx` — Billboarded UI overlays
- `procedural.tsx` — Instances, arrays, scatter, grids
- `data.tsx` — Data-driven geometry (bar charts, pie charts)
- `video.tsx` — Video playback synced to playhead
- `graphics.tsx` — Canvas 2D to texture
- And more...

**Each renderer:**
- Reads evaluated node state at current time
- Binds to Three.js object hierarchy
- Updates on frame, not on React updates
- Uses vertex programs for transform gizmos

---

### 4. Editor Components (`src/components/motion/`)

#### **MotionEditor.tsx** (Main shell, 500+ lines)

Owns layout and top-level dialogs:

```
MotionEditor
├── Header (8px) — save, undo/redo, add node, export, toggles
├── ResizablePanelGroup (vertical)
│   ├── Top Panel (66%)
│   │   ├── MotionScenePanel (20%) — hierarchy tree
│   │   ├── MotionViewport (58%) — R3F canvas
│   │   └── MotionInspector (22%) — properties
│   └── Bottom Panel (34%)
│       └── MotionTimeline — animation editor (collapsible)
└── MotionCopilotPanel (slide-in overlay, 320px, when open)
```

**Keyboard shortcuts:**
- `1` / `2` — View modes (cinematic / editorial)
- `W` / `R` / `E` — Transform modes (translate / rotate / scale)
- `Space` — Play/pause
- `Cmd/Ctrl+S` — Save
- `Cmd/Ctrl+Z` / `Shift+Z` — Undo / redo
- `Cmd/Ctrl+Shift+T` — Toggle timeline collapse
- `Shift+A` — Add node dialog

#### **MotionViewport.tsx** (Preview + chrome, 380 lines)

Live 3D preview with controls:

```typescript
export function MotionViewport() {
  const [viewMode, setViewMode] = useState<'cinematic' | 'editorial'>('editorial');
  const [stageTone, setStageTone] = useState<'graphite' | 'slate' | 'paper'>('graphite');
  const [gridVisible, setGridVisible] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [transformMode, setTransformMode] = useState('translate');
  
  // Renders:
  // - Checkerboard for transparent worlds
  // - Loading spinner
  // - R3F canvas
  // - Camera / transform toggle buttons
  // - Grid, look, zoom controls
  // - Scene selector (multi-scene projects)
  // - Sequence preview button (for multi-scene playback)
}
```

#### **MotionInspector.tsx** (Properties, 400+ lines)

Context-aware inspector with collapsible sections:

**Sections:**
1. **Selection** — Object name, type, hierarchy
2. **Transform** — Position, rotation, scale with scrub controls
3. **Appearance** — Opacity, blend mode, material properties
4. **Node-Specific** — Type-dependent props (light color/intensity, text string, model variant)
5. **Moves** — Pre-built camera animation recipes
6. **Output** — Document resolution, FPS, frame range

**Auto-key integration:**
- When auto-key is on, moving a node or changing a property adds keyframes
- Uses `createMotionAutoKeyOps()` to generate keyframe ops

#### **MotionTimeline.tsx** (Animation editor, 350+ lines)

Adapter binding Motion document → generic timeline model:

```typescript
export function MotionTimeline({ collapsed, onExpand }) {
  // Manages:
  // - Scene switching (document scene selector on header)
  // - Track/clip management (add, remove, rename)
  // - Clip placement and trimming
  // - Keyframe editing (dopesheet layout)
  // - Audio track management
  
  // Converts Motion ops ↔ timeline canvas intents
  // Rendering delegated to CanvasTimeline + TimelineRowHeaders
}
```

#### **MotionScenePanel.tsx** (Hierarchy tree, 150+ lines)

Scene graph browser with drag-to-reparent:

```typescript
// Displays:
// - Root nodes (no parent)
// - Nested children (tree structure)
// - Node names, icons, visibility/lock toggles
// - Drag-drop reparenting
// - Right-click context menu (delete, duplicate, isolate)
```

#### **MotionCopilotPanel.tsx** (Chat + streaming)

Wraps the Motion Copilot agent's streaming output:
- Chat message history
- Streaming text and reasoning
- Tool approval cards (for destructive ops)
- Fallback provider notice (if agent auto-switched providers)

---

### 5. AI Copilot Agent (`src/main/ai/motion-copilot-agent.ts`)

**ToolLoopAgent with 40-step budget:**

```typescript
function createMotionCopilotAgent(opts: MotionCopilotAgentOptions) {
  return new ToolLoopAgent({
    model: resolveModel(providerId, modelId),
    instructions: buildMotionInstructions(doc, activeProject),
    tools: {
      // Scene operations
      ...createMotionTools(toolContext),
      
      // Subagent for complex modeling
      buildModel: createModelBuilderSubagentTool(),
      
      // Discovery tools
      getMotionCapability: createMotionCapabilityTool(),
      
      // Designer patterns
      ...recipeTool,
      
      // Verification
      ...verifyTools,
      
      // Planning
      ...createPlanTools(planManager),
    },
    stopWhen: [isStepCount(40), planManager.stopCondition()],
  });
}
```

**Agent Capabilities:**

1. **sceneDirector** — Add/update/remove nodes
   - Cameras, lights, models, geometry, text, UI
   - Batch ops for atomicity
   - Reparenting with world-space preservation

2. **keyframe** — Timeline animation
   - Add keyframes to channels
   - Linear, step, cubic easing
   - Time in seconds (clip-local)

3. **nodeBuilder** — Pre-configured node creation
   - Registered node types
   - Default props + custom overrides

4. **proceduralModeling** — Geometry generation
   - Arrays, radial patterns, scatter, grids
   - Instance limits for performance
   - Exposed parameters

5. **buildModel** — Subagent delegation
   - Complex multi-part heroes (desk + chair + lamp + monitor)
   - Returns Blender GLB + preview
   - Asset staging into project bundle

6. **getMotionCapability** — Design pattern discovery
   - "How do I build a product hero?" → Recipes + node types
   - Capability composition

7. **applyMotionRecipe** — Senior designer patterns
   - `product-hero` — Hero showcase with lighting
   - `stinger-3d` — Logo animation
   - `data-viz` — Chart/graph visualization
   - Each = op batch pre-configured

8. **Verification** — Quality checks
   - `lintMotionProject()` — Schema validation, missing nodes
   - `renderMotionPreview()` — Visual frame check

9. **Plan tools** — Task planning
   - `createPlan()` — Break down work
   - `updatePlanItem()` — Track progress
   - Visible in UI as collapsible checklist

**System Prompt includes:**
- Current scene state (name, duration, node count)
- Project context (if scoped)
- Engine manifest (node types, animatable properties)
- Mission statement (help user create/edit/animate scenes)
- Tone (helpful, action-oriented, no fluff)

---

### 6. Tools (`src/main/tools/`)

#### **motion.ts** (Core tools, 1000+ lines)

```typescript
createMotionTools(context: MotionToolContext) → {
  sceneDirector,      // Scene graph CRUD
  keyframe,           // Timeline keyframe CRUD
  nodeBuilder,        // Pre-configured node creation
  proceduralModeling, // Geometry generation
}
```

Each tool:
- Accepts Zod-validated parameters
- Returns `resultEnvelope()` with ops, summary, risk class
- Supports `reason` (for approval cards)
- Integrates with `planMotionCommand()` for op planning

#### **motion-recipe-tool.ts**

Pre-packaged scene patterns:
- `product-hero-pattern` — Product showcase setup
- `stinger-3d-pattern` — Logo animation
- `data-viz-pattern` — Chart/graph
- Returns op batch with pre-configured lighting, camera, geometry

#### **motion-verify-tool.ts**

Quality checks:
- `lintMotionProject()` — Schema validation
- `renderMotionPreview()` — Frame render at current time

#### **motion-capability-tool.ts**

Design pattern discovery (no mutations):
- Returns JSON-Schema descriptions of node types
- Lists animatable properties
- Suggests recipes for common briefs

---

## Store & State Management

### MotionStore (`src/hooks/use-motion-store.ts`)

**Zustand-like subscription model:**

```typescript
class MotionStore {
  doc: MotionDocument;
  selection: MotionSelection = null;        // { kind: 'node', nodeId, selectedNodeIds? }
  view: TimelineView = { pxPerSecond, scrollSeconds };
  past: MotionDocument[] = [];              // Undo history (200 limit)
  future: MotionDocument[] = [];            // Redo stack
  clock: PlaybackClock;                     // Shared playhead
  autoKeyEnabled: boolean;                  // Preference
  pendingApproval: null | { label, ops };  // Destructive ops awaiting approval
  
  methods:
    getSnapshot() → MotionSnapshot
    commit(label, ops, options?) → MotionCommitResult
    undo()
    redo()
    seek(time)
    play() / pause() / togglePlay()
    setSelection(selection)
    setView(view)
    setAutoKeyEnabled(enabled)
    loadDocument(doc)
}
```

**Undo/Redo:**
- Stack of whole documents (not inverse ops)
- Documents are small, structurally shared
- Same ops replayed produce identical document
- 200-item limit (oldest discarded)

**Subscriptions:**
- `useMotionSnapshot()` hook subscribes via `useSyncExternalStore`
- Only structural changes notify React
- Playhead updates do NOT trigger renders (clock is independent)

---

## Page Route

### Motion.tsx (`src/renderer/pages/Motion.tsx`)

Route: `/motion/:projectId`

```typescript
export default function Motion() {
  const { projectId } = useParams();
  const { doc, canUndo, canRedo } = useMotionSnapshot();
  const motionProject = useMotionProject(projectId);
  
  // Returns:
  // - Loading state
  // - Error state with recovery options
  // - Recovery dialog (if crash-recovery available)
  // - MotionEditor (when ready)
  
  // Keyboard shortcuts:
  // - Cmd/Ctrl+S → save
  // - Space → play/pause
  // - Cmd/Ctrl+Z / Shift+Z → undo/redo
}
```

**motionProject hook** (`use-motion-project.ts`):
- Loads project from disk
- Manages save/restore
- Handles crash recovery
- Tracks dirty state
- Backup versioning

---

## Data Persistence

### Schema Version 5 (`src/lib/motion/schema.ts`)

**Migrations:**
- V1 → V2: Scene structure additions
- V2 → V3: Timeline layout changes
- V3 → V4: Sequence/transition support
- V4 → V5: Latest (current)

**On load:**
- Zod validation (strict, no silent truncation)
- Migration chain applied (V1 → V2 → V3 → V4 → V5)
- Forward compatibility: reject if file version > app version

**Assets:**
- Bundle-relative paths (no absolute paths)
- Content hash (SHA256, or empty for builtins)
- Metadata parsed on first load (glTF parts, font info)

---

## Key Concepts

### Scene Graphs

- **Hierarchy** — Nodes have optional `parentId`
- **Orphans** — Nodes with missing parent shown at root (not hidden)
- **Transform inheritance** — Parent matrix applied to children
- **Reparenting** — Optional world-space preservation

### Clipping & Trimming

```
Document Timeline (seconds)
├─ Track A
│  └─ Placement (start=5s, clipId='clip-1', trimIn=2s, duration=3s)
│     → Plays clip at 5s on document timeline
│     → Starts from 2s in clip (trim in)
│     → Duration 3s (original clip is longer)
└─ Track B
   └─ Placement (start=8s, clipId='clip-2')
      → Plays clip at 8s on document timeline
```

### Easing

```typescript
MotionEasing = 
  | { type: 'linear' }
  | { type: 'step' }
  | { type: 'cubic', x1, y1, x2, y2 }  // Bézier control points
```

Easing belongs to the **outgoing** keyframe (governs segment to next keyframe).

### Multi-Scene Projects

One document can have many scenes. The UI allows:
- Scene selector dropdown
- Sequence preview (plays scenes in order)
- Per-scene independent timelines

---

## Inspector Sections

### Selection

Shows selected node:
- Name (editable)
- Type badge
- Hierarchy breadcrumb

### Transform

- Position XYZ (with scrub controls)
- Rotation XYZ (with rotation orb)
- Scale XYZ
- All animatable (auto-key when enabled)

### Appearance

- Opacity (0–1)
- Blend mode
- World position indicator

### Node-Specific

Type-dependent UI:
- **Lights** — Color, intensity, range, angle
- **Cameras** — FOV, near/far, ortho scale
- **Text** — String, font, size, align
- **Models** — Asset, variant, parts editor
- **Geometry** — Parameters (radius, sides, etc.)
- **Procedural** — Instance count, spacing, pattern

### Moves (Camera Recipes)

Pre-built camera animations:
- Orbit, dolly, pan, focus-track
- Applied as keyframe batch

### Output

Document settings:
- Resolution (1920×1080, 2560×1440, custom)
- FPS (24, 30, 60)
- Frame range

---

## Rendering Features

### Viewport Modes

**Cinematic** — Free orbit, no gizmo, presentation-like
- Mouse drag to rotate
- Scroll to zoom

**Editorial** — Transform gizmo, selection, modeling
- W/R/E keys switch gizmo mode
- Drag gizmo to transform
- Shift+click to multi-select
- Cmd/Ctrl+click to toggle

### Stage Appearance

**Graphite** (#171a22) — Dark, production
**Slate** (#39424f) — Medium, flexible
**Paper** (#e1e4e9) — Light, editorial

### Transparency Handling

- Alpha worlds show checkerboard background
- Indicates no opaque backdrop
- User can add a stage.ground or environment

### Grid

Toggle on/off. Always visible in editorial mode (helps with positioning).

### Zoom

- Min 70%, max 130%
- Buttons or mouse wheel
- Centered zoom around camera

---

## Export System

### Render Plan (`src/lib/motion/export/render-plan.ts`)

Pre-computed export strategy:
```typescript
RenderPlan {
  frames: number;                 // Total frame count
  duration: number;               // In seconds
  fps: number;
  width: number;
  height: number;
  workers: number;                // Parallel encoding
  codec: string;
  presets: RenderPreset[];
}
```

### Presets

- Social media kits (1:1, 9:16, 16:9)
- Custom resolution
- Different codecs (H.264, VP9, ProRes)

---

## Performance Considerations

### Rendering

- **No re-renders on playback** — Clock is external
- **Vertex programs** — Gizmo transforms via shaders
- **Culling** — Invisible nodes skip render
- **LOD** — High-poly models can use LOD chains

### Timeline

- **Dopesheet layout** — Computed once per collapse change
- **Keyframe sampling** — Linear search (sorted by time)
- **Channel quantization** — Frame-aligned sampling for export

### Limits

- Max instances: 5000 (procedural)
- Max nodes per scene: Reasonable (tested to 1000+)
- Max clip duration: Limited by UI (slider range)

---

## Known Limitations & Future Work

### Current Limitations

1. **No keyframe animation UI** — Can set via copilot or tools, but no visual editor in timeline
   - Dopesheet layout exists but UI not connected
   - Could add in-timeline drag-to-create

2. **No advanced camera rigs** — Camera is always a single node
   - Recipes provide pre-built animations
   - Could add look-at constraints, dolly tracks

3. **No effects/compositing** — Motion renders 3D, not 2D effects
   - Could integrate with Studio effects layer
   - Post-proc passes not implemented

4. **Model parts UI incomplete** — Can edit parts but UI is basic
   - Material override bindings work
   - Visibility toggles per part work
   - Could improve inspector UX

5. **No real-time collaboration** — Single-user editing
   - Document is large, not suitable for CRDT
   - Could implement version-based merge

### Future Opportunities

1. **Non-linear editor** — Transition system partially implemented
   - Could build full sequence/clip composer
   - Multi-camera cutting

2. **VFX integration** — Particle systems, post-processing
   - ShaderMaterial support exists
   - Could add Babylon.js post-pro plugins

3. **Performance HUD** — GPU stats, memory usage
   - For optimization validation

4. **AI Material Generator** — Procedural materials
   - Similar to Model Builder (Blender → GLB)
   - Could generate procedural shaders

---

## Summary

The Motion System is a **mature, agent-callable 3D animation editor** with:

✅ **Clean architecture** — Data, ops, rendering are separate layers  
✅ **Deterministic evaluation** — Same ops → same scene  
✅ **Full agent integration** — Copilot drives scene creation  
✅ **Professional rendering** — R3F + Three.js, export-ready  
✅ **Undo/redo, autosave, recovery** — Production-grade state management  
✅ **Extensible node registry** — 50+ types, easy to add more  
✅ **Timeline composition** — Multi-clip, multi-scene sequencing  

The editor is **production-ready** for:
- Product hero animations
- Motion graphics
- Data visualization
- 3D stingers
- Interactive previews

Integration points for future work:
- Non-linear editor (transitions, compositing)
- AI-driven material/texture generation
- Real-time collaboration (CRDT or server-synced)
- Mobile/AR export targets
