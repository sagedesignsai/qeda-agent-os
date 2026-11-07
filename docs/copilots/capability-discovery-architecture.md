# Shared Capability Discovery Sub-Agent Architecture

A lightweight, scalable pattern for all copilots to delegate system capability discovery to a shared sub-agent. Solves context bloat and ensures consistent system knowledge across domains.

## Problem Statement

### Current Issues

1. **Context Bloat**
   - Each copilot embeds full system documentation in its system prompt
   - Drafter: +2000 tokens for block types, styles, examples
   - Studio: +1500 tokens for effects, transitions, presets
   - Motion: +1200 tokens for node types, materials, lighting
   - **Total**: ~6500 tokens per copilot system prompt
   - **Impact**: 70% of prompt is documentation, 30% is instructions

2. **Inconsistent System Knowledge**
   - Document system capability documented in drafter
   - Studio capability documented in studio copilot
   - Motion capability documented in motion copilot
   - **Result**: If system changes, must update multiple copilots

3. **Inability to Leverage Full System Capability**
   - Copilots generate generic output because they don't know what's possible
   - Example: Drafter creates basic documents, doesn't know about sophisticated block patterns
   - Example: Studio doesn't know about advanced effect combinations
   - **Root cause**: Documentation too minimal to enable sophisticated generation

## Solution: Shared Capability Discovery Sub-Agent

A **lightweight, non-agentic service** that all copilots delegate to for capability queries. Loads system documentation once at startup and answers questions on-demand.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│              All Copilots (ToolLoopAgents)                  │
│  Drafter, Studio, Motion, Music, Correspondence, Terminal   │
│                                                              │
│  System prompt: ~500 tokens (minimal)                       │
│  Tools: Domain-specific + Capability Discovery tools        │
└────────────────────────┬────────────────────────────────────┘
                         │
         Copilot queries: "How do I create a sophisticated layout?"
         "What effects are available?" "Can I animate this?"
                         │
                         ▼
         ┌──────────────────────────────────────────┐
         │ Shared Capability Discovery Service      │
         │ (src/main/ai/capability-discovery.ts)    │
         │                                          │
         │ • generateText (lightweight, not agent)  │
         │ • System: "Know all Qeda systems"       │
         │ • Load docs once at startup             │
         │ • Answer capability questions           │
         │ • Return JSON: {capability, available,  │
         │    pattern, example, tips}               │
         └──────────────┬───────────────────────────┘
                        │
                        ▼
         ┌──────────────────────────────────────────┐
         │ System Documentation Files               │
         │ (docs/systems/)                          │
         │                                          │
         │ ├── shared-patterns.md                  │
         │ ├── document-system.md                  │
         │ ├── studio-system.md                    │
         │ ├── motion-system.md                    │
         │ ├── music-system.md                     │
         │ └── correspondence-system.md            │
         └──────────────────────────────────────────┘
```

### Key Design Principles

1. **Sub-agent is NOT a ToolLoopAgent**
   - Uses lightweight `generateText` (Vercel AI SDK)
   - Single LLM call per capability query
   - Fast, low-token overhead
   - No tool loop, no step budget

2. **Lazy Loading**
   - Docs loaded once at server startup
   - Cached in memory (Map<system, docContent>)
   - Only relevant systems passed to sub-agent per query

3. **Structured Output**
   - Sub-agent returns JSON only
   - Parsed by caller
   - Predictable format for all copilots

4. **Separation of Concerns**
   - Main copilot: Generate output (documents, video edits, scenes)
   - Capability agent: Explain what's possible
   - Documentation: Single source of truth

---

## Implementation

### 1. Capability Discovery Service

**File**: `src/main/ai/capability-discovery.ts`

```typescript
import { generateText } from 'ai';
import { resolveModel } from './provider';
import { readFileSync } from 'fs';
import path from 'path';

