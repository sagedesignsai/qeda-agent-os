# Motion System: Architecture Diagrams

---

## 1. Component Hierarchy

```
Motion Page (/motion/:projectId)
│
├── MotionEditor (shell, layout manager)
│   │
│   ├── Header (8px)
│   │   ├── Panel toggles
│   │   ├── MotionCommandBar (centered)
│   │   └── Actions (save, undo/redo, add node, export)
│   │
│   ├── ResizablePanelGroup (vertical split)
│   │   │
│   │   ├── Top Panel (66%)
│   │   │   └── ResizablePanelGroup (horizontal split)
│   │   │       ├── MotionScenePanel (20%)
│   │   │       │   └── Scene hierarchy tree
│   │   │       │       ├── Node list with drag-to-reparent
│   │   │       │       └── Context menu (delete, duplicate)
│   │   │       │
│   │   │       ├── MotionViewport (58%)
│   │   │       │   ├── Canvas chrome (controls)
│   │   │       │   │   ├── View mode toggle (cinematic/editorial)
│   │   │       │   │   ├── Transform mode toggle (W/R/E)
│   │   │       │   │   ├── Grid toggle
│   │   │       │   │   ├── Look/stage selector
│   │   │       │   │   ├── Zoom controls
│   │   │       │   │   └── Sequence preview (if multi-scene)
│   │   │       │   │
│   │   │       │   └── MotionSceneCanvas (R3F host)
│   │   │       │       ├── Canvas element (WebGL)
│   │   │       │       ├── Orbit controls (cinematic)
│   │   │       │       ├── Transform controls (editorial gizmo)
│   │   │       │       ├── DocumentNode (recursive renderer)
│   │   │       │       │   ├── Node-specific renderers (50+ types)
│   │   │       │       │   └── Children (recursive)
│   │   │       │       └── EditorStage (grid, helpers)
│   │   │       │
│   │   │       └── MotionInspector (22%)
│   │   │           └── Collapsible sections
│   │   │               ├── Selection
│   │   │               ├── Transform (with scrub controls)
│   │   │               ├── Appearance
│   │   │               ├── Node-specific props
│   │   │               ├── Moves (camera recipes)
│   │   │               └── Output settings
│   │   │
│   │   └── Bottom Panel (34%)
│   │       └── MotionTimeline (collapsible)
│   │           ├── TimelineTransport (play/scrub)
│   │           ├── MotionSceneSelector (scene switcher)
│   │           ├── TimelineRowHeaders (left labels)
│   │           └── CanvasTimeline (dopesheet, keyframe editing)
│   │
│   └── Dialogs
│       ├── MotionAddNodeDialog (node type picker)
│       ├── MotionAssetMarketplaceDialog (import assets)
│       ├── MotionExportDialog (render settings)
│       └── ModelBuilderDialog (Blender subagent)
│
└── MotionCopilotPanel (slide-in overlay, 320px)
    ├── Header (Motion Copilot)
    └── ChatPanel
        ├── Message history
        ├── Streaming text/reasoning
        ├── Tool approval cards
        └── Fallback notice (if provider switched)
```

---

## 2. Data Flow (Edit → Render)

```
User Action
  │
  ├─ Select node in hierarchy
  │  └─> motionStore.setSelection(selection)
  │      └─> MotionStore emits
  │          └─> React re-renders MotionInspector + selection highlight
  │
  ├─ Drag node in inspector (transform)
  │  └─> motionStore.commit('Move node', [
  │        { op: 'scene.node.update', nodeId, transform }
  │      ])
  │      └─> applyMotionOps(doc, ops)
  │          └─> MotionStore emits
  │              └─> React re-renders doc snapshot
  │                  └─> R3F frame subscription fires
  │                      └─> Three.js updates transform
  │                          └─> Canvas renders
  │
  ├─ Add keyframe in timeline
  │  └─> motionStore.commit('Add keyframe', [
  │        { op: 'keyframe.add', clipId, channelId, keyframeId, time, value, easing }
  │      ])
  │      └─> applyMotionOps(doc, ops)
  │          └─> Keyframe inserted in clip.channels[].keyframes[]
  │              └─> Clock continues, evaluateMotionFrame() sees new keyframe
  │                  └─> Node property sampled at keyframe time
  │                      └─> Canvas re-samples animation
  │
  └─ Play/pause
     └─> motionStore.togglePlay()
         └─> clock.toggle()
             └─> PlaybackClock emits tick (external subscription)
                 └─> MotionSceneCanvas frame loop fires
                     └─> evaluateMotionFrame(scene, currentTime)
                         └─> Three.js objects updated
                             └─> Canvas renders
```

---

## 3. Rendering Pipeline

