/**
 * lib/studio/editing/composition.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Project-level styling, captions, overlays, and state inspection.
 *
 * Captions and overlays are stored as timeline clips on their own lanes, so they
 * are editable, movable and deletable like every other element. The legacy
 * `take.captions` / `take.overlays` arrays remain readable for recordings.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { nanoid } from 'nanoid';
import type {
  StudioAspectRatio,
  StudioCameraEasing,
  StudioCaptionWord,
  StudioOverlay,
  StudioStyling,
  StudioTake,
} from '../types';
import { addClip, findClip, listClips, projectDurationMs, removeClip } from './clips';
import { materializeProjectTracks } from './materialize';

const ASPECT_RATIOS: readonly StudioAspectRatio[] = ['16:9', '9:16', '1:1', '4:3'];
const CAMERA_EASINGS: readonly StudioCameraEasing[] = [
  'smooth',
  'snappy',
  'cinematic',
];

export interface ProjectStylingPatch {
  background?: string;
  aspectRatio?: StudioAspectRatio;
  padding?: number;
  borderRadius?: number;
  cameraEasing?: StudioCameraEasing;
  zoomIntensity?: number;
  showCaptions?: boolean;
  captionStyle?: StudioStyling['captionStyle'];
  canvasMode?: StudioStyling['canvasMode'];
}

export function setProjectStyling(
  take: StudioTake,
  patch: ProjectStylingPatch,
): { take: StudioTake; styling: StudioStyling; error?: string } {
  if (patch.aspectRatio && !ASPECT_RATIOS.includes(patch.aspectRatio)) {
    return {
      take,
      styling: take.styling,
      error: `aspectRatio must be one of ${ASPECT_RATIOS.join(', ')}`,
    };
  }
  if (patch.cameraEasing && !CAMERA_EASINGS.includes(patch.cameraEasing)) {
    return {
      take,
      styling: take.styling,
      error: `cameraEasing must be one of ${CAMERA_EASINGS.join(', ')}`,
    };
  }
  if (patch.padding !== undefined && (patch.padding < 0 || patch.padding > 80)) {
    return { take, styling: take.styling, error: 'padding must be 0..80' };
  }
  if (
    patch.borderRadius !== undefined &&
    (patch.borderRadius < 0 || patch.borderRadius > 64)
  ) {
    return {
      take,
      styling: take.styling,
      error: 'borderRadius must be 0..64',
    };
  }

  const styling: StudioStyling = {
    ...take.styling,
    ...(patch.background !== undefined ? { background: patch.background } : {}),
    ...(patch.aspectRatio !== undefined ? { aspectRatio: patch.aspectRatio } : {}),
    ...(patch.padding !== undefined ? { padding: patch.padding } : {}),
    ...(patch.borderRadius !== undefined
      ? { borderRadius: patch.borderRadius }
      : {}),
    ...(patch.cameraEasing !== undefined
      ? { cameraEasing: patch.cameraEasing }
      : {}),
    ...(patch.zoomIntensity !== undefined
      ? { zoomIntensity: patch.zoomIntensity }
      : {}),
    ...(patch.showCaptions !== undefined
      ? { showCaptions: patch.showCaptions }
      : {}),
    ...(patch.captionStyle !== undefined
      ? { captionStyle: patch.captionStyle }
      : {}),
    ...(patch.canvasMode !== undefined ? { canvasMode: patch.canvasMode } : {}),
  };

  return { take: { ...take, styling }, styling };
}

export interface AddCaptionInput {
  startMs: number;
  endMs: number;
  text: string;
  words?: StudioCaptionWord[];
}

export function addCaption(
  take: StudioTake,
  input: AddCaptionInput,
): { take: StudioTake; captionId?: string; error?: string } {
  if (input.endMs <= input.startMs) {
    return { take, error: 'endMs must be greater than startMs' };
  }
  if (!input.text.trim()) return { take, error: 'text is required' };

  const base = materializeProjectTracks(take);
  const placed = addClip(base, {
    clip: {
      id: `caption-${nanoid(8)}`,
      name: input.text,
      itemType: 'text',
      startMs: Math.max(0, input.startMs),
      durationMs: input.endMs - input.startMs,
      sourceInMs: Math.max(0, input.startMs),
      sourceDurationMs: input.endMs - input.startMs,
      payload: {
        text: input.text,
        ...(input.words && input.words.length > 0 ? { words: input.words } : {}),
      },
    },
  });

  if (placed.error) return { take, error: placed.error };
  return {
    take: {
      ...placed.take,
      styling: { ...placed.take.styling, showCaptions: true },
    },
    captionId: placed.clip?.id,
  };
}

export function removeCaption(
  take: StudioTake,
  captionId: string,
): { take: StudioTake; removed: boolean } {
  return removeClip(take, captionId);
}

export interface AddOverlayInput {
  kind: 'image' | 'video';
  srcPath: string;
  startMs: number;
  endMs: number;
  x?: number;
  y?: number;
  widthPct?: number;
  opacity?: number;
  rotation?: number;
  cornerRadius?: number;
}

export function addOverlay(
  take: StudioTake,
  input: AddOverlayInput,
): { take: StudioTake; overlayId?: string; error?: string } {
  if (!input.srcPath) return { take, error: 'srcPath is required' };
  if (input.endMs <= input.startMs) {
    return { take, error: 'endMs must be greater than startMs' };
  }

  const overlay: StudioOverlay = {
    id: `overlay-${nanoid(8)}`,
    kind: input.kind,
    srcPath: input.srcPath,
    startMs: Math.max(0, input.startMs),
    endMs: input.endMs,
    x: clamp01(input.x ?? 0.5),
    y: clamp01(input.y ?? 0.5),
    widthPct: clamp(input.widthPct ?? 0.42, 0.05, 1),
    opacity: clamp01(input.opacity ?? 1),
    rotation: input.rotation ?? 0,
    cornerRadius: Math.max(0, input.cornerRadius ?? 12),
  };

  const base = materializeProjectTracks(take);
  const placed = addClip(base, {
    clip: {
      id: overlay.id,
      name: overlay.kind === 'image' ? 'Image Overlay' : 'Video Overlay',
      itemType: 'overlay',
      startMs: overlay.startMs,
      durationMs: overlay.endMs - overlay.startMs,
      sourceInMs: 0,
      sourceDurationMs: overlay.endMs - overlay.startMs,
      payload: {
        kind: overlay.kind,
        srcPath: overlay.srcPath,
        x: overlay.x,
        y: overlay.y,
        widthPct: overlay.widthPct,
        opacity: overlay.opacity,
        rotation: overlay.rotation,
        cornerRadius: overlay.cornerRadius,
      },
    },
  });

  if (placed.error) return { take, error: placed.error };

  return {
    take: {
      ...placed.take,
      overlays: [...(placed.take.overlays ?? []), overlay],
    },
    overlayId: overlay.id,
  };
}

export function removeOverlay(
  take: StudioTake,
  overlayId: string,
): { take: StudioTake; removed: boolean } {
  const stripped = removeClip(take, overlayId);
  return {
    take: {
      ...stripped.take,
      overlays: (stripped.take.overlays ?? []).filter(
        (overlay) => overlay.id !== overlayId,
      ),
    },
    removed: stripped.removed,
  };
}

/** Compact project state for agent context and post-edit verification. */
export interface ProjectState {
  takeId: string;
  title: string;
  durationMs: number;
  styling: StudioStyling;
  mediaAssets: Array<{
    id: string;
    name: string;
    kind: string;
    durationMs: number;
  }>;
  tracks: Array<{
    id: string;
    name: string;
    type: string;
    clipCount: number;
    clips: Array<{
      id: string;
      name: string;
      itemType?: string;
      startMs: number;
      durationMs: number;
      mediaAssetId?: string;
      effectCount: number;
      effects: Array<{ id: string; type: string; intensity: number; stackOrder: number }>;
      keyframeCount: number;
    }>;
  }>;
}

