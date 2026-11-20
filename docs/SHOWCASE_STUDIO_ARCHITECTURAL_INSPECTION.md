# ShowcaseStudio — Architectural Inspection

> A thorough inspection of the ShowcaseStudio video composing system from the perspective of a professional editor (CapCut / After Effects).

---

## Executive Summary

ShowcaseStudio is a **production-ready video composing engine** built on a clean three-layer architecture: **domain types → timeline evaluation → canvas rendering**. The core pipeline is deterministic, frame-accurate, and shares the same evaluation path between preview and export — the single most important property a serious editor needs for WYSIWYG guarantees.

The system currently supports: multi-track timelines with 6 track types, cut-centered transitions, kinetic camera with frame-rate-independent smoothing, per-clip transforms and animations, universal keyframes with easing, canvas post-processing effects, audio mixing with Web Audio API, and deterministic offline export via WebCodecs.

**What's strong:** The architectural foundation — type system, evaluation pipeline, compositing order, time-domain separation, and export determinism — is exactly how professional editors are structured. The missing features are **additions, not refactors**.

**What's needed:** The rendering architecture that enables everything beyond the current feature set: color grading, masking, chroma key, speed ramping, audio-reactive visuals, text layers, and effect parameterization. This document analyzes the current state and proposes the rendering architecture to support these capabilities.

---

## 1. System Architecture Overview

### 1.1 Three-Layer Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: Domain Types (types.ts)                              │
│  Canonical persisted model: StudioTake, StudioClip, StudioTrack │
│  Single source of truth — timeline is a projection, not origin  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2: Timeline Evaluation (timeline/evaluate.ts)            │
│  Time-domain → Frame description                                │
│  Given a playhead time, resolves all active clips, source times │
│  transitions, and paint order. Pure function, no side effects.  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3: Canvas Rendering (render/compose.ts + friends)        │
│  Frame description → Pixels                                     │
│  Single composition pass with defined paint order               │
│  Preview: rAF loop in StudioCanvas                              │
│  Export: frame-by-frame seek in export-renderer                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Architectural Properties

| Property | Status | Notes |
|----------|--------|-------|
| Preview/Export parity | ✅ | Both use `evaluateEditorTimeline()` and `drawStudioFrame()` |
| Deterministic export | ✅ | Frame-by-frame seeking, no real-time dependency |
| Frame-rate independence | ✅ | Camera uses `stepCameraWithDelta()` with measured frame delta |
| Audio parity | ✅ | `mixAudioSamples()` is pure array math, no AudioContext |
| Time-domain evaluation | ✅ | `evaluateEditorTimeline(timeMs)` is framework-agnostic |
| Layer ordering | ✅ | Positional array order, no zIndex drift |
| Undo/redo | ✅ | Timeline store with snapshot-based undo |

---

## 2. Core Systems Deep Dive

### 2.1 Type System (`types.ts` — 826 lines)

**Role:** Canonical domain model, shared by main and renderer processes.

**Key Types:**
- `StudioTake` — Top-level project container with media pool, tracks, cuts, zooms, captions, effects, overlays, and styling
- `StudioClip` — Fundamental timeline building block with transforms, animations, device frames, and payload
- `StudioTrack` — Named track with clips; ordering is positional (no `zIndex`)
- `StudioClipPayload` — Flat optional bag carrying media references, keyframes, effect data, transition data, and visual properties
- `StudioKeyframe` — Universal property-addressed keyframe: `{ timeMs, property, value, easing }`
- `StudioComposition` — Multi-scene multi-layer composition with aspect-ratio-aware layouts

**Strengths:**
- Clean separation between persisted model (`StudioTake`) and timeline projection (`TimelineClip`)
- `StudioClipPayload` as a flat bag allows partial patches without wiping sibling keys
- Keyframes are property-addressed strings, not hardcoded enums — extensible without type changes
- `ClipTransform` with optional fields supports partial updates from inspector

