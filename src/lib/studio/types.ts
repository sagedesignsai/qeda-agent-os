/**
 * lib/studio/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical, UI-free Studio domain types, shared by the main and renderer
 * processes.
 *
 * This is the single source of truth for the persisted take shape. The timeline
 * is a *projection* of this model (see `timeline/convert.ts`), never the other
 * way around — so every element type that survives a reload is declared here.
 *
 * `effects` and `overlays` are optional on the take so fixtures and older rows
 * that predate those capabilities still type-check; normalize with `?? []`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Camera / edit primitives ──────────────────────────────────────────────────

export interface StudioCut {
  id: string;
  startMs: number;
  endMs: number;
  reason?: 'silence' | 'idle' | 'manual';
}

export interface StudioZoom {
  id: string;
  startMs: number;
  endMs: number;
  targetX: number; // 0..1 normalized to video width
  targetY: number; // 0..1 normalized to video height
  scale: number;
  /**
   * Optional keyframed zoom animation, in clip-local time.
   * Properties: `zoomScale`, `zoomTargetX`, `zoomTargetY`.
   * When absent the static scale/target values are used.
   */
  keyframes?: StudioKeyframe[];
}

export interface StudioCaptionWord {
  word: string;
  startMs: number;
  endMs: number;
}

export interface StudioCaption {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  words?: StudioCaptionWord[];
}

// ── Global styling ────────────────────────────────────────────────────────────

export type StudioAspectRatio = '16:9' | '9:16' | '1:1' | '4:3';
export type StudioCameraEasing = 'smooth' | 'snappy' | 'cinematic';
export type StudioCaptionStyle = 'karaoke' | 'minimal' | 'badge';

export type DeviceFrameType =
  | 'none'
  | 'browser'
  | 'macbook'
  | 'iphone'
  | 'minimal-svg'
  | 'glass';

export interface StudioDeviceFrame {
  type: DeviceFrameType;
  title?: string;
  url?: string;
  theme?: 'dark' | 'light' | 'accent';
  showControls?: boolean;
}

export interface StudioMotionCard {
  enabled: boolean;
  title: string;
  subtitle?: string;
  badge?: string;
  durationMs: number;
  preset?: 'minimal' | 'kinetic' | 'gradient' | 'cyber';
  logoUrl?: string;
}

export interface StudioPlugin {
  id: string;
  name: string;
  description: string;
  category: 'frame' | 'motion' | 'effects' | 'overlay';
  icon: string;
  version: string;
  author?: string;
}

export interface StudioStyling {
  /** Video uses an edge-to-edge editing canvas; showcase retains the framed mockup presentation. */
  canvasMode?: 'edit' | 'showcase';
  background: string;
  borderRadius: number;
  padding: number;
  shadow: string;
  aspectRatio: StudioAspectRatio;
  zoomIntensity: number;
  cameraEasing: StudioCameraEasing;
  showCaptions: boolean;
  captionStyle: StudioCaptionStyle;
  deviceFrame?: StudioDeviceFrame;
  introCard?: StudioMotionCard;
  outroCard?: StudioMotionCard;
}

export interface StudioSocialKit {
  title: string;
  summary: string;
  tweet: string;
  changelog: string;
  linkedIn: string;
}

// ── Canvas compositing effects ────────────────────────────────────────────────

export type StudioEffectType =
  | 'spotlight'
  | 'neon-glow'
  | 'vignette'
  | 'film-grain'
  | 'scanlines'
  | 'color-grade'
  | 'chroma-key'
  | 'motion-blur';

/** A timed visual effect pass composited over the framed video. */
export interface StudioEffect {
  id: string;
  type: StudioEffectType;
  startMs: number;
  endMs: number;
  /** 0..1 strength; 0 disables the pass. */
  intensity: number;
}

// ── Media overlays (picture-in-picture images / videos) ───────────────────────

export type StudioOverlayKind = 'image' | 'video';

/**
 * A timed media element composited inside the window frame. Geometry is
 * normalized to the framed *content* box so it scales across aspect ratios:
 * `x`/`y` are the element centre (0..1), `widthPct` its width as a fraction of
 * the content width.
 */
