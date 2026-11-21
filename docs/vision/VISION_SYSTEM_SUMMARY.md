# Vision System — Executive Summary

**Status:** Comprehensive analysis complete, ready for team review  
**Date:** 2026-11-21  
**Author:** Kiro CLI  
**Scope:** All 13 agents + unified vision framework

---

## What We Analyzed

You identified a critical gap: **Agents need to SEE.**

### The Problem

Qeda has powerful agent systems across 6 editors:
- **Studio** (video editing)
- **Motion** (3D scenes)
- **Trace** (2D vector animation)
- **Motion Studio** (composite editor)
- **Workspace** (documents)
- **Builder** (coding)

But agents can only read:
- Metadata (file size, duration, etc.)
- Accessibility trees (button labels, element positions)
- Plain text descriptions

They **cannot understand:**
- What's currently visible in a viewport
- Whether a rendered asset looks right
- If a composition has visual balance
- Layout problems (overlapping text, bad alignment)

### The Opportunity

Qeda already has:
✅ **Computer-use tools** (screenshots, window capture)  
✅ **Offline vision model** (SmolVLM2, local inference)  
✅ **One working vision integration** (Blender specialist for asset scoring)  
✅ **AI SDK 7 support** (generateText with images)

**What's Missing:**
❌ Unified vision system (each agent would reimplement logic)  
❌ Model selection + fallback strategy  
❌ Vision tools integrated into agent toolsets  
❌ Documentation of use cases

---

## What We Delivered

### 📄 Three Complete Specification Documents

1. **`VISION_INTEGRATION_ARCHITECTURE.md`** (873 lines)
   - 13-section comprehensive spec
   - Architecture diagrams + file structure
   - Vision System interface + implementation patterns
   - Model selector design + fallback logic
   - Approval policy (read-only = no approval)
   - Full implementation roadmap (Phase 1–3)
   - Risk mitigation + success metrics

2. **`VISION_SYSTEM_QUICK_START.md`** (415 lines)
   - Use-case impact matrix (8 agents ranked by value)
   - Recommended sprint breakdown
   - Phase 1, 2a, 2b, 2c, 2d implementation details
   - Success criteria (DoD for each phase)
   - Open decisions for team discussion

3. **`VISION_SYSTEM_USE_CASES.md`** (630 lines)
   - 7 agents × 2–3 real-world workflows each
   - Step-by-step walkthrough of each use case
   - Expected outcomes + quality gates
   - Testing scenarios (quick loop, long workflow, offline fallback)
   - Summary table of vision calls per agent

---

## Key Findings

### The 4 Core Vision Operations

```typescript
1. analyzeViewport('studio'|'motion'|'trace'|'workspace')
   → Returns: { elements, focus, issues, suggestions }
   → Used by: Studio, Motion, Trace, Document, Chat agents

2. scorePreview(imagePath, brief, criteria)
   → Returns: { match: 0–1, issues, suggestions }
   → Used by: Motion, Trace, Blender agents

3. validateComposition(imagePath, spec)
   → Returns: { valid, warnings, errors, metrics }
   → Used by: Studio, Trace, Motion Studio, Chat agents

4. checkConsistency(before, after, dimension)
   → Returns: { consistent, difference }
   → Used by: Trace, Motion Studio agents
```

### Impact by Agent

| Agent | Impact | Effort | Priority |
|-------|--------|--------|----------|
| **Studio Copilot** | 8/10 (zoom/caption timing) | ⭐⭐ | 🔴 Highest |
| **Motion Copilot** | 8/10 (render validation) | ⭐⭐⭐ | 🔴 Highest |
| **Trace Copilot** | 7/10 (frame validation) | ⭐⭐ | 🟡 High |
| **Chat Agent** | 5/10 (general analysis) | ⭐ | 🟢 Medium |
| **Document Drafter** | 6/10 (layout inspection) | ⭐⭐ | 🟡 High |
| **Motion Studio** | 5/10 (composite validation) | ⭐⭐⭐ | 🟢 Medium |
| **Blender Specialist** | 6/10 (consolidation) | ⭐ | 🟡 High |