**Limitations:**
- `StudioClipPayload` is a flat bag — no discriminated union, so type safety relies on runtime checks
- Effects are defined by type string + intensity — no per-effect parameter schema
- No native support for mask paths, blend modes, or color correction data

### 2.2 Timeline Evaluation (`timeline/evaluate.ts` — 211 lines)

**Role:** Time-domain boundary between editable track data and renderers.

**Key Function:** `evaluateEditorTimeline(tracks, timeMs) → EditorTimelineFrame`

**What it produces:**
```typescript
interface EditorTimelineFrame {
  video: EvaluatedTimelineClip[];    // In paint order
  audio: EvaluatedTimelineClip[];
  effects: EvaluatedTimelineClip[];
  transitions: EvaluatedTimelineClip[];
  captions: EvaluatedTimelineClip[];
  overlays: EvaluatedTimelineClip[];
}
```

**Transition System:** Cut-centered transitions using `fromClipId`/`toClipId` pairing. The transition clip sits at the cut point, and both participants are evaluated with role-based opacity/progress. This is architecturally correct — transitions are edit-point operations, not clip properties.

**Speed Handling:** Uses `integratedSpeedAtMs()` from `keyframes.ts` for time-remap support. With no speed keyframes, falls back to linear `sourceRate`.

**Strengths:**
- Pure function — no side effects, fully testable
- Returns evaluated clips with computed `sourceTimeMs` and `localTimeMs`
- Transition participants carry role and progress for compositing
- Paint order from shared `trackPaintOrder()` — evaluator can't disagree with store

### 2.3 Compositing Engine (`render/compose.ts` — 450 lines)

**Role:** Single composition pass for a Studio preview frame.

**Paint Order (bottom → top):**
1. Wallpaper + ambient glow
2. Window shadow
3. Active video clips, bottom track to top track, clipped to rounded window
4. Media overlays (picture-in-picture)
5. Canvas effect passes (spotlight, vignette, neon-glow, film-grain, scanlines)
6. Window chrome / device frame
7. Captions

**Clip Compositing:** Each video clip is drawn with:
- Source rect from camera or crop
- Cover crop for full-canvas clips, native aspect for PiP
- Transform: position, scale, rotation, anchor point
- Animation: enter/exit phases via GSAP evaluator
- Universal keyframes: x, y, scale, rotation, opacity
- Transition: fade, slide, scale, blur with role-based opacity
- Device frame overlay
- Per-clip opacity

**Strengths:**
- Single function, single paint order — preview and export can't diverge
- Transform chain is well-structured: translate → anchor → scale → rotate → draw
- Transition handling supports both cut-centered (paired) and legacy modes
- Keyframe values override animation values — proper precedence

**Limitations:**
- All compositing is Canvas 2D `drawImage()` — no blend modes, no masking, no color grading
- Effects are post-process overlays — not per-clip
- No support for adjustment layers, track mattes, or luminance keys
- Captions and effects are legacy/deprecated subsystems dating from the early automated screen-recording showcase tool (prior to the multi-track CapCut/AE restructuring), bridged into the timeline as compatibility projections rather than true layer-native graphic/shader nodes.

### 2.4 Camera System (`render/camera.ts` — 133 lines)

**Role:** Kinetic camera with frame-rate-independent smoothing.

**Key Functions:**
- `computeCameraTarget()` — Resolves active zoom keyframe into scale/pan target with easing
- `stepCameraWithDelta(current, target, easing, dtMs)` — Frame-rate-independent lerp
- `cameraSourceRect(camera, videoWidth, videoHeight)` — Source crop clamped to frame

**Smoothing:** `alpha = 1 - (1 - smoothing60)^(dtMs / 16.667)` ensures identical motion on 60 Hz, 120 Hz, and export.

**Strengths:**
- Render-loop concern, not React state — correct architectural placement
- Frame-rate independence — preview/export convergence
- Look-ahead/look-behind for smooth zoom transitions

