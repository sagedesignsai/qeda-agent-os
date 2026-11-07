# NovaTrace System Capabilities

> Capability discovery documentation for the NovaTrace copilot.
> The copilot reads this before generating compositions to ground output in real system capabilities.

## Overview

NovaTrace is a 2D vector motion graphics workspace. A **TraceProject** is a declarative document
containing SVG elements, keyframe-animated property tracks, gradients, a storyboard with scenes,
and optional audio tracks. Projects render at 60–120fps via a GSAP-driven DOM renderer and
export to animated SVG or GSAP code.

## Core Data Model

### TraceProject
```
{ id, name, width, height, durationMs, fps, elements: Record<id, TraceElement>, rootElementIds,
  defs?, gradients?, audioTracks?, storyboard? }
```
- Default canvas: 1920×1080 @ 60fps, 6000ms duration
- Other common sizes: 1280×720, 1080×1920 (vertical/reels)

### TraceElement
```
{ id, name, type, visible, locked, sceneId, attributes: Record<string, any>,
  origin: {x, y}, tracks: PropertyTrack[], parentId?, childrenIds? }
```
- `origin` is the rotation/scale pivot in element-local coordinates
- `attributes` hold the static/base values (animated properties overlay on top)
- Position convention: `baseX/baseY` = layout position, `x/y` = animation offset.
  When no base pair exists, `x/y` IS the position.

### Element Types
| Type | Purpose | Key Attributes |
|------|---------|----------------|
| `text` | Text labels, headings | text, fontSize, fontWeight, fontFamily, fill, letterSpacing, textAnchor, dominantBaseline |
| `rect` | Rectangles, cards, backgrounds | width, height, rx, ry, fill, stroke, strokeWidth |
| `circle` | Bullets, dots, rings | width(=diameter), fill |
| `ellipse` | Ovals | width, height, fill |
| `line` | Dividers, connectors | x1, y1, x2, y2, stroke, strokeWidth |
| `polyline` | Open shapes | points ("x,y x,y ..."), stroke |
| `polygon` | Closed shapes, stars | points or polygonSides, fill |
| `path` | SVG paths, logos, icons | d (SVG path data), fill, stroke, trimStart, trimEnd |
| `image` | Raster images | href, width, height |
| `use` | SVG instances | href, width, height |
| `group` | Container for nested elements | childrenIds, opacity, isolate |

## Animation System

### PropertyTrack
```
{ id, property: AnimatableProperty, label, keyframes: Keyframe[] }
```

### Keyframe
```
{ id, timeMs, value: number|string, easing: EasingType }
```

### Animatable Properties
| Property | Applies To | Value Type | Notes |
|----------|-----------|------------|-------|
| x, y | All | number | Position (offset from baseX/baseY when present) |
| scaleX, scaleY | All | number | 1.0 = identity |
| rotation | All | number | Degrees |
| opacity | All | number | 0–1 |
| fillOpacity | All | number | 0–1 |
| fill | shapes, text | color | Hex or rgb() — interpolated as color |
| stroke | shapes | color | Hex or rgb() |
| strokeWidth | shapes | number | Pixels |
| strokeDashoffset | shapes | number | For draw-on animations |
| fontSize | text | number | Pixels |
| letterSpacing | text | number | Pixels |
| text | text | string | Supports typewriter interpolation (progressive char slicing) |
| width, height | shapes | number | Bounding box dimensions |
| rx | rect | number | Corner radius |
| pathProgress | path-bound | number | 0–100, position along a motion path |
| trimStart, trimEnd, trimOffset | path | number | 0–100, AE "Trim Paths" for draw-on effects |
| morphProgress | path | number | 0–100, path morphing |
| boxShadow | rect, text | string | CSS box-shadow |
| filter | All | string | SVG filter reference: `url(#filterId)` (defined in defs). Animatable: switches filter at keyframes. |
| backgroundColor | rect | color | |
| color | text | color | |
| borderRadius | rect | number | |