// Load all capability docs once at startup
const capabilityDocs = {
  document: readFileSync(
    path.join(process.cwd(), 'docs/systems/document-system.md'),
    'utf-8'
  ),
  studio: readFileSync(
    path.join(process.cwd(), 'docs/systems/studio-system.md'),
    'utf-8'
  ),
  motion: readFileSync(
    path.join(process.cwd(), 'docs/systems/motion-system.md'),
    'utf-8'
  ),
  music: readFileSync(
    path.join(process.cwd(), 'docs/systems/music-system.md'),
    'utf-8'
  ),
  correspondence: readFileSync(
    path.join(process.cwd(), 'docs/systems/correspondence-system.md'),
    'utf-8'
  ),
  shared: readFileSync(
    path.join(process.cwd(), 'docs/systems/shared-patterns.md'),
    'utf-8'
  ),
};

// System prompt for capability discovery
const CAPABILITY_DISCOVERY_INSTRUCTIONS = `
You are the Capability Discovery Agent. You have complete knowledge of every system in Qeda:

• Document Editor: blocks, styles, layouts, templates
• Studio: effects, transitions, captions, marketing, recording
• Motion: nodes, animation, procedural geometry, materials, lighting
• Music: library, playlists, ambience, focus integration
• Correspondence: messages, recipients, escalation, clocks
• Shared: patterns used across systems

When a copilot asks how to do something, you explain:
1. What capability exists
2. Which components to use
3. Recommended pattern or approach
4. A concrete example (in JSON where applicable)
5. Common mistakes to avoid

Always respond with valid JSON (no markdown, no explanations outside JSON):

{
  "capability": "brief description of what's possible",
  "available": ["list", "of", "available", "components"],
  "pattern": "recommended approach or pattern name",
  "example": { "structured": "example showing how to use it" },
  "tips": ["tip 1", "tip 2", "tip 3"]
}

If the question is outside Qeda systems, respond:
{
  "capability": "Not a Qeda system capability",
  "available": [],
  "pattern": "Out of scope",
  "example": null,
  "tips": ["This question is about external systems, not Qeda"]
}
`;

export interface CapabilityResponse {
  capability: string;
  available: string[];
  pattern: string;
  example: any;
  tips: string[];
}

/**
 * Query the capability discovery sub-agent.
 * Delegates to lightweight generateText (not a ToolLoopAgent).
 *
 * @param query - User question: "How do I...?" or "What's possible with...?"
 * @param systems - Which systems are relevant (document, studio, motion, music, correspondence)
 * @returns Structured capability response
 */
export async function discoverCapability(
  query: string,
  systems: ('document' | 'studio' | 'motion' | 'music' | 'correspondence')[]
): Promise<CapabilityResponse> {
  // Build context from requested systems
  const context = systems
    .map(sys => `## ${sys.toUpperCase()}\n${capabilityDocs[sys]}`)
    .join('\n\n');

  const fullDocs = `${capabilityDocs.shared}\n\n${context}`;

  const { text } = await generateText({
    model: resolveModel(/* use default model */),
    system: CAPABILITY_DISCOVERY_INSTRUCTIONS,
    prompt: `System documentation:
${fullDocs}

---
Query: ${query}

Respond as valid JSON only.`,
  });

  try {
    return JSON.parse(text);
  } catch (err) {
    console.error('Capability discovery JSON parse error:', err, 'text:', text);
    // Fallback if JSON parsing fails
    return {
      capability: query,
      available: [],
      pattern: text.substring(0, 200),
      example: null,
      tips: ['Error parsing capability response; check logs'],
    };
  }
}

// Convenience functions for specific systems

/**
 * Ask about document system capabilities.
 */
export const docSystemCapability = (query: string) =>
  discoverCapability(query, ['document', 'shared']);

/**
 * Ask about studio system capabilities.
 */
export const studioCapability = (query: string) =>
  discoverCapability(query, ['studio', 'shared']);

/**
 * Ask about motion system capabilities.
 */
export const motionCapability = (query: string) =>
  discoverCapability(query, ['motion', 'shared']);

/**
 * Ask about music system capabilities.
 */
export const musicCapability = (query: string) =>
  discoverCapability(query, ['music', 'shared']);

/**
 * Ask about correspondence system capabilities.
 */