export interface StudioOverlay {
  id: string;
  kind: StudioOverlayKind;
  /** Absolute path on disk; served to the renderer by overlay id. */
  srcPath: string;
  startMs: number;
  endMs: number;
  x: number;
  y: number;
  widthPct: number;
  opacity: number;
  /** Rotation in degrees. */
  rotation: number;
  cornerRadius: number;
}

// ── Telemetry ─────────────────────────────────────────────────────────────────

export interface MouseTrackerEvent {
  t: number; // ms relative to recording start
  x: number;
  y: number;
  type: 'move' | 'mousedown' | 'mouseup' | 'click' | 'dblclick' | 'wheel';
}

/** A rectangle in device-independent screen coordinates (DIP). */
export interface StudioCaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * What an agent-driven capture should record.
 *
 * `windowId` is an Electron window id — the value `openBrowser` returns — not a
 * `desktopCapturer` source id. Electron-owned windows are the only ones whose
 * bounds we can read and whose stacking we can control, so they are the only
 * ones a take can be cropped to.
 */
export interface StudioCaptureRequest {
  windowId?: string;
  /** Native (non-Electron) window title; resolved through the OS window list. */
  windowTitle?: string;
  displayId?: string;
  rect?: StudioCaptureRect;
  /**
   * Set when a rect came from a real window rather than a user-drawn region,
   * so the take is still filed as a window capture.
   */
  kindHint?: 'window';
  /** Human label for a rect capture, e.g. the native window title. */
  label?: string;
}

/** Renderer-facing description of what the running capture is recording. */
export interface StudioCaptureSummary {
  kind: 'display' | 'window' | 'region';
  /** Human label, e.g. the window title or "Display 1". */
  label: string;
  /** Size of the visible frame, in DIP. */
  width: number;
  height: number;
}

/**
 * Live, renderer-facing view of an agent-driven screen capture.
 *
 * Sent over `studio:recording-state` so the Studio pill can show what is being
 * recorded while ffmpeg owns the capture in main. Deliberately metadata only:
 * the renderer derives elapsed time from `startedAt` instead of receiving a
 * tick every second.
 */
export interface StudioRecordingSnapshot {
  sessionId: string;
  takeId: string;
  title: string;
  sourceName: string;
  /** Epoch milliseconds. */
  startedAt: number;
  maxDurationMs: number;
  fps: number;
  highlightCount: number;
  cursorSampleCount: number;
  /** What the frame actually contains — screen, a window, or an explicit region. */
  capture: StudioCaptureSummary;
}

/** Push payload for `studio:recording-state`; `active: null` means it ended. */
export interface StudioRecordingStateEvent {
  active: StudioRecordingSnapshot | null;
}

/** Request sent to Studio while the copilot waits for a user to sign in. */
export interface StudioSignInRequest {
  requestId: string;
  browserId: string;
  expiresAt: number;
}

export type StudioSignInDecision = 'continue' | 'cancel';
export type StudioSignInOutcome = 'confirmed' | 'cancelled' | 'expired';

// ── Video region crop ─────────────────────────────────────────────────────────

/** Normalized sub-region (0..1) of a take's source video to render/export. */
export interface StudioVideoCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StudioMediaProbe {
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  rotation: number;
  hasAudio: boolean;
  keyframeIntervalMs?: number;
}

// ── Media pool & multi-track clips ────────────────────────────────────────────

/**
 * A media asset added to a Showcase project's media pool.
 *
 * This is the source material — a recording, an imported video, or an image —
 * that can be placed on the timeline as one or more clips.  Unlike `StudioTake`,
 * which is a single-recording record, the media pool holds *all* source files
 * for a multi-track project.
 */
export interface StudioMediaAsset {
  id: string;
  /** Human-readable label shown in the media pool panel. */
  name: string;
  /** Absolute path on disk. */
  path: string;
  /** Asset kind determines how it can be placed on the timeline. */
  kind: 'video' | 'audio' | 'image';
  /** Duration in milliseconds (0 for images). */
  durationMs: number;
  /** Video dimensions; absent for audio-only assets. */
  width?: number;
  height?: number;
  /** Probed metadata (fps, rotation, etc.). */
  probe?: StudioMediaProbe | null;
  addedAt: number;
}

