# Studio Showcase Agent Implementation Roadmap

**Date:** November 20, 2026  
**Status:** Planning Complete, Ready for Execution  
**Scope:** 8 implementation tasks + integration  

---

## Executive Summary

This roadmap describes a comprehensive rebuild of the Studio editing system to support **autonomous end-to-end showcase video creation**. The agent will be capable of:

1. **Recording** demonstrations of web applications and software
2. **Composing** multiple recorded segments into a unified multi-track project
3. **Editing** with effects, captions, styling, and transitions
4. **Exporting** finished showcase videos for distribution

The solution is built in three layers:
- **Core operations** (lib/studio/editing/) — modular, testable, independent
- **AI tools** (main/tools/studio-editing.ts) — wraps core operations for agent use
- **Showcase agent** (ai/studio-showcase-agent.ts) — orchestrates workflows

---

## Problem Statement

### Current State
- Studio Copilot and its tools are broken following the Effects Redesign (15 tasks completed)
- Deprecated tools (`addCanvasEffect`, `removeCanvasEffect`) operate on old track-based effects
- New clip-attached effects system has no programmatic API for agents
- No tools exist for multi-track project creation, track management, or clip composition
- No framework for end-to-end workflow orchestration (record → edit → export)

### Requirements (User Clarification)
- **Decision boundaries:** Agent must intelligently route based on request type (record new, edit existing, or multi-step composition)
- **Project context:** Reuse existing patterns (renderProjectContext, projectResources); agent can ask clarifying questions
- **Success criteria:** Functionally complete AND human-refineable (user can iterate on agent choices)
- **Effect annotation:** Coarse-grained during recording ("Add spotlight effect"), refined during editing
- **Multi-track support:** Record intro + features separately, compose on timeline

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                 STUDIO SHOWCASE AGENT                           │
│         ai/studio-showcase-agent.ts (orchestration)             │
│                                                                 │
│  • Understand user request                                      │
│  • Gather project context                                       │
│  • Route: Record? Edit existing? Multi-step?                   │
│  • Execute workflow end-to-end                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
        ┌───────────────────┼───────────────────┐
        ↓                   ↓                   ↓
    RECORD FLOW        EDIT FLOW          MULTI-STEP FLOW
    (new content)      (existing)         (segments)
        ↓                   ↓                   ↓
    Record via       Load project        Record each
    browser-use      Modify state        segment
    Mark highlights  Apply effects       Compose
    Stop recording   Save                Apply effects
    Import take                          Save
