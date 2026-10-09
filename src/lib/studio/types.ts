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
  | 'scanlines';

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

// ── Persisted take ────────────────────────────────────────────────────────────

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
  /** Picture-in-picture image / video elements. */
  overlays?: StudioOverlay[];
  styling: StudioStyling;
  socialKit: StudioSocialKit | null;
  fileSizeBytes?: number;
  createdAt: number;
  updatedAt: number;
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
}

// ── Timeline projection ───────────────────────────────────────────────────────

export type TrackType = 'effects' | 'captions' | 'video' | 'audio' | 'overlays';

/**
 * The payload carried by a timeline clip. Kept as one flat, optional bag so a
 * clip can round-trip through JSON without a discriminator union, and so
 * `updateClip` can merge partial patches without wiping sibling keys.
 */
export interface StudioClipPayload {
  // Kinetic camera zoom
  scale?: number;
  targetX?: number;
  targetY?: number;
  // Subtitles / text
  text?: string;
  // Audio
  volume?: number;
  // Shared
  reason?: string;
  speed?: number;
  // Canvas effect pass
  effectType?: string;
  intensity?: number;
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
}

export interface TimelineClip {
  id: string;
  trackId: string;
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
  clips: TimelineClip[];
}