### Easing Types
| Easing | Use Case |
|--------|---------|
| `linear` | Constant rate, fade progress |
| `power2.out` / `ease-out` | Elements settling into place (default) |
| `power2.in` / `ease-in` | Elements leaving |
| `power2.inOut` / `ease-in-out` | Symmetric motions |
| `power3.out` | Stronger deceleration, premium feel |
| `power4.out` / `expo.out` | Very strong deceleration, dramatic |
| `back.out` | Slight overshoot — logo reveals, button pops |
| `back.inOut` | Overshoot both ways |
| `elastic.out` | Spring oscillation — playful elements |
| `bounce.out` | Physical bounce |
| `sine.out` | Gentle ease |
| `sine.inOut` | Gentle symmetric |
| `cubic-bezier(x1,y1,x2,y2)` | Custom curve (GSAP CustomEase style) |

### Stagger Pattern
For sequential reveals (e.g., list items, bullet points):
```
Item 0: keyframes at timeMs = baseDelay + 0 * staggerMs
Item 1: keyframes at timeMs = baseDelay + 1 * staggerMs
Item 2: keyframes at timeMs = baseDelay + 2 * staggerMs
...
```
Common values: 80–200ms stagger, 200–500ms per-item duration.

## Op System (Mutation Contract)

All document mutations are **ops** — pure data applied atomically by `applyOps()`.

| Op | Purpose |
|----|---------|
| `setCanvas` | Set width, height, durationMs, fps |
| `addElement` | Add element (takes a TraceElementSpec) |
| `updateElement` | Update element attributes, name, visibility, locked, sceneId |
| `deleteElement` | Remove element + subtree |
| `duplicateElement` | Clone with offset |
| `reorderElement` | Z-order: front, back, forward, backward |
| `reparentElement` | Move to new parent or root |
| `groupElements` | Group multiple elements under a new group |
| `ungroupElement` | Flatten a group |
| `setTrack` | Set/replace a property track with keyframes |
| `deleteTrack` | Remove a property track |
| `addScene` | Add storyboard scene |
| `updateScene` | Update scene name, intent, duration, transition |
| `removeScene` | Remove scene + its elements |
| `setDefs` | Set SVG defs (gradients, filters, patterns) |
| `setAudio` | Set audio tracks |
| `applyRecipe` | Instantiate a pre-built recipe |
| `insertFragment` | Insert parsed SVG fragment |

### Op Batches
Ops can be sent as arrays — they apply atomically (all or nothing).
If any op fails, the project is unchanged.

## Recipes (Pre-built Compositions)

| Recipe | Elements | Animation |
|--------|----------|-----------|
| `lower-third` | Card bg + accent bar + title + subtitle | Card fades in, accent bar grows, text slides in |
| `progress-ring` | Track circle + progress arc + label | Arc draws on via strokeDashoffset, percentage counts up |
| `bar-chart` | Group of bars + labels | Bars grow from 0 to value height |
| `kinetic-text` | Word-by-word text elements | Each word fades + slides up with stagger |
| `counter` | Number text + caption | Number animates from start to end value |

## Templates

| Template | Size | Duration | Description |
|----------|------|----------|-------------|
| `blank` | 1920×1080 | 6s | Empty canvas |
| `nova-mark` | 700×700 | 4.6s | Concentric trace rings resolving into wordmark |
| `kinetic-type` | 1280×720 | 4.2s | Typewriter headline + accent rule + subhead |
| `metrics` | 1280×720 | 4s | KPI counter + progress ring + bar chart |
| `lower-third` | 1280×720 | 3.6s | Speaker card with accent reveal |
| `sponsor-card` | 1920×1080 | 3.5s | Logo stinger + feature list with glow |
| `lower-third-overlay` | 1920×1080 | 4s | Status card with title, subtext, metric badge |