```

### Three Workflow Types

**1. RECORD** — "Create a demo of Sonic Genius platform"
```
1. Gather context (web search, ask clarifying questions)
2. openBrowser(url) → navigate to app
3. startDemoRecording(windowId) → begin capture
4. Use browser-use tools to interact (clickSelector, typeSelector, navigateBrowser)
5. markHighlight("Add spotlight effect") at key moments (semantic annotation)
6. stopDemoRecording(sessionId) → save take
7. Transition to EDIT phase
```

**2. EDIT EXISTING** — "Add effects to this recording"
```
1. List available takes/projects
2. Load project state
3. Apply changes via editing tools (effects, captions, transitions)
4. Save and persist
```

**3. MULTI-STEP** — "Create showcase with intro, features A/B/C, outro"
```
1. Plan breakdown (ask clarifying questions: separate recordings?)
2. For each segment: Execute RECORD workflow
3. After all segments: Execute EDIT workflow to compose
4. Arrange on timeline, apply effects, save
```

---

## Data Model

### Key Types (from lib/studio/types.ts)

**StudioTake** — Single recording
- `videoPath`, `audioPath`, `durationMs`
- `cuts: StudioCut[]` — silence/manual cuts
- `zooms: StudioZoom[]` — kinetic zooms
- `captions: StudioCaption[]` — subtitles
- `effects?: StudioEffect[]` — (deprecated, for backward compat)
- `overlays?: StudioOverlay[]` — picture-in-picture
- `styling: StudioStyling` — global styling
- `tracks?: StudioTrack[]` — multi-track project (NEW)
- `mediaAssets?: StudioMediaAsset[]` — media pool (NEW)

**StudioTrack** — Named track holding clips
- `id: string`
- `name: string`
- `type: 'video' | 'audio' | 'effects' | 'transitions' | 'captions' | 'overlays'`
- `clips: StudioClip[]` — ordered clip array
- `locked: boolean`
- `visible: boolean`
- `muted?: boolean`

**StudioClip** — Unit of media on timeline
- `id: string`
- `trackId: string` — which track
- `name: string`
- `startMs: number` — timeline position
- `durationMs: number` — timeline duration
- `sourceInMs: number` — where in source media
- `mediaAssetId?: string` — reference to media pool
- `speed?: number` — playback speed (1 = normal)
- `volume?: number` — audio volume (0..2)
- `opacity?: number` — visual opacity (0..1)
- `transform?: ClipTransform` — position, scale, rotation
- `enterAnimation?: ClipAnimation` — entrance
- `exitAnimation?: ClipAnimation` — exit
- `deviceFrame?: ClipDeviceFrame` — frame overlay
- `payload?: StudioClipPayload` — effects, captions, transitions

**StudioMediaAsset** — Source material in media pool
- `id: string`
- `name: string`
- `path: string` — absolute path on disk
- `kind: 'video' | 'audio' | 'image'`
- `durationMs: number` — (0 for images)
- `width?: number`, `height?: number`
- `probe?: StudioMediaProbe` — metadata

**ClipEffect** — Clip-attached effect (NEW)
- `id: string`
- `type: 'spotlight' | 'neon-glow' | 'vignette' | 'film-grain' | 'scanlines'`
- `intensity: number` — 0..1 (keyframable)
- `params: Record<string, number | string | boolean>` — static config (radius, color, etc)
- `stackOrder: number` — render depth

---

## Implementation Plan: 8 Tasks

### Task 1: Core Track & Clip Operations
**File:** `lib/studio/editing/tracks.ts`, `lib/studio/editing/clips.ts`  
**Scope:** Modular CRUD for tracks and clips  
**Deliverables:**
- `createTrack(name, type) → StudioTrack`
- `deleteTrack(trackId) → boolean`
- `reorderTracks(trackIds[]) → void`
- `getTrack(trackId) → StudioTrack`
- `addClipToTrack(trackId, clip) → StudioClip`
- `removeClip(clipId) → boolean`
- `moveClip(clipId, newTrackId, newStartMs) → void`
- `getClip(clipId) → StudioClip`

**Tests:**
- Unit tests for track creation, deletion, reordering
- Unit tests for clip insertion, removal, movement
- Invariant tests (track ordering, clip timing overlaps)
- Edge cases (empty tracks, boundary positions)

**Definition of Done:**
- ✅ All functions implemented and tested
- ✅ No dependencies on AI layer or tools
- ✅ Clear error handling
- ✅ Working demo: create multi-track project with clips

---

### Task 2: Clip Properties & Effect Operations
**File:** `lib/studio/editing/properties.ts`, `lib/studio/editing/effects.ts`  
**Scope:** Clip-level mutations and effect management  
**Deliverables:**
- `setClipProperties(clipId, {speed?, volume?, opacity?, transform?}) → void`
- `addClipEffect(clipId, effectType, intensity, params) → ClipEffect`
- `removeClipEffect(clipId, effectId) → boolean`
- `updateEffectParams(clipId, effectId, params) → void`
- `addEffectKeyframe(clipId, effectId, timeMs, intensity, easing) → StudioKeyframe`
- `removeEffectKeyframe(clipId, effectId, keyframeId) → boolean`
- `reorderEffects(clipId, effectIds[]) → void`
- `listEffectCatalog() → EffectDefinition[]`

**Tests:**
- Unit tests for property patching (speed, volume, opacity)
- Unit tests for effect addition/removal
- Unit tests for keyframe insertion/removal
- Validation tests (bounds checking, type validation)
- Edge cases (multiple effects, keyframe ordering)

**Definition of Done:**
- ✅ All functions implemented and tested
- ✅ Effects match new clip-attached system
- ✅ Keyframes properly associated with effects
- ✅ Working demo: add effects to clips and keyframe intensity

---

### Task 3: Styling & Composition Operations
**File:** `lib/studio/editing/styling.ts`, `lib/studio/editing/composition.ts`  
**Scope:** Project-level styling and composition  
**Deliverables:**
- `setProjectStyling(take, {background?, aspectRatio?, cameraEasing?, ...}) → void`
- `setBackground(take, color) → void`
- `setAspectRatio(take, ratio: '16:9' | '9:16' | '1:1' | '4:3') → void`
- `setCameraEasing(take, easing: 'smooth' | 'snappy' | 'cinematic') → void`
- `addCaption(clipId, caption: StudioCaption) → void`
- `removeCaption(captionId) → boolean`
- `addOverlay(clipId, overlay: StudioOverlay) → void`
- `removeOverlay(overlayId) → boolean`
- `composeProject(take) → CompositionState` (internal representation)

**Tests:**
- Unit tests for styling mutations
- Unit tests for caption/overlay CRUD
- Validation tests (aspect ratio enum, easing values)
- Integration tests (styling + rendering)

**Definition of Done:**
- ✅ All functions implemented and tested
- ✅ Styling changes persist correctly
- ✅ Working demo: modify project background, aspect ratio, camera easing

---

### Task 4: Studio Editing Tools
**File:** `main/tools/studio-editing.ts`  
**Scope:** AI SDK tool wrappers around core operations  
**Deliverables:**
```typescript
// 15+ tools wrapping core operations
createTrack(name, type) → tool
deleteTrack(trackId) → tool
reorderTracks(trackIds[]) → tool
addClipToTrack(trackId, clipId, startMs, durationMs, sourceInMs, mediaAssetId) → tool
removeClip(clipId) → tool
moveClip(clipId, newTrackId, newStartMs) → tool
setClipProperties(clipId, props) → tool
addClipEffect(clipId, effectType, intensity, params) → tool
removeClipEffect(clipId, effectId) → tool
addEffectKeyframe(clipId, effectId, timeMs, intensity, easing) → tool
setProjectStyling(takeId, styling) → tool
addCaption(takeId, caption) → tool
addOverlay(takeId, overlay) → tool
getProjectState(takeId) → tool (returns full multi-track structure)
inspectTimeline(takeId) → tool (returns clips, effects, timing)
listEffectCatalog() → tool
```

**Tests:**
- Tool input/output validation tests
- Error handling tests (missing ids, invalid parameters)
- Permission/approval policy tests
- Integration tests with mock agent

**Definition of Done:**
- ✅ All 15+ tools implemented with AI SDK
- ✅ Full input validation
- ✅ Error messages clear and actionable
- ✅ Approval policy integration complete
- ✅ Working demo: call tools from agent and verify changes persist

---

### Task 5: Recording Import & Media Pool
**File:** `lib/studio/editing/media.ts`, `main/tools/studio-recording.ts`  
**Scope:** Import recorded takes into media pool, create clips on timeline  
**Deliverables:**
- `importRecording(takeId, projectId) → StudioMediaAsset`
- `createMediaAsset(path, kind, name, metadata) → StudioMediaAsset`
- `addClipFromAsset(trackId, mediaAssetId, startMs, sourceInMs, durationMs) → StudioClip`
- `detectAudioTrack(take) → boolean` (does recording have audio?)
- `autoCreateTracks(take) → {videoTrack, audioTrack}`

**AI SDK Tools:**
- `importRecording(takeId, projectId) → tool`
- `addClipFromAsset(trackId, mediaAssetId, startMs, sourceInMs, durationMs) → tool`

**Tests:**
- Unit tests for recording import
- Unit tests for media asset creation
- Unit tests for clip-from-asset insertion
- End-to-end: record take → import → add to timeline → render

**Definition of Done:**
- ✅ Recording imports cleanly into media pool
- ✅ Audio track auto-detected and created
- ✅ Clips reference media assets correctly
- ✅ Working demo: record take → import → add to timeline → see in UI

---

### Task 6: Enhanced Effect Tools (Replace Deprecated)
**File:** `main/tools/studio-effects.ts`, `main/tools/policies/studio-effects.ts`  
**Scope:** Clip-aware effect management, fully replaces old system  
**Deliverables:**
```typescript
// NEW tools for clip-attached effects
addClipEffect(clipId, effectType, intensity, params, takeId) → tool
removeClipEffect(clipId, effectId, takeId) → tool
addEffectKeyframe(clipId, effectId, timeMs, intensity, easing, takeId) → tool
removeEffectKeyframe(clipId, effectId, keyframeId, takeId) → tool
listEffectCatalog() → tool

