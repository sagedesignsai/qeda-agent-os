# Vision System — Quick Start & Priority Action Items

**Document:** Implementation priorities based on agent use-case analysis  
**Date:** 2026-11-21  
**Status:** Ready for Sprint Planning

---

## High-Impact Use Cases (By Agent)

### 1. 🎬 **Studio Copilot** — HIGHEST PRIORITY

**Problem:** Copilot edits video (zooms, captions, cuts) based on user description + metadata, but can't see the current state of the timeline.

**Scenario:**
- User: "Add a zoom where I introduce the feature"
- Copilot: Creates zoom, but doesn't know where the feature intro actually is on the timeline

**Solution:** Before editing, call `analyzeViewport('studio')` to understand:
- What's currently visible on the timeline
- Where the playhead is
- What captions/effects already exist
- Current framing/styling

**Impact:** Zooms and captions land at the right moments; fewer "try again" requests.

**Implementation Effort:** ⭐⭐ (moderate — integrates with existing studio tools)

---

### 2. 🎨 **Motion Copilot** — HIGH PRIORITY

**Problem:** Generates 3D scenes and can render previews, but has no way to validate if the render matches the brief.

**Scenario:**
- User: "Create a sci-fi barrel with metal rings"
- Copilot: Generates geometry, renders preview, has no idea if it looks right
- Copilot: Can't tell why the user would reject it

**Solution:** Call `scorePreview()` after rendering:
- Match score (0–1) against brief
- Specific issues (e.g., "missing base ring", "proportions too tall")
- Refinement suggestions

**Impact:** Iterative improvement loop becomes automatic; match scores drive refinement.

**Implementation Effort:** ⭐⭐⭐ (moderate — requires motion-verify-tool.ts updates)

**Bonus:** Can reuse this pattern in **Blender Specialist** to eliminate duplicate vision code.

---

### 3. ✏️ **Trace Copilot** — HIGH PRIORITY

**Problem:** Generates SVG animations and renders static frames, but doesn't validate the frame.

**Scenario:**
- User: "Create animated ring rotating around a central point"
- Copilot: Generates SVG, renders frame, can't tell if the ring is actually centered or rotating correctly

**Solution:** Call `validateComposition()` on rendered frames:
- Is layout correct (alignment, balance, hierarchy)?
- Is animation consistent across frames?

**Impact:** Fewer iterations; animations validated before declaring "done".

**Implementation Effort:** ⭐⭐ (low — SVG rendering already works, just add validation)

---

### 4. 📄 **Document Drafter** — MEDIUM PRIORITY

**Problem:** Creates block-structured documents but can't see the final page layout visually.

**Scenario:**
- Copilot: Adds blocks (text, code, images) programmatically
- Copilot: Can't tell if the visual hierarchy looks good or if text is being cut off

**Solution:** Call `analyzeViewport('workspace')` periodically:
- Validate visual hierarchy and readability
- Catch layout issues (text wrapping, image overflow)

**Impact:** Better document layouts without user manual adjustment.

**Implementation Effort:** ⭐⭐ (low — read-only inspection)

---

### 5. 💬 **Chat Agent** — MEDIUM PRIORITY

**Problem:** Has computer-use tools for screenshots but no structured vision analysis.

**Scenario:**
- User: "What's the current state of my Motion project?"
- Agent: Takes screenshot, manually analyzes it in prose
- Result: Loss of structured data, agent can't use it for decisions

**Solution:** Use unified `visionTools` for structured queries:
- `analyzeViewport('motion')` returns structured data
- Agent can reason about elements, focus, issues systematically

**Impact:** Better understanding of editor state; more reliable analysis.

**Implementation Effort:** ⭐ (minimal — just expose existing tools)

---

### 6. 🎬 **Motion Studio (Composite Editor)** — LOWER PRIORITY

**Problem:** Multi-track compositions (clips + effects) lack visual validation.

**Scenario:**
- Copilot: Arranges clips, applies effects, has no way to verify the final composition

**Solution:** Add composite validation tool to motion-verify-tool.ts

**Impact:** Quality gates before export.

**Implementation Effort:** ⭐⭐⭐ (higher — new tool, complex composition rules)

---

## Implementation Priority Matrix