### 2.5 Effects System (`render/effects.ts` — 228 lines)

> **Historical Context:** The current effects catalog (and captions system) originates from the earlier automated screen-recording showcase tool, before Showcase Studio was restructured into a multi-track CapCut/AE-like NLE. They currently exist as fixed global canvas passes rather than modular clip-level shaders.

**Role:** Canvas compositing passes for visual effects.

**Current Effects (5):**
| Effect | Technique | Quality |
|--------|-----------|---------|
| Spotlight | Radial gradient alpha falloff | Good |
| Vignette | Radial gradient darkening | Good |
| Neon-glow | Additive bloom via `globalCompositeOperation: 'lighter'` + `shadowBlur` | Good |
| Film-grain | Cached noise tile with random offset | Good |
| Scanlines | Cached 1×4 line tile rolled by time | Good |

**Strengths:**
- Lazy tile creation on offscreen canvas
- Graceful degradation in non-DOM environments (jsdom)
- Intensity parameter (0..1) for all effects

**Limitations:**
- Effects are post-process overlays on the entire frame — not per-clip
- No effect parameterization beyond intensity
- No effect stacking or blending
- No keyframeable effect parameters (though `intensity` keyframes are supported on effect clips)

### 2.6 Audio System (`audio/mixer.ts` + `audio/schedule.ts`)

**Role:** Real-time preview mixing and export audio encoding.

**Preview Path:**
- `StudioAudioMixer` class with `sync()` API
- One `AudioBufferSourceNode` per active clip
- Drift guard resyncs at 120ms
- Per-clip volume × per-track volume × mute
- On-demand buffer decoding with cache

**Export Path:**
- `mixAudioSamples()` — Pure array math, no AudioContext
- Speed-adjusted sample reading with linear interpolation
- Stereo output with proper channel handling
- Silence emission for empty audio frames

**Strengths:**
- Clean separation: planning (`schedule.ts`) vs runtime (`mixer.ts`)
- Preview/export parity — same rate calculation
- Proper click-free gain changes via `setTargetAtTime`
- Drift guard prevents audio/video desync

**Limitations:**
- No pitch-preserving time-stretch (uses native `playbackRate`)
- No audio effects (EQ, compression, noise reduction)
- No beat detection or audio-reactive features
- No audio ducking or sidechain

### 2.7 Keyframe System (`keyframes.ts` — 329 lines)

**Role:** Universal property-addressed keyframes on clips.

**Capabilities:**
- Property-addressed: any string property name
- Easing support: cubic-bezier, GSAP-style easings (power2, power3, expo, sine, circ, back, elastic, bounce)
- Time-remap: speed keyframes with trapezoidal integration
- Clip-level convenience: `evaluateClipKeyframeValues()` for x, y, scale, rotation, opacity, intensity

**Strengths:**
- Extensible property namespace — adding new animatable properties doesn't require type changes
- Proper hold behavior before first and after last keyframe
- Cached speed integral for performance
- Easing evaluation supports custom cubic-bezier strings

**Currently Animatable Properties:**
- Transform: `x`, `y`, `scale`, `rotation`, `opacity`
- Time remap: `speed`
- Effects: `intensity`

### 2.8 Animation System (`animation-evaluator.ts` — 414 lines)

**Role:** GSAP-based clip animation evaluator for enter/exit animations.

**Architecture:** Uses GSAP as a deterministic clock/evaluator, not as a DOM animator. The canvas reads animation state from GSAP's timeline progress.

**Three-Phase Model:** Enter → Visible (hold) → Exit

**Strengths:**
- GSAP timeline caching by keyframe hash
- Preset system with `generateKeyframes()`
- Proper phase handling — enter and exit don't interfere

### 2.9 Export Renderer (`render/export-renderer.ts` — 889 lines)

**Role:** Frame-by-frame offline composition renderer.

