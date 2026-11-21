# Motion System: Implementation Patterns & Best Practices

---

## Pattern 1: Operation-Based Mutations

**Core principle:** All document changes go through the ops system.

```typescript
// ✅ CORRECT
motionStore.commit('Add camera', [
  { op: 'scene.node.add', nodeId: 'node-1', type: 'camera.perspective' }
]);

// ❌ WRONG (mutation bypasses ops)
doc.scenes[0].nodes.push(newNode);
```

**Why:**
- Enables undo/redo (ops are replayed)
- Enables agent integration (ops are serializable)
- Enables approval gating (risk classification)
- Enables validation (Zod schema per op type)

---

## Pattern 2: Batch Atomicity

**Group related ops into one commit:**

```typescript
// ✅ CORRECT (atomic, can approve/reject as unit)
motionStore.commit('Build lighting rig', [
  { op: 'scene.node.add', nodeId: 'light-1', type: 'light.directional', props: { color: '#fff' } },
  { op: 'scene.node.add', nodeId: 'light-2', type: 'light.point', props: { intensity: 0.5 } },
  { op: 'scene.node.add', nodeId: 'light-3', type: 'light.ambient' },
]);

// ❌ LESS IDEAL (three separate commits)
motionStore.commit('Add directional light', [{ op: 'scene.node.add', ... }]);
motionStore.commit('Add point light', [{ op: 'scene.node.add', ... }]);
motionStore.commit('Add ambient light', [{ op: 'scene.node.add', ... }]);
```

**Why:**
- User can undo entire rig in one keystroke
- Copilot approval card shows "Build lighting rig" not three separate approvals
- Atomic from user perspective

---

## Pattern 3: Selection as Subscription, Not Prop

**Store selection in MotionStore, subscribe from components:**

```typescript
// ✅ CORRECT (subscription pattern)
// In component
const { selection } = useMotionSnapshot();

// When selecting
motionStore.setSelection({ kind: 'node', nodeId: 'node-1' });

// ❌ LESS IDEAL (prop drilling)
<MotionViewport selectedNodeId={state.selectedNodeId} onSelectNode={setSelectedNodeId} />
```

**Why:**
- Selection is ephemeral UI state (not document state)
- Multiple components need it (viewport, inspector, timeline)
- Single source of truth (MotionStore)
- No prop drilling

---

## Pattern 4: Clock External, Frame Loop Independent

**Playback clock is external to React rendering.**

```typescript
// ✅ CORRECT (clock independent)
// In MotionSceneCanvas (R3F)
useFrame(() => {
  // Fires every frame, no React re-render
  const evaluated = evaluateMotionFrame(scene, motionStore.clock.time);
  applyMotionFrame(scene, evaluated);
});

// ❌ WRONG (ties playback to React renders)
const [time, setTime] = useState(0);
useEffect(() => {
  const interval = setInterval(() => setTime(t => t + 1/60), 1000/60);
  return () => clearInterval(interval);
}, []);
```

**Why:**
- 60fps canvas rendering independent of React (which might only render 30fps)
- Play/pause doesn't cause React re-renders
- Smooth, jank-free playback
- Performance: No React overhead on playhead update

---

## Pattern 5: Deterministic Evaluation

**Given a time, evaluateMotionFrame always produces the same result.**

```typescript
// ✅ CORRECT (pure, deterministic)
function evaluateMotionFrame(scene, time, context) {
  const nodes = new Map(scene.nodes.map(n => [n.id, n]));
  const values = sampleSceneTimeline(scene, time);  // Pure
  
  for (const [key, value] of values) {
    // Apply sampled value to node
    nodes.set(node.id, applyNodeProperty(node, property, value));
  }
  
  return { time, sceneId: scene.id, nodes: [...nodes.values()] };
}

// Same input → Same output, every time
evaluateMotionFrame(scene, 5.0) === evaluateMotionFrame(scene, 5.0)
```

**Why:**
- Re-render at different time: Same result
- Replay ops: Same animation
- Export at different frame rate: Consistent
- No random state, callbacks, or side effects

---

## Pattern 6: Immutable Document Updates

**Never mutate doc directly; create new doc with changes.**

