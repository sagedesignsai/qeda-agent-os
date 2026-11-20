# Canvas Transform Gizmo Gap Analysis

## Current State

**What Works:** Video and image clips on the video track have full on-canvas transform gizmos:
- ✅ Draggable position handles (X, Y)
- ✅ Rotatable handles (corner rotation)
- ✅ Scalable handles (corner scale with aspect ratio lock)
- ✅ Live preview during drag
- ✅ Anchor point visual indicator
- ✅ Real-time sync with Inspector properties

**What's Missing:** Other clip types (text/captions, shapes, overlays) have properties but no gizmo:
- ❌ Caption clips (track type: 'captions', itemType: 'text')
- ❌ Shape clips (track type: 'captions', itemType: 'shape') — *if added to timeline*
- ❌ Overlay clips (track type: 'overlays', itemType: 'image'/'video')

## Why This Matters

1. **Discoverability:** Users expect visual editing on the canvas, not just inspector panels
2. **Workflow:** Dragging is faster than scrubbing numeric fields
3. **Spatial Reasoning:** Visual placement (especially for overlays and text) is intuitive on canvas
4. **Consistency:** All visual clip types should support the same editing paradigm

## Technical Blockers

### 1. **Gizmo Selection Logic** (`StudioCanvas.tsx:983–1009`)
```typescript
const selectedGizmo = (() => {
  const selected = selectedTimelineClip;
  if (
    !selectedClipActive ||
    !selected ||
    selected.track.type !== 'video',  // 👈 BLOCKER: Only video track
    !selected.track.visible
  ) return null;
  // ... geometry calculation only for video
};
```

**Fix:** Expand to support all visual tracks:
```typescript
const isVisualClip = 
  selected.track.type === 'video' ||
  selected.track.type === 'overlays' ||
  (selected.track.type === 'captions' && selected.clip.itemType === 'text');
```

### 2. **Geometry Calculation** (`StudioCanvas.tsx:107–161`)
The `studioClipCanvasGeometry()` function currently assumes video source dimensions:
- Reads `sourceWidth` / `sourceHeight` from video or media asset
- For text/captions: No source dimensions (text is measured at render time)
- For shapes: Source dimensions come from pathData bounds

**Fix:** Handle each type:
- **Text:** Measure text dimensions using canvas.measureText() at current font/size
- **Shapes:** Use the ShapeClipPayload's pathLengthPx or compute bounds from SVG pathData
- **Overlays:** Already has source dimensions (image/video asset)

### 3. **Canvas Point Translation** 
The gizmo converts client coordinates to canvas space:
```typescript
const getCanvasPoint = useCallback(
  (clientX: number, clientY: number): GizmoPoint => { ... },
  []
);
```

**Status:** ✅ This works for all clip types (coordinate space is universal)

### 4. **Gizmo Preview/Commit** (`StudioCanvas.tsx:1029–1069`)
```typescript
const handleGizmoPreview = useCallback((preview: { transform, origin }) => {
  const selected = selectedGizmoRef.current;
  if (!selected) return;
  
  // Updates clip.payload.transform in preview state
  const newTransform: ClipTransform = {
    position: { x, y },
    scale: { x, y },
    rotation: deg,
  };
  timelineStore.setSelectedClipPreview({ ...selected.clip, payload: { transform: newTransform } });
});
```

**Status:** ✅ This is generic and works for any visual clip type

## Implementation Plan

### Phase 1: Extend Gizmo to Overlays (Low Risk)
- ✅ Overlays already have dimensions (media assets)
- Modify `selectedGizmo` check: `selected.track.type === 'overlays'` → include
- Test with existing PiP overlays
- **Risk:** Low — overlays use same transform model as video

### Phase 2: Extend Gizmo to Captions/Text (Medium Risk)
- ❌ Text has no source dimensions; must compute from rendered font
- Add `textMeasurementContext` to capture rendered text bounding box
- Compute text dimensions from `clip.payload.text`, `styling.captionStyle`, `style.fontSize`
- Must handle multi-line text (measure each line, find bounding box)
- **Risk:** Medium — text layout complexity, font rendering differences

### Phase 3: Extend Gizmo to Shapes (Medium Risk)
- ❌ Shapes have no source dimensions; must compute from pathData
- For named shapes (rect, circle, arrow, callout): Use preset dimensions
- For custom SVG paths: Parse pathData, find bounding box
- **Risk:** Medium — SVG path parsing, bounds calculation

### Phase 4: Unify Transform Model (Optional)
- Ensure all visual clip types use consistent `ClipTransform` structure
- Currently: `clip.payload?.transform` is already used by video, overlays
- **Status:** ✅ Already unified; text/shapes just need adoption

## Files to Modify

1. **`src/components/studio/StudioCanvas.tsx`**
   - Extend `selectedGizmo` check (line ~983)
   - Extend `studioClipCanvasGeometry()` to handle text/shapes (line ~107)
   - Add text measurement helper (new)

2. **`src/lib/studio/types.ts`**
   - Verify `ClipTransform` is defined on all visual payloads ✅ (already there)

3. **`src/components/studio/StudioCanvasTransformGizmo.tsx`**
   - No changes needed (already generic)

4. **Tests**
   - Add unit tests for text bounding box calculation
   - Add unit tests for shape bounds from pathData
   - Add integration tests for gizmo interaction

## Estimated Effort

| Phase | Complexity | Time | Risk |
|-------|-----------|------|------|
| Overlays | Low | 30 min | Low |
| Text | Medium | 2–3 hrs | Medium |
| Shapes | Medium | 2–3 hrs | Medium |
| Unification | Low | 30 min | Low |
| Testing | Medium | 2 hrs | Low |
| **Total** | | **6–8 hrs** | **Low–Medium** |

## Benefits After Implementation

✅ All visual clips editable on canvas with gizmo
✅ Consistent editor UX across clip types
✅ Faster workflow (no context-switching to inspector)
✅ Better spatial reasoning for overlays and text
✅ Preview feedback before commit
✅ Position/scale/rotation all in one interaction

## Known Unknowns

1. **Text measurement:** Does caption rendering use pixel-perfect dimensions?
   - Captions use `drawStudioCaption()` which has its own layout logic
   - Text may need to be measured the same way it's rendered

2. **Shape bounds:** How do we compute pathData bounds accurately?
   - SVG Path2D doesn't expose bounds directly
   - May need to rasterize or use DOM measurement

3. **Multi-line captions:** How should gizmo behave?
   - Wrap to text bounding box? Or fullscreen caption area?
   - Current caption rendering is full-width; transform may need clamping

4. **Overlay positioning:** Current overlays use percentage coords (x, y, widthPct)
   - Should gizmo convert to/from pixel coords?
   - Or update overlay to use pixel transforms like video?