// ── Clip visual property sub-objects ─────────────────────────────────────────

/**
 * Spatial transform applied to a single clip on the canvas.
 *
 * All values are optional so a partial patch from the inspector can update
 * just one property without wiping the rest.  Defaults when absent:
 * position (0, 0), scale (1, 1), rotation 0°, anchor (0.5, 0.5).
 */
export interface ClipTransform {
  /** Pixel offset from the clip's default track position. */
  position?: { x: number; y: number };
  /** Scale multiplier; 1 = original size. */
  scale?: { x: number; y: number };
  /** Rotation in degrees (clockwise). */
  rotation?: number;
  /** Normalized pivot point for scale/rotation (0-1). */
  anchorPoint?: { x: number; y: number };
}

/**
 * Animatable properties for clip keyframe animations.
 */
export type ClipAnimatableProperty =
  | 'x'
  | 'y'
  | 'scale'
  | 'rotation'
  | 'opacity';

/**
 * Easing curves available for clip animations.
 *
 * Mirrors Trace's `EasingType` so the same evaluation functions can be
 * reused.  Custom cubic-bezier strings are also accepted.
 */
export type StudioAnimationEasing =
  | 'linear'
  | 'ease-out'
  | 'ease-in'
  | 'ease-in-out'
  | 'power2.out'
  | 'power2.in'
  | 'power2.inOut'
  | 'power3.out'
  | 'power3.in'
  | 'back.out'
  | 'elastic.out'
  | 'bounce.out'
  | 'expo.out'
  | 'sine.out'
  | string; // custom cubic-bezier: cubic-bezier(x1, y1, x2, y2)

/**
 * A single keyframe in a clip animation.
 *
 * Keyframe times are stored as offsets from the clip's start (for enter)
 * or end (for exit), in milliseconds.  This makes animations portable when
 * clips are moved on the timeline.
 */
export interface ClipKeyframe {
  id: string;
  /** Time offset from clip start (enter) or clip end (exit), in ms. */
  timeMs: number;
  /** Property being animated. */
  property: ClipAnimatableProperty;
  /** Target value at this keyframe. */
  value: number;
  /** Easing curve from this keyframe to the next. */
  easing: StudioAnimationEasing;
}

/**
 * Preset-based enter or exit animation for a clip.
 *
 * Supports both legacy preset mode (type + duration + easing) and the new
 * keyframe-based mode (presetId + keyframes).  Presets generate keyframe
 * data automatically, while custom keyframes allow fine-grained control.
 */
export interface ClipAnimation {
  type: StudioCompositionTransitionType;
  durationMs: number;
  /** CSS easing name, e.g. "ease-out", "ease-in-out". Defaults to "ease-out". */
  easing?: string;
  /** Reference to a pre-built animation preset. */
  presetId?: string;
  /** Custom or preset-generated keyframes for fine-grained animation. */
  keyframes?: ClipKeyframe[];
}

/**
 * Optional device mockup frame overlay for a single clip.
 *
 * Reuses `DeviceFrameType` from the global styling so the same frame
 * renderer can handle both project-level and per-clip frames.
 */
export interface ClipDeviceFrame {
  type: DeviceFrameType;
  /** Frame border color. */
  color?: string;
  /** Gap between the clip content and the frame edge in px. */
  padding?: number;
  /** Visual surface theme for realistic mockups. */
  theme?: 'dark' | 'light' | 'silver';
  /** Optional window title (for browser / window frames). */
  title?: string;
  /** Optional address bar URL (for browser frames). */
  url?: string;
  /** Optional preset identifier (e.g. 'macos-window', 'macbook-pro'). */
  presetId?: string;
  /** Cast a realistic drop shadow behind the device frame. */
  shadow?: boolean;
  /** Subtle diagonal glass glare sheen across the top-left corner. */
  glare?: boolean;
}