```
MotionDocument
  │
  ├─ evaluateMotionFrame(scene, timeInSeconds)
  │  ├─ sampleSceneTimeline() — Sample all channels at time
  │  ├─ For each channel:
  │  │  └─ applyNodeProperty(node, property, value) — Bake keyframe value into node
  │  └─ Return evaluated MotionFrame { time, sceneId, nodes[] }
  │
  └─ MotionSceneCanvas (R3F host)
     │
     ├─ useFrame() — Fires every frame (60fps)
     │  ├─ Subscribe to clock (no React re-render)
     │  ├─ evaluateMotionFrame() called (no React involved)
     │  └─ applyMotionFrame() binds evaluated state to Three.js
     │
     └─ DocumentNode (recursive)
        ├─ getMotionThreeRenderer(nodeType) — Lookup renderer
        ├─ <Renderer /> renders Three.js objects
        ├─ useFrame subscribes, applies evaluated node state
        └─ Recursively render children
```

---

## 4. Operation Flow (Copilot → Document)

```
AI Copilot
  │
  └─ ToolLoopAgent (40-step budget)
     │
     ├─ Call sceneDirector tool
     │  └─ Tool validates params (Zod schema)
     │     └─ Plan ops (planMotionCommand)
     │        └─ Apply ops (context.apply)
     │           └─ IPC: 'motion:apply-ops'
     │              │
     │              └─ Main process
     │                 └─ applyMotionOps(doc, ops)
     │                    ├─ Validate ops against doc schema
     │                    ├─ Apply reducer for each op
     │                    └─ Return new document
     │                       └─ IPC emit: 'motion:changed'
     │                          └─ Renderer MotionStore updates
     │                             └─ React re-renders
     │
     ├─ Call keyframe tool
     │  └─ Batch add keyframes to clip.channels
     │     └─ Apply ops (same flow above)
     │
     └─ Call verification tool
        └─ lintMotionProject() — Schema validation
           └─ renderMotionPreview() — Visual check at current time
```

---

## 5. Document State Tree

```
MotionDocument (immutable, 1-5MB typical)
│
├─ meta
│  ├─ id (UUID)
│  ├─ name (user-editable)
│  ├─ output { fps, width, height }
│  └─ brand (color palette for new nodes)
│
├─ scenes[] (array, usually 1-5 items)
│  └─ MotionScene
│     ├─ id, name
│     ├─ nodes[] (scene graph)
│     │  └─ MotionNode
│     │     ├─ id, type, name, parentId
│     │     ├─ transform { position[3], rotation[3], scale[3] }
│     │     ├─ props {} (type-specific)
│     │     └─ visible, locked
│     ├─ timeline
│     │  ├─ duration
│     │  ├─ tracks[] (may be empty)
│     │  ├─ clips[] (reusable)
│     │  │  └─ MotionClip
│     │  │     ├─ id, name, duration
│     │  │     └─ channels[] (per-property animation)
│     │  │        └─ MotionChannel
│     │  │           ├─ targetId (node id)
│     │  │           ├─ property (path: "position.x", "opacity")
│     │  │           └─ keyframes[] (sorted by time)
│     │  │              └─ MotionKeyframe
│     │  │                 ├─ time (seconds, clip-local)
│     │  │                 ├─ value (number, 0-1 or custom range)
│     │  │                 └─ easing { type, cubic params }
│     │  ├── workArea { enabled, start, end }
│     │  ├── playMode ('once' | 'loop' | 'ping-pong')
│     │  └── audio[] (audio placements)
│     └─ background, cameraId
│
├─ assets[] (library, images/models/fonts/audio)
│  └─ MotionAsset
│     ├─ id, name, kind (image/video/audio/model/environment/font)
│     ├─ path (bundle-relative)
│     ├─ hash (content SHA256 or 'builtin')
│     └─ metadata (parsed: glTF parts, font info)
│
└─ timeline (document-level timeline)
   └─ Duration, tracks, clips (may differ from scenes)
```

---

## 6. Timeline Adapter (Motion → Generic Timeline Model)

```
MotionDocument
  │
  └─ toTimelineModel()
     ├─ Convert scenes to timeline items
     ├─ Convert tracks to row headers
     ├─ Convert clips to timeline items with channels
     ���─ Return TimelineModel {
         rows[],        // Track/node rows
         items[],       // Clips with channels
         channels[],    // Keyframe lanes
         duration,
       }
     │
     └─ CanvasTimeline renders
        ├─ TimelineRowHeaders (left panel)
        ├─ Dopesheet canvas (keyframes)
        └─ Listens for user intents (drag keyframe, etc.)
           └─ Convert back to Motion ops
              └─ motionStore.commit()
```

---

## 7. Node Type System