**Approach:** Fully offline and deterministic:
1. For each frame at `t = n / fps`, seek video to exact timestamp
2. Draw full composition at that time coordinate
3. Capture via `VideoFrame` (WebCodecs API)
4. Encode with `VideoEncoder` (VP9/VP8, hardware-accelerated)
5. Mux with `WebMMuxer`, stream via IPC to main process
6. Main process hands to ffmpeg for final MP4/GIF transcode

**Audio:** Decodes all audio clips ahead of time, mixes per-frame with `mixAudioSamples()`, encodes with `AudioEncoder` (Opus), muxes into WebM.

**Strengths:**
- No real-time dependency — no dropped frames, no jank
- Hardware-accelerated encoding
- Batched encoder flush to manage memory
- Profile mode for performance debugging
- Preview/export share the same compositing function

### 2.10 Composition System (`composition.ts` — 752 lines)

**Role:** Multi-scene multi-layer compositions with templates.

**Scenes:**
- `app-spotlight` — Single recording, full canvas
- `desktop-mobile-comparison` — Two recordings, split layout

**Features:**
- Aspect-ratio-aware layouts (16:9, 9:16, 1:1, 4:3)
- Template system with instantiation
- Layer reordering with zIndex
- Per-layer transitions
- Effects on compositions

### 2.11 Time Mapping (`timeline/ripple.ts` — 204 lines)

**Role:** Two time axes and the mapping between them.

**Source Time:** What the recording file contains. All persisted elements authored in source time.

**Composition Time:** What the viewer sees. Source with cuts excised.

**Key Functions:**
- `compFromSource()` — Source → Composition
- `sourceFromComp()` — Composition → Source
- `normalizeCuts()` — Sort, clamp, merge
- `keptSegments()` — Source spans surviving cuts

**Strengths:**
- Pure, UI-free — preview, exporter, and timeline projection all share it
- Cut seams resolve to end of cut — no landing on removed frames

### 2.12 Layer Ordering (`timeline/layers.ts` — 128 lines)

**Role:** Single source of truth for track ordering.

**Invariant:** Timeline row order IS layer order. Index 0 = top row = painted last.

**Lane Order:** effects → captions → transitions → overlays → video → audio

**Strengths:**
- No `zIndex` — positional array order prevents drift
- Shared by store, converter, and evaluator
- Type-safe lane boundaries

---

## 3. Rendering Architecture Analysis

### 3.1 Current Rendering Model

The current rendering model is **Canvas 2D raster compositing**:

```
For each frame:
  1. Evaluate timeline at time T → EditorTimelineFrame
  2. For each video clip (bottom to top):
     a. Compute source rect (camera or crop)
     b. Apply cover crop for aspect ratio
     c. Apply transform (translate, scale, rotate)
     d. Apply animation (enter/exit)
     e. Apply keyframes (x, y, scale, rotation, opacity)
     f. Apply transition (fade, slide, scale, blur)
     g. drawImage(source, dest)
  3. Draw overlays
  4. Draw effects (post-process)
  5. Draw chrome
  6. Draw captions
```

**This is a raster pipeline.** Every operation produces pixels. There is no intermediate vector or scene graph representation.

### 3.2 What This Means for Extensibility

| Feature | Canvas 2D Feasibility | Notes |
|---------|----------------------|-------|
| Color grading | ⚠️ Limited | Per-pixel manipulation via `getImageData()` is slow; WebGL shader is better |
| LUTs | ❌ Not feasible | Requires per-pixel color space transformation — WebGL only |
| Masking | ⚠️ Limited | `ctx.clip()` works for simple shapes, but not for rotoscoping or track mattes |
| Chroma key | ❌ Not feasible | Per-pixel color comparison — WebGL shader required |
| Blend modes | ⚠️ Limited | `globalCompositeOperation` supports some modes, but not all (e.g., no "difference" in all browsers) |
| Text layers | ⚠️ Limited | `ctx.fillText()` works but no rich text, no text animations, no text paths |
| Audio-reactive | ✅ Feasible | Can read audio levels and drive canvas properties |
| Speed ramping | ✅ Implemented | Via speed keyframes with trapezoidal integration |
| Effect parameters | ⚠️ Limited | Current effects use Canvas 2D primitives; complex effects need WebGL |
| Adjustment layers | ⚠️ Limited | Can apply post-process to entire frame, but per-region adjustment needs WebGL |
| Glow/bloom | ⚠️ Limited | Current neon-glow uses `shadowBlur`; proper multi-pass bloom needs WebGL |
| Motion blur | ❌ Not feasible | Requires multi-sample accumulation — WebGL or offscreen canvases |