```
┌─────────────────────┬────────────────┬──────────────────┐
│ Agent               │ Impact         │ Effort           │
├─────────────────────┼────────────────┼──────────────────┤
│ Studio Copilot      │ ████████░░ 8/10│ ⭐⭐  Medium    │
│ Motion Copilot      │ ████████░░ 8/10│ ⭐⭐⭐ Moderate │
│ Trace Copilot       │ ███████░░░ 7/10│ ⭐⭐  Low-Mod  │
│ Document Drafter    │ ██████░░░░ 6/10│ ⭐⭐  Low-Mod  │
│ Chat Agent          │ █████░░░░░ 5/10│ ⭐   Low       │
│ Motion Studio       │ █████░░░░░ 5/10│ ⭐⭐⭐ Higher  │
└─────────────────────┴────────────────┴──────────────────┘

RECOMMENDED SPRINT ORDER:
1. Core System (vision-system.ts + selector)
2. Studio Copilot integration
3. Motion + Trace Copilot integration
4. Chat Agent exposure
5. (Optional) Motion Studio composite validation
```

---

## Phase 1: Core System Build (1–2 sprints)

### Deliverables

```
src/main/ai/
├── vision-system.ts (350 lines)
├── vision-model-selector.ts (200 lines)
└── vision-schema.ts (100 lines)

src/main/tools/
├── vision.ts (250 lines)
└── policies/vision.ts (50 lines)

Total: ~950 lines of new code
```

### Key Files to Create

1. **`vision-system.ts`** — Core VisionSystem class
   - 4 public methods (analyzeViewport, scoreAsset, validateComposition, checkConsistency)
   - Internal prompt templates (task-specific system prompts)
   - Error handling + logging

2. **`vision-model-selector.ts`** — Model selection + fallback logic
   - selectFor(task) → picks best model for task
   - Fallback chain (online → offline)
   - Integration with settings + offline catalog

3. **`vision.ts`** — Agent tools
   - 4 tools: analyzeViewport, scorePreview, validateComposition, checkConsistency
   - Zod schemas for I/O
   - Read-only operations (no approval needed)

### Testing Strategy

```
Unit tests (vision-system.ts):
✓ analyzeViewport() with mock model
✓ scoreAsset() with different criteria
✓ validateComposition() with various specs
✓ checkConsistency() with before/after images
✓ Fallback chain (online → offline)

Integration tests:
✓ Vision tools work with Chat agent
✓ Vision tools don't require approval
✓ Model selector respects settings
✓ Offline fallback triggers on timeout

Performance benchmarks:
✓ analyzeViewport latency (GPU vs CPU)
✓ SmolVLM2 first-load vs cached
✓ Memory usage under load
```

---

## Phase 2a: Studio Copilot Integration (1 sprint)

### Changes to `studio-copilot-agent.ts`

```typescript
// 1. Import vision tools
import { visionTools } from '../tools/vision.js';

// 2. Add to toolset
tools: {
  ...studioTools,
  ...visionTools,  // ← NEW
  ...computerUseTools,
  ...browserUseTools,
}

// 3. Update instructions
instructions: `
...existing instructions...

## Visual Context
Before making major edits (adding zooms, adjusting captions), call analyzeViewport('studio')
to understand the current timeline state. This helps you:
- Know where the playhead is
- See existing captions and effects
- Understand current framing/styling
- Make edits that match what the user sees

After editing, call validateComposition() to verify the result matches your intent.
`,
```

### Expected Improvement

- **Before:** "Add a zoom where you explain the feature" → copilot guesses, user says "try at 30s instead"
- **After:** "Add a zoom where you explain the feature" → copilot inspects viewport, finds caption "Explaining...", adds zoom at the right spot, validates framing

---

## Phase 2b: Motion Copilot Integration (1 sprint)

### Changes to `motion-copilot-agent.ts`

```typescript
// Add vision tools to toolset
import { visionTools } from '../tools/vision.js';

tools: {
  ...motionTools,
  ...visionTools,  // ← NEW
}

// In the instructions:
instructions: `
...existing...

## Asset Validation
After rendering a preview with renderMotionPreview(), call scorePreview() to evaluate
how well it matches the brief:
- If match < 0.6: Use the issues to refine your geometry
- If match >= 0.8: You're done
- Otherwise: Iterate (max 3 attempts)
`
```

### Expected Improvement

- **Before:** Generate → Render → Manual user review → "Looks good" or "Needs X"
- **After:** Generate → Render → scorePreview → Issues list → Auto-refine → scorePreview again → Done

---