```
Node Registry (singleton)
│
├─ registerMotionNodeType(definition)
│  └─ Validates definition
│     ├─ Zod schema for props
│     ├─ Animatable property paths
│     ├─ Default props
│     └─ Property hints (color picker, slider bounds)
│
├─ getMotionNodeType(type: string) → definition
├─ listMotionNodeTypes() → all definitions
└─ createMotionNode(type, id) → MotionNode (with defaults)
   │
   └─ Node Definitions (50+ files in src/lib/motion/nodes/)
      ├─ scene.ts — Root, camera binding, stage
      ├─ camera.ts — Perspective, orthographic
      ├─ light.ts — Directional, point, spot, ambient
      ├─ model.ts — glTF asset binding + parts system
      ├─ primitives.ts — Box, sphere, cylinder, plane, cone, torus
      ├─ geometry.ts — Parametric (lathe, extrude, shape)
      ├─ text.ts — 3D text with font rendering
      ├─ shapes.ts — 2D shapes (rectangle, circle, polygon, star)
      ├─ surfaces.ts — Material properties (color, roughness, emissive)
      ├─ procedural.ts — Arrays, instances, scatter, grids
      ├─ data.ts — Data-driven (bar charts, pie charts, scatter)
      ├─ video.ts — Video playback synced to playhead
      ├─ graphics.ts — Canvas 2D rendered to texture
      ├─ ui.ts — Billboarded UI overlays
      ├─ stage.ts — Ground plane, stage, environment
      ├─ lighting.ts — Lighting rig presets
      └─ ... (16 more categories)
         │
         └─ Each definition declares:
            ├─ label, category, description
            ├─ propsSchema (Zod)
            ├─ defaultProps
            ├─ animatableProperties { 'property.path': description }
            ├─ propertyHints { 'property': { type, bounds, ... } }
            └─ Renderer function (src/components/motion/scene/nodes/)
```

---

## 8. Keyboard Shortcut Map

```
Global Viewport
  1 ...................... Cinematic view
  2 ...................... Editorial view
  W ...................... Translate mode (gizmo)
  R ...................... Rotate mode (gizmo)
  E ...................... Scale mode (gizmo)
  Space .................. Play/pause
  Cmd/Ctrl+S ............. Save
  Cmd/Ctrl+Z ............. Undo
  Cmd/Ctrl+Shift+Z ....... Redo
  Cmd/Ctrl+Shift+T ....... Toggle timeline collapse
  Shift+A ................ Add node dialog

Timeline (when focused)
  Spacebar ............... Play/pause (scrub)
  < / > .................. Prev/next frame
  J / K .................. Rewind/fast-forward

Multi-select
  Shift+Click ............ Add to selection
  Cmd/Ctrl+Click ......... Toggle in selection
```

---

## 9. Copilot Task Breakdown (Example: "Build a product hero")

```
User: "Create a product hero animation with a glowing laptop"

AI Copilot
│
└─ Call getMotionCapability("product hero")
   ├─ Return: node types, recipes, lighting patterns
   └─ User reads response
      │
      └─ User: "Use the product-hero recipe, with a custom monitor."
         │
         ├─ createPlan()
         │  └─ Tasks:
         │     1. Apply product-hero recipe
         │     2. Replace model with custom monitor
         │     3. Add camera dolly animation
         │     4. Add light keyframes for glow effect
         │
         ├─ updatePlanItem(1, 'in-progress')
         │  └─ applyMotionRecipe('product-hero')
         │     └─ Apply ops batch
         │        └─ motionStore.commit()
         │
         ├─ updatePlanItem(1, 'done')
         │  └─ Create MotionNode (model type)
         │     └─ motionStore.commit()
         │
         ├─ updatePlanItem(2, 'in-progress')
         │  └─ sceneDirector tool
         │     ├─ Update model node prop (assetId → custom monitor)
         │     └─ motionStore.commit()
         │
         ├─ updatePlanItem(2, 'done')
         │  └─ ...
         │
         └─ updatePlanItem(3-4, ..., done)
```

---

## 10. Export Architecture

```
MotionDocument
  │
  ├─ Export dialog opens
  │  └─ User chooses preset (1920×1080 H.264, etc.)
  │     └─ Render plan computed
  │        ├─ Total frames
  │        ├─ Codec
  │        ├─ Workers (parallel)
  │        └─ Quality settings
  │
  └─ Render session starts
     ├─ For each frame:
     │  ├─ evaluateMotionFrame(scene, frameTime)
     │  ├─ Render to PNG buffer
     │  └─ Encode to video stream
     │
     ├─ Progress tracked in export state
     ├─ IPC updates renderer
     │  └─ Progress bar displayed
     │
     └─ On complete:
        └─ Save to project output folder
           └─ User notified (Reveal in Finder / Open)
```

