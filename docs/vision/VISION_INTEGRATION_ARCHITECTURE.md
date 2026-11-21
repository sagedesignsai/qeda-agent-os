# Vision Integration Architecture
## Comprehensive Plan for Multi-Agent Visual Understanding

**Date:** 2026-11-21  
**Author:** Kiro CLI Agent  
**Status:** Proposal — Ready for Review & Implementation

---

## Executive Summary

Qeda has strong **computer-use** foundations (screenshots, window capture, element refs) and one working **vision model** integration in the Blender specialist for render scoring. However, the system lacks a unified vision framework for agents to inspect editors, previews, and media across the platform.

This document proposes a **Vision System** that:
- Enables agents to see and understand UI state, renders, and media at critical moments
- Provides a unified vision API compatible with any vision model (GPT-4V, Claude, Llama, local)
- Integrates across **13 agents** without requiring manual approval for read-only inspection
- Prioritizes local/offline models where possible (SmolVLM2 for fallback)
- Supports all major editor viewports: **Studio (video), Motion (3D), Trace (2D), Motion Studio (composite), Workspace (documents)**

---

## Current State

### ✅ What Exists

| Component | Status | Location | Capability |
|-----------|--------|----------|-----------|
| **Computer Use** | ✅ Mature | `src/main/computer-use.ts` | Screenshots, window capture, element refs, mouse/keyboard |
| **Screenshot Tool** | ✅ Implemented | `computerUseTools.captureScreenshot` | Per-window/screen capture with base64 encoding |
| **Blender Vision** | ✅ Working | `blender-specialist-agent.ts` | 3D asset render scoring (T2 verification) |
| **Offline Models** | ✅ Catalogued | `src/lib/offline-ai/models.ts` | SmolVLM2 1.7B (vision), Whisper (transcription), etc. |
| **Motion Preview** | ✅ Exists | `motion-verify-tool.ts` | Headless render → PNG, no vision scoring |
| **Trace Preview** | ✅ Exists | `trace-preview-tool.ts` | Static SVG frame generation, no vision scoring |
| **Studio Recording** | ✅ Mature | `studio-recorder.ts` | 60fps recording with highlight marking |

### ❌ What's Missing

| Gap | Impact | Scope |
|-----|--------|-------|
| **Unified Vision Tool** | Each agent reimplements vision logic separately | All agents |
| **Editor Inspection** | Agents can't see what's currently on screen in viewport | Studio, Motion, Trace, Workspace |
| **Asset Preview Analysis** | Motion/Trace agents can render but can't interpret results visually | Motion, Trace |
| **Validation at Scale** | No way to validate complex multi-element compositions visually | Motion Studio, Trace |
| **Fallback Strategy** | No clear decision tree for which vision model to use | All agents |
| **Real-time UI Understanding** | Agents see accessibility trees but miss visual layout/styling | All UI agents |

---

## Architecture Overview

### 1. Vision System Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                      AGENT LAYER                                │
│  Chat | Studio Copilot | Motion | Trace | Document Drafter    │
└──────────────────┬──────────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────────┐
│              UNIFIED VISION API LAYER                           │
│  • analyzeViewport(app, question)                              │
│  • scoreAsset(imagePath, brief, criteria)                      │
│  • validateComposition(imagePath, spec)                        │
│  • describeUIState(screenshot, app)                            │
└──────────────────┬──────────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────────┐
│           VISION MODEL RESOLVER LAYER                           │
│  • getVisionModel() → provider/model                            │
│  • selectModel(task, constraints)                              │
│  • fallback(primaryFailed) → nextProvider                       │
└──────────────────┬──────────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────────┐
│            PROVIDER & IMAGE LAYER                               │
│  • generateText(model, image, prompt)                           │
│  • captureScreenshot(sourceId)                                 │
│  • renderPreview(scene)                                        │
└─────────────────────────────────────────────────────────────────┘
```

### 2. File Structure

```
src/main/
├── ai/
│   ├── vision-system.ts              ✨ NEW: Core vision API
│   ├── vision-model-selector.ts      ✨ NEW: Model selection + fallback
│   └── vision-schema.ts              ✨ NEW: Zod schemas for responses
│
├── tools/
│   ├── vision.ts                     ✨ NEW: Vision tools for agents
│   └── policies/vision.ts            ✨ NEW: Approval policy (read-only = no approval)
│
├── computer-use.ts                   ✅ Extend: Add vision-aware screenshot helper
│
└── blender/
    └── vision-scoring.ts             ✨ NEW: Extract Blender vision logic
