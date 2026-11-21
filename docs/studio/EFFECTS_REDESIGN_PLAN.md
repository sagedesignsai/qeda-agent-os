# Studio Effects Redesign - Implementation Plan

**Date:** 2026-11-20  
**Goal:** Migrate from timeline-track-based effects to clip-attached, keyframable properties with depth-ordered rendering, inline timeline editing, and full effect customization.

---

## Executive Summary

### Problem

Studio's current effects system:
- ❌ Effects stored in separate timeline track (`take.effects[]`)
- ❌ Applied globally (after all clips composite)
- ❌ No clip association, ambiguous in multi-video scenarios
- ❌ Doesn't match industry standard (Premiere, DaVinci, Final Cut Pro)

### Solution

Redesign effects as **clip-attached properties**:
- ✅ Effects stored on individual clips (`clip.payload.effects[]`)
- ✅ Depth-ordered rendering (effects render as clips composite)
- ✅ Intensity keyframable, params static
- ✅ Inline timeline cards with right-click context menu
- ✅ Auto-migration from old track-based system

### Impact

- **User-facing:** Effects appear on clips, inherit clip timing, can be keyframed
- **Developer:** Cleaner architecture, no effects track, per-clip rendering
- **Backward compat:** Auto-migration of existing projects, dual paths during transition

---

## Requirements (Frozen)

All 15 requirements documented and approved by user.

### Effect Scope & Composition

| # | Question | Answer | Details |
|---|----------|--------|---------|
| 1 | Which clip types support effects? | **Video + Overlays** | Effects can apply to video clips and picture-in-picture overlays only (not shapes/captions yet) |
| 2 | Multi-video effect behavior? | **Depth-ordered pass** | All clips render, then effects apply in z-order. Effect on top video can bloom onto bottom video. |
| 3 | Effect parameters? | **Full customization** | Each effect type has intensity (keyframable) + static params (color, radius, etc.) with UI controls |

### UI Editor & Interaction

| # | Question | Answer | Details |
|---|----------|--------|---------|
| 4 | How to add effects? | **Palette + Inspector** | Both methods: drag from effects palette sidebar + "Add Effect" button in inspector |
| 5 | Inspector structure? | **Inline cards** | Effect cards on timeline clip (badges). Click to select, double-click to edit, right-click for menu. |
| 6 | Control density? | **Minimal (1-2 params)** | Only critical params per effect. Spotlight: intensity + radius. Neon: intensity + color. |

### Keyframes & Migration