/**
 * A clip on the timeline — the fundamental editable building block.
 *
 * Unlike the legacy model where clips were *derived* from a single `StudioTake`
 * on every load, `StudioClip` is stored directly and references any
 * `StudioMediaAsset` in the project's media pool.  This enables:
 *
 *   - Multiple recordings on the same timeline
 *   - The same source segment appearing at multiple positions
 *   - Non-contiguous tracks with gaps between clips
 *   - Per-clip transforms (speed, volume, opacity)
 *
 * Time model:
 *   - `startMs` / `durationMs` → composition time (where it plays on the timeline)
 *   - `sourceInMs` → where inside the referenced media asset this clip begins
 */
export interface StudioClip {
  id: string;
  /** The track this clip belongs to. */
  trackId: string;
  /** Semantic item kind; optional while reading projects created before tagging. */
  itemType?: TimelineItemType;
  /** Human label (e.g. "Screen recording [1]"). */
  name: string;
  /** Composition-time start position on the timeline (ms). */
  startMs: number;
  /** Duration of this clip on the timeline (ms). */
  durationMs: number;
  /** Offset into the source media asset (ms). */
  sourceInMs: number;
  /** Selected source range in milliseconds; timeline duration may differ at non-1x speed. */
  sourceDurationMs?: number;
  /** Reference to the media asset in the project's pool. */
  mediaAssetId?: string;
  /** Playback speed multiplier (1 = normal, 0.5 = half speed, 2 = double). */
  speed?: number;
  /** Volume multiplier for audio clips (0..2, default 1). */
  volume?: number;
  /** Opacity for video/image clips (0..1, default 1). */
  opacity?: number;
  /** Visual color for the clip block in the timeline UI. */
  color?: string;

  // ── Visual properties ──────────────────────────────────────────────────────
  // Per-clip spatial transform, enter/exit animations, and optional device
  // frame overlay.  These are editable in the inspector and passed through
  // to the timeline store via `StudioClipPayload`.

  /** Spatial transform: position, scale, rotation, anchor point. */
  transform?: ClipTransform;
  /** How this clip appears at its start time. */
  enterAnimation?: ClipAnimation;
  /** How this clip disappears at its end time. */
  exitAnimation?: ClipAnimation;
  /** Optional device mockup frame overlay for this clip. */
  deviceFrame?: ClipDeviceFrame;
  /** Optional effect, caption, overlay, or transition data for non-media clips. */
  payload?: StudioClipPayload;
}

/**
 * A named track within a Showcase project timeline.
 *
 * Each track holds an ordered set of clips. Media lanes compose or mix by
 * stack order; effects and transitions are represented as timeline clips.
 */
export type StudioTrackType =
  | 'video'
  | 'audio'
  | 'effects'
  | 'transitions'
  | 'captions'
  | 'overlays';

/**
 * A persisted track.
 *
 * Ordering is positional, not numeric: the array is stored in timeline row
 * order (top row first), and that order *is* the compositing order. There is
 * deliberately no `zIndex` — see `timeline/layers.ts` for the invariant.
 */
export interface StudioTrack {
  id: string;
  name: string;
  type: StudioTrackType;
  locked: boolean;
  visible: boolean;
  muted?: boolean;
  clips: StudioClip[];
}

export interface StudioTake {
  id: string;
  projectId: string | null;
  projectName?: string | null;
  title: string;
  description: string | null;
  sourceType: 'screen' | 'window';
  sourceName: string | null;
  durationMs: number;
  videoPath: string;
  audioPath: string | null;
  mouseEventsPath: string | null;
  cuts: StudioCut[];
  zooms: StudioZoom[];
  captions: StudioCaption[];
  /** Canvas compositing passes (spotlight, glow, vignette, grain, scanlines). */
  effects?: StudioEffect[];
  /**
   * Timestamp indicating when global effects were migrated to clip-attached
   * effects (new system). If present, migration has completed. Absence means
   * migration should run on next load.
   */
  effectsMigratedAt?: number;
  /** Picture-in-picture image / video elements. */
  overlays?: StudioOverlay[];
  /** Normalized sub-region of source video to render/export (OBS-like crop). */
  videoCrop?: StudioVideoCrop;
  styling: StudioStyling;
  socialKit: StudioSocialKit | null;
  fileSizeBytes?: number;
  probeJson?: string | null;
  probe?: StudioMediaProbe | null;
  optimizedPath?: string | null;
  filmstripPath?: string | null;
  waveformPath?: string | null;
  mediaReadyAt?: number | null;
  createdAt: number;
  updatedAt: number;