---

## 11. Store Subscription Flow

```
MotionStore
│
├─ Internal state
│  ├─ doc (MotionDocument)
│  ├─ selection (MotionSelection)
│  ├─ view (TimelineView)
│  ├─ past[] (undo history)
│  ├─ future[] (redo stack)
│  ├─ clock (PlaybackClock)
│  ├─ autoKeyEnabled (boolean)
│  └─ listeners (Set<() => void>)
│
└─ useSyncExternalStore subscription
   │
   ├─ getSnapshot() → MotionSnapshot
   │  └─ Return immutable snapshot
   │
   ├─ subscribe(listener) → unsubscribe
   │  └─ Register listener
   │     └─ Listener called on emit()
   │        └─ React re-renders with new snapshot
   │
   └─ No playhead updates → No renders
      └─ Clock ticks independently
         └─ R3F useFrame fires
            └─ Canvas updates without React
```

---

## 12. Error Recovery

```
On crash or error
│
├─ Recovery file written (autosave)
│  └─ Backup with crash metadata
│
└─ On next launch
   ├─ Motion.tsx checks recovery status
   │  ├─ If corrupted: Show error + recovery dialog
   │  ├─ If recoverable: Show "Recover?" dialog
   │  └─ If clean: Open normally
   │
   ├─ User action:
   │  ├─ "Recover" → Restore autosave, open editor
   │  ├─ "Discard" → Ignore recovery, open last saved
   │  ├─ "Inspect" → Export recovery file to disk
   │  └─ "Duplicate for repair" → Copy project, try again
   │
   └─ Backups available
      └─ Show version list (revision #, timestamp)
         └─ User can restore any prior backup
```

---

## 13. Multi-Scene Composition

```
MotionDocument with 3 scenes
│
├─ Scene 1 (Product intro, 5 seconds)
├─ Scene 2 (Feature highlight, 3 seconds)
└─ Scene 3 (Logo stinger, 2 seconds)
   │
   └─ Sequence (optional, for playback order)
      ├─ Item 1: Scene 1, start=0s, duration=5s
      ├─ Item 2: Scene 2, start=5s, duration=3s
      │  ├─ transitionIn: { type: 'crossfade', duration: 0.5s }
      │  └─ transitionOut: { type: 'dip', duration: 0.3s, color: '#000' }
      └─ Item 3: Scene 3, start=8.3s, duration=2s
         │
         └─ Total duration: 10.3 seconds
            │
            └─ User clicks "Sequence Preview" in viewport
               ├─ Plays Scene 1 (0-5s)
               ├─ Transition crossfade (5-5.5s)
               ├─ Plays Scene 2 (5.5-8.5s)
               ├─ Transition dip to black (8.5-8.8s)
               ├─ Plays Scene 3 (8.8-10.8s)
               └─ Loops back to Scene 1 (if loop enabled)
```

---

## 14. Integration Points (For Future)

```
Future Integrations
│
├─ Studio (Video Editor)
│  └─ Export Motion scene as video clip
│     └─ Import video into Studio take
│        └─ Apply effects, captions over 3D render
│
├─ Trace (Vector Animation)
│  └─ Render Trace SVG animation to image sequence
│     └─ Bind sequence to Motion shader
│        └─ Animate 3D geometry with 2D vector animation
│
├─ Music (Audio Sync)
│  └─ Import playlist track into Motion audio track
│     └─ AI suggests camera moves sync'd to beat
│        └─ Export 3D + audio as composite video
│
└─ Builder (Coding)
   └─ AI generates Three.js shader code
      └─ Motion registers custom node type
         └─ User adds procedural shader nodes to scene
```

---

## 15. Approval Flow (Destructive Operations)

```
User or Copilot attempts destructive op
│
├─ motionStore.commit(label, ops, {})
│  └─ batchRisk(ops) → 'destructive'?
│
├─ YES: Hold for approval
│  ├─ motionStore.pendingApproval = { label, ops }
│  ├─ React re-renders
│  └─ UI shows approval card
│     ├─ Title: "Delete 5 nodes?"
│     ├─ Details: Ops description
│     └─ Actions: [Approve] [Reject]
│
├─ User clicks Approve
│  └─ motionStore.commit(label, ops, { approved: true })
│     └─ applyMotionOps(doc, ops)
│        └─ Document updated
│           └─ React re-renders
│
└─ User clicks Reject
   └─ pendingApproval cleared
      └─ Document unchanged
```

---

This architecture ensures **data consistency**, **undo/redo correctness**, **performance** (no unnecessary renders), and **agent integration** (all ops are serializable and validated).
