/**
 * lib/studio-types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure, UI-free domain types and presets for Studio: Showcase Generator.
 * Shared across main and renderer processes without bringing in any node/db deps.
 * ─────────────────────────────────────────────────────────────────────────────
 */

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

export interface StudioStyling {
  background: string;
  borderRadius: number;
  padding: number;
  shadow: string;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3';
  zoomIntensity: number;
  cameraEasing: 'smooth' | 'snappy' | 'cinematic';
  showCaptions: boolean;
  captionStyle: 'karaoke' | 'minimal' | 'badge';
}

export interface StudioSocialKit {
  title: string;
  summary: string;
  tweet: string;
  changelog: string;
  linkedIn: string;
}

export interface MouseTrackerEvent {
  t: number; // ms relative to recording start
  x: number;
  y: number;
  type: 'move' | 'mousedown' | 'mouseup' | 'click' | 'dblclick' | 'wheel';
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
  styling: StudioStyling;
  socialKit: StudioSocialKit | null;
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
  videoPath: string;
  cutCount: number;
  zoomCount: number;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_STUDIO_STYLING: StudioStyling = {
  background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 50%, #020617 100%)',
  borderRadius: 16,
  padding: 44,
  shadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
  aspectRatio: '16:9',
  zoomIntensity: 1.5,
  cameraEasing: 'smooth',
  showCaptions: true,
  captionStyle: 'karaoke',
};
