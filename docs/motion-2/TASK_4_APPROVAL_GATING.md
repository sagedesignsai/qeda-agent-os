# Task 4: Approval Gating & Risk Classification

**Status:** 🚀 READY TO START  
**Foundation:** Tasks 1-3 complete (68 tests passing)  
**Scope:** Integrate pipeline execution with Motion's approval system

---

## OBJECTIVE

Integrate the pipeline execution engine with Motion's existing approval workflow, enabling AI agents and users to review and approve pipelines before application to documents.

**Key goals:**
1. Use `planMotionCommand()` to create approval-gated plans
2. Automatically classify pipeline risk as safe/mutating/destructive
3. Wire into UI approval cards (existing infrastructure)
4. Display before/after diff in approval UI
5. Tie approval response back to pipeline execution

---

## REQUIREMENTS

### Functional Requirements

1. **Risk Classification**
   - Inherit risk from accumulated ops (already done in engine)
   - Classify pipeline as safe, mutating, or destructive
   - Set `requiresApproval` boolean

2. **Plan Creation**
   - Create `MotionPlan` via `planMotionCommand()`
   - Include pipeline DSL, parameters, and generated ops
   - Attach reasoning for approval UI

3. **Approval Integration**
   - Use existing approval card UI components
   - Show pipeline name, description, risk level
   - Display op count and op types
   - Show risk classification reasoning

4. **Approval Response**
   - Wire approval/rejection back to executor
   - Apply ops on approval
   - Cancel on rejection
   - Track approval state in motion store

5. **Diff/Preview**
   - Show what will change (before/after snapshots)
   - Visualize ops in human-readable format
   - Show node/clip/track changes

### Non-Functional Requirements

- Use existing approval infrastructure (no new UI patterns)
- Deterministic — same pipeline + params → same ops
- Preserve op order and batching
- Type-safe with Motion types
- Test coverage for approval flows
- Integration with motion store

---

## ARCHITECTURE

### Data Flow

```
PipelineExecutor.execute()
  ↓ (result has ops, risk, requiresApproval)
pipelineToMotionPlan()
  ↓ (creates MotionPlan with ops)
planMotionCommand()
  ↓ (approval gating)
motion store → approval queue
  ↓ (user approves)
applyMotionCommand()
  ↓ (apply ops to document)
Updated MotionDocument
```

### New Functions

```typescript
// src/lib/motion/pipeline/approval.ts

// Convert pipeline execution result to MotionPlan
function pipelineToMotionPlan(
  result: PipelineExecutionResult,
  pipeline: MotionPipeline,
  docBefore: MotionDocument
): MotionPlan

// Generate human-readable description of changes
function describePipelineChanges(result: PipelineExecutionResult): string

// Classify approval requirement
function getApprovalLevel(
  risk: 'safe' | 'mutating' | 'destructive'
): 'auto-approve' | 'requires-review' | 'requires-approval'

// Extract changed nodes/clips/etc for diff
function extractChangedAssets(
  docBefore: MotionDocument,
  ops: MotionOpRequest[]
): {
  createdNodes: string[]
  modifiedNodes: string[]
  deletedNodes: string[]
  createdClips: string[]
  modifiedClips: string[]
  deletedClips: string[]
  // ... etc
}
```

### Integration Points

**Motion Plan System** (`src/lib/motion/plan.ts`)
- Use `createMotionPlan()` with pipeline ops
- Leverage existing approval infrastructure
- Inherit plan versioning and replay

**Motion Store** (`src/hooks/use-motion-store.ts`)
- Queue pipeline execution for approval
- Track approval state
- Apply ops on approval

**Motion Ops** (`src/lib/motion/ops.ts`)
- Ops already fully typed
- Risk classification already implemented
- Approval already supported

**Copilot Integration** (`src/main/ai/motion-copilot-agent.ts`)
- New tool: `executePipelineWithApproval()`
- Passes pipeline and parameters
- Awaits approval or rejection
- Reports result to agent

---

## IMPLEMENTATION PLAN

### Phase 1: Approval Integration (2-3 hours)