  // ── Multi-track project fields ─────────────────────────────────────────────
  // These fields enable the independent track model. New media, effect, and
  // transition clips live in `tracks`; legacy take fields remain readable for
  // existing recordings. A blank project has empty arrays and an empty path.

  /** Media pool — all source recordings and imported assets for this project. */
  mediaAssets?: StudioMediaAsset[];
  /** Named media and effect tracks holding the project's clips. */
  tracks?: StudioTrack[];
}

export interface StudioTakeSummary {
  id: string;
  projectId: string | null;
  projectName?: string | null;
  title: string;
  description: string | null;
  sourceType: 'screen' | 'window';
  sourceName: string | null;
  durationMs: number;
  videoPath?: string;
  cutCount: number;
  zoomCount: number;
  effectCount?: number;
  overlayCount?: number;
  fileSizeBytes?: number;
  createdAt: number;
  updatedAt: number;
  /** True when the take uses the multi-track model (tracks_json is valid JSON). */
  isMultiTrack: boolean;
}

// ── Layer-based showcase compositions ────────────────────────────────────────

export type StudioCompositionSceneId =
  | 'app-spotlight'
  | 'desktop-mobile-comparison';

export interface StudioLayerLayout {
  /** Normalized canvas coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
  fit: 'cover' | 'contain';
  cornerRadius: number;
}

export type StudioCompositionTransitionType =
  | 'none'
  | 'fade'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'
  | 'scale'
  | 'blur'
  | 'cross-zoom'
  | 'directional-blur'
  | 'glitch'
  | 'rgb-split'
  | 'radial-wipe';

export interface StudioCompositionTransition {
  type: StudioCompositionTransitionType;
  durationMs: number;
}

export interface StudioCompositionLayerBase {
  id: string;
  name: string;
  startMs: number;
  endMs: number;
  zIndex: number;
  opacity: number;
  transitionIn: StudioCompositionTransition;
  transitionOut: StudioCompositionTransition;
  layouts: Record<StudioAspectRatio, StudioLayerLayout>;
}

export interface StudioCompositionVideoLayer
  extends StudioCompositionLayerBase {
  kind: 'video';
  /** References a Studio take; the main process resolves its media path. */
  sourceId: string;
  sourceDurationMs: number;
  sourceInMs: number;
}

export interface StudioCompositionImageLayer
  extends StudioCompositionLayerBase {
  kind: 'image';
  /** References an image imported into this composition. */
  sourceId: string;
}

export type StudioCompositionLayer =
  | StudioCompositionVideoLayer
  | StudioCompositionImageLayer;

/** JSON document stored separately from source takes. Bump version when its shape changes. */
export interface StudioCompositionDocument {
  version: 1;
  sceneId: StudioCompositionSceneId;
  aspectRatio: StudioAspectRatio;
  durationMs: number;
  background: string;
  audioSourceLayerId: string | null;
  layers: StudioCompositionLayer[];
  effects?: StudioEffect[];
}

export interface StudioComposition {
  id: string;
  projectId: string | null;
  title: string;
  document: StudioCompositionDocument;
  createdAt: number;
  updatedAt: number;
}

export interface StudioCompositionTemplateLayerBase {
  id: string;
  name: string;
  startMs: number;
  endMs: number;
  zIndex: number;
  opacity: number;
  transitionIn: StudioCompositionTransition;
  transitionOut: StudioCompositionTransition;
  layouts: Record<StudioAspectRatio, StudioLayerLayout>;
}

export interface StudioCompositionTemplateVideoLayer
  extends StudioCompositionTemplateLayerBase {
  kind: 'video';
  sourceInMs: number;
}