export const correspondenceCapability = (query: string) =>
  discoverCapability(query, ['correspondence', 'shared']);

/**
 * Generic query: ask about any combination of systems.
 */
export const queryCapabilities = (
  query: string,
  systems: ('document' | 'studio' | 'motion' | 'music' | 'correspondence')[]
) => discoverCapability(query, systems);
```

### 2. Capability Discovery Tools

**File**: `src/main/tools/capability-discovery.ts`

```typescript
import {
  discoverCapability,
  docSystemCapability,
  studioCapability,
  motionCapability,
  musicCapability,
  correspondenceCapability,
  type CapabilityResponse,
} from '../ai/capability-discovery';
import { tool } from 'ai';
import { z } from 'zod';

/**
 * Tools for capability discovery. Added to copilots that need to understand
 * what's possible in Qeda systems.
 *
 * All are auto-approved (read-only queries to documentation service).
 */
export const capabilityDiscoveryTools = {
  /**
   * Generic capability query: ask about any system or combination of systems.
   * Most flexible, but requires specifying which systems.
   */
  askCapabilityAgent: tool({
    description:
      'Ask the Capability Discovery Agent how to accomplish something in Qeda systems',
    parameters: z.object({
      query: z.string().describe(
        'What do you want to accomplish? e.g., "Create a sophisticated proposal with metrics", "Add kinetic text animation"'
      ),
      systems: z
        .array(
          z.enum(['document', 'studio', 'motion', 'music', 'correspondence'])
        )
        .describe('Which systems might be relevant to this task'),
    }),
    execute: async ({ query, systems }): Promise<CapabilityResponse> =>
      discoverCapability(query, systems),
  }),

  /**
   * Document system shortcut: ask about documents, layouts, blocks, styles.
   * Use this when you're working with documents.
   */
  getDocumentCapability: tool({
    description:
      'Ask about Document system capabilities: blocks, styles, layouts, templates',
    parameters: z.object({
      query: z
        .string()
        .describe(
          'What do you want to create or accomplish? e.g., "Create a two-column layout with metrics"'
        ),
    }),
    execute: async ({ query }): Promise<CapabilityResponse> =>
      docSystemCapability(query),
  }),

  /**
   * Studio system shortcut: ask about video editing, effects, captions, marketing.
   * Use this when you're working with video recordings.
   */
  getStudioCapability: tool({
    description:
      'Ask about Studio system capabilities: effects, transitions, captions, marketing, recording',
    parameters: z.object({
      query: z
        .string()
        .describe(
          'What do you want to create? e.g., "Add a kinetic zoom with fade effect"'
        ),
    }),
    execute: async ({ query }): Promise<CapabilityResponse> =>
      studioCapability(query),
  }),

  /**
   * Motion system shortcut: ask about 3D scenes, animation, procedural geometry.
   * Use this when you're building 3D scenes.
   */
  getMotionCapability: tool({
    description:
      'Ask about Motion system capabilities: nodes, animation, procedural geometry, materials, lighting',
    parameters: z.object({
      query: z
        .string()
        .describe(
          'What do you want to build? e.g., "Create an array of spheres with rotation animation"'
        ),
    }),
    execute: async ({ query }): Promise<CapabilityResponse> =>
      motionCapability(query),
  }),

  /**
   * Music system shortcut: ask about playlists, ambience, library, focus.
   * Use this when you're working with music.
   */
  getMusicCapability: tool({
    description:
      'Ask about Music system capabilities: library, playlists, ambience, focus integration',
    parameters: z.object({
      query: z
        .string()
        .describe(
          'What do you want to accomplish? e.g., "Create a deep focus playlist from ambient genre"'
        ),
    }),
    execute: async ({ query }): Promise<CapabilityResponse> =>
      musicCapability(query),
  }),

  /**
   * Correspondence system shortcut: ask about messages, recipients, escalation.
   * Use this when you're drafting messages or managing correspondence.
   */
  getCorrespondenceCapability: tool({
    description:
      'Ask about Correspondence system capabilities: messages, recipients, escalation, clocks',
    parameters: z.object({
      query: z
        .string()
        .describe(
          'What do you want to accomplish? e.g., "Draft a follow-up message for stalled recipients"'
        ),
    }),
    execute: async ({ query }): Promise<CapabilityResponse> =>
      correspondenceCapability(query),
  }),
};

