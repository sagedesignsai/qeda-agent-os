# Implementation Plan: Extend Canvas Transform Gizmo

## Overview
Extend the canvas transform gizmo to work with text clips, shapes, and overlays — not just video.

## Phase 1: Overlays (Quick Win)

### Changes to `StudioCanvas.tsx`

**1. Extend selectedGizmo check (line ~983)**
```typescript
const selectedGizmo = (() => {
  const selected = selectedTimelineClip;
  if (!selectedClipActive || !selected || !selected.track.visible) return null;

  // ✅ Support video, overlays, and visual text
  const isVisualTrack = 
    selected.track.type === 'video' ||
    selected.track.type === 'overlays' ||
    (selected.track.type === 'captions' && selected.clip.itemType === 'text');
  
  if (!isVisualTrack) return null;

  const asset = selected.clip.payload?.mediaAssetId
    ? clipAssetsRef.current.get(selected.clip.payload.mediaAssetId) ??
      mediaAssets.find((candidate) => candidate.id === selected.clip.payload?.mediaAssetId)
    : undefined;

  let sourceWidth = 0;
  let sourceHeight = 0;

  if (selected.track.type === 'overlays' || selected.track.type === 'video') {
    // Media assets: image or video
    sourceWidth = asset?.width ?? (selected.track.id === 'track-video' ? videoRef.current?.videoWidth : 0) ?? 0;
    sourceHeight = asset?.height ?? (selected.track.id === 'track-video' ? videoRef.current?.videoHeight : 0) ?? 0;
  } else if (selected.track.type === 'captions' && selected.clip.itemType === 'text') {
    // Text: measure from rendered caption
    const measured = measureTextClipBounds(selected.clip, styling);
    sourceWidth = measured.width;
    sourceHeight = measured.height;
  }

  if (sourceWidth <= 0 || sourceHeight <= 0) return null;
  
  // ... rest of geometry calculation
};
```