```

---

## 1. Core Vision System (`src/main/ai/vision-system.ts`)

### Interface

```typescript
/**
 * Unified vision API for all agents.
 * Read-only operations never require approval.
 */

export interface VisionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  modelUsed?: string;
  timingMs?: number;
}

export interface ViewportAnalysis {
  app: string;                    // 'studio' | 'motion' | 'trace' | 'workspace'
  title: string;                  // viewport title
  elements: string[];             // identified UI elements
  focus: string;                  // what user is likely working on
  issues: string[];               // visual problems detected
  suggestions?: string[];         // actionable improvements
}

export interface AssetScoring {
  match: number;                  // 0–1 score
  issues: string[];               // specific problems
  strengths?: string[];           // what looks good
  nextSteps?: string[];           // how to fix
}

export interface CompositionValidation {
  valid: boolean;
  warnings: string[];
  errors: string[];
  visualMetrics?: {
    balance: 'good' | 'poor';
    contrast: 'good' | 'poor';
    alignment: 'good' | 'poor';
  };
}

export class VisionSystem {
  /**
   * Analyze an active viewport: "What do you see?"
   * Used by: Studio Copilot, Motion Copilot, Trace Copilot, Document Drafter
   */
  async analyzeViewport(
    app: 'studio' | 'motion' | 'trace' | 'workspace',
    question?: string,
  ): Promise<VisionResult<ViewportAnalysis>>;

  /**
   * Score a rendered asset against a brief.
   * Returns match score (0–1) + specific issues + fix suggestions.
   * Used by: Motion Copilot (3D renders), Trace Copilot (SVG previews), Blender Specialist
   */
  async scoreAsset(
    imagePath: string,
    brief: string,
    criteria?: 'geometry' | 'animation' | 'styling' | 'composition',
  ): Promise<VisionResult<AssetScoring>>;

  /**
   * Validate a composite layout against a specification.
   * "Does this look right?" — used for multi-element compositions.
   * Used by: Motion Studio (clips + effects), Studio (captions + zooms)
   */
  async validateComposition(
    imagePath: string,
    spec: string,
  ): Promise<VisionResult<CompositionValidation>>;

  /**
   * Describe UI layout from screenshot.
   * "What's on screen and where?" — visual layout + styling.
   * Used by: Chat agent, any copilot inspecting an editor.
   */
  async describeUIState(
    screenshot: string | Buffer,  // base64 or Buffer
    app?: string,
  ): Promise<VisionResult<ViewportAnalysis>>;

  /**
   * Check visual consistency: "Do these elements match?"
   * Used for quality gates in multi-pass workflows.
   */
  async checkConsistency(
    imagePath1: string,
    imagePath2: string,
    dimension: 'color' | 'style' | 'scale' | 'alignment',
  ): Promise<VisionResult<{ consistent: boolean; difference: string }>>;
}
```

### Implementation Pattern

```typescript
// src/main/ai/vision-system.ts (skeleton)

import { generateText } from 'ai';
import { getVisionModel } from './vision-model-selector.js';
import { z } from 'zod';
import fs from 'node:fs/promises';

export class VisionSystem {
  private modelSelector = getVisionModel();