```typescript
// ✅ CORRECT (immutable)
const updated = applyMotionOps(currentDoc, ops);
// currentDoc unchanged, updated is new object with shared structure

// Use structurally shared updates (Immer-like)
const newDoc = { ...oldDoc, scenes: [...newScenes] };

// ❌ WRONG (mutation)
oldDoc.scenes[0].nodes.push(newNode);
```

**Why:**
- Enables undo/redo (keep old docs on stack)
- React can detect changes (reference equality)
- Functional programming guarantees (no hidden mutations)

---

## Pattern 7: Component Registration Pattern

**Node types self-register via definitions.**

```typescript
// src/lib/motion/nodes/camera.ts
export const MOTION_CAMERA_NODES: MotionNodeTypeDefinition[] = [
  {
    id: 'camera.perspective',
    label: 'Perspective Camera',
    category: 'cameras',
    description: 'Standard perspective view',
    propsSchema: z.object({ fov: z.number().min(1).max(180), ... }),
    defaultProps: { fov: 50, near: 0.1, far: 1000 },
    animatableProperties: { 'fov': { description: '...' } },
  },
  // ... more camera types
];

// src/lib/motion/nodes/index.ts
export const MOTION_NODE_TYPES = [
  ...MOTION_CAMERA_NODES,
  ...MOTION_LIGHT_NODES,
  ...MOTION_GEOMETRY_NODES,
  // ... all categories
];

// At app startup
MOTION_NODE_TYPES.forEach(def => registerMotionNodeType(def));
```

**Why:**
- Easy to add new node types (one file + one entry in index)
- Definitions separate from renderer (can move code around)
- Registry powers UI (add node menu, inspector props, copilot capabilities)

---

## Pattern 8: Adapter Layer Between Domains

**Motion document → Generic timeline model → Canvas rendering.**

```typescript
// Convert Motion document to timeline model (once)
const timelineModel = toTimelineModel(motionDoc);

// Components can work with generic timeline (reusable)
<CanvasTimeline model={timelineModel} />

// Canvas emits timeline intents (generic)
onKeyframeMove({ itemId, channelId, keyId, newTime })

// Convert back to Motion ops (at application point)
const ops = timelineIntentToMotionOps(motionDoc, intent);
motionStore.commit('Move keyframe', ops);
```

**Why:**
- Timeline kit is reusable (could be used by Trace, Studio)
- Motion logic stays in lib/motion
- Clear separation of concerns
- Easy to test each layer independently

---

## Pattern 9: Inspector Sections as Collapsible Accordion

**One section open at a time, stateful per-section.**

```typescript
// ✅ CORRECT (one section open)
<Collapsible open={openSection === 'transform'}>
  <CollapsibleTrigger onClick={() => setOpenSection('transform')}>
    Transform
  </CollapsibleTrigger>
  <CollapsibleContent>
    {/* Transform controls */}
  </CollapsibleContent>
</Collapsible>

// ❌ LESS IDEAL (all sections independently openable)
<Collapsible open={transformOpen} onOpenChange={setTransformOpen}>
  {/* cluttered if multiple sections expand */}
</Collapsible>
```

**Why:**
- Cleaner UI (one section at a time)
- Encourages exploring properties (discover by expanding)
- Vertical real estate efficient
- Pattern matches Figma, Maya inspector

---

## Pattern 10: Risk-Based Approval Gating

**Ops declare risk; store enforces approval before mutation.**

```typescript
export type MotionOpRisk = 'safe' | 'mutating' | 'destructive';

const RISKS: Record<string, MotionOpRisk> = {
  'scene.node.add': 'safe',          // No approval needed
  'scene.node.update': 'mutating',   // May require approval
  'scene.node.remove': 'destructive', // Always requires approval
  'scene.node.reparent': 'destructive',
  // ...
};

// In store.commit()
const risk = batchRisk(ops);
if (risk === 'destructive' && !options.approved) {
  this.pendingApproval = { label, ops };
  // UI shows approval card
  return { status: 'pending', document: this.doc };
}

// After approval
motionStore.commit(label, ops, { approved: true });
```

**Why:**
- Prevents accidental deletions
- Safe operations run immediately (fast)
- Copilot sees which ops need approval (can batch requests)
- Audit trail (approval reason shown in UI)