### Model Selection Strategy

```
Preferred model (user's choice) 
  ↓ (try first)
Online fallback chain (GPT-4V → Claude → Groq → ...)
  ↓ (if online fails)
Offline fallback (SmolVLM2 1.7B, lazy-loaded)
  ↓ (if all fail)
Error with clear message
```

### Approval Policy

✅ **All vision tools are read-only → No approval needed**

This is critical: Vision operations never modify state, so they should flow straight through without user confirmation cards.

---

## Implementation Path

### Sprint Breakdown

```
Sprint N: Core System (vision-system.ts + selector + tools)
  ├─ 350 lines: VisionSystem class (4 analysis methods)
  ├─ 200 lines: VisionModelSelector (task optimization + fallback)
  ├─ 250 lines: Vision tools for agents
  ├─ 100 lines: Zod schemas + error handling
  ├─ Unit tests: 30+ test cases
  └─ Deliverable: All vision tools working, offline fallback tested

Sprint N+1: Agent Integration (Studio + Motion + Trace)
  ├─ Studio Copilot: analyzeViewport before edits
  ├─ Motion Copilot: scorePreview for render validation
  ├─ Trace Copilot: validateComposition for frame checks
  ├─ Integration tests: 3 agents end-to-end
  └─ Deliverable: 3 agents using vision in production

Sprint N+2: Polish & Scale (Blender refactor + Chat exposure)
  ├─ Refactor: Blender uses unified scorePreview
  ├─ Chat Agent: Vision tools available to users
  ├─ Performance: Benchmark latency, memory usage
  └─ Deliverable: No code duplication, all agents tested together
```

### Definition of Done

**Phase 1 (Core System):**
- [ ] vision-system.ts passes all unit tests
- [ ] Offline fallback (SmolVLM2) working + documented
- [ ] No regressions in existing workflows
- [ ] TypeScript passes with zero new errors

**Phase 2 (Agent Integration):**
- [ ] Studio Copilot: analyzeViewport working end-to-end
- [ ] Motion Copilot: scorePreview in render loop
- [ ] Trace Copilot: frame validation working
- [ ] User testing: "Copilot understands what I see" ✅

**Phase 3 (Scale):**
- [ ] Blender specialist refactored (no duplication)
- [ ] Chat Agent can call vision tools
- [ ] Performance benchmarks: analyzeViewport < 5s (GPU)

---

## Example Impact: Before & After

### Studio Copilot

**Before:**
```
User: "Add a zoom where I introduce the feature"
Copilot: Creates zoom at arbitrary position
User: "Actually, I introduce it at 30 seconds"
Copilot: "Let me try again" (iteration cycle)
```

**After:**
```
User: "Add a zoom where I introduce the feature"
Copilot: [analyzeViewport] → finds caption "Feature Introduction" at 25–30s
Copilot: Creates zoom at 25–30s (exact spot)
Copilot: [validateComposition] → "Framing looks good!"
Result: Done on first try ✅
```

### Motion Copilot

**Before:**
```
Copilot: Generate 3D model → Render → "Done!"
User: "That doesn't match the brief"
Copilot: Can't explain why it failed
User: Manually fixes or starts over
```

**After:**
```
Copilot: Generate 3D model → Render → [scorePreview]
  Result: 65% match, missing base ring, proportions too tall
Copilot: "Let me fix those issues" → Regenerate
Copilot: [scorePreview again] → 88% match ✅
Result: Iterative refinement fully automatic
```

---

## Technical Highlights

### Architecture: 3-Tier Vision System

