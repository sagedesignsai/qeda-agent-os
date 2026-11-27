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
  defs?, gradients?, audioTracks?, storyboard?, camera?, style?, reviewNotes? }
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
| `reorderScene` | Move a scene; start times are re-derived |
| `updateScene` | Update scene name, intent, duration, transition, background |
| `removeScene` | Remove scene + its elements |
| `setDefs` | Set SVG defs (gradients, filters, patterns) |
| `setFilters` | Set structured SVG filters (editor-authored, serialized into defs) |
| `setAudio` | Set audio tracks |
| `applyRecipe` | Instantiate a pre-built recipe |
| `insertFragment` | Insert parsed SVG fragment |

### Op Batches
Ops can be sent as arrays — they apply atomically (all or nothing).
If any op fails, the project is unchanged.

## Filters (SVG Effects)

Filters are structured `TraceFilter` objects stored in `project.filters` (keyed by id) and serialized into `<defs>` alongside gradients. An element applies a filter via `attributes.filter = "url(#id)"`. The inspector **Effects** section provides:

- Preset picker: drop shadow, neon/inner glow, blur, grayscale, sepia, hue shift, duotone, glitch/RGB split, film grain, liquid displacement, outline, emboss
- Inline param editing (creative field renders): blur, offset X/Y, color, scale, radius — surfaced directly in the effect row
- `⋯` popover for additional controls: per-primitive params, region expansion %, `color-interpolation-filters` (linearRGB/sRGB)
- Filter defs from raw `project.defs` are also recognized (read-only ref)

Filter primitives supported structurally: `feGaussianBlur`, `feOffset`, `feFlood`, `feComposite`, `feMerge` (+ merge nodes), `feBlend`, `feColorMatrix`, `feTurbulence`, `feDisplacementMap`, `feMorphology`, `feConvolveMatrix`, `feComponentTransfer`, `feDiffuseLighting/feSpecularLighting`, `feDropShadow`.

## Recipes (Pre-built Compositions)

| Recipe | Elements | Animation |
|--------|----------|-----------|
| `lower-third` | Card bg + accent bar + title + subtitle | Card fades in, accent bar grows, text slides in |
| `progress-ring` | Track circle + progress arc + label | Arc draws on via strokeDashoffset; the label shows the target percentage (static) |
| `bar-chart` | Group of bars + labels | Bars grow from 0 to their value, one after another |
| `kinetic-text` | Word-by-word text elements | Each word fades + slides up with stagger |
| `counter` | Number text + caption | Number steps through exact values from start to end |

Recipes are inserted as an ordinary group of primitive children, so every layer and track stays editable. A track can set `discrete: true` to hold each keyframe instead of interpolating; the counter uses this so its text never passes through the typewriter interpolator.

## Blocks (Registry)

The block registry is the single searchable catalogue of insertable visuals. It wraps the five recipes and adds first-party blocks. Every block becomes ordinary layers and tracks; nothing is locked or special after insertion.

| Block id | Category | What it builds |
|----------|----------|----------------|
| `title-card` | Titles | Kicker + oversized headline + growing accent rule |
| `kinetic-text` | Titles | Word-by-word headline reveal (recipe) |
| `quote-card` | Titles | Quotation glyph, wrapped statement, attribution |
| `bullet-list` | Titles | Staggered points, one per row in the `items` field |
| `lower-third` | Lower thirds | Speaker card with accent bar (recipe) |
| `counter` | Data | KPI number that steps to a target (recipe) |
| `progress-ring` | Data | Arc that draws to a percentage (recipe) |
| `bar-chart` | Data | Bars that grow in sequence (recipe) |
| `callout` | Callouts | Pill label, pulsing dot and connector |
| `device-frame` | Social | Phone/browser frame with an app panel |
| `logo-end-card` | Social | Badge, wordmark and tagline |
| `background-treatment` | Backgrounds | Base, glow pools and edge shading (inserts at the back) |

- Discover with `searchBlocks` (free text + category); insert with `insertBlock`.
- Each block declares the parameters its builder reads; `searchBlocks` returns them with defaults, kinds and select options.
- Layout is canvas-relative, so blocks land correctly on 16:9, 1:1 and 9:16.
- `layer: 'background'` blocks insert at the back of the root stack so they never cover existing art.

