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
  videoPath: string;
  cutCount: number;
  zoomCount: number;
  fileSizeBytes?: number;
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

// ── Multi-Track Timeline Domain Models ────────────────────────────────────────

export type TrackType = 'effects' | 'captions' | 'video' | 'audio';

export interface TimelineClip {
  id: string;
  trackId: string;
  name: string;
  startMs: number;
  durationMs: number;
  sourceStartMs: number;
  sourceDurationMs: number;
  color?: string;
  payload?: {
    scale?: number;
    targetX?: number;
    targetY?: number;
    text?: string;
    volume?: number;
    reason?: string;
  };
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

export function convertTakeToTracks(take: StudioTake): TimelineTrack[] {
  const duration = Math.max(take.durationMs, 4000);

  // 1. Effects track (Kinetic zooms)
  const effectClips: TimelineClip[] = (take.zooms || []).map((z) => ({
    id: z.id,
    trackId: 'track-effects',
    name: `Zoom ${z.scale}x`,
    startMs: z.startMs,
    durationMs: Math.max(z.endMs - z.startMs, 500),
    sourceStartMs: z.startMs,
    sourceDurationMs: z.endMs - z.startMs,
    color: '#8b5cf6',
    payload: {
      scale: z.scale,
      targetX: z.targetX,
      targetY: z.targetY,
    },
  }));

  // 2. Captions track
  const captionClips: TimelineClip[] = (take.captions || []).map((c) => ({
    id: c.id,
    trackId: 'track-captions',
    name: c.text,
    startMs: c.startMs,
    durationMs: Math.max(c.endMs - c.startMs, 500),
    sourceStartMs: c.startMs,
    sourceDurationMs: c.endMs - c.startMs,
    color: '#14b8a6',
    payload: {
      text: c.text,
    },
  }));

  // 3. Video track (Single clip or sliced by cuts)
  const cuts = take.cuts || [];
  const videoClips: TimelineClip[] = [];

  if (cuts.length === 0) {
    videoClips.push({
      id: `${take.id}-video-0`,
      trackId: 'track-video',
      name: take.title,
      startMs: 0,
      durationMs: duration,
      sourceStartMs: 0,
      sourceDurationMs: duration,
      color: '#334155',
    });
  } else {
    // Generate clips between cuts
    const sortedCuts = [...cuts].sort((a, b) => a.startMs - b.startMs);
    let currentMs = 0;
    let clipIndex = 0;

    for (const cut of sortedCuts) {
      if (cut.startMs > currentMs) {
        const segDuration = cut.startMs - currentMs;
        videoClips.push({
          id: `${take.id}-video-${clipIndex++}`,
          trackId: 'track-video',
          name: `${take.title} [${clipIndex}]`,
          startMs: currentMs,
          durationMs: segDuration,
          sourceStartMs: currentMs,
          sourceDurationMs: segDuration,
          color: '#334155',
        });
      }
      currentMs = cut.endMs;
    }

    if (currentMs < duration) {
      const segDuration = duration - currentMs;
      videoClips.push({
        id: `${take.id}-video-${clipIndex++}`,
        trackId: 'track-video',
        name: `${take.title} [${clipIndex}]`,
        startMs: currentMs,
        durationMs: segDuration,
        sourceStartMs: currentMs,
        sourceDurationMs: segDuration,
        color: '#334155',
      });
    }
  }

  // 4. Audio track
  const audioClips: TimelineClip[] = videoClips.map((vc, i) => ({
    id: `${take.id}-audio-${i}`,
    trackId: 'track-audio',
    name: 'Microphone & System Audio',
    startMs: vc.startMs,
    durationMs: vc.durationMs,
    sourceStartMs: vc.sourceStartMs,
    sourceDurationMs: vc.sourceDurationMs,
    color: '#0284c7',
    payload: {
      volume: 1.0,
    },
  }));

  return [
    {
      id: 'track-effects',
      type: 'effects',
      name: 'Kinetic Zooms',
      locked: false,
      visible: true,
      clips: effectClips,
    },
    {
      id: 'track-captions',
      type: 'captions',
      name: 'Subtitles',
      locked: false,
      visible: true,
      clips: captionClips,
    },
    {
      id: 'track-video',
      type: 'video',
      name: 'Primary Video',
      locked: false,
      visible: true,
      clips: videoClips,
    },
    {
      id: 'track-audio',
      type: 'audio',
      name: 'Audio Waveform',
      locked: false,
      visible: true,
      muted: false,
      clips: audioClips,
    },
  ];
}