// Export for use in tool registry
export { CapabilityResponse } from '../ai/capability-discovery';
```

### 3. Integration into Copilots

**Example**: Document Drafter

```typescript
// src/main/ai/document-drafter-agent.ts

import { capabilityDiscoveryTools } from '../tools/capability-discovery';

function buildInstructions(): string {
  return `You are the Document Drafter. You create professional documents for review.

## Core Capability
You can create and edit block-structured documents using:
- createDocument: Start a new document
- appendBlocks: Add blocks to a document
- replaceBlock: Modify existing blocks

## System Knowledge
When you need to know what's possible in documents, use getDocumentCapability.
Ask it questions like:
- "What block types exist?"
- "How do I create a two-column layout?"
- "What's a sophisticated proposal pattern?"
- "Can I add metrics and KPIs?"

Never guess what's possible—always ask the capability agent first.
This grounds your generation in real system capabilities.

## Pattern
1. User describes document they want
2. Call getDocumentCapability to learn what's available
3. Generate document using real blocks and patterns
4. Iterate if needed`;
}

export function createDocumentDrafterAgent(opts?: {
  activeProject?: string;
  target?: ModelTarget;
  planManager?: PlanManager;
}) {
  const settings = getSettings();
  const providerId = opts?.target?.providerId ?? settings.activeProvider;
  const modelId = opts?.target?.modelId ?? settings.activeModel;
  const model = resolveModel(providerId, modelId);
  const planManager = opts?.planManager ?? new PlanManager();

  const instructions = buildInstructions();

  return new ToolLoopAgent({
    model: model as any,
    instructions,
    tools: {
      // Core document tools
      createDocument,
      appendBlocks,
      insertBlocksAt,
      replaceBlock,
      getDocumentOutline,
      readDocument,

      // Project file reading
      listProjectFiles,
      readProjectFile,

      // NEW: Capability discovery
      ...capabilityDiscoveryTools,

      // Planning
      ...createPlanTools(planManager),
    },
    toolApproval: createApprovalPolicy(documentDrafterToolPolicies),
    stopWhen: [isStepCount(DRAFTER_STEP_BUDGET)],
  });
}
```

### 4. Approval Policy

**File**: `src/main/tools/policies/drafter.ts` (updated)

```typescript
import type { ToolPolicyMap } from '../capability';

const t = (capability: ToolPolicyMap[string]['capability']): ToolPolicyMap[string] => ({
  capability,
});

export const documentDrafterToolPolicies: ToolPolicyMap = {
  // ... existing entries ...

  // NEW: Capability discovery tools (all auto-approved reads)
  askCapabilityAgent: t('read'),
  getDocumentCapability: t('read'),
  getStudioCapability: t('read'),
  getMotionCapability: t('read'),
  getMusicCapability: t('read'),
  getCorrespondenceCapability: t('read'),
};
```

Similar updates for other copilot policies.

---

## System Documentation Files

Create documentation at `docs/systems/`:

### `docs/systems/shared-patterns.md`

```markdown
# Shared Patterns Across Qeda Systems

Common approaches used across Document, Studio, Motion, Music, Correspondence systems.

## Pattern: "Understand Before Building"

Before creating something sophisticated:
1. Ask the capability agent what's possible
2. Understand the component options
3. Read an example pattern
4. Build using real components

This prevents hallucination and ensures generation uses actual system capabilities.

## Pattern: "Minimal Viable Sophistication"

When building complex outputs:
1. Start with the simplest working version
2. Ask capability agent for advanced options
3. Add one layer of sophistication at a time
4. Provide clear examples at each step

Avoids both generic output and overwhelming complexity.

## Pattern: "Progressive Enhancement"