export interface StudioCompositionTemplateImageLayer
  extends StudioCompositionTemplateLayerBase {
  kind: 'image';
  assetPath: string;
}

export type StudioCompositionTemplateLayer =
  | StudioCompositionTemplateVideoLayer
  | StudioCompositionTemplateImageLayer;

export interface StudioCompositionTemplate {
  version: 1;
  id: string;
  title: string;
  sceneId: StudioCompositionSceneId;
  aspectRatio: StudioAspectRatio;
  durationMs: number;
  background: string;
  audioSourceLayerId: string | null;
  layers: StudioCompositionTemplateLayer[];
  effects: StudioEffect[];
  createdAt: number;
  updatedAt: number;
}

export interface StudioCompositionTemplateSummary {
  id: string;
  title: string;
  sceneId: StudioCompositionSceneId;
  aspectRatio: StudioAspectRatio;
  videoLayers: Array<{ id: string; name: string }>;
  imageLayerCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface StudioCompositionSummary {
  id: string;
  projectId: string | null;
  projectName?: string | null;
  title: string;
  sceneId: StudioCompositionSceneId;
  aspectRatio: StudioAspectRatio;
  layerCount: number;
  durationMs: number;
  createdAt: number;
  updatedAt: number;
}

export interface StudioCompositionImageAsset {
  id: string;
  name: string;
}

// ── Timeline projection ───────────────────────────────────────────────────────

export type TrackType = StudioTrackType;

/** Semantic kind of an item placed on an Editor timeline track. */
export type TimelineItemType =
  | 'video'
  | 'image'
  | 'audio'
  | 'text'
  | 'shape'
  | 'effect'
  | 'transition'
  | 'overlay';

/**
 * The payload carried by a timeline clip. Kept as one flat, optional bag so a
 * clip can round-trip through JSON without a discriminator union, and so
 * `updateClip` can merge partial patches without wiping sibling keys.
 */
/**
 * A universal, property-addressed keyframe on a clip.
 *
 * `timeMs` is the keyframe position within the clip (0 = clip start,
 * `clip.durationMs` = clip end). Multiple keyframes per property are allowed;
 * they interpolate between each other in clip time and clamp at the ends
 * (hold the first keyframe's value before the first, the last after the last).
 *
 * Property namespaces:
 *  - Transform: 'x', 'y', 'scale', 'rotation', 'opacity'
 *    (draw-space offsets and multipliers, same semantics as enter/exit anims)
 *  - Time remap: 'speed' (source-seconds per composition-second multiplier;
 *    1 = real time, 2 = twice as fast)
 *  - Effect intensity: 'effect:<effectId>:intensity' (0..1, keyframed strength
 *    for clip-attached effects; renders as colored circles on timeline)
 */
export interface StudioKeyframe {
  id: string;
  timeMs: number;
  property: string;
  value: number;
  easing: StudioAnimationEasing;
}

// ── Shape clip payloads ──────────────────────────────────────────────────────

export type StudioShapeKind = 'rect' | 'circle' | 'arrow' | 'callout' | 'path';

/**
 * SVG-based shape with optional trim animation and stroke styling.
 * Used by shape timeline clips to render vector graphics.
 */
export interface ShapeClipPayload {
  /** Shape type or SVG path data mode. */
  shapeKind: StudioShapeKind;
  /** SVG path data (e.g. "M 0 0 L 100 100 Z"). Required for 'path' kind. */
  pathData: string;
  /** Fill color (CSS color string or undefined for no fill). */
  fill?: string;
  /** Stroke properties. */
  stroke?: { color: string; width: number };
  /**
   * Path trim animation: start/end as fractions [0, 1] of total path length.
   * Offset drives the animation phase.
   */
  trim?: { start: number; end: number; offset: number };
  /** Pre-computed path length in pixels (for trim dash calculation). */
  pathLengthPx?: number;
  /** Universal keyframes (inherited from base). */
  keyframes?: StudioKeyframe[];
  /** Spatial transform: position, scale, rotation. */
  transform?: ClipTransform;
  /** Entry animation. */
  enterAnimation?: ClipAnimation;
  /** Exit animation. */
  exitAnimation?: ClipAnimation;
}

// ── Text animator modes ──────────────────────────────────────────────────────

/**
 * Frame-by-frame text reveal animation modes for captions and free text.
 *
 * - 'typewriter': Characters reveal left-to-right, one at a time.
 * - 'fade-words': Words fade in sequentially (requires word timings).
 * - 'slide-up': Characters slide in from below with a fade.
 */
export type TextAnimatorMode = 'typewriter' | 'fade-words' | 'slide-up';

/**
 * Configuration for text animation. Attached to text clips to enable
 * character/word-by-word reveal effects.
 */
export interface TextAnimator {
  /** Animation mode. */
  mode: TextAnimatorMode;
  /** Duration per character/word in milliseconds. */
  charDurationMs?: number;
  /** Easing function name (default: 'ease-out'). */
  easing?: string;
}

// ── Clip-attached effects ────────────────────────────────────────────────────

/**
 * A visual effect attached to an individual clip (video or overlay).
 *
 * Effects render in `stackOrder` sequence after the clip is drawn, inheriting
 * the clip's clip domain ('content' for video/overlay, except neon-glow always
 * uses 'window'). Intensity is keyframable via the universal keyframe system
 * with property name `effect:<effectId>:intensity`. Parameters are static
 * (set once when the effect is added).
 *
 * Keyframe colors (visual distinction):
 *   - Spotlight: #f59e0b (orange)
 *   - Neon-Glow: #6366f1 (indigo)
 *   - Vignette: #475569 (slate)
 *   - Film-Grain: #a8a29e (brown)
 *   - Scanlines: #22d3ee (cyan)
 */
export interface ClipEffect {
  /** Unique ID for this effect instance on the clip. */
  id: string;
  /** Effect type (spotlight, neon-glow, vignette, film-grain, scanlines, …). */
  type: StudioEffectType;
  /**
   * Base intensity (0–1). Keyframed via universal keyframes with property
   * `effect:<effectId>:intensity`. Evaluated at render time and multiplied
   * with the keyframed value (if present).
   */
  intensity: number;
  /**
   * Static effect-specific parameters (not keyframable).
   * Examples:
   *   - Spotlight: { radius: 0.3 } (normalized 0–1)
   *   - Neon-Glow: { colorHue: 0.6, colorSat: 1.0 }
   *   - Vignette: { falloff: 0.5 }
   *   - Film-Grain: { grainSize: 1.0 }
   *   - Scanlines: { lineSpacing: 2.0 }
   *   - Chroma-Key: { keyColor: '#00ff00', tolerance: 0.28 }
   */
  params: Record<string, number | string | boolean>;
  /**
   * Render order on this clip (0 = first, 1 = second, etc.).
   * Effects render in ascending order; user can reorder via inspector UI.
   */
  stackOrder: number;
}

export interface StudioClipPayload {
  /** Media pool source used by this timeline placement. */
  mediaAssetId?: string;
  // Kinetic camera zoom
  scale?: number;
  targetX?: number;
  targetY?: number;
  // Subtitles / text
  text?: string;
  /** Per-clip typography for text layers; absent styles retain legacy captions. */
  textStyle?: StudioTextStyle;
  /**
   * Measured caption word timings, in composition time (same base as the
   * clip's `startMs`). Populated by the take → track converter so karaoke keeps
   * the transcription's timings after dead-air cuts.
   */
  words?: StudioCaptionWord[];
  /** Text animator for frame-by-frame reveal effects (typewriter, fade-words, slide-up). */
  textAnimator?: TextAnimator;
  // Audio
  volume?: number;
  /** Runtime-only: decoded audio buffer for preview/export mixing. Not serialized. */
  audioBuffer?: AudioBuffer;
  /** Runtime-only: pre-computed waveform peaks (RMS amplitude 0-1) for timeline rendering. Not serialized. */
  waveformPeaks?: Float32Array;
  // Shared
  reason?: string;
  speed?: number;
  // Universal keyframes (user-authored per-property timelines)
  keyframes?: StudioKeyframe[];
  // Canvas effect pass
  effectType?: string;
  intensity?: number;
  transitionType?: StudioCompositionTransitionType;
  transitionSide?: 'in' | 'out';
  /** Video clips joined by an Editor cut transition. */
  fromClipId?: string;
  toClipId?: string;
  targetClipId?: string;
  // Media overlay
  kind?: StudioOverlayKind;
  srcPath?: string;
  mediaUrl?: string;
  filePath?: string;
  x?: number;
  y?: number;
  widthPct?: number;
  opacity?: number;
  rotation?: number;
  cornerRadius?: number;
  // Per-clip visual properties (multi-track model)
  transform?: ClipTransform;
  enterAnimation?: ClipAnimation;
  exitAnimation?: ClipAnimation;
  deviceFrame?: ClipDeviceFrame;
  /** Blend mode for compositing (source-over, multiply, screen, overlay, etc.) */
  blendMode?: string;
  // Clip-attached effects (new system; replaces global take.effects[])
  /** Visual effects attached to this individual clip. Renders in stackOrder. */
  effects?: ClipEffect[];
  /** Optional GPU shape mask applied before compositing this clip. */
  mask?: {
    enabled?: boolean;
    shape: 'circle' | 'rect';
    centerX: number;
    centerY: number;
    radiusX: number;
    radiusY: number;
    feather: number;
    invert?: boolean;
  };
}

export interface StudioTextStyle {
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
}

export interface TimelineClip {
  id: string;
  trackId: string;
  /** Semantic item kind; new Editor placements always set this explicitly. */
  itemType?: TimelineItemType;
  name: string;
  startMs: number;
  durationMs: number;
  sourceStartMs: number;
  sourceDurationMs: number;
  color?: string;
  payload?: StudioClipPayload;
}

export interface TimelineTrack {
  id: string;
  type: TrackType;
  name: string;
  locked: boolean;
  visible: boolean;
  muted?: boolean;
  /** Track volume 0-1 (default 1). */
  volume?: number;
  clips: TimelineClip[];
}

// ── Discriminated payload map ─────────────────────────────────────────────────
//
// `StudioClipPayload` is a flat optional bag so partial patches and JSON
// round-trips keep working. That shape cannot discriminate: narrowing on
// `clip.itemType` would still leave `payload` as the full union.
//
// The types below re-attach the discriminant by distributing over the *whole
// clip* rather than over the payload. Use `TypedTimelineClip` / `TypedStudioClip`
// where a switch on `itemType` should narrow `payload`; the wide interfaces stay
// in place so the migration can proceed file by file.

export interface PayloadTypeMap {
  video: StudioClipPayload & { mediaAssetId?: string };
  image: StudioClipPayload & { mediaAssetId: string };
  audio: StudioClipPayload & { mediaAssetId: string };
  text: StudioClipPayload & { text: string };
  shape: ShapeClipPayload & { shapeKind: StudioShapeKind };
  effect: StudioClipPayload & { effectType: string };
  transition: StudioClipPayload & {
    transitionType?: StudioCompositionTransitionType;
  };
  overlay: StudioClipPayload & { kind?: StudioOverlayKind };
}

export type PayloadFor<T extends TimelineItemType> = PayloadTypeMap[T];

export type TimelineClipOf<T extends TimelineItemType> = Omit<
  TimelineClip,
  'itemType' | 'payload'
> & {
  itemType: T;
  payload: PayloadFor<T>;
};

/** A timeline clip whose `itemType` narrows `payload` when switched on. */
export type TypedTimelineClip = {
  [K in TimelineItemType]: TimelineClipOf<K>;
}[TimelineItemType];

export type StudioClipOf<T extends TimelineItemType> = Omit<
  StudioClip,
  'itemType' | 'payload'
> & {
  itemType: T;
  payload: PayloadFor<T>;
};

/** A persisted clip whose `itemType` narrows `payload` when switched on. */
export type TypedStudioClip = {
  [K in TimelineItemType]: StudioClipOf<K>;
}[TimelineItemType];