  async analyzeViewport(app, question) {
    const startMs = Date.now();
    try {
      // 1. Capture screenshot of the app viewport
      const screenshot = await captureViewport(app);
      if (!screenshot) {
        return { success: false, error: `Could not capture ${app} viewport.` };
      }

      // 2. Get best-available vision model
      const model = await this.modelSelector.selectFor('viewport-analysis');
      
      // 3. Call vision model with viewport-specific prompt
      const result = await generateText({
        model: model as any,
        system: `
You are a UI/UX analyst. Examine the screenshot and identify:
- What application or editor this is
- What task the user appears to be doing
- Key UI elements visible and their state
- Any visual issues, misalignments, or broken state
- Suggestions for the AI to help

Respond in JSON matching this schema:
{
  "app": "studio|motion|trace|workspace",
  "title": "what the user is editing",
  "elements": ["element 1", "element 2"],
  "focus": "the primary task",
  "issues": [],
  "suggestions": []
}
        `.trim(),
        prompt: [
          {
            type: 'image' as const,
            image: new Uint8Array(screenshot),
          },
          {
            type: 'text' as const,
            text: question || 'Analyze this viewport and identify the current UI state.',
          },
        ],
      });

      // 4. Parse + return
      const json = JSON.parse(result.text) as ViewportAnalysis;
      return {
        success: true,
        data: json,
        modelUsed: model.modelId,
        timingMs: Date.now() - startMs,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timingMs: Date.now() - startMs,
      };
    }
  }

  async scoreAsset(imagePath, brief, criteria = 'geometry') {
    // Similar pattern: read image, select model, call with asset-scoring prompt
  }

  // ... other methods follow same pattern
}

export const visionSystem = new VisionSystem();
```

---

## 2. Vision Model Selector (`src/main/ai/vision-model-selector.ts`)

### Interface

```typescript
export interface VisionModelSelectorOptions {
  /** User's preferred vision model from Settings, e.g. "openai/gpt-4-vision" */
  preferred?: string;
  /** Fallback to offline models if API fails? */
  allowOffline?: boolean;
  /** Max time to spend retrying (ms) */
  timeoutMs?: number;
}

export class VisionModelSelector {
  /**
   * Select a vision model optimized for the given task.
   */
  async selectFor(
    task: 'viewport-analysis' | 'asset-scoring' | 'composition-validation' | 'consistency-check',
    opts?: VisionModelSelectorOptions,
  ): Promise<ReturnType<typeof resolveModel>>;

  /**
   * Get the currently configured vision model.
   */
  getConfigured(): string | undefined;

  /**
   * List available vision models (from Settings + offline catalog).
   */
  listAvailable(): Array<{ id: string; name: string; offline: boolean }>;

  /**
   * Attempt fallback to next model if primary failed.
   */
  async fallback(failedModelId: string): Promise<ReturnType<typeof resolveModel>>;
}
```

### Selection Rules

```
Priority order for vision model selection:

1. User's explicit choice in Settings → Blender → visionModel
   ├─ Try it first
   ├─ If it fails (timeout, 429, invalid key), log but don't stop
   └─ Fall through to next rule

2. Task-optimized default
   ├─ viewport-analysis     → GPT-4V (detail), fallback SmolVLM2 (local)
   ├─ asset-scoring         → GPT-4V (quality), fallback Claude (color sense)
   ├─ composition-validation → Claude (spatial reasoning), fallback GPT-4V
   └─ consistency-check     → SmolVLM2 (fast binary decision)

3. Available configured provider
   ├─ Check OpenAI/Claude/Groq/etc for vision endpoint
   └─ If available, use it

4. Offline fallback
   ├─ If allowOffline=true and online failed
   ├─ Use SmolVLM2 1.7B from offline models
   └─ Warn user about latency (first load ~5s, subsequent ~2–3s)

5. Explicit user reject
   └─ If user has disabled vision in Settings → skip & return error