**2. Add text measurement helper**
```typescript
function measureTextClipBounds(
  clip: TimelineClip,
  styling: StudioStyling,
): { width: number; height: number } {
  const text = clip.payload?.text ?? clip.name;
  if (!text) return { width: 300, height: 100 };

  // Create temporary canvas for text measurement
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return { width: 300, height: 100 };

  const style = styling.captionStyle;
  ctx.font = `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
  
  const lines = text.split('\n');
  const metrics = lines.map((line) => ctx.measureText(line));
  
  const width = Math.max(...metrics.map((m) => m.width), 200);
  const lineHeight = style.lineHeight ?? style.fontSize * 1.2;
  const height = lines.length * lineHeight;

  return { width, height };
}
```

**Status:** ✅ Ready for implementation

---

## Phase 2: Shapes (If Timeline Shape Support Added)

### Prerequisite
Shapes need to be added to the timeline first (currently only in display-list rendering).

### Changes needed
1. Create timeline shape tracks
2. Extend `selectedGizmo` to handle shape clips
3. Implement `measureShapeClipBounds()` to compute SVG pathData bounds

### Implementation
```typescript
function measureShapeClipBounds(
  clip: TimelineClip,
): { width: number; height: number } {
  const payload = clip.payload as ShapeClipPayload;
  if (!payload?.pathData) return { width: 100, height: 100 };

  // Use Path2D to measure bounds (requires DOM)
  try {
    const path = new Path2D(payload.pathData);
    // Note: Path2D doesn't expose bounds directly
    // Fallback: use supplied pathLengthPx and assume square
    const size = payload.pathLengthPx ?? 100;
    return { width: size, height: size };
  } catch {
    return { width: 100, height: 100 };
  }
}
```

**Status:** ⏳ Blocked until shapes are added to timeline

---

## Phase 3: Coordinate Space Verification

### Current Video Transform
Video clips use `clip.payload.transform` with these properties:
```typescript
{
  position: { x, y },      // Pixels relative to base position
  scale: { x, y },         // Multiplier (1.0 = 100%)
  rotation: number,        // Degrees
  anchorPoint: { x, y },   // Fraction (0–1) from top-left
}
```

### Overlay Current Model
Overlays use `clip.payload` with:
```typescript
{
  x, y,           // Fraction of frame (0–1)
  widthPct,       // Fraction (0–1)
  opacity,        // 0–1
  rotation,       // Degrees
  cornerRadius,   // Pixels
}
```

### Gap
Overlays use percentage coords; video/text use pixels. The gizmo works in pixel space.

### Solution
Option A: Convert overlays to pixel transform (breaking change)
Option B: Keep overlay coords, convert in getCanvasPoint only
Option C: Store both representations

**Recommendation:** Option C — minimal change, preserves backward compat

---

## Phase 4: Testing Strategy

### Unit Tests
```typescript
describe('measureTextClipBounds', () => {
  it('measures single-line text', () => {
    const clip = { payload: { text: 'Hello' }, name: 'Hello' };
    const bounds = measureTextClipBounds(clip, mockStyling);
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
  });

  it('handles multi-line text', () => {
    const clip = { payload: { text: 'Hello\nWorld' }, name: 'Hello World' };
    const bounds = measureTextClipBounds(clip, mockStyling);
    expect(bounds.height).toBeGreaterThan(100); // 2 lines
  });
});
```

### Integration Tests
```typescript
describe('Canvas Gizmo - Extended Clip Types', () => {
  it('shows gizmo for overlay clips', () => {
    // Render with overlay clip selected
    // Assert gizmo is visible
  });

  it('dragging gizmo on overlay updates position', () => {
    // Drag gizmo
    // Assert clip.payload.x/y updated
  });

  it('text clip gizmo uses measured bounds', () => {
    // Select text clip
    // Assert gizmo size matches text measurement
  });
});
```

---

## Rollout Plan

### Week 1: Overlays
- [ ] Implement overlay gizmo support
- [ ] Add text measurement helper
- [ ] Test overlay drag/scale
- [ ] Update inspector to sync with gizmo

### Week 2: Text/Captions
- [ ] Extend measurement to work for captions
- [ ] Handle multi-line caption bounds
- [ ] Test caption positioning
- [ ] Add UI indicator for text clip gizmo

### Week 3: Shapes (If approved)
- [ ] Design timeline shape track UI
- [ ] Implement shape gizmo support
- [ ] Test shape transform

### Week 4: Polish & Docs
- [ ] Fix edge cases (very long text, complex SVG)
- [ ] Performance optimization (avoid remeasuring every frame)
- [ ] Documentation & help text
- [ ] Video tutorial

---

## Risk Mitigation

### Risk 1: Text measurement divergence
**Problem:** Gizmo-measured text bounds ≠ rendered text bounds
**Mitigation:** Use exact same measurement code as caption renderer

### Risk 2: Overlay coord confusion
**Problem:** Overlays use fractions; gizmo uses pixels
**Mitigation:** Keep overlay model, convert at boundary only

### Risk 3: Performance regression
**Problem:** Text measurement on every frame
**Mitigation:** Cache measurement, invalidate on text/style change

### Risk 4: Breaking changes
**Problem:** Existing overlay positions might be affected
**Mitigation:** Backward compat tests, optional flag to enable gizmo

---

## Dependencies

- ✅ Canvas transform already unified (ClipTransform)
- ✅ Gizmo component is generic
- ✅ Inspector already has transform controls
- ❌ Text measurement (new, low complexity)
- ⏳ Shape support (blocked on timeline shape tracks)

---

## Success Criteria

- [ ] All visual clip types show gizmo when selected
- [ ] Gizmo drag/scale/rotate works for all types
- [ ] Inspector and gizmo stay in sync
- [ ] Measurement accuracy ±5% for text
- [ ] Performance <16ms per frame (60 fps)
- [ ] No breaking changes to existing workflows