// DEPRECATE old tools
addCanvasEffect (mark with @deprecated, log warning)
removeCanvasEffect (mark with @deprecated, log warning)

// Update approval policies
studio.ts policy: remove addCanvasEffect/removeCanvasEffect entries
studio-effects.ts policy: add entries for new tools
```

**Tests:**
- Unit tests for new clip-aware tools
- Deprecation warning tests
- Migration tests (old tool calls log warnings)
- Catalog listing tests

**Definition of Done:**
- ✅ New tools fully functional with clip-attached effects
- ✅ Deprecated tools marked and warned
- ✅ Approval policies updated
- ✅ Working demo: agent can add effects to clips on timeline

---

### Task 7: Studio Showcase Agent
**File:** `ai/studio-showcase-agent.ts`  
**Scope:** Orchestrate end-to-end showcase creation workflow  
**Deliverables:**

**System Prompt Components:**
- Project context block (via renderProjectContext)
- Active take description
- Workflow routing instructions (decide: record/edit/multi-step)
- Tool descriptions

**Workflow Decision Logic:**
```
if request mentions "record", "demo", "create", "capture":
  → RECORD workflow
else if request mentions "add effects", "edit", "modify", "change":
  → EDIT workflow
else if request mentions "compose", "multi-step", "multiple segments":
  → MULTI-STEP workflow