```

---

## 3. Vision Tools (`src/main/tools/vision.ts`)

### Tools for Agents

```typescript
export const visionTools = {
  /**
   * Inspect an editor's viewport via vision model.
   * Read-only: no approval needed.
   */
  analyzeViewport: tool({
    description:
      'Inspect what is currently visible in an editor viewport (Studio, Motion, Trace, Workspace). ' +
      'Returns UI layout, focus area, and any visual issues. Use before making edits to understand context.',
    inputSchema: z.object({
      app: z.enum(['studio', 'motion', 'trace', 'workspace'])
        .describe('Which editor to inspect'),
      question: z.string().optional()
        .describe('Optional specific question to answer about the viewport'),
    }),
    execute: async ({ app, question }) => {
      const result = await visionSystem.analyzeViewport(app, question);
      if (!result.success) {
        return { error: result.error };
      }
      return {
        success: true,
        analysis: result.data,
        modelUsed: result.modelUsed,
      };
    },
  }),

  /**
   * Score a preview render (3D, 2D, video) against a brief.
   * Read-only: no approval needed.
   */
  scorePreview: tool({
    description:
      'Score a rendered preview (Blender GLB, Trace SVG, video frame) against its intended design brief. ' +
      'Returns a match score (0–1) and specific issues to refine. Call after generation to validate.',
    inputSchema: z.object({
      imagePath: z.string().describe('Path to preview image (PNG/JPG) or rendered file'),
      brief: z.string().describe('What the render is supposed to be'),
      criteria: z.enum(['geometry', 'animation', 'styling', 'composition']).optional()
        .describe('What aspect to prioritize in scoring'),
    }),
    execute: async ({ imagePath, brief, criteria }) => {
      const result = await visionSystem.scoreAsset(imagePath, brief, criteria);
      if (!result.success) {
        return { error: result.error };
      }
      return {
        success: true,
        match: result.data?.match,
        issues: result.data?.issues,
        suggestions: result.data?.suggestions,
        modelUsed: result.modelUsed,
      };
    },
  }),

  /**
   * Validate a complex composition layout.
   * Used for multi-element visual designs.
   * Read-only: no approval needed.
   */
  validateComposition: tool({
    description:
      'Validate a composite layout: multi-element scene, captions over video, UI mockup, etc. ' +
      'Checks alignment, balance, visual hierarchy. Returns validation report.',
    inputSchema: z.object({
      imagePath: z.string().describe('Screenshot of the composition'),
      spec: z.string().describe('Specification of what the composition should look like'),
    }),
    execute: async ({ imagePath, spec }) => {
      const result = await visionSystem.validateComposition(imagePath, spec);
      if (!result.success) {
        return { error: result.error };
      }
      return {
        success: true,
        valid: result.data?.valid,
        warnings: result.data?.warnings,
        errors: result.data?.errors,
        metrics: result.data?.visualMetrics,
      };
    },
  }),

  /**
   * Check if two visuals are consistent (color, style, scale, alignment).
   * Used for quality gates in iterative workflows.
   * Read-only: no approval needed.
   */
  checkConsistency: tool({
    description:
      'Compare two visual states for consistency: do the colors/styling/scale/alignment match? ' +
      'Used to validate multi-pass iterations match a reference.',
    inputSchema: z.object({
      beforePath: z.string().describe('Path to reference/before image'),
      afterPath: z.string().describe('Path to current/after image'),
      dimension: z.enum(['color', 'style', 'scale', 'alignment'])
        .describe('Which aspect to check for consistency'),
    }),
    execute: async ({ beforePath, afterPath, dimension }) => {
      const result = await visionSystem.checkConsistency(beforePath, afterPath, dimension);
      if (!result.success) {
        return { error: result.error };
      }
      return {
        success: true,
        consistent: result.data?.consistent,
        difference: result.data?.difference,
      };
    },
  }),
};
```

---

## 4. Agent Integration Points

### 4.1 Studio Copilot

**Current:** Edits take arrays (zooms, cuts, captions) based on user direction + take metadata.  
**Enhancement:** Before editing, inspect current viewport state to understand context.

```typescript
// New instructions segment:
// ──────────────────────────────────────────────────────────────────
// If you need to understand what's currently on screen:
// - Call analyzeViewport('studio') to see the current editor state
// - This helps you make edits that match what the user sees
// 
// After major changes, call scorePreview('path', 'brief') to validate
// the result before summarizing.
```

**Use Cases:**
- User says "Add a zoom to where I introduce the feature" → **analyzeViewport** first to see what's visible
- User says "Fix the caption timing" → **analyzeViewport** to see current captions, then edit
- After adding captions → **validateComposition** to check text over video alignment

### 4.2 Motion Copilot

**Current:** Generates 3D scenes, can render previews but doesn't interpret them.  
**Enhancement:** Score renders visually to decide if they match the brief.

```typescript
// In motion-copilot-agent.ts:
// After renderMotionPreview() returns a path:
if (previewPath) {
  const scoring = await scorePreview(previewPath, brief, 'geometry');
  if (scoring.match < 0.7) {
    // Use issues list to refine the scene
    // Then regenerate and re-score
  }
}
```

**Tools Added:**
- `renderMotionPreview` (already exists)
- `scorePreview` ← **NEW:** Rate the render against brief
- `validateComposition` ← Apply to full scene layouts

### 4.3 Trace Copilot

**Current:** Generates 2D SVG animations, renders static frames.  
**Enhancement:** Validate frame layout and animation consistency.

```typescript
// In trace-copilot-agent.ts:
const previewResult = await renderTracePreview(projectId);
if (previewResult.success) {
  // NEW: Validate the rendered frame
  const validation = await validateComposition(
    previewResult.previewPath,
    'SVG animation frame: all elements properly aligned and scaled'
  );
  
  if (!validation.valid) {
    // Use warnings/errors to iterate
  }
}
```

### 4.4 Motion Studio (Composite Editor)

**Current:** Multi-track composition with clips + effects.  
**Enhancement:** Validate final composite before export.

```typescript
// New tool in motion-verify-tool.ts:
const validateFinalComposition = tool({
  execute: async ({ projectId }) => {
    // 1. Render a frame of the composite at key moments
    // 2. Call validateComposition() with spec
    // 3. Return validation + suggestions
  },
});
```

### 4.5 Document Drafter

**Current:** Creates block-structured documents (text, code, images).  
**Enhancement:** Inspect page layout, verify visual hierarchy.

```typescript
// Use analyzeViewport('workspace') before suggesting layout changes
// Helps the agent understand current viewport constraints
```

### 4.6 Chat Agent

**Current:** General-purpose agent with computer-use for screenshots.  
**Enhancement:** Use unified vision tools instead of ad-hoc vision calls.

```typescript
// Example: User says "What's the current state of my Motion project?"
// Instead of: await cu.captureScreenshot() → manual analysis
// Use: await visionTools.analyzeViewport('motion')
```

---

## 5. Approval Policy

**Key Principle:** Vision tools are read-only inspection operations; they never modify state and require **no approval** in any agent surface.

```typescript
// src/main/tools/policies/vision.ts