```
1. Create approval.ts module
   ├─ pipelineToMotionPlan()
   ├─ describePipelineChanges()
   ├─ getApprovalLevel()
   └─ extractChangedAssets()

2. Add to engine.ts
   ├─ Export result with approval metadata
   └─ Export helper for approval creation

3. Create integration tests
   ├─ Test plan creation from execution result
   ├─ Test approval level classification
   ├─ Test change extraction
   └─ Test human-readable descriptions
```

### Phase 2: Motion Store Integration (1-2 hours)

```
1. Add to use-motion-store.ts
   ├─ executePipelineWithApproval(pipeline, params)
   ├─ Queue execution for approval
   ├─ Handle approval/rejection
   └─ Apply ops on approval

2. Wire into motion store state
   ├─ Track pending approvals
   ├─ Store execution results
   └─ Manage approval callbacks

3. Create integration tests
   ├─ Test store integration
   ├─ Test approval/rejection flow
   └─ Test ops application
```

### Phase 3: Copilot Tool (1 hour)

```
1. Add tool to motion-copilot-agent.ts
   ├─ executePipeline(name, parameters)
   ├─ Executes with approval
   ├─ Reports result to agent
   └─ Handles rejection gracefully

2. Test tool with agent
   ├─ Agent calls tool
   ├─ User approves/rejects
   ├─ Agent continues
   └─ Report shows in chat
```

### Phase 4: Documentation & Examples (30 min)

```
1. Create Task 4 summary document
2. Add JSDoc examples
3. Create usage guide
4. Document approval flows
```

---

## TEST STRATEGY

### Unit Tests (`motion-pipeline-approval.test.ts`)

```typescript
describe('Pipeline Approval Integration', () => {
  // Plan creation
  describe('pipelineToMotionPlan', () => {
    it('should create plan from execution result')
    it('should include ops in plan')
    it('should set correct approval level')
    it('should extract changed assets')
  })

  // Human descriptions
  describe('describePipelineChanges', () => {
    it('should describe node creation')
    it('should describe property modifications')
    it('should describe clip operations')
    it('should describe multiple changes')
  })

  // Approval level classification
  describe('getApprovalLevel', () => {
    it('should return auto-approve for safe ops')
    it('should return requires-review for mutating ops')
    it('should return requires-approval for destructive ops')
  })

  // Asset extraction
  describe('extractChangedAssets', () => {
    it('should track created nodes')
    it('should track modified nodes')
    it('should track deleted nodes')
    it('should track created clips')
    it('should track modified clips')
  })
})
```

### Integration Tests (`motion-pipeline-store.test.ts`)

```typescript
describe('Pipeline Store Integration', () => {
  describe('executePipelineWithApproval', () => {
    it('should queue execution for approval')
    it('should create approval card')
    it('should apply ops on approval')
    it('should cancel on rejection')
    it('should track approval state')
  })
})
```

### E2E Tests (if needed)

```typescript
describe('Pipeline Approval E2E', () => {
  it('user executes pipeline → sees approval card → approves → ops applied')
  it('user rejects → execution cancelled → no changes')
})
```

---

## SUCCESS CRITERIA

✅ Pipelines integrate with Motion approval workflow  
✅ Risk classification automatic and correct  
✅ Approval cards show pipeline info and changes  
✅ Approval/rejection properly routed to executor  
✅ Ops applied atomically on approval  
✅ Integration tests passing  
✅ Tool available in motion copilot  
✅ Type-safe with Motion types  
✅ Comprehensive documentation  

---

## DEPENDENCIES

- ✅ Task 1: Types & Schema
- ✅ Task 2: DSL Parser
- ✅ Task 3: Execution Engine
- 🟡 Motion plan.ts (already implemented)
- 🟡 Motion store hooks (already implemented)
- 🟡 Motion ops system (already implemented)

---

## ESTIMATED EFFORT

- **Phase 1:** 2-3 hours
- **Phase 2:** 1-2 hours
- **Phase 3:** 1 hour
- **Phase 4:** 30 min
- **Total:** 5-7 hours
- **Tests:** 25-30 test cases
- **Coverage:** Approval flow, risk classification, change tracking

---

## NOTES

- Approval infrastructure already exists — just wiring
- No new UI needed — reuse existing approval cards
- Risk classification already in engine — just expose it
- Motion store already supports approval gating
- Deterministic execution makes approval safe (can replay)

