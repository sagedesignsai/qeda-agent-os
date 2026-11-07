# Capability Discovery Implementation Guide

Step-by-step guide to implement the shared capability discovery sub-agent architecture.

## Table of Contents

1. [Phase 1: Foundation (2 hours)](#phase-1-foundation)
2. [Phase 2: Roll-Out (2 hours)](#phase-2-roll-out)
3. [Phase 3: Validation (1 hour)](#phase-3-validation)
4. [Troubleshooting](#troubleshooting)
5. [Performance Tuning](#performance-tuning)

---

## Phase 1: Foundation

### Step 1.1: Create Capability Discovery Service

**File**: `src/main/ai/capability-discovery.ts`

Copy the implementation from `capability-discovery-architecture.md` § Implementation § 1. Capability Discovery Service.

**Key points**:
- Load docs synchronously at startup (readFileSync)
- Cache in Map<string, string>
- Use resolveModel() for default model (no explicit provider needed)

**Verify**:
```bash
# Check file exists and is syntactically valid
ls -la src/main/ai/capability-discovery.ts
npx tsc --noEmit src/main/ai/capability-discovery.ts
```

### Step 1.2: Create Capability Discovery Tools

**File**: `src/main/tools/capability-discovery.ts`

Copy the implementation from `capability-discovery-architecture.md` § Implementation § 2. Capability Discovery Tools.

**Key points**:
- Six tools: one generic, five domain-specific shortcuts
- All return CapabilityResponse type (interface)
- No approval needed (read-only)

**Verify**:
```bash
ls -la src/main/tools/capability-discovery.ts
npx tsc --noEmit src/main/tools/capability-discovery.ts
```

### Step 1.3: Export from Tool Registry

**File**: `src/main/tools/index.ts`

Add to exports:
```typescript
export { capabilityDiscoveryTools, type CapabilityResponse } from './capability-discovery';
```

Add to `allTools`:
```typescript
export const allTools = {
  ...filesystemTools,
  ...shellTools,
  // ... other tools ...
  ...capabilityDiscoveryTools,  // Add here
  ...createPlanTools(new PlanManager()),
};
```

### Step 1.4: Create System Documentation

**Minimal set** (just enough for drafter):

#### `docs/systems/shared-patterns.md`

Create file with:
- "Understand Before Building" pattern
- "Minimal Viable Sophistication" pattern
- Common mistakes
- Cross-system concepts

(Copy from `capability-discovery-architecture.md` § System Documentation Files)

#### `docs/systems/document-system.md`

Create file with:
- Block types: Text, Layout, Data, Emphasis, Specialized
- Style system: Typography, Colors, Spacing tokens
- Two patterns: Proposal Template + Two-Column Comparison
- Tips for sophisticated documents

(Copy from `capability-discovery-architecture.md` § System Documentation Files)

**Verify**:
```bash
ls -la docs/systems/*.md
# Should show: shared-patterns.md, document-system.md
```

### Step 1.5: Update Document Drafter Agent

**File**: `src/main/ai/document-drafter-agent.ts`

**Change 1**: Import capability tools
```typescript
import { capabilityDiscoveryTools } from '../tools/capability-discovery';
```

**Change 2**: Update instructions (in `buildInstructions()`)
```typescript
function buildInstructions(): string {
  return `You are the Document Drafter. You create professional documents for review.

## Core Tools
- createDocument: Start a new document
- appendBlocks: Add blocks
- replaceBlock: Modify blocks

## Capability Discovery
When you need to know what's possible, call getDocumentCapability.
Questions to ask:
- "What block types exist?"
- "How do I create a two-column layout?"
- "What's a sophisticated proposal pattern?"

Never guess—always ask first.`;
}
```

**Change 3**: Add tools to agent
```typescript
export function createDocumentDrafterAgent(opts?: {...}) {
  // ... existing setup ...
  
  return new ToolLoopAgent({
    model: model as any,
    instructions,
    tools: {
      // Existing tools
      createDocument,
      appendBlocks,
      insertBlocksAt,
      replaceBlock,
      getDocumentOutline,
      readDocument,
      listProjectFiles,
      readProjectFile,
      
      // NEW: Add capability discovery
      ...capabilityDiscoveryTools,
      
      // Existing tools
      ...createPlanTools(planManager),
    },
    toolApproval: createApprovalPolicy(documentDrafterToolPolicies),
    stopWhen: [isStepCount(DRAFTER_STEP_BUDGET)],
  });
}
```

### Step 1.6: Update Drafter Approval Policy

**File**: `src/main/tools/policies/drafter.ts`

Add entries for capability discovery tools:
```typescript
export const documentDrafterToolPolicies: ToolPolicyMap = {
  // ... existing entries ...

  // Capability discovery (all auto-approved reads)
  askCapabilityAgent: t('read'),
  getDocumentCapability: t('read'),
  getStudioCapability: t('read'),
  getMotionCapability: t('read'),
  getMusicCapability: t('read'),
  getCorrespondenceCapability: t('read'),
};
```

### Step 1.7: Test Drafter with Capability Discovery

**Manual Test**:
```bash
# Start app
bun start

# In chat or document interface:
# 1. Go to Document Drafter
# 2. Request: "Create a sophisticated annual proposal"
# 3. Observe:
#    - Drafter calls getDocumentCapability
#    - Receives: {capability, available, pattern, example, tips}
#    - Generates document using real blocks (not generic)
```

**Automated Test** (add to `__tests__/capability-discovery.test.ts`):
```typescript
import { discoverCapability } from '../src/main/ai/capability-discovery';
import { docSystemCapability } from '../src/main/ai/capability-discovery';

describe('Capability Discovery', () => {
  it('should return document capabilities for proposal query', async () => {
    const response = await docSystemCapability(
      'Create a sophisticated annual proposal with metrics'
    );
    
    expect(response.capability).toBeDefined();
    expect(response.available).toContain('heading');
    expect(response.available).toContain('metrics');
    expect(response.pattern).toBeDefined();
    expect(response.example).toBeDefined();
    expect(Array.isArray(response.tips)).toBe(true);
  });

  it('should parse JSON response correctly', async () => {
    const response = await discoverCapability(
      'What blocks are available?',
      ['document']
    );
    
    // Should not throw; response should be parsed
    expect(response).toHaveProperty('capability');
    expect(response).toHaveProperty('available');
    expect(response).toHaveProperty('pattern');
    expect(response).toHaveProperty('example');
    expect(response).toHaveProperty('tips');
  });

  it('should handle out-of-scope queries', async () => {
    const response = await docSystemCapability(
      'How do I use AWS S3?'
    );
    
    expect(response.capability).toBe('Not a Qeda system capability');
  });
});
```

**Verify**:
```bash
npm test -- capability-discovery.test.ts
```

---

## Phase 2: Roll-Out

### Step 2.1: Create Remaining System Documentation

Create `docs/systems/` files for all systems:

#### `docs/systems/studio-system.md`
- Effects: zoom, cut, caption, transition
- Properties per effect
- Common patterns: highlight reel, tutorial, product demo
- Tips for video editing

#### `docs/systems/motion-system.md`
- Node types: geometry, lights, cameras, procedurals
- Animation: keyframe, easing, timing
- Common patterns: product showcase, title sequence, data visualization
- Tips for 3D scenes

#### `docs/systems/music-system.md`
- Library structure: folders, playlists, tracks
- Ambience scenes: white noise, binaural beats, rain
- Focus integration: pairing music with tasks
- Common patterns: deep focus, creative work, ambient background
- Tips for DJ features

#### `docs/systems/correspondence-system.md`
- Message types: drafted, sent, received, replied
- Recipients and channels: email, phone, postal, portal
- Clocks: reply deadline, follow-up time
- Escalation: stalled detection, chase tasks
- Common patterns: initial outreach, follow-up, escalation
- Tips for correspondence management

**Template** for each file:
```markdown
# {System} Capabilities

## Component Types / Effects / Tools
[List with descriptions]

## Properties & Options
[Table or nested list]

## Common Patterns
[2-3 detailed patterns with examples]

## Tips for Effective Use
[5-7 best practices]
```

### Step 2.2: Add Tools to All Copilots

For each copilot (studio, motion, music, correspondence, terminal):

**Update**: `src/main/ai/{copilot}-agent.ts`

```typescript
// 1. Import
import { capabilityDiscoveryTools } from '../tools/capability-discovery';

// 2. Update instructions to mention capability agent
function buildInstructions(): string {
  return `[existing instructions]

## Capability Discovery
When you need to know what's possible, use get{System}Capability.
Ask it: "How do I...?" "What's available?" "What patterns exist?"`;
}

// 3. Add tools
return new ToolLoopAgent({
  // ...
  tools: {
    // existing tools...
    ...capabilityDiscoveryTools,  // Add here
  },
  // ...
});
```

### Step 2.3: Update Approval Policies

For each copilot policy file (`src/main/tools/policies/*.ts`):

```typescript
export const copilotToolPolicies: ToolPolicyMap = {
  // ... existing entries ...

  // Capability discovery
  askCapabilityAgent: t('read'),
  getDocumentCapability: t('read'),
  getStudioCapability: t('read'),
  getMotionCapability: t('read'),
  getMusicCapability: t('read'),
  getCorrespondenceCapability: t('read'),
};
```

**Files to update**:
- `src/main/tools/policies/chat.ts` (already has access to all tools, just add entries)
- `src/main/tools/policies/copilot.ts` (task copilot)
- `src/main/tools/policies/drafter.ts` (already done in Phase 1)
- `src/main/tools/policies/correspondence.ts` (correspondence copilot)

### Step 2.4: Integration Test All Copilots

**Test Matrix**:
| Copilot | System | Query | Expected |
|---------|--------|-------|----------|
| Drafter | Document | "Two-column layout" | Returns columns block type |
| Studio | Studio | "Add zoom effect" | Returns zoom effect details |
| Motion | Motion | "Create array of spheres" | Returns procedural pattern |
| Music | Music | "Deep focus playlist" | Returns focus patterns |
| Correspondence | Correspondence | "Follow-up message" | Returns escalation pattern |

**Manual Testing**:
```bash
# For each copilot surface:
# 1. Open copilot
# 2. Make request that requires capability knowledge
# 3. Verify capability agent is called
# 4. Verify output uses real system capabilities
```

### Step 2.5: Verify Approval Policies

**Check**: Agent capabilities test still passes

```bash
npm test -- agent-capabilities.test.ts
```

Should pass without changes (tests verify all tools have policy entries).

---

## Phase 3: Validation

### Step 3.1: Measure Token Reduction

**Before Metrics**:
```bash
# Log system prompt sizes
# In each copilot agent factory:
console.log('System prompt length:', instructions.length);
console.log('Estimated tokens:', instructions.length / 4); // ~4 chars per token
```

**Expected**:
- Drafter: was ~2000 tokens (docs inline), now ~500 tokens (just mission)
- Other copilots: 60-70% reduction in system prompt

**After implementation**: Run same measurement, compare.

### Step 3.2: Compare Output Quality

**Test Case 1: Drafter**
```
User: "Create a professional annual report with financial metrics"

Before implementation:
  - Generated basic document: heading + paragraph + paragraph
  - Generic structure, no sophisticated patterns
  
After implementation:
  - Calls getDocumentCapability
  - Receives: metrics block type, two-column layout, section pattern
  - Generates: heading + section + metrics + columns + signature
  - Result: Sophisticated, pattern-based document
```

**Test Case 2: Studio**
```
User: "Add dramatic zooms to highlight the key moments"

Before:
  - Creates basic zoom effects
  - No effect combinations
  
After:
  - Calls getStudioCapability
  - Learns: zoom + caption combo, timing patterns
  - Generates: zooms with captions and transitions
```

### Step 3.3: Profile Capability Agent Latency

**Measure**: Time to call `generateText` in capability agent

```typescript
// In capability-discovery.ts:
const start = Date.now();
const { text } = await generateText({...});
const elapsed = Date.now() - start;
console.log(`Capability query took ${elapsed}ms`);
```

**Expected**: 200-800ms depending on model and network.

**Acceptable**: <2 seconds (faster than copilot generating entire output).

### Step 3.4: Documentation Review

Checklist:
- [ ] All capability docs written and reviewed
- [ ] Examples in docs are accurate and tested
- [ ] Tips reflect actual system behavior
- [ ] Cross-system patterns documented in shared-patterns.md
- [ ] No outdated or placeholder text

### Step 3.5: Final Integration Test

**Scenario**: Full end-to-end test

```
1. User launches app
2. Capability docs load (silent, at startup)
3. User opens Drafter
4. User: "Create a budget proposal"
5. Drafter calls getDocumentCapability("budget proposal")
6. Capability agent returns structured response (JSON)
7. Drafter generates document using real blocks
8. User sees sophisticated document (not generic)

Verification:
  - No errors in logs
  - Capability agent latency <2s
  - Generated output is sophisticated
  - Token usage reduced vs. before
```

---

## Troubleshooting

### Issue: "docs/systems/*.md not found"

**Cause**: Documentation files not created

**Fix**:
```bash
mkdir -p docs/systems
touch docs/systems/{shared-patterns,document,studio,motion,music,correspondence}-system.md
# Fill each with content from capability-discovery-architecture.md
```

### Issue: "JSON parse error in capability discovery"

**Cause**: Model returned non-JSON or invalid JSON

**Check**:
1. Model supports JSON mode (most recent models do)
2. System prompt forces JSON output
3. Model is not hallucinating

**Fix**: Add to capability-discovery.ts

```typescript
// Retry with stricter prompt if JSON fails
try {
  return JSON.parse(text);
} catch (err) {
  // Log the raw text for debugging
  console.error('Raw capability response:', text);
  // Optionally retry with different model
  // or return error response
}
```

### Issue: Capability agent responds with hallucinated components

**Cause**: Model inventing capabilities not in documentation

**Fix**:
1. Verify documentation is complete and accurate
2. Add instruction: "Only answer based on documentation provided"
3. Test with more specific, grounded queries

### Issue: Copilot doesn't call capability agent

**Cause**: System prompt doesn't mention it, or tool not added

**Fix**:
```typescript
// 1. Verify tool in tools object
tools: {
  ...capabilityDiscoveryTools,  // Must be here
}

// 2. Verify system prompt mentions it
instructions: `...
When you need to know capabilities, call getDocumentCapability.
...`

// 3. Verify tool is exported from index.ts
export { capabilityDiscoveryTools } from './capability-discovery';
```

### Issue: Token usage not reduced

**Cause**: System prompt still has inline documentation, or tools not used

**Check**:
```typescript
// In agent factory, before creating ToolLoopAgent:
console.log('Instructions length:', instructions.length);
// Should be ~500 tokens for minimal prompt

// Verify no docs embedded:
if (instructions.includes('block type')) {
  throw new Error('Documentation still inline!');
}
```

---

## Performance Tuning

### Optimization 1: Pre-Warm Capability Cache

Load docs at startup, not first query:

```typescript
// In main process initialization (src/main/main.ts):
import { preWarmCapabilityCache } from './ai/capability-discovery';

app.on('ready', async () => {
  await preWarmCapabilityCache();  // Load all docs
  createWindow();
});
```

Add to capability-discovery.ts:
```typescript
export async function preWarmCapabilityCache(): Promise<void> {
  // Docs already loaded at import time (readFileSync)
  // This is just a marker for the flow
  console.log('Capability cache warm (docs loaded)');
}
```

### Optimization 2: Selective System Loading

For queries that only need one system, don't load all:

```typescript
// Already done in implementation:
export const discoverCapability = (query, systems: string[]) => {
  // Only load requested systems, not all
  const context = systems.map(sys => capabilityDocs[sys]).join('\n');
}
```

### Optimization 3: Response Caching

Cache repeated capability queries (optional):

```typescript
const capabilityCache = new Map<string, CapabilityResponse>();

export async function discoverCapability(query: string, systems: string[]): Promise<CapabilityResponse> {
  const cacheKey = `${query}::${systems.join(',')}`;
  
  if (capabilityCache.has(cacheKey)) {
    return capabilityCache.get(cacheKey)!;
  }
  
  // ... existing logic ...
  
  capabilityCache.set(cacheKey, response);
  return response;
}
```

**Trade-off**: Cache hits fast, but misses if user asks similar questions differently. Start without cache; add if needed.

### Optimization 4: Batch Queries

If copilot has multiple capability questions, batch them:

```typescript
// Instead of:
const capability1 = await getDocumentCapability('blocks');
const capability2 = await getDocumentCapability('styles');

// Do:
const response = await askCapabilityAgent(
  'What blocks and styles are available?',
  ['document']
);
// Returns all info in one call
```

---

## Summary: Implementation Checklist

### Phase 1 (Day 1 - 2 hours)
- [ ] Create `src/main/ai/capability-discovery.ts`
- [ ] Create `src/main/tools/capability-discovery.ts`
- [ ] Export from `src/main/tools/index.ts`
- [ ] Create `docs/systems/shared-patterns.md`
- [ ] Create `docs/systems/document-system.md`
- [ ] Update `src/main/ai/document-drafter-agent.ts`
- [ ] Update `src/main/tools/policies/drafter.ts`
- [ ] Test drafter with capability queries
- [ ] Add test to `__tests__/capability-discovery.test.ts`

### Phase 2 (Day 2 - 2 hours)
- [ ] Create `docs/systems/{studio,motion,music,correspondence}-system.md`
- [ ] Update all copilot agents (studio, motion, music, correspondence)
- [ ] Update all copilot approval policies
- [ ] Integration test all copilots
- [ ] Verify `npm test -- agent-capabilities.test.ts` passes

### Phase 3 (Day 3 - 1 hour)
- [ ] Measure token reduction (system prompt sizes before/after)
- [ ] Compare output quality (generic vs. sophisticated)
- [ ] Profile capability agent latency
- [ ] Documentation review
- [ ] Final end-to-end test

---

## Next Steps

After implementation:
1. Monitor token usage in production
2. Gather user feedback on output quality
3. Iterate on capability documentation based on copilot behavior
4. Consider extending to other systems (terminal, chat research, etc.)
5. Optimize caching if needed