export const visionToolPolicies = createApprovalPolicy({
  analyzeViewport: { capability: 'read' },        // ✅ No approval
  scorePreview: { capability: 'read' },            // ✅ No approval
  validateComposition: { capability: 'read' },     // ✅ No approval
  checkConsistency: { capability: 'read' },        // ✅ No approval
});

// All vision tools flow straight through without approval cards.
```

---

## 6. Vision Model Fallback Logic

### Decision Tree

```
User needs vision analysis (e.g., analyzeViewport called)
│
├─ Is a vision model configured in Settings?
│  ├─ YES → Try primary provider first
│  │  ├─ Success → Return result
│  │  └─ Fail (timeout, 429, key error)
│  │     ├─ Log failure
│  │     └─ Fall through to fallback
│  │
│  └─ NO → Skip to fallback
│
├─ Fallback: Online providers in priority order
│  ├─ Try OpenAI/Claude/Groq for vision endpoint
│  ├─ Success → Return result
│  └─ Fail or not available → Fall through
│
├─ Final fallback: Offline models
│  ├─ User has allowOffline=true in settings?
│  │  ├─ YES → Load SmolVLM2 1.7B (first run ~5s, cached ~2–3s)
│  │  ├─ Success → Return result
│  │  └─ Fail (out of memory, download error) → Return error
│  │
│  └─ NO → Return error "No vision model available"
│
└─ Return result with modelUsed metadata
```

### Example: Complete Fallback Flow

```typescript
// Vision system attempts to analyze a viewport

const visionResult = await visionSystem.analyzeViewport('studio');