Systems support basic and advanced usage:
- Basic: Use built-in defaults, simple configuration
- Advanced: Leverage component combinations, custom styling, interactions

Always ask: "What does this system support natively?" before inventing workarounds.

## Common Mistakes to Avoid

- **Hallucinating capabilities**: Always ask first
- **Ignoring built-in patterns**: Systems have working templates
- **Over-engineering**: Prefer 80% solution to 100% custom
- **Not reading examples**: Examples show idiomatic usage
- **Assuming capabilities don't exist**: They probably do

## Cross-System Concepts

### Blocks (Document System)
Reusable, composable content units. Each block has type, properties, and children.

### Nodes (Motion System)
Hierarchical scene components (geometry, lights, cameras, animation).

### Effects (Studio System)
Timeline modifications (cuts, zooms, captions, transitions).

### Tracks (Music System)
Sequenced audio with properties (volume, fade, ambience).

### Messages (Correspondence System)
Timestamped records with recipients, channels, clocks.
```

### `docs/systems/document-system.md`

```markdown
# Document System Capabilities

Complete reference for Document Editor system.

## Block Types Reference

### Text Blocks
- **heading**: Levels 1-6, typography tokens, alignment (left/center/right/justify)
- **paragraph**: Formatted text, color tokens, font weight (bold/normal/light)

### Layout Blocks
- **columns**: 2 or 3 column layout, gap spacing, responsive behavior
- **section**: Hierarchical grouping with nested blocks

### Data Blocks
- **table**: Rows, columns, merged cells, styling
- **metrics**: KPI display (value + label, optional icon/color)
- **list**: Ordered or unordered, nested levels

### Emphasis Blocks
- **callout**: Icon, background color, nested content
- **divider**: Horizontal rule, customizable style
- **quote**: Indented quote with attribution

### Specialized Blocks
- **signature**: Signature field, date field
- **page-break**: Insert page break

## Style System

### Typography Tokens
Named styles applied to text blocks:
- headline-1, headline-2, headline-3
- body-regular, body-large, body-small
- mono-code, mono-label

### Color Tokens
Named colors applied to text and background:
- primary, secondary, accent
- success, warning, danger
- neutral-50 through neutral-950 (grayscale)

### Spacing Tokens
Applied to gaps, padding, margins:
- 1xs, xs, sm, md, lg, xl, 2xl, 3xl

## Common Document Patterns

### Proposal Template
```json
{
  "type": "document",
  "title": "Proposal: [Client Name]",
  "blocks": [
    { "type": "heading", "level": 1, "content": "Proposal: [Client Name]" },
    { "type": "paragraph", "content": "Executive summary paragraph" },
    {
      "type": "section",
      "title": "Overview",
      "blocks": [
        { "type": "paragraph", "content": "Section content" }
      ]
    },
    {
      "type": "metrics",
      "items": [
        { "label": "Timeline", "value": "8 weeks" },
        { "label": "Investment", "value": "$50K" },
        { "label": "ROI", "value": "3x" }
      ]
    },
    { "type": "section", "title": "Details", "blocks": [...] },
    { "type": "signature" }
  ]
}
```

### Two-Column Feature Comparison
```json
{
  "type": "columns",
  "count": 2,
  "blocks": [
    { "type": "heading", "level": 3, "content": "Feature A" },
    { "type": "paragraph", "content": "Description" },
    { "type": "list", "items": ["benefit 1", "benefit 2"] }
  ]
}
```

### Report with Data
```json
{
  "blocks": [
    { "type": "heading", "level": 1, "content": "Annual Report" },
    { "type": "table", "rows": [...], "cols": [...] },
    { "type": "metrics", "items": [...] }
  ]
}
```

## Tips for Sophisticated Documents

1. Use columns for side-by-side layouts (feature comparison, before/after)
2. Use metrics to highlight KPIs and key numbers
3. Use sections to organize by topic
4. Use callouts to emphasize important information
5. Combine heading + paragraph + metrics for compelling sections
6. Use typography tokens consistently (all headlines use same token)
7. Leverage spacing tokens for visual hierarchy
8. Always end with signature or approval block for contracts
```

### `docs/systems/studio-system.md`, `motion-system.md`, `music-system.md`, `correspondence-system.md`

Same structure: **Block Types / Node Types / Effects / Message Types** + **Properties** + **Common Patterns** + **Tips**

---

## Usage Flow

### Drafter Example

```
User: "Create a sophisticated annual proposal document"

