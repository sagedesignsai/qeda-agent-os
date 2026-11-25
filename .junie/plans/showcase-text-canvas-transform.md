---
sessionId: session-261125-061644-gt9d
---

# Requirements

### Overview & Goals
Enable timeline text clips in Showcase Studio to use the same canvas transform workflow as video clips: a selectable bounding gizmo plus inspector controls for position, scale, rotation, and anchor point. Persist values on the clip and reflect them in preview and export.

### Scope
- **In scope:** `captions` track clips with `itemType: 'text'`; reuse the existing transform interaction and `ClipTransform` payload.
- **Out of scope:** A new transform controller, global subtitle-style changes, or a new keyframe system.
- Preserve the existing appearance and behavior of captions that have not been customized or transformed.

# Technical Design

### Current Implementation
`StudioCanvas.tsx` already measures text bounds, hit-tests caption text, computes text clip geometry, and contains a `selectedGizmo` path for text. However, the selected-clip activity predicate only admits `video` tracks, preventing text clips from reaching the gizmo. `StudioCanvasTransformGizmo.tsx` wraps the existing `TraceTransformGizmo` and sends live previews and committed transforms through `ClipTransform`.

`ClipPropertiesSection.tsx` defines transform eligibility as video and overlay tracks; captions currently expose text and typography controls but not the Transform section. `StudioClipPayload.transform` uses the shared `ClipTransform` contract (position, scale, rotation, anchor point). The existing text render paths in `compose.ts` and `program.ts` apply transforms for free-text clips.

### Proposed Changes
Extend the existing visual-clip eligibility and current-time activity checks in `StudioCanvas.tsx` to include visible, active text clips, retaining measured text bounds and the shared gizmo preview/commit flow. Extend `ClipPropertiesSection.tsx` so text clips expose the same Transform controls and update the same payload contract without replacing the Caption/text-style controls. Keep the existing renderer and shared gizmo; adjust rendering only if regression tests reveal a text-specific gap, and maintain legacy caption rendering unless the clip is customized or transformed.

### Validation
Add or extend tests in `studio-canvas-enhancements.test.tsx` for text selection and gizmo availability, and in `studio-display-list.test.ts` / `studio-display-list-parity.test.ts` for stored transforms and consistent preview/export output. Verify inspector edits update the selected text clip while preserving its typography settings.

# Delivery Steps

### ✓ Step 1: Expose shared Transform properties for text clips
Text clips show the existing Transform inspector controls and persist edits in their `ClipTransform` payload.
- Update transform eligibility and initial section behavior in `src/components/studio/inspector/sections/ClipPropertiesSection.tsx` to include caption-track text clips.
- Reuse the current position, scale, rotation, anchor-point fields and `setTransform` merge logic; leave caption text and typography controls intact.
- Add or extend inspector-focused coverage to verify edits target the text clip and preserve unrelated payload fields.

### ✓ Step 2: Enable text selection and gizmo transforms on the canvas
An active text clip can be selected and manipulated with the same canvas gizmo used for video clips.
- Update the selection-activity predicate in `src/components/studio/StudioCanvas.tsx` to allow visible, active text clips through the existing `selectedGizmo` path.
- Reuse text measurement, clip geometry, `StudioCanvasTransformGizmo`, and its preview/commit callbacks; ensure committed transforms persist and render.
- Extend `src/__tests__/studio-canvas-enhancements.test.tsx` and display-list/parity tests to cover text bounds, transform persistence, and consistent rendered transforms while retaining legacy caption behavior.