## Add-ons

An add-on is a content + capability pack. It contributes blocks to the same
searchable registry and may expose a generative specialist; it never introduces a
parallel insertion path. Insertion, validation, undo and export stay the core
Trace paths.

### Surfaces add-on (10 blocks)

Animated backgrounds built from ordinary rects, circles, paths, structured
gradients, filters and tracks. Every block is `layer: 'background'` and therefore
inserts behind existing art. Every block loops on a four-second canvas.

| Block id | What it builds |
|----------|----------------|
| `surface-aurora` | Gradient base, three drifting blurred light pools, vignette |
| `surface-waves` | Layered wave paths with vertical gradient fills and a sun glow |
| `surface-bauhaus` | Seeded discs, rings, bars, triangles and arcs on flat stock |
| `surface-blueprint` | Drafting grid that pans one cell per loop, brackets and a scan line |
| `surface-orbit` | Counter-rotating rings, markers, ambient dots and an accent arc |
| `surface-terrain` | Layered ridge paths, sunset gradient and a glowing sun |
| `surface-starfield` | Seeded twinkling stars, blurred bokeh and slow parallax |
| `surface-halftone` | Focus-weighted dot matrix with an accent diagonal |
| `surface-grain` | Film gradient, turbulence grain, scanlines, light leak and vignette |
| `surface-speedlines` | Diagonal streaks with staggered opacity windows |

The `generateSurface` specialist turns a brief into bespoke SVG plus editable
tracks. The compiler parses the SVG with the real importer (baking transforms and
`use` references), attaches tracks through the ops engine, validates the fragment,
lints the result and renders review frames. It enforces the supported SVG
subset, element/track/keyframe budgets and seamless-loop endpoints, and rescales
a wrongly sized viewBox to cover the canvas instead of rejecting the proposal. The editor dialog previews the proposal and inserts it at the back on
approval; the copilot tool inserts the validated fragment directly.

The generation workspace is live and durable: a valid proposal streams to the
preview the moment the `proposeSurface` tool compiles it (mid-turn), every
completed proposal is persisted under `userData/trace/surfaces` with a thumbnail
and can be re-inserted later, and the conversation itself is a persisted session
(`sessions:ensure` + message upserts) so reopening the generator restores the
brief history. Playback in the preview mutates the mounted SVG DOM through the
runtime renderer instead of re-rendering React per frame.

### Typography add-on (6 blocks)

Text-first blocks that complement the core title, kinetic-type and lower-third
recipes. Text stays real text, not outlines.

| Block id | What it builds |
|----------|----------------|
| `text-split-title` | Editorial two-line title, kicker and growing accent rule |
| `text-caption` | Speaker-labelled caption card in the subtitle-safe band |
| `text-ticker` | Loop-safe marquee strip with a label chip |
| `text-credits` | Vertical end-credit roll |
| `text-typewriter` | Monospace line typed with discrete text keyframes and a cursor |
| `text-agenda` | Numbered agenda with staggered row reveals |

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
- `startMs` is **derived**: scenes are laid out back-to-back in array order, and
  `migrateTraceProject` normalizes legacy documents whose scenes all started at
  0. Never author `startMs` by hand.
- Scenes partition the timeline for planning; they do NOT create separate element graphs
- Elements have an optional `sceneId` linking them to a scene
- `transitionIn`: 'cut' | 'fade' | 'slide'. Non-cut entrances run for 450ms
  (clamped to the scene duration) and are a **frame-level veil**, never an
  element mutation — the signature template choreographs its own entrances, so
  multiplying element opacity at a boundary would blink authored content.
  `fade` dips from the scene's background colour and lifts; `slide` carries the
  same full-cover veil off the right edge, revealing the composition behind it.
  The veil paints above the graph and below the subtitle layer.
- `background` paints behind the graph for that scene. When both the outgoing
  and incoming scenes define a background, the engine blends them across the
  entrance. A scene without a background leaves the artboard transparent; the
  video exporter falls back to the first scene's background (or slate) behind
  the frame.