```
┌─────────────────────────────┐
│   AGENT LAYER               │ Agents call vision tools
│ (Studio, Motion, Trace...)  │
└────────────┬────────────────┘
             │
┌────────────▼────────────────┐
│  UNIFIED VISION API         │ Single interface:
│  (analyzeViewport, etc)     │ analyzeViewport()
│                             │ scorePreview()
│                             │ validateComposition()
│                             │ checkConsistency()
└────────────┬────────────────┘
             │
┌────────────▼────────────────┐
│  MODEL SELECTOR + FALLBACK  │ Smart selection:
│  (task-optimized, online→  │ User choice → Online → Offline
│   offline fallback)         │
└────────────┬────────────────┘
             │
┌────────────▼────────────────┐
│  PROVIDER + IMAGE LAYER     │ Integration with:
│  (generateText, screenshot) │ AI SDK 7, computer-use
│                             │
└─────────────────────────────┘
```

### Model Selection: Task-Optimized Defaults

```typescript
selectFor('viewport-analysis')     → GPT-4V (detail), fallback SmolVLM2
selectFor('asset-scoring')         → GPT-4V (quality), fallback Claude
selectFor('composition-validation') → Claude (spatial), fallback GPT-4V
selectFor('consistency-check')      → SmolVLM2 (fast)
```

### Approval Policy: Read-Only Operations

```typescript
// All vision tools automatically approved (no user card)
visionTools.analyzeViewport        ✅ No approval
visionTools.scorePreview           ✅ No approval
visionTools.validateComposition    ✅ No approval
visionTools.checkConsistency       ✅ No approval

// Unlike write operations:
studioTools.addZoom                ⚠️ Needs approval in some surfaces
```

---

## Open Questions for Team

1. **Model Priority:** User's choice first, or smart defaults?
   - **Recommended:** User's choice (Settings) → smart defaults

2. **Offline Always Available:** Include SmolVLM2 as last fallback, or user opt-in?
   - **Recommended:** Always available, lazy-loaded

3. **Image Cropping:** Auto-crop to editor canvas to reduce image size?
   - **Recommended:** No (start simple), add if latency issue

4. **Caching:** Cache vision results for identical images?
   - **Recommended:** Yes, 1-hour TTL

5. **Logging:** Log all vision calls for debugging?
   - **Recommended:** Yes, behind debugVision setting

---

## Files Ready for Immediate Use

```
/data/projects/docugent/docugent-desktop/
├── VISION_INTEGRATION_ARCHITECTURE.md (full 13-section spec)
├── VISION_SYSTEM_QUICK_START.md       (sprint planning)
├── VISION_SYSTEM_USE_CASES.md         (real workflows)
└── VISION_SYSTEM_SUMMARY.md           (this file)
```

**Next Action:** 
1. Team reviews the 3 specs
2. Answer the 5 open questions
3. Decide on Phase 1 scope + sprint start
4. Begin implementation

---

## Success Metrics

### Immediate (End of Phase 1)
- [ ] 900 lines of vision code written + tested
- [ ] Offline fallback (SmolVLM2) working
- [ ] 30+ unit tests passing
- [ ] Zero regressions

### Short-term (End of Phase 2)
- [ ] 3 agents (Studio, Motion, Trace) using vision actively
- [ ] User testing: "Copilot understands the editor now" ✅
- [ ] Iteration count reduced by 30%+ in copilot workflows

### Long-term (End of Phase 3)
- [ ] All 13 agents able to use vision (even if not all do)
- [ ] No code duplication (Blender uses unified system)
- [ ] Performance: analyzeViewport < 5s avg (GPU), < 10s (CPU)
- [ ] "Agents that see" becomes differentiator vs other AI editor tools

---

## Conclusion

Qeda is uniquely positioned to give agents **sight**:
- ✅ Computer-use foundation ready
- ✅ Offline model available (local, no API calls)
- ✅ 13 agent surfaces ready to benefit
- ✅ Clear use cases across 6 editors

**This proposal is actionable, low-risk, and high-impact.**

---

**Next Step:** Schedule team review → Sprint planning → Start Phase 1.

**Questions?** See the full specs:
- Architecture details: `VISION_INTEGRATION_ARCHITECTURE.md`
- Sprint planning: `VISION_SYSTEM_QUICK_START.md`
- Real workflows: `VISION_SYSTEM_USE_CASES.md`