export function describeProject(take: StudioTake): ProjectState {
  return {
    takeId: take.id,
    title: take.title,
    durationMs: Math.max(projectDurationMs(take), take.durationMs),
    styling: take.styling,
    mediaAssets: (take.mediaAssets ?? []).map((asset) => ({
      id: asset.id,
      name: asset.name,
      kind: asset.kind,
      durationMs: asset.durationMs,
    })),
    tracks: (take.tracks ?? []).map((track) => ({
      id: track.id,
      name: track.name,
      type: track.type,
      clipCount: track.clips.length,
      clips: track.clips.map((clip) => {
        const effects = clip.payload?.effects ?? [];
        return {
          id: clip.id,
          name: clip.name,
          itemType: clip.itemType,
          startMs: clip.startMs,
          durationMs: clip.durationMs,
          mediaAssetId: clip.mediaAssetId ?? clip.payload?.mediaAssetId,
          effectCount: effects.length,
          effects: effects.map((effect) => ({
            id: effect.id,
            type: effect.type,
            intensity: effect.intensity,
            stackOrder: effect.stackOrder,
          })),
          keyframeCount: clip.payload?.keyframes?.length ?? 0,
        };
      }),
    })),
  };
}

/** Look up an existing caption/overlay clip, e.g. for verification. */
export function findElementClip(take: StudioTake, id: string) {
  return findClip(take, id);
}

/** All clip effects on the timeline, flattened for diagnostics. */
export function listClipEffects(take: StudioTake) {
  return listClips(take).flatMap((clip) =>
    (clip.payload?.effects ?? []).map((effect) => ({
      clipId: clip.id,
      ...effect,
    })),
  );
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