---

## Pattern 11: Node Registry as Single Source of Truth

**Registry is **not** in document; it's in code (registration at startup).**

```typescript
// ✅ CORRECT
// In definitions (src/lib/motion/nodes/camera.ts)
const definition = { id: 'camera.perspective', propsSchema: ..., animatableProperties: ... };
registerMotionNodeType(definition);

// Query registry
const nodeType = getMotionNodeType('camera.perspective');
const animatable = nodeType.animatableProperties; // { 'fov', 'position.x', ... }

// ❌ WRONG (store registry in document)
doc.nodeTypes = { 'camera.perspective': { ... } };
// Now document is document + schema, gets huge and slow to save
```

**Why:**
- Node types are app code, not user data
- Document only stores node instances and their values
- Registry is source of truth for UI (inspector, add menu, copilot)
- Easy to update types in future without migration

---

## Pattern 12: Hook Composition for Complex State

**Use React hooks to bind complex state management.**

```typescript
// ✅ CORRECT (composition)
export function useMotionExport() {
  const [state, setState] = useState<MotionExportState>({ busy: false });
  
  const start = async (options: MotionExportStartOptions) => {
    setState(s => ({ ...s, busy: true, progress: null }));
    // Listen for IPC progress events
    const unsubscribe = useIpcEvent('motion:export-progress', (progress) => {
      setState(s => ({ ...s, progress }));
    });
    // ... export logic
    setState(s => ({ ...s, busy: false }));
    unsubscribe();
  };
  
  return { state, start };
}

// Usage in component
const exportState = useMotionExport();
<Button onClick={() => exportState.start({ preset: '1920x1080' })}>Export</Button>
```

**Why:**
- Encapsulates state machine (busy, progress, error)
- Separates state logic from component rendering
- Reusable across components
- Testable in isolation

---

## Pattern 13: Keyboard Shortcuts at Page Level

**Don't claim global keys in components; register at page level.**

```typescript
// ✅ CORRECT (Motion.tsx page owns shortcuts)
export default function Motion() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey && event.code === 'KeyS') {
        event.preventDefault();
        void motionProject.saveNow();
      }
      if (event.code === 'Space') {
        event.preventDefault();
        motionStore.togglePlay();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  
  return <MotionEditor />;
}

// ✅ ALSO OK (viewport-local, lower priority)
// In MotionViewport.tsx
if (event.key === '1') setViewMode('cinematic');  // Override if page didn't handle

// ❌ WRONG (multiple components claiming same keys)
// Can't predict which fires first, conflicts at scale
```

**Why:**
- Page is the boundary for keyboard scope
- Prevents conflicts between features
- User expectations match OS conventions (app-wide shortcuts at top level)
- Viewport shortcuts are secondary (specific to preview mode)

---

## Pattern 14: Selection Multi-Select with Modifiers

**Shift/Cmd modifiers enable powerful selection patterns.**

```typescript
onSelectNode={(nodeId, modifiers) => {
  const current = motionStore.getSnapshot().selection;
  const selected = new Set(
    current?.kind === 'node'
      ? current.selectedNodeIds ?? [current.nodeId]
      : []
  );
  
  if (modifiers?.shiftKey) {
    // Shift: add to selection (range-like)
    selected.add(nodeId);
  } else if (modifiers?.ctrlKey || modifiers?.metaKey) {
    // Cmd/Ctrl: toggle in selection
    if (selected.has(nodeId)) selected.delete(nodeId);
    else selected.add(nodeId);
  } else {
    // No modifier: replace selection
    motionStore.setSelection({ kind: 'node', nodeId });
    return;
  }
  
  const ids = [...selected];
  if (ids.length === 0) motionStore.setSelection(null);
  else motionStore.setSelection({
    kind: 'node',
    nodeId: ids.includes(nodeId) ? nodeId : ids[ids.length - 1],
    selectedNodeIds: ids.length > 1 ? ids : undefined,
  });
});
```

**Why:**
- Matches Figma, Blender, Maya conventions
- User already knows modifier patterns
- Power users appreciate efficiency
- Reduces UI clutter (no "add to selection" button needed)