else:
  → Ask clarifying question
```

**Tool Set:**
- Recording tools: startDemoRecording, stopDemoRecording, markHighlight, openBrowser, browser-use
- Editing tools: createTrack, addClipToTrack, addClipEffect, setProjectStyling, etc.
- Query tools: getTakeDetails, getProjectState, inspectTimeline, listEffectCatalog
- Context tools: web search, render project context

**AI SDK Configuration:**
- ToolLoopAgent with step budget (40 or 60, similar to other copilots)
- Model: inherit from system provider registry
- Approval policy: studioCopilotApprovalPolicy (minimal friction for autonomous decisions)

**Tests:**
- Test RECORD workflow routing
- Test EDIT workflow routing
- Test MULTI-STEP workflow routing
- Test decision logic with various prompts
- Mock end-to-end flow (record → edit → export)

**Definition of Done:**
- ✅ Agent correctly routes based on request
- ✅ Can execute RECORD workflow end-to-end
- ✅ Can execute EDIT workflow end-to-end
- ✅ Can execute MULTI-STEP workflow end-to-end
- ✅ Working demo: agent receives "Create promo" → records → edits → exports

---

### Task 8: Integration & E2E Testing
**File:** `src/__tests__/studio-showcase-e2e.test.ts`, UI integration  
**Scope:** Full workflow testing, integration with existing Studio UI  
**Deliverables:**

**E2E Test Suite:**
```
✓ Record → Import → Add to Timeline
  Scenario: Record a take, import it as media asset, add clip to video track
  Expected: Clip appears on timeline, renders correctly

✓ Single Recording + Effects
  Scenario: Record take, import, add spotlight effect with keyframe
  Expected: Effect visible in timeline, keyframes set correctly

✓ Multi-Segment Composition
  Scenario: Record 3 segments, import each, arrange on timeline
  Expected: Timeline shows all clips, timing correct, render works

✓ Styling Application
  Scenario: Set project background, aspect ratio, camera easing
  Expected: Changes persist, rendering reflects styling

✓ Caption & Overlay
  Scenario: Add captions and overlays to clips
  Expected: Captions render with timing, overlays layer correctly

✓ Full Agent Workflow
  Scenario: Agent receives prompt → records → edits → exports
  Expected: Finished video in correct format, playable