// Internally:
// 1. Check settings.blender?.visionModel (e.g., "openai/gpt-4-vision")
// 2. Try OpenAI GPT-4V → Fails (API key expired)
// 3. Fallback → Try Claude Vision → Fails (not configured)
// 4. Fallback → Try Groq Vision → Fails (no vision endpoint)
// 5. Offline fallback → Load SmolVLM2 → Success!
// 
// Return {
//   success: true,
//   data: { app: 'studio', elements: [...], issues: [...] },
//   modelUsed: 'xenova/smollvm2-1.7b',
//   timingMs: 2100
// }
```

---

## 7. Implementation Roadmap

### Phase 1: Core System (This Session)

- [ ] **Create `src/main/ai/vision-system.ts`**
  - Core VisionSystem class
  - All four main analysis methods (analyzeViewport, scoreAsset, validateComposition, checkConsistency)
  - Prompts tailored for each task

- [ ] **Create `src/main/ai/vision-model-selector.ts`**
  - Model selection logic + task optimization
  - Fallback chain implementation
  - Integration with settings + offline models

- [ ] **Create `src/main/tools/vision.ts`**
  - Tool implementations wrapping vision system
  - Zod schemas for inputs/outputs
  - Error handling

- [ ] **Create `src/main/tools/policies/vision.ts`**
  - Approval policy (all read-only, no approval needed)

### Phase 2: Agent Integration (Next Sprint)

- [ ] **Studio Copilot**
  - Add vision tools to toolset
  - Update instructions: "Call analyzeViewport before editing"
  - Add validation after major changes

- [ ] **Motion Copilot**
  - Integrate scorePreview for render validation
  - Add iterative refinement loop

- [ ] **Trace Copilot**
  - Add frame validation
  - Animation consistency checking

- [ ] **Refactor Blender Specialist**
  - Use unified vision system instead of custom scoreRenderTool
  - Reduces code duplication

- [ ] **Update Chat Agent**
  - Expose vision tools to chat surface
  - Document in system prompt

### Phase 3: Testing & Refinement

- [ ] **Unit tests** for vision-system.ts (all methods)
- [ ] **Integration tests** with real agents
- [ ] **Offline fallback tests** (SmolVLM2 download + inference)
- [ ] **Performance benchmarks** (latency, memory usage)
- [ ] **User testing** with copilots (verify usefulness)

---

## 8. Use Case Examples

### Example 1: Studio Copilot Inspects Viewport Before Editing

```
User: "Add a zoom to where I introduce the new feature"

Studio Copilot:
1. Call analyzeViewport('studio')
   → Returns: { elements: ['timeline', 'playhead at 12s', 'caption "Introducing..."'], focus: 'timeline editing' }

2. Understand: "The user is at 12s where the caption begins"

3. Create a zoom operation at 12s with smart bounds

4. Call validateComposition('screenshot_of_timeline_after_edit', 'zoom should be 2x with good framing')
   → Returns: { valid: true, warnings: [...], metrics: { alignment: 'good' } }

5. Summary: "Added zoom at 12s where your feature intro begins. Framing looks good."
```

### Example 2: Motion Copilot Iteratively Refines a 3D Model

```
User: "Create a sci-fi barrel with metal rings"

Motion Copilot (via Blender Specialist):
1. Generate initial geometry → GLB at /tmp/barrel.glb
2. Render preview: /tmp/barrel_preview.png

3. Call scorePreview('/tmp/barrel_preview.png', 'sci-fi barrel with metal rings', 'geometry')
   → { match: 0.65, issues: ['missing base ring', 'proportions too tall'], suggestions: [...] }

4. Interpret: "65% match but base ring missing and too tall"

5. Refine geometry code → Regenerate GLB
6. Render new preview → /tmp/barrel_preview_v2.png

7. Call scorePreview('/tmp/barrel_preview_v2.png', ...)
   → { match: 0.88, issues: ['minor: top cap could be sharper'], suggestions: [...] }

8. Reach threshold (0.85+) → Complete
   Summary: "Generated 3D barrel. Matches brief well. (88% match after 2 iterations)"
```

### Example 3: Trace Copilot Validates SVG Animation Frame

```
User: "Create a 2D animation: rotate ring around central point"