---

## Pattern 15: Error Recovery with Autosave

**Always write recovery on error; offer restore on next launch.**

```typescript
// During edit
// ... motionStore.commit() happens

// On crash
try {
  // ... code throws
} catch (error) {
  // Write recovery file
  await writeRecoveryFile({
    document: motionStore.getDocument(),
    error: error.toString(),
    savedAt: new Date().toISOString(),
  });
  // Let OS crash handler take over
}

// On next launch
if (recoveryFileExists()) {
  // Show recovery dialog
  <AlertDialog>
    <h2>Motion closed unexpectedly</h2>
    <p>Recover changes from {recoveryFile.savedAt}?</p>
    <button onClick={() => restoreRecovery()}>Recover</button>
    <button onClick={() => discardRecovery()}>Discard</button>
  </AlertDialog>
}
```

**Why:**
- User work is never lost
- Transparent error handling
- Encourages reporting crashes (recovery proves they happened)
- Professional UX (matches Adobe, Figma)

---

## Pattern 16: Render Nothing During Load

**Don't show placeholder; block render until doc is ready.**

```typescript
// ✅ CORRECT (block render)
if (motionProject.status === 'loading') {
  return <div>Opening Motion project…</div>;
}

if (motionProject.status === 'error') {
  return <ErrorDialog error={motionProject.error} />;
}

if (motionProject.status === 'recovery') {
  return <RecoveryDialog />;
}

// Only render when status === 'ready'
return <MotionEditor />;

// ❌ WRONG (show partial state)
return (
  <>
    {motionProject.loading && <Spinner />}
    <MotionEditor doc={motionProject.doc} /> {/* undefined or partial */}
  </>
);
```

**Why:**
- Components assume doc exists and is complete
- No defensive checks needed in editor
- Clear state machine (one status at a time)
- User sees exactly what's happening

---

## Pattern 17: Copilot Streaming with Approval Integration

**Agent streams; UI renders incrementally; approval cards halt stream.**

```typescript
// In copilot hook
const [messages, setMessages] = useState<UIMessage[]>([]);
const [pendingApproval, setPendingApproval] = useState<ToolApprovalRequest | null>(null);

const sendMessage = async (content: string) => {
  const stream = agent.stream({ messages: [...messages, { role: 'user', content }] });
  
  for await (const chunk of stream) {
    if (chunk.type === 'text-delta') {
      // Append text to last message
      setMessages(m => [...m.slice(0, -1), { ...m[m.length - 1], content: m[m.length - 1].content + chunk.text }]);
    }
    
    if (chunk.type === 'tool-call') {
      // Show tool being called
      setMessages(m => [...m, { role: 'assistant', parts: [{ type: 'tool', name: chunk.toolName, state: 'input-streaming' }] }]);
    }
    
    if (chunk.type === 'tool-approval-request') {
      // Halt stream, show approval card
      setPendingApproval(chunk);
      // User approves or rejects
      // Stream resumes with tool-approval-response
    }
  }
};
```

**Why:**
- User sees work in progress
- Destructive ops don't execute until approved
- Stream continues after approval
- Feels responsive (incremental updates)

---

## Summary: Motion System Design Principles

1. **Op-based mutations** — All changes are ops
2. **Atomic batching** — Group related ops
3. **Subscription state** — Ephemeral state in store, subscribe from components
4. **External clock** — Playback independent of React renders
5. **Pure evaluation** — Same input → same output
6. **Immutable updates** — Never mutate document directly
7. **Self-registering types** — Node types register themselves
8. **Adapter layers** — Convert between domains
9. **Accordion inspector** — One section at a time
10. **Risk-based approval** — Ops declare risk
11. **Registry as source** — Types in code, instances in document
12. **Hook composition** — Complex state in hooks
13. **Top-level shortcuts** — Page owns keyboard scope
14. **Modifier selection** — Shift/Cmd for multi-select
15. **Error recovery** — Autosave + restore on crash
16. **Render blocking** — Don't render until ready
17. **Streaming + approval** — Agent streams, UI gates destructive ops

These patterns ensure the Motion editor is **performant**, **maintainable**, **testable**, and **agent-friendly**.