```

**UI Integration:**
- Studio Copilot surface shows Showcase Agent option
- Agent runs with activeTakeId and projectId scoped
- Results update in real-time (broadcastStudioChanged on each mutation)
- User can continue editing results in Inspector

**Tests:**
- Integration tests for recording → editing → export pipeline
- UI sync tests (changes reflected in real-time)
- Regression tests (no breaks in existing Studio features)
- Performance tests (large projects, many clips/effects)

**Definition of Done:**
- ✅ Full end-to-end workflow tested and working
- ✅ No regressions in existing functionality
- ✅ Agent integrated into Studio UI
- ✅ User can iterate on agent choices in Inspector
- ✅ Finished video exports correctly

---

## Integration Checklist

- [ ] Register new tools in `main/tools/index.ts`
- [ ] Add tool approval policies to `main/tools/policies/studio.ts`
- [ ] Update `getStudioCapability()` if capability classification needed
- [ ] Wire Studio Showcase Agent into UI (`pages/Studio.tsx`)
- [ ] Update Studio Copilot to optionally delegate to Showcase Agent
- [ ] Remove deprecated effect tools from registry (or mark as deprecated)
- [ ] Update documentation (README, tool descriptions, workflow guide)
- [ ] Smoke test with real recordings and projects

---

## Success Criteria

✅ **Functional Completeness**
- Agent can record a demo and import as multi-track project
- Agent can add effects to clips using new clip-attached system
- Agent can compose multiple recorded segments on timeline
- Agent can apply styling, captions, and transitions

✅ **Intelligent Routing**
- Agent correctly identifies request type (record/edit/multi-step)
- Agent asks clarifying questions when ambiguous
- Agent chooses reasonable defaults for timing, styling, effects

✅ **Architecture Quality**
- All editing operations testable without UI
- Core operations independent of AI layer
- Tools wrap operations with proper validation
- No regressions in existing Studio functionality

✅ **User Experience**
- Agent makes reasonable choices user can iterate on
- Changes reflected in real-time (Inspector updates)
- Finished video ready for export
- Clear error messages when things go wrong

✅ **Deprecation Cleanup**
- Deprecated effect tools marked with @deprecated
- New tools fully functional and tested
- Approval policies updated
- No breaking changes to existing workflows

---

## Timeline Estimate

Assuming sequential execution with testing at each step:

- **Task 1–3:** Core operations, 3–4 days
- **Task 4:** Studio tools, 1–2 days
- **Task 5:** Recording import, 1–2 days
- **Task 6:** Enhanced effect tools, 1 day
- **Task 7:** Studio Showcase Agent, 2–3 days
- **Task 8:** Integration & E2E testing, 2–3 days

**Total: 11–15 days of focused development**

Can run in parallel with other work; each task is semi-independent.

---

## Known Constraints & Notes

**Backward Compatibility:**
- Keep `StudioTake.effects` field for old recordings (read-only during migration)
- Auto-migration on load converts old effects to clip-attached
- No breaking changes to existing Studio functionality

**Test Infrastructure:**
- Reuse existing Jest/Bun test setup
- Mock BrowserWindow and IPC for tool tests
- Use real database for integration tests (separate test DB)

**UI Integration:**
- Studio Copilot gets Showcase Agent as alternative mode
- Existing Studio Inspector remains fully functional
- Agent changes trigger `broadcastStudioChanged()` for real-time sync

**Future Enhancements (Post-MVP):**
- Agent learns from past projects (RAG over previous showcases)
- Smart effect recommendations based on content
- Template-based workflows (e.g., "tech demo template")
- Multi-language support for captions
- Social media kit generation enhanced

---

## Next Steps

1. **Notify team of plan** — Review this roadmap, ask clarifying questions
2. **Prepare development environment** — Ensure tests can run, DB setup correct
3. **Execute Task 1** — Start with core track/clip operations
4. **Iterate** — Complete each task, verify tests pass, demo working
5. **Integrate** — Wire into UI, end-to-end testing
6. **Deploy** — Merge to main, announce to users

---

**Plan approved and ready for execution. Each task has clear deliverables, tests, and definition of done.**