Scene editing lives in the **Scenes** dialog (command bar → “Scenes & transitions”,
or the gear in the timeline’s Scenes lane). It can add, rename, re-time, reorder
and delete scenes, choose the entrance, set a custom background, and write the
director note. Reordering or changing a duration re-lays every `startMs`; deleting
a scene prunes its assigned layers after a named confirmation. Adding a scene
places it after the active one and focuses it.

## Camera

`project.camera` frames the whole element graph. Absent means the full artboard.

```
{ x?, y?, zoom?, rotation?, tracks?: PropertyTrack[] }
```

- `x`/`y` — the canvas point that sits at the centre of the frame (default:
  canvas centre).
- `zoom` — multiplier, `1` = 100%; must be positive (render clamps to 0.05–20).
- `rotation` — degrees.
- `tracks` — one per property, animating `x`, `y`, `zoom` or `rotation` with the
  same keyframe/easing model as elements.
- The camera is **screen-space**: scene backgrounds, entrance veils and burned-in
  subtitles do not move with it.
- Transform order: `translate(centre) rotate(rotation) scale(zoom)
  translate(-x, -y)`.
- Set or animate with the `setCamera` tool/op; `null` clears it. The inspector's
  Camera section edits the base values and adds keyframes at the playhead.

## Look & Style

`project.style` holds authoring tokens. They are defaults, not a stylesheet:

```
{ lookId?, palette?: { background, surface, text, muted, accent, accentAlt },
  fonts?: { heading, body },
  motion?: { easing, durationMs, staggerMs } }
```

Presets (`listLooks`, `setLook`): `nova-dark`, `clean-tech`, `editorial`, `warm-film`, `noir`, `neon`.

- New blocks inherit the palette for colour options the caller leaves unset, and their text takes the look's heading/body font.
- The copilot reads the resolved look from `getProject` and uses it for new layers.
- `setLook` only restyles existing layers when `applyToElements` is true: role-matched fills/strokes are remapped and text fonts switch to the heading/body pairing. `applyBackground` sets every scene background to the look background.
- `setLook` with `style: null` clears the style.
- Motion taste is linted: linear easing on x/y/scale/rotation, large pure-black fills and four or more motion tracks sharing the same start/end are warnings.

## Review Notes & QA

`project.reviewNotes` holds timestamped review comments:

```
[{ id, text, timeMs, sceneId?, elementId?, createdAt, resolved? }]
```

- Add notes in the editor (Notes dialog at the playhead) or with `addReviewNote`; read them with `getReviewNotes`; resolve with `resolveReviewNotes`. Resolution is a flag, never a delete.
- `auditComposition` (tool) and the QA dialog run the measurable readiness pass:
  - lint issues (validity)
  - scene coverage (canvas time not covered / scenes overrunning)
  - narration readiness (unmeasured lines, missing voice assets)
  - large-text contrast against the scene background (WCAG 3:1 for ≥40px text)
  - open review notes
  - motion metrics (tracks, keyframes, linear-motion tracks)
- The contact-sheet frame list shows each scene settled and mid, plus every note time, deduped and capped at 9 frames.
- The audit tool also has a vision model review the rendered contact sheet and returns a written review with `performed`/`model`/`notes`.

## Export

- **Animated SVG**: self-contained SMIL document (no JavaScript), for embeds
- **GSAP code**: React component or vanilla JS with a GSAP timeline
- **Video**: frame-exact MP4 (H.264) or WebM (VP9/AV1) rendered in a hidden
  window, with narration audio muxed in when voice lines exist
- All paths evaluate the same document; the video path serializes each frame
  with `staticSvgMarkup`, so camera framing, scene backgrounds, entrance veils
  and burned-in subtitles match the editor stage. The animated-SVG and GSAP
  artifacts remain approximations for parametric internals and do not author
  camera moves or scene veils (their markup is generated without those layers).

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
- Use `searchBlocks` before hand-building a named visual, then `insertBlock`; blocks are ordinary layers afterwards
- Gradients need entries in both `project.gradients` and serialized `defs`