### 3.3 The Rendering Architecture Question

You asked about the "rendering system" — the architecture for everything rendered on canvas and in final export. The core question is:

**How do systems like After Effects and Rive handle rendering?**

#### After Effects Approach
After Effects uses a **scene graph + render engine** model:
1. **Scene Graph:** Every layer is a node with properties (transform, effects, masks, blend mode)
2. **Render Engine:** Iterates the scene graph, applying effects as **filters** in a pipeline
3. **Effect Pipeline:** Each effect is a plugin that processes pixels, with access to previous effect output
4. **GPU Acceleration:** Modern AE uses Mercury GPU acceleration for effects rendering

#### Rive Approach
Rive uses a **vector scene graph + rasterization** model:
1. **Vector Artboards:** Everything is defined as vector shapes, state machines, and interactions
2. **State Machines:** Drive animation through state transitions, not keyframes
3. **Rasterization:** Vector shapes are rasterized to canvas at render time
4. **Interactivity:** Built-in event system for user interaction

#### What ShowcaseStudio Uses Today
ShowcaseStudio uses a **direct raster compositing** model:
1. **Timeline Evaluation:** Resolves what's active at each time
2. **Direct Drawing:** Each clip is drawn directly to canvas with transforms
3. **Post-process:** Effects are drawn as overlays after all clips

### 3.4 Recommended Rendering Architecture for Future Features

To support the full range of professional editor features, ShowcaseStudio needs to evolve from direct raster compositing to a **layered rendering architecture**:

```
┌─────────────────────────────────────────────────────────────────┐
│  TIMELINE EVALUATION (evaluateEditorTimeline)                   │
│  → EditorTimelineFrame with all active clips                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  SCENE GRAPH CONSTRUCTION                                       │
│  → LayerNode[] with properties, effects, masks, blend modes     │
│  → Each node: transform, source, effects[], masks[], blendMode  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  RENDER PIPELINE                                                │
│                                                                  │
│  ┌─ Pass 1: Source Drawing ─────────────────────────────────┐   │
│  │  For each layer: draw source with transform              │   │
│  │  → Offscreen canvas per layer                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              ↓                                   │
│  ┌─ Pass 2: Per-Layer Effects ─────────────────────────────┐   │
│  │  For each layer: apply effect pipeline                   │   │
│  │  → Each effect reads previous output, writes new output  │   │
│  │  → WebGL shaders for pixel operations                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              ↓                                   │
│  ┌─ Pass 3: Compositing ───────────────────────────────────┐   │
│  │  Composite layers with blend modes, masks, opacity      │   │
│  │  → WebGL blend operations                               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              ↓                                   │
│  ┌─ Pass 4: Post-Process ──────────────────────────────────┐   │
│  │  Full-frame effects: color grading, LUTs, bloom, etc.   │   │
│  │  → WebGL fullscreen shaders                             │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  OUTPUT                                                         │
│  → Canvas 2D for preview (readPixels from WebGL)               │
│  → VideoFrame for export (direct WebGL capture)                │
└─────────────────────────────────────────────────────────────────┘
```

### 3.5 Implementation Path

The rendering architecture can be evolved incrementally without breaking existing features:

#### Phase 1: Offscreen Canvas per Layer (Canvas 2D)
- Each clip draws to its own offscreen canvas
- Effects apply to the layer's offscreen canvas
- Final compositing blends layers with `globalCompositeOperation`
- **Enables:** Per-clip effects, blend modes, track mattes (alpha)
- **No WebGL required**

#### Phase 2: WebGL Effect Pipeline
- Introduce WebGL context for effect processing
- Each effect becomes a shader that processes layer's texture
- Effects chain: output of one effect is input to the next
- **Enables:** Color grading, LUTs, chroma key, proper bloom, motion blur
- **Canvas 2D fallback** for effects that don't need WebGL

#### Phase 3: Scene Graph Abstraction
- Introduce `LayerNode` type as intermediate representation
- Timeline evaluation produces scene graph, not direct draw calls
- Render pipeline consumes scene graph
- **Enables:** Adjustment layers, nested compositions, pre-comps
- **Decouples** evaluation from rendering completely

#### Phase 4: Text and Vector Layers
- Add text layer type with rich text support
- SVG path rendering for shapes and masks
- Text animations via keyframed text properties
- **Enables:** Kinetic typography, shape layers, mask animations

---

## 4. Feature Gap Analysis

### 4.1 Current vs. Professional Editor Capabilities

| Area | Current State | Professional Editor Gap | Rendering Architecture Needed |
|------|---------------|------------------------|-------------------------------|
| **Effects** | 5 canvas effects, intensity-only | Keyframeable parameters, effect stacking, presets | Phase 2: WebGL effect pipeline |
| **Color** | None | Color grading, LUTs, scopes, primary/secondary correction | Phase 2: WebGL shaders |
| **Keyframes** | Transform + speed + intensity | Universal keyframing on any property | Phase 3: Scene graph |
| **Masking** | None | Shape masks, rotoscoping, track mattes | Phase 1: Offscreen canvases + clip() |
| **Blend Modes** | None | Multiply, screen, overlay, difference, etc. | Phase 1: globalCompositeOperation |
| **Text** | Captions with timing | Free-form text layers, text animations, kinetic typography | Phase 4: Text layers |
| **Green Screen** | None | Chroma key, luminance key | Phase 2: WebGL chroma key shader |
| **Speed Ramping** | Static speed + keyframes | Variable speed curves, time remapping | ✅ Already supported via keyframes |
| **Audio-Reactive** | None | Beat-synced effects, audio spectrum visualization | Phase 2: Audio analysis + effect input |
| **Adjustment Layers** | None | Effects that apply to all layers below | Phase 3: Scene graph with adjustment nodes |
| **Pre-comps** | Compositions (limited) | Nested compositions, pre-rendered layers | Phase 3: Nested scene graphs |
| **Motion Blur** | None | Per-layer motion blur | Phase 2: Multi-pass WebGL |
| **Templates** | Motion card presets | Full project templates, element libraries | UI layer, not rendering |

### 4.2 What the Current Architecture Supports Directly

The following features can be added **without changing the rendering architecture**:

- ✅ **More effects** — Add new cases to `drawStudioEffects()` using Canvas 2D primitives
- ✅ **Effect keyframes** — Already supported via `intensity` keyframes on effect clips
- ✅ **Speed ramping** — Already supported via speed keyframes
- ✅ **More transitions** — Add new transition types to the cut-centered system
- ✅ **Per-clip device frames** — Already supported
- ✅ **Audio track mixing** — Already supported with proper volume/mute
- ✅ **Waveform visualization** — Already computed, needs UI rendering
- ✅ **Ripple operations** — Already implemented in `timeline/ripple.ts`

### 4.3 What Requires Rendering Architecture Changes

The following features **require the layered rendering architecture**:

- 🔶 **Color grading** — Per-pixel color manipulation, WebGL shader
- 🔶 **LUTs** — 3D color space transformation, WebGL only
- 🔶 **Chroma key** — Per-pixel color comparison, WebGL shader
- 🔶 **Track mattes** — Alpha from one layer masks another, offscreen canvas
- 🔶 **Blend modes** — Beyond what `globalCompositeOperation` supports
- 🔶 **Adjustment layers** — Effects that apply to composite of layers below
- 🔶 **Motion blur** — Multi-sample accumulation, WebGL
- 🔶 **Text layers** — Rich text, text animations, text paths
- 🔶 **Audio-reactive** — Audio analysis feeding effect parameters

---

## 5. Comparison with Professional Editors

### 5.1 After Effects

| Aspect | After Effects | ShowcaseStudio | Gap |
|--------|--------------|----------------|-----|
| Layer model | Scene graph with nested compositions | Flat track array with paint order | Moderate — needs scene graph for pre-comps |
| Effects | Plugin-based, per-pixel, keyframeable | Canvas 2D post-process, intensity-only | High — needs WebGL effect pipeline |
| Keyframes | Any property, any layer | Transform, speed, intensity | Moderate — property namespace is extensible |
| Masks | Shape masks, rotoscoping, track mattes | None | High — needs offscreen canvases + WebGL |
| Color | Primary/secondary correction, LUTs, scopes | None | High — needs WebGL shaders |
| Text | MoText, kinetic typography, text layers | Captions only | High — needs text layer system |
| Compositing | Blend modes, adjustment layers, pre-comps | Paint order only | High — needs scene graph |
| Export | Media Encoder, multiple formats | WebCodecs VP9/VP8 + ffmpeg | Low — export pipeline is solid |
| Preview | QPEG, Mercury GPU | Canvas 2D rAF loop | Moderate — WebGL would improve quality |

### 5.2 CapCut

| Aspect | CapCut | ShowcaseStudio | Gap |
|--------|--------|----------------|-----|
| Templates | Rich template ecosystem | Motion card presets | High — needs template system |
| Effects | Keyframeable, stacked, with presets | 5 effects, intensity-only | High — needs effect parameterization |
| Transitions | Large library, previewable | Cut-centered, 8 types | Low — transition system is solid |
| Text | Free-form, animated, styled | Captions with timing | High — needs text layer system |
| Audio | Beat detection, ducking, effects | Basic mixing | Moderate — needs audio analysis |
| Color | Filters, basic grading | None | High — needs color pipeline |
| Speed | Variable speed curves | Speed keyframes | Low — keyframe system supports it |
| Export | Multiple resolutions, formats | WebCodecs + ffmpeg | Low — export is flexible |

### 5.3 Rive

| Aspect | Rive | ShowcaseStudio | Gap |
|--------|------|----------------|-----|
| Artboards | Vector scene graph | Canvas 2D raster | High — different paradigms |
| Animation | State machines | Keyframes + GSAP | Different — both valid |
| Interactivity | Built-in event system | None | N/A — different use case |
| Export | Runtime SDK, not video | Video export | N/A — different output |
| Design | Vector-first, interactive | Video-first, linear | N/A — different domain |

---

## 6. Recommendations

### 6.1 Short-Term (No Architecture Changes)

These can be implemented with the current rendering model:

1. **More Canvas Effects** — Add effects like: freeze frame, pixelate, sepia, duotone, glitch, shake
2. **Effect Presets** — Pre-configured effect combinations with named presets
3. **Transition Library** — Expand from 8 to 20+ transition types
4. **Caption Styling** — Rich caption styles with fonts, colors, backgrounds
5. **Audio Waveform UI** — Render pre-computed waveforms in timeline
6. **Clip Speed UI** — Visual speed ramp editor in timeline

### 6.2 Medium-Term (Phase 1: Offscreen Canvases)

Requires introducing per-layer offscreen canvases:

1. **Blend Modes** — Multiply, screen, overlay, difference via `globalCompositeOperation`
2. **Track Mattes** — Alpha matte from one layer masks another
3. **Per-Clip Effects** — Effects that apply to individual clips, not just post-process
4. **Shape Masks** — Simple shape masks via `ctx.clip()`
5. **Adjustment Layers** — Post-process effects that apply to composite of layers below

### 6.3 Long-Term (Phase 2-3: WebGL + Scene Graph)

Requires WebGL integration and scene graph abstraction:

1. **Color Grading** — Primary/secondary color correction with WebGL shaders
2. **LUTs** — 3D LUT application for color grading
3. **Chroma Key** — Green/blue screen removal
4. **Motion Blur** — Per-layer motion blur with multi-pass accumulation
5. **Text Layers** — Rich text with animations, paths, and styling
6. **Audio-Reactive** — Beat detection driving effect parameters
7. **Nested Compositions** — Pre-comps with independent timelines
8. **Advanced Effects** — Glow, bloom, lens distortion, etc.

### 6.4 Rendering Architecture Decision

The key architectural decision is **when to introduce WebGL**:

| Approach | Pros | Cons |
|----------|------|------|
| **Canvas 2D only** | Simple, works everywhere, easy to debug | Limited effects, slow per-pixel ops |
| **Canvas 2D + WebGL effects** | Best of both worlds, incremental | Two rendering contexts, complexity |
| **Full WebGL** | Maximum flexibility, GPU acceleration | Complex, loses Canvas 2D simplicity |

**Recommendation:** Start with **Canvas 2D + offscreen canvases** (Phase 1). This enables blend modes, track mattes, and per-clip effects without WebGL complexity. Introduce WebGL selectively for effects that truly need it (color grading, chroma key, motion blur).

This matches how **CapCut** and **DaVinci Resolve** approach it: the core compositing is raster-based, with GPU acceleration for specific effects.

---

## 7. Code Quality Assessment

### 7.1 Strengths

- **Pure functions:** Evaluation, mixing, and time mapping are all pure — easy to test, no side effects
- **Single source of truth:** Types in one file, layer ordering in one file, time mapping in one file
- **Preview/Export parity:** Both paths use the same evaluation and compositing functions
- **Good documentation:** Module headers explain purpose, invariants, and design decisions
- **Type safety:** TypeScript throughout with proper interfaces
- **Performance considerations:** Cached gradients, lazy tile creation, speed integral cache

### 7.2 Areas for Improvement

- **StudioClipPayload:** Flat bag pattern loses type safety; consider discriminated unions for known payload types
- **Effect system:** Hardcoded switch statement in `drawStudioEffects()` — consider plugin registry pattern
- **Caption rendering:** Text on canvas is limited — consider HTML overlay for rich text
- **Error handling:** Some silent failures (e.g., overlay decode errors) could benefit from warnings
- **Test coverage:** Core modules have tests, but UI components and integration tests are sparse

---

## 8. Conclusion

ShowcaseStudio has a **solid, extensible foundation** that matches the architectural patterns of professional video editors. The three-layer pipeline (types → evaluation → rendering) is correct. The preview/export parity is achieved. The time-domain evaluation is clean.

The current rendering model — direct Canvas 2D compositing — is appropriate for the current feature set. To support professional-grade features (color grading, masking, chroma key, text layers), the rendering architecture needs to evolve to a **layered model with offscreen canvases and selective WebGL effects**.

This evolution can be done **incrementally** without breaking existing features. Phase 1 (offscreen canvases) enables blend modes, track mattes, and per-clip effects. Phase 2 (WebGL) enables color grading, chroma key, and motion blur. Phase 3 (scene graph) enables adjustment layers, pre-comps, and nested compositions.

The core doesn't need to be rewritten. It needs to be **extended with a rendering pipeline** that sits between timeline evaluation and canvas drawing — a scene graph that describes what to render, and a render pipeline that processes it through multiple passes.

This is exactly how After Effects, CapCut, and DaVinci Resolve are structured at their core.