Drafter system prompt says:
  "When you need to know capabilities, call getDocumentCapability"

Drafter thinks:
  "The user wants something sophisticated. 
   I should ask what's possible first."

Drafter calls: getDocumentCapability(
  "Create sophisticated annual proposal with metrics and comparison"
)

Capability Agent (generateText):
  Loads: docs/systems/shared-patterns.md + docs/systems/document-system.md
  Generates response:
  {
    "capability": "Professional proposal documents with visual hierarchy",
    "available": [
      "heading", "paragraph", "metrics", "columns", 
      "table", "callout", "section", "signature"
    ],
    "pattern": "Title + Executive Summary + Metrics + Sections + Comparison + Signature",
    "example": {
      "structure": [
        { "type": "heading", "level": 1 },
        { "type": "paragraph", "content": "Executive summary" },
        { "type": "metrics", "count": 3 },
        { "type": "columns", "count": 2 },
        { "type": "signature" }
      ]
    },
    "tips": [
      "Use metrics to highlight key numbers (budget, timeline, ROI)",
      "Use columns for comparison tables",
      "Use callout for high-priority items",
      "End with signature block for approval"
    ]
  }

Drafter now has:
  ✓ Knows what blocks exist
  ✓ Knows a sophisticated pattern
  ✓ Has example structure
  ✓ Has tips for best practices

Drafter generates:
  → Document with heading + summary + metrics
  → Two-column comparison section
  → Detailed sections with callouts
  → Signature block
  → RESULT: Sophisticated document (not generic boilerplate)
```

---

## Benefits

| Metric | Before | After |
|--------|--------|-------|
| **System Prompt Size** | 6,500 tokens (docs inline) | 500 tokens (just mission) |
| **Per-Turn Context** | Carries all docs every turn | Calls sub-agent on-demand |
| **Token Usage** | High (wasteful) | Low (lazy loading) |
| **Documentation Updates** | Redeploy agents | Update docs/systems/*.md |
| **System Knowledge Consistency** | Each agent documents differently | All use same reference |
| **Scalability** | Hard to add new systems | Just add docs/systems/new-system.md |
| **Output Quality** | Generic (didn't know capabilities) | Sophisticated (knew patterns) |
| **Development Velocity** | Slow (tight feedback loop) | Fast (docs decouple from agents) |

---

## Integration Checklist

### Phase 1: Foundation (2 hours)
- [ ] Create `src/main/ai/capability-discovery.ts`
- [ ] Create `src/main/tools/capability-discovery.ts`
- [ ] Create `docs/systems/shared-patterns.md`
- [ ] Create `docs/systems/document-system.md`
- [ ] Add capability discovery tools to drafter
- [ ] Update drafter system prompt to mention capability agent
- [ ] Test: "Create proposal" → uses capability agent?

### Phase 2: Roll-Out (2 hours)
- [ ] Create remaining `docs/systems/*.md` files (studio, motion, music, correspondence)
- [ ] Add capability discovery tools to all copilots
- [ ] Update all copilot system prompts
- [ ] Update approval policies for all copilots
- [ ] Test each copilot with capability queries

### Phase 3: Validation (1 hour)
- [ ] Measure token reduction (before/after)
- [ ] Compare output quality (generic vs. sophisticated)
- [ ] Profile performance (capability agent latency)
- [ ] Document learnings

---

## Related Documentation

- `docs/copilots/README.md` – Quick reference for all copilots
- `docs/copilots/architecture.md` – IPC orchestration, caching
- `docs/copilots/approval-policies.md` – Approval derivation system
- `docs/systems/shared-patterns.md` – Cross-system patterns
- `docs/systems/{domain}-system.md` – Domain-specific capabilities