## Gradients

```typescript
interface TraceGradient {
  id: string;
  type: 'linear' | 'radial';
  stops: GradientStop[]; // { offset: 0-1, color, opacity }
  angle: number;  // linear: degrees (0 = left-to-right)
  cx: number; cy: number; r: number; // radial: 0-1
}
```
Gradients are stored in `project.gradients` and serialized to `project.defs`.
Reference via `fill: url(#gradientId)`.

## Storyboard

Scenes are contiguous time ranges within a project:
```
{ id, name, startMs, durationMs, intent?, transitionIn?, background? }
```
- Scenes partition the timeline for planning; they do NOT create separate element graphs
- Elements have an optional `sceneId` linking them to a scene
- `transitionIn`: 'cut' | 'fade' | 'slide'

## Export

- **Animated SVG**: Full SVG with inline GSAP timeline (self-contained, embeddable)
- **GSAP code**: React component or vanilla JS with GSAP timeline
- Both use the same `resolveElementAtTime` evaluation path

## Design Patterns

### Logo Reveal / Stinger
1. Dark background rect (1920×1080, fill: #0f172a)
2. Ambient glow circles at edges (large radius, low opacity, fill: rgba(blue/purple, 0.08-0.15))
3. Logo path centered (fill: #ffffff or brand color)
4. Scale-up: scaleX/scaleY 0.9→1.0 over 500ms with `power2.out`
5. Fade-in: opacity 0→1 over same 500ms with `linear`
6. Feature list below: bullet circles + text, staggered fade-in

### Lower Third
1. Card rect with rounded corners (rx: 8), semi-transparent dark bg
2. Accent bar (4px wide rect, brand color) grows height 0→full
3. Title text fades in + slides right (x offset → final position)
4. Subtitle text fades in after title

### Kinetic Text
1. Split text into words
2. Each word = separate text element in a group
3. Stagger: each word fades 0→1 and slides y: 24→0 with `power3.out`
4. 90ms stagger between words, 400ms per word

### Counter / Number Animation
1. Text element with start value
2. `text` property track animates from start to end value
3. Interpolator handles progressive number display

### Staggered List Reveal
1. Each item = group of (bullet + title + optional subtitle)
2. Opacity 0→1 per item with stagger delay
3. Optional slide-up: y offset → 0
4. Common: 200ms stagger, 400ms duration, `power2.out`

## Color Palette (Professional)
| Role | Color | Hex |
|------|-------|-----|
| Background dark | Slate 950 | #0f172a |
| Background dark alt | Slate 900 | #1e293b |
| Card bg | Semi-transparent dark | rgba(12, 18, 32, 0.9) |
| Primary text | Slate 50 | #f8fafc |
| Secondary text | Slate 400 | #94a3b8 |
| Muted text | Slate 600 | #475569 |
| Accent blue | Blue 500 | #3b82f6 |
| Accent cyan | Cyan 400 | #22d3ee |
| Accent purple | Violet 500 | #8b5cf6 |
| Accent pink | Pink 400 | #f472b6 |
| Accent sky | Sky 400 | #38bdf8 |
| Glow blue (ambient) | Blue 500 @ 10% | rgba(59, 130, 246, 0.1) |
| Glow purple (ambient) | Purple 500 @ 8% | rgba(139, 92, 246, 0.08) |

## Key Reminders
- All ops apply atomically — batch them in one dispatch
- Keyframe times are in milliseconds from project start
- Easing is per-keyframe (the easing of the outgoing keyframe)
- Elements with `baseX/baseY` use `x/y` as animation offset; elements without use `x/y` as position
- Groups have `childrenIds`; children reference parent via `parentId`
- Root elements are listed in `rootElementIds` (paint order, bottom = first)
- Use `applyRecipe` to instantiate pre-built compositions (lower-third, kinetic-text, etc.)
- Gradients need entries in both `project.gradients` and serialized `defs`