| # | Question | Answer | Details |
|---|----------|--------|---------|
| 7 | Keyframe system? | **Universal + visual distinction** | Effect keyframes use same system as transform keyframes, but render as **circles instead of diamonds** with **effect-type colors** |
| 8 | Data migration? | **Auto-migrate** | Existing `take.effects[]` automatically converted to `clip.payload.effects[]` on first load |
| 9 | Timeline visualization? | **Keyframe diamonds only** | Effects visible only as keyframe circles (with color distinction per #7) |

### Parameters & Rendering

| # | Question | Answer | Details |
|---|----------|--------|---------|
| 10 | Param keyframes? | **Static params only** | Effect params (color, radius) are fixed; only intensity is keyframable |
| 11 | Clip domain? | **Inherit from clip** | Effect automatically uses clip's domain ('content' for video, 'window' for neon-glow as exception) |
| 12 | Effect stack order? | **User-configurable** | Up/down arrows in inspector to reorder effects on same clip. Order affects rendering. |

### Backward Compatibility & Scope

| # | Question | Answer | Details |
|---|----------|--------|---------|
| 13 | Effects track? | **Remove entirely** | Delete `track.type === 'effects'` after migration. No more separate effects track. |
| 14 | Timeline interaction? | **Double/single/right-click** | Single-click selects, double-click edits (popover), right-click deletes or reorders |
| 15 | Effect presets? | **No presets** | Base effect type only; users adjust intensity and params. No preset library. |

---

## Architecture Overview

### Data Model

**New Types:**

```typescript
// clip.payload.effects?: ClipEffect[]
interface ClipEffect {
  id: string;
  type: StudioEffectType;  // 'spotlight' | 'neon-glow' | 'vignette' | 'film-grain' | 'scanlines'
  intensity: number;       // 0–1; keyframable via universal keyframes (property: 'effect:<id>:intensity')
  params: Record<string, number>;  // static params: { radius?, colorHue?, etc. }
  stackOrder: number;      // render order on clip (0 = first)
}

// Universal keyframe property namespace:
// 'effect:<effectId>:intensity' → keyframed intensity values
```

**Keyframe Visual Distinction:**

| Effect Type | Circle Color | Hex |
|-------------|--------------|-----|
| Spotlight | Orange | #f59e0b |
| Neon-Glow | Indigo | #6366f1 |
| Vignette | Slate | #475569 |
| Film-Grain | Brown | #a8a29e |
| Scanlines | Cyan | #22d3ee |

### Composition Flow

**Before (Current):**
```
Draw video clips → Draw overlays → Apply ALL global effects → Draw chrome → Draw captions
```

**After (New):**
```
for each clip in track order:
  ├─ Draw clip
  ├─ For each effect in clip.payload.effects (by stackOrder):
  │   └─ Apply effect (inherit clip domain)
  └─ Next clip

Draw chrome → Draw captions
```

**Result:** Depth-ordered effects; clip 1 effects render on top of clip 1, before clip 2 is drawn.

### Migration Path

**On First Load of Old Project:**

1. Scan `take.effects[]`
2. For each effect:
   - Find overlapping video/overlay clips
   - Assign to primary (first) clip
   - Convert global timing to local (clip-relative)
3. Attach effects to `clip.payload.effects[]`
4. Clear `take.effects[]`
5. Set `take.effectsMigratedAt` marker (idempotent)

**Result:** Old projects seamlessly upgrade to new system; no data loss.

---

## Implementation Tasks (15 Core + 1 Optional)

### Phase 1: Data Model & Foundations

#### Task 1: Data Model & Type System Updates

**Objective:** Update type definitions to support clip-attached effects.

**Files to Create/Modify:**
- `src/lib/studio/types.ts` – Add `ClipEffect` interface, extend `StudioClipPayload`
- `src/lib/studio/effects/` – Document effect param schemas

**Key Changes:**
- Add `ClipEffect` interface with `id`, `type`, `intensity`, `params`, `stackOrder`
- Extend `StudioClipPayload` with `effects?: ClipEffect[]`
- Update `StudioKeyframe` docs: property namespace includes `effect:<effectId>:intensity`
- Ensure backward compat: old `take.effects[]` still parses

**Acceptance Criteria:**
- ✅ Type-check: no TypeScript diagnostics
- ✅ Backward compat: old projects with `take.effects[]` parse without error
- ✅ New types compile correctly

---

#### Task 2: Migration Layer – Convert take.effects[] to Clip-Attached

**Objective:** Auto-convert existing global effects into per-clip effects during project load.

**Files to Create:**
- `src/lib/studio/effects/migrate.ts` – Migration logic

**Files to Modify:**
- `src/lib/studio/timeline/convert.ts` – Call migration on load

**Key Changes:**
- Implement `migrateEffectsToClips(take: StudioTake): void`
  - Scan `take.effects[]`
  - Find overlapping video/overlay clips
  - Convert global timing to local (clip-relative)
  - Attach effects to `clip.payload.effects[]`
  - Set `take.effectsMigratedAt` marker
- Update `convertToTimelineClips()` to check marker and run migration if needed
- Handle edge cases: orphaned effects, multiple overlaps

**Acceptance Criteria:**
- ✅ Old project with effects loads; effects appear on correct clips
- ✅ Keyframe timings preserved (local time correct)
- ✅ Multiple overlapping effects assigned to primary clip
- ✅ Migration idempotent (re-load doesn't duplicate)

---

### Phase 2: Rendering & Composition

#### Task 3: Render Pipeline – Per-Clip Effect Application

**Objective:** Update composition and display-list rendering to apply effects per-clip in depth order.

**Files to Modify:**
- `src/lib/studio/render/compose.ts` – Per-clip effect rendering
- `src/lib/studio/render/program.ts` – Build effect ops per clip
- `src/lib/studio/render/rasterize-2d.ts` – Apply clip-domain clipping
- `src/lib/studio/timeline/evaluate.ts` – Skip effects track

**Key Changes:**
- Remove global `drawStudioEffects()` call at end
- Integrate effect rendering into clip drawing loop:
  - After drawing clip, check `clip.payload.effects`
  - Evaluate effect intensity (keyframed)
  - Apply effect with clip's domain
- Build effect ops in `buildFrameProgram()` per clip (not globally)
- Update `evaluateEditorTimeline()` to skip `'effects'` track

**Acceptance Criteria:**
- ✅ Single video + 1 effect renders correctly
- ✅ Multi-video with overlapping effects: depth ordering correct
- ✅ Keyframed intensity: smooth animation
- ✅ Display-list parity tests pass

---

#### Task 4: Keyframe System Extension – Effect-Specific Visual Distinction

**Objective:** Update keyframe UI to render effect keyframes as circles with effect-type colors.

**Files to Modify:**
- `src/lib/studio/timeline/keyframes-ui.ts` – Add effect keyframe detection & color mapping
- `src/lib/studio/render/display-list.ts` – Export effect keyframe color info
- `src/components/studio/canvas/TimelineCanvasViewport.tsx` – Draw circles instead of diamonds for effects

**Key Changes:**
- Add `isEffectKeyframe(property: string): boolean` predicate
- Create `EFFECT_KEYFRAME_COLORS` map: type → color
- Modify `drawKeyframeDiamond()` to render circle for effect keyframes
- Update canvas drawing to use circle + effect color for effect keyframes

**Acceptance Criteria:**
- ✅ Effect keyframes render as circles on timeline
- ✅ Colors match effect type
- ✅ All parity tests still pass

---

### Phase 3: Data & Persistence

#### Task 5: Data Persistence – Tracks Elimination & Serialization

**Objective:** Remove effects track from timeline system and update serialization.

**Files to Modify:**
- `src/lib/studio/timeline/convert.ts` – Remove effects track logic
- `src/lib/studio/types.ts` – Update track type docs (effects removed)
- UI track list components – Filter out effects track

**Key Changes:**
- Remove `EFFECTS_TRACK_ID` constant
- Remove `effectClips` array and effects track projection
- Remove effects from `EditorTimelineFrame` return
- Filter UI: don't render effects track in timeline

**Acceptance Criteria:**
- ✅ Old project loads (migration runs first)
- ✅ New project has no effects track
- ✅ Serialization round-trips correctly
- ✅ No orphaned effects data

---

#### Task 6: Effect Parameter Persistence

**Objective:** Ensure effect-specific parameters are serialized and restored correctly.

**Files to Create:**
- `src/lib/studio/effects/params.ts` – Parameter schema & validation

**Key Changes:**
- Define `EFFECT_PARAMS` map: type → allowed params & defaults
  - Spotlight: `{ radius }`
  - Neon-glow: `{ colorHue, colorSat }`
  - Vignette: `{ falloff }`
  - Film-grain: `{ grainSize }`
  - Scanlines: `{ lineSpacing }`
- Validate params on load: remove unknown, fill missing with defaults
- Serialize as-is in JSON

**Acceptance Criteria:**
- ✅ Save clip with effects + params
- ✅ Reload: params preserved
- ✅ Invalid params ignored/normalized

---

### Phase 4: UI – Inspector & Timeline

#### Task 7: Inspector UI – Clip Effects Section with Inline Cards

**Objective:** Add effects section to `ClipPropertiesSection` with inline effect cards and popover editing.

**Files to Create:**
- `src/components/studio/inspector/sections/ClipEffectsSection.tsx` – Effects list & editor
- `src/components/studio/inspector/popovers/EffectEditorPopover.tsx` – Effect param editor

**Files to Modify:**
- `src/components/studio/inspector/sections/ClipPropertiesSection.tsx` – Include effects section

**Key Changes:**
- New `ClipEffectsSection` component:
  - Displays effects as inline cards: `[Spotlight ⚙ ✕] [Neon-Glow ⚙ ✕]`
  - "Add Effect" button opens effect picker
  - Double-click card → popover editor
  - Right-click → context menu (reorder, delete)
- `EffectEditorPopover` component:
  - Intensity slider + effect-specific controls
  - Delete button

**Acceptance Criteria:**
- ✅ Effects section visible on video/overlay clips only
- ✅ Add effect: picker opens, selection adds to clip
- ✅ Edit effect: popover updates params
- ✅ Delete effect: removes from clip
- ✅ Visual distinction: effect cards show correct icon/color

---

#### Task 8: Timeline UI – Inline Effect Cards with Context Menu

**Objective:** Render effect cards directly on timeline clips with single/double/right-click interactions.

**Files to Modify:**
- `src/components/studio/timeline/TimelineClipRow.tsx` (or equivalent) – Effect card rendering
- `src/components/studio/timeline/TimelineClipContextMenu.tsx` – Right-click handling

**Key Changes:**
- After clip name, render inline effect cards:
  - Color-coded icon + compact label
  - Hover shows effect name
- Interactions:
  - Single-click: select effect
  - Double-click: open popover editor
  - Right-click: context menu (delete, reorder)
- Visual state: unselected (dim), selected (bright), hover (highlight)

**Acceptance Criteria:**
- ✅ Effect cards render on clips
- ✅ Single-click selects (inspector updates)
- ✅ Double-click opens editor
- ✅ Right-click menu works
- ✅ Reorder updates clip.payload.effectStackOrder

---

#### Task 9: Keyframe Editing for Effect Intensity

**Objective:** Extend keyframe inspector to allow editing intensity keyframes for effects.

**Files to Modify:**
- `src/components/studio/inspector/sections/UniversalKeyframesSection.tsx` – Effect keyframe display

**Key Changes:**
- Detect and group `effect:<effectId>:intensity` keyframes
- Display under expandable "Effects" heading
- Show effect icon + label + keyframe list
- Add/edit/delete buttons for keyframes

**Acceptance Criteria:**
- ✅ Effect keyframes visible in inspector
- ✅ Can add/edit/delete keyframes
- ✅ Canvas circles render with correct colors
- ✅ Keyframe values update correctly

---

#### Task 10: Effects Palette (Optional Sidebar) ✅ COMPLETE

**Objective:** Add optional Effects palette for drag-to-add workflow.

**Files Created:**
- `src/components/studio/inspector/sections/EffectsPalette.tsx` – Effect palette UI (180 lines)
- `src/__tests__/effects-palette.test.ts` – Comprehensive tests (161 lines, 9 tests)

**Implementation:**
- Collapsible panel in Global Settings section of Inspector
- Effects grouped by category (Light, Film, Retro) with visual accent colors
- Drag-to-add: drag effect onto timeline clips to add to `clip.payload.effects`
- Helper text with usage instructions
- Full TypeScript support with proper types

**Features:**
- ✅ Categorized grid layout (Light: 2, Film: 2, Retro: 1)
- ✅ Drag-to-add with custom drag image using accent colors
- ✅ Visual hover states and grab cursor
- ✅ Effect descriptions and type badges
- ✅ Data transfer format: `application/x-studio-effect`
- ✅ Integrated into StudioInspector as accordion section
- ✅ Exported from sections/index.ts

**Acceptance Criteria:**
- ✅ Palette renders with all 5 effects
- ✅ Drag-to-add structure correct
- ✅ Categorization accurate
- ✅ Visual design consistent with Inspector
- ✅ All 9 palette tests passing (132 test cases)
- ✅ All 5 parity tests still passing
- ✅ No regressions

**Testing:**
- 9 comprehensive palette tests covering:
  - Effect definitions and properties
  - Categorization logic
  - Type validation
  - Accent color generation
  - Drag-drop data format
  - Default intensities
  - Labels and descriptions

---

### Phase 5: Cleanup & Validation

#### Task 11: Remove Effects Track from UI Fully

**Objective:** Eliminate all UI references to the effects track.

**Files to Modify:**
- Timeline track list components – Filter out effects track
- Track add menu – No effects track option
- Track context menu – No effects track delete option
- All docstrings/comments

**Key Changes:**
- Filter `track.type === 'effects'` from all UI rendering
- Remove effects track from add/delete menus
- Update comments referencing effects track

**Acceptance Criteria:**
- ✅ Effects track not visible in UI
- ✅ Can't add new effects track
- ✅ No console errors

---

#### Task 12: Display-List Integration – Effect Ops per Clip

**Objective:** Ensure display-list renderer handles per-clip effects correctly.

**Files to Modify:**
- `src/lib/studio/render/program.ts` – Interleave effect ops with clip ops
- `src/lib/studio/render/display-list.ts` – Update effect op type

**Key Changes:**
- Modify `buildFrameProgram()` to interleave effect ops with video/overlay ops
- Add `appliedToClipId` field to `EffectDrawOp` for tracking
- Update `EffectDrawOp` order in final display list

**Acceptance Criteria:**
- ✅ Display-list golden-frame parity tests pass
- ✅ Multi-clip effects render in correct depth order

---

#### Task 13: Parity Tests – Golden-Frame Validation

**Objective:** Ensure all render paths produce identical frames.

**Files to Modify:**
- `src/__tests__/studio-display-list-parity.test.ts` – Add effect test cases

**Key Changes:**
- Add test case: single video + 1 effect
- Add test case: multi-video with overlapping effects
- Add test case: effect with keyframed intensity
- Compare output across legacy and display-list paths

**Acceptance Criteria:**
- ✅ All parity tests pass (no pixel differences)
- ✅ Keyframe interpolation identical across paths

---

#### Task 14: Auto-Migration Metadata & Idempotency

**Objective:** Ensure migration runs once and can be safely re-run.

**Files to Modify:**
- `src/lib/studio/types.ts` – Add migration marker to `StudioTake`
- `src/lib/studio/effects/migrate.ts` – Idempotency checks
- `src/lib/studio/timeline/convert.ts` – Check marker before migrating

**Key Changes:**
- Add `effectsMigratedAt?: number` to `StudioTake`
- Check marker on load; skip migration if present
- Set marker after successful migration
- Validation and logging

**Acceptance Criteria:**
- ✅ First load: migration runs
- ✅ Reload: no duplicate migration
- ✅ Marker persisted correctly

---

#### Task 15: Documentation & Backward Compat Notes

**Objective:** Document changes and migration for future maintainers.

**Files to Create:**
- `EFFECTS_REDESIGN_PLAN.md` (this file)

**Files to Modify:**
- `src/lib/studio/effects/` – Add design doc comments
- `src/lib/studio/types.ts` – Add interface comments
- `src/lib/studio/render/compose.ts` – Add rendering flow docs

**Key Changes:**
- Clear comments on new effect architecture
- Migration rationale
- Dev notes for adding new effect types
- Backward compat notes

**Acceptance Criteria:**
- ✅ Docs complete and accurate
- ✅ Comments clear and helpful

---

## Implementation Order

**Phase 1 (Foundation):**
1. Task 1 – Data model updates
2. Task 2 – Migration layer

**Phase 2 (Rendering):**
3. Task 3 – Render pipeline
4. Task 4 – Keyframe visualization
5. Task 12 – Display-list integration

**Phase 3 (Persistence):**
6. Task 5 – Track elimination
7. Task 6 – Parameter persistence
8. Task 14 – Auto-migration metadata

**Phase 4 (UI):**
9. Task 7 – Inspector effects section
10. Task 8 – Timeline effect cards
11. Task 9 – Keyframe editing
12. Task 10 – Effects palette (optional)

**Phase 5 (Validation):**
13. Task 11 – Remove effects track UI
14. Task 13 – Parity tests
15. Task 15 – Documentation

---

## Success Criteria

### Functional
- ✅ Effects attach to video and overlay clips only
- ✅ Effects render in depth order (per-clip, not global)
- ✅ Intensity is keyframable, params are static
- ✅ Inline timeline cards with right-click menu
- ✅ Double-click to edit (popover), single-click to select, right-click to delete
- ✅ Auto-migration of existing projects

### Quality
- ✅ All parity tests pass (golden-frame consistency)
- ✅ No TypeScript diagnostics
- ✅ Backward compat: old projects load correctly
- ✅ Idempotent migration: safe to re-run

### UX
- ✅ Effects appear on clips in inspector
- ✅ Effect cards visible on timeline
- ✅ Keyframe circles with effect-type colors
- ✅ Clear, intuitive editing workflow

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Data loss during migration | Backup original `take.effects[]`, idempotent migration, validation logging |
| Performance regression | Profile render path, display-list tests ensure parity |
| Multi-track effects ambiguity | Clear depth-order semantics, test coverage for overlap scenarios |
| Backward compat breakage | Migration marker, dual-path support during transition, fallback to old system if needed |

---

## Timeline Estimate

- **Phase 1:** 2–3 hours (types, migration setup)
- **Phase 2:** 4–5 hours (rendering integration, parity tests)
- **Phase 3:** 2–3 hours (persistence, metadata)
- **Phase 4:** 4–5 hours (UI components, popovers, context menus)
- **Phase 5:** 2–3 hours (cleanup, validation, docs)

**Total: ~14–19 hours of focused implementation**

---

## Rollback Plan

If critical issues emerge:
1. Revert data model changes (keep types for compat)
2. Keep migration layer in-place but disable
3. Restore legacy `drawStudioEffects()` global path
4. Keep effects track visible in UI
5. Document issue and retry after fixes

---

## Future Enhancements

- Add effects to shapes and captions (Task 1 scope limited to video/overlays)
- Effect presets library (currently not implemented per requirements)
- Per-param keyframing (currently only intensity is keyframable)
- Effect stacking presets (e.g., "Film" = grain + vignette + scanlines)
- Custom effect plugins (extensible effect catalog)

---

**Document Created:** 2026-11-20 17:50 UTC+2  
**Status:** Ready for implementation