Trace Copilot:
1. Generate SVG animation → project stored
2. Render frame at t=0s (start): /tmp/trace_frame_t0.svg

3. Call validateComposition('/tmp/trace_frame_t0.svg', 'central point with ring rotating around it')
   → { valid: true, metrics: { alignment: 'good', balance: 'good' }, warnings: [] }

4. Render frame at t=1s (mid-rotation): /tmp/trace_frame_t1.svg

5. Call checkConsistency('/tmp/trace_frame_t0.svg', '/tmp/trace_frame_t1.svg', 'scale')
   → { consistent: true, difference: 'Ring rotated ~180°, center and scale unchanged' }

6. Summary: "Animation validated across key frames. Ring rotates smoothly around center."
```

---

## 9. Configuration & Settings

### Settings Entry

```typescript
// In Settings → AI → Vision Models

export interface VisionSettings {
  /** Explicit vision model choice, e.g. "openai/gpt-4-vision" */
  preferredVisionModel?: string;
  
  /** Allow fallback to offline models (SmolVLM2) if online fails? */
  allowOfflineFallback?: boolean;
  
  /** Max time to wait for vision model response (ms) */
  visionTimeoutMs?: number;
  
  /** Enable vision analysis for each agent surface */
  enableVision?: {
    chat?: boolean;
    studio?: boolean;
    motion?: boolean;
    trace?: boolean;
    workspace?: boolean;
  };
  
  /** Log vision calls for debugging */
  debugVision?: boolean;
}
```

---

## 10. Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Vision model latency** | Agent turns slow (image encoding, inference) | Timeout at 30s, cache results, use fast offline models for simple checks |
| **API costs** | Expensive vision calls accumulate | Prefer offline models, batch images, limit to critical moments |
| **Image size** | Large screenshots exceed model token limits | Crop to relevant region, reduce resolution, use SVG for Trace |
| **Hallucination** | Vision model misinterprets UI | Use low-confidence scores as advisory, require user confirmation for edits |
| **Offline model OOM** | SmolVLM2 runs out of memory on low-RAM machines | Fallback to online, document memory requirements (8GB recommended) |
| **Broken fallback chain** | Agent stuck if all models fail | Return clear error, suggest user configure a vision model in Settings |

---

## 11. Success Metrics

### During Development

- [ ] All four vision methods (analyzeViewport, scoreAsset, validateComposition, checkConsistency) working
- [ ] Model selector passes all fallback scenarios
- [ ] Vision tools added to at least 3 agent surfaces (Studio, Motion, Trace)
- [ ] Offline SmolVLM2 fallback working + documented
- [ ] No regressions in existing agent workflows

### After Integration

- [ ] Agents using vision reduce their iteration count (fewer "try again" turns)
- [ ] User satisfaction with visual editing (copilot understands what's on screen)
- [ ] Benchmark: analyzeViewport < 3s (with GPU), < 8s (CPU offline)
- [ ] Zero approval-bypass issues (vision tools truly read-only)

---

## 12. Open Questions

1. **SmolVLM2 Memory:** Should we offer lighter alternatives (e.g., Phi-Vision, MobileVLM) for ultra-low-RAM machines?
2. **Real-time vs Batch:** Should vision calls be batched to reduce latency, or do immediate calls matter for UX?
3. **Viewport Cropping:** Smart crop to reduce image size (e.g., exclude toolbars, focus on canvas)?
4. **Prompt Tuning:** Task-specific prompts vs. single generic prompt? Tradeoff: flexibility vs. consistency.
5. **Audit Trail:** Log all vision calls for transparency (especially in production)?

---

## 13. Conclusion

Qeda has strong fundamentals (computer-use, screenshot capture, offline models). This proposal unifies them into a **coherent Vision System** that:

✅ Enables agents to see and reason about visual state  
✅ Provides unified API across all copilots  
✅ Integrates seamlessly with existing approval framework (read-only = no approval)  
✅ Prioritizes local models with robust online fallback  
✅ Requires no user action (automatic model selection)  

**Next Step:** Review architecture, agree on Phase 1 scope, then implement.

---

**Status:** Ready for team review and sprint planning.