## Phase 2c: Trace Copilot Integration (1 sprint)

Similar to Motion — add vision tools, use scorePreview() and checkConsistency() for validation.

---

## Phase 2d: Refactor Blender Specialist

**Opportunity:** Blender specialist has its own `scoreRenderTool()`. Consolidate with vision system.

```typescript
// BEFORE: blender-specialist-agent.ts (inline vision code)
const scoreRenderTool = tool({
  // 50 lines of custom vision logic
});

// AFTER: (use unified system)
const scoreRenderTool = visionTools.scorePreview; // ← Just alias
```

**Benefit:** Single source of truth for asset scoring, easier to maintain.

---

## Phase 3: Documentation & Release

- [ ] Update README.md with vision capabilities
- [ ] Add vision section to agent tooling docs
- [ ] Create user guide: "How the copilots see your work"
- [ ] Blog post / release notes

---

## Recommended Sprint Breakdown

### Sprint N (Core System)
- **Goal:** vision-system.ts + selector + tools, fully tested
- **Effort:** 1 sprint (8–10 days)
- **Deliverable:** All vision tools available, pass unit tests, offline fallback works

### Sprint N+1 (Studio + Motion + Trace)
- **Goal:** Studio Copilot uses analyzeViewport; Motion/Trace use scorePreview
- **Effort:** 1 sprint
- **Deliverable:** 3 agents using vision, pass integration tests

### Sprint N+2 (Polish)
- **Goal:** Refactor Blender Specialist, finalize Chat Agent exposure
- **Effort:** 0.5 sprint
- **Deliverable:** No code duplication, all agents tested together

---

## Quick Reference: API Surface

### For Agents to Use

```typescript
// Four main tools available to all agents (no approval needed):

visionTools.analyzeViewport({
  app: 'studio' | 'motion' | 'trace' | 'workspace',
  question?: string,
})
→ { elements, focus, issues, suggestions }

visionTools.scorePreview({
  imagePath: string,
  brief: string,
  criteria?: 'geometry' | 'animation' | 'styling' | 'composition',
})
→ { match: 0–1, issues, suggestions }

visionTools.validateComposition({
  imagePath: string,
  spec: string,
})
→ { valid: boolean, warnings, errors, metrics }

visionTools.checkConsistency({
  beforePath: string,
  afterPath: string,
  dimension: 'color' | 'style' | 'scale' | 'alignment',
})
→ { consistent: boolean, difference: string }
```

---

## Success Criteria

### Definition of Done (Phase 1 — Core System)

- [ ] vision-system.ts passes all unit tests
- [ ] vision-model-selector.ts passes fallback scenarios
- [ ] All vision tools added to allTools registry
- [ ] Offline fallback (SmolVLM2) working + documented
- [ ] No regressions in existing agent workflows
- [ ] TypeScript passes with zero new errors in vision code

### Definition of Done (Phase 2 — Agent Integration)

- [ ] Studio Copilot integration complete, end-to-end tested
- [ ] Motion Copilot scorePreview loop working
- [ ] Trace Copilot frame validation working
- [ ] Chat Agent can call vision tools without approval
- [ ] User testing: "Copilot understands what I see" feedback positive
- [ ] Performance benchmarks: analyzeViewport < 5s avg (GPU)

---

## Open Decisions for Team

1. **Model Priority:** GPT-4V first, then Claude, then Groq, then offline? Or user's choice first?
   - **Recommendation:** User's choice first (respects preferences), then smart defaults.

2. **Offline Always Available:** Always include SmolVLM2 in fallback, or only if user enables it?
   - **Recommendation:** Always available but lazy-loaded (download on first use).

3. **Image Cropping:** Automatically crop screenshots to relevant region (e.g., editor canvas only)?
   - **Recommendation:** Start without cropping; add if latency becomes issue.

4. **Logging/Audit:** Log all vision calls for debugging/transparency?
   - **Recommendation:** Yes, with user control (debugVision setting).

5. **Caching:** Cache vision results for identical images?
   - **Recommendation:** Yes, with 1-hour TTL (viewport likely unchanged).

---

## Files Ready for Review

1. **`VISION_INTEGRATION_ARCHITECTURE.md`** — Full 13-section spec (copy to repo)
2. **This doc** — Quick start + priorities

**Next Step:** Team review → Decisions on open questions → Sprint planning → Implementation.

---

**Status:** Ready to kick off Phase 1.
