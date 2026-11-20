/**
 * lib/studio/render/compose.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The single composition pass for a Studio preview frame.
 *
 * Order (bottom → top):
 *   1. wallpaper + ambient glow
 *   2. window shadow
 *   3. active video clips from bottom to top, clipped to the rounded window
 *   4. media overlays
 *   5. canvas effect passes
 *   6. window chrome (header, dots, border)
 *   7. captions
 *
 * Keeping the order in one place means the Canvas preview, and any future
 * export renderer, paint identical frames.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { resolveActiveStudioCaption } from '../captions/presets';
import type {
  StudioCaption,
  ClipTransform,
  StudioEffect,
  StudioEffectType,
  StudioOverlay,
  StudioStyling,
  StudioVideoCrop,
  TimelineTrack,
} from '../types';
import { effectTypeFromPayload } from '../effects/catalog';
import { evaluateClipAtTime } from '../animation-evaluator';
import { drawStudioBackground } from './background';
import { cameraSourceRect, type StudioCameraState } from './camera';
import { drawStudioCaption } from './captions';
import { drawStudioEffects } from './effects';
import { drawStudioWindowChrome, drawStudioWindowShadow } from './frame';
import { computeStudioWindowFrame } from './geometry';
import { drawClipDeviceFrame } from './clip-device-frame';
import { drawStudioOverlays, type StudioOverlayAsset } from './overlays';

export interface StudioComposeInput {
  width: number;
  height: number;
  styling: StudioStyling;
  timeMs: number;
  video: HTMLVideoElement | null;
  videoReady: boolean;
  camera: StudioCameraState;
  effects: readonly StudioEffect[];
  captions: readonly StudioCaption[];
  overlays: readonly StudioOverlay[];
  overlayAssets: ReadonlyMap<string, StudioOverlayAsset>;
  videoCrop?: StudioVideoCrop;
  /** Cached radial glow, rebuilt only when the canvas size changes. */
  glowGradient?: CanvasGradient | null;
  /** Optional custom window chrome / device frame renderer */
  drawWindowChrome?: (
    ctx: CanvasRenderingContext2D,
    frame: import('./geometry').StudioWindowFrame,
  ) => void;
  /** Ordered editor tracks used to composite the current frame. */
  tracks?: readonly TimelineTrack[];
  clipAssets?: ReadonlyMap<string, StudioOverlayAsset>;
  /** Composition time in ms (for animation evaluation; differs from source time when cuts exist). */
  compTimeMs?: number;
  /** Live transform preview while the canvas gizmo is being dragged. */
  clipTransformPreview?: { clipId: string; transform: ClipTransform } | null;
}

export function drawStudioFrame(
  ctx: CanvasRenderingContext2D,
  input: StudioComposeInput,
): void {
  const { width, height, styling, timeMs } = input;
  const showcaseMode = styling.canvasMode !== 'edit';
  // Animation evaluation uses composition time, not source time
  const compTime = input.compTimeMs ?? timeMs;

  drawStudioBackground(ctx, {
    width,
    height,
    background: styling.background,
    glowGradient: input.glowGradient,
  });

  const crop = input.videoCrop;
  const activeVideoClip = input.tracks
    ?.filter((track) => track.type === 'video' && track.visible)
    .flatMap((track) => track.clips)
    .find((clip) => compTime >= clip.startMs && compTime <= clip.startMs + clip.durationMs);
  const activeVideoAsset = activeVideoClip?.payload?.mediaAssetId
    ? input.clipAssets?.get(activeVideoClip.payload.mediaAssetId)
    : undefined;
  const activeUsesRecordedVideo =
    (!activeVideoClip || activeVideoClip.trackId === 'track-video') &&
    !activeVideoClip?.payload?.mediaAssetId;
  const videoAspect =
    activeVideoAsset && activeVideoAsset.width > 0 && activeVideoAsset.height > 0
      ? activeVideoAsset.width / activeVideoAsset.height
      : activeUsesRecordedVideo && crop && crop.width > 0 && crop.height > 0
      ? crop.width / crop.height
      : activeUsesRecordedVideo && input.video && input.video.videoWidth > 0 && input.video.videoHeight > 0
        ? input.video.videoWidth / input.video.videoHeight
        : 16 / 9;

  const frame = computeStudioCanvasFrame(width, height, styling, videoAspect);

  if (showcaseMode) drawStudioWindowShadow(ctx, frame);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(frame.x, frame.y, frame.width, frame.height, frame.radius);
  ctx.clip();

  if (!input.tracks && input.videoReady && input.video) {
    // Compatibility path for callers that haven't supplied timeline tracks.
    const vw = input.video.videoWidth || 1920;
    const vh = input.video.videoHeight || 1080;
    const source = crop
      ? {
          x: Math.max(0, Math.min(vw, crop.x * vw)),
          y: Math.max(0, Math.min(vh, crop.y * vh)),
          width: Math.max(1, crop.width * vw),
          height: Math.max(1, crop.height * vh),
        }
      : cameraSourceRect(input.camera, vw, vh);

    ctx.drawImage(
      input.video,
      source.x,
      source.y,
      source.width,
      source.height,
      frame.contentX,
      frame.contentY,
      frame.contentWidth,
      frame.contentHeight,
    );
  } else {
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(
      frame.contentX,
      frame.contentY,
      frame.contentWidth,
      frame.contentHeight,
    );
  }

  // A track based composition draws every visible video clip in stack order.
  // The recorded take is supplied as the media source for its legacy clip so
  // it follows the same layer, trim, transition, and visibility rules.
  if (input.tracks) {
    drawMultiTrackClips(
      ctx,
      input.tracks,
      input.clipAssets,
      frame,
      compTime,
      input.videoReady ? input.video : null,
      input.camera,
      input.videoCrop,
      input.clipTransformPreview,
    );
  }

  const visibleOverlayIds = input.tracks
    ?.filter((track) => track.type === 'overlays' && track.visible)
    .flatMap((track) => track.clips.map((clip) => clip.id));
  const hasOverlayTracks = input.tracks?.some((track) => track.type === 'overlays');
  const overlays = input.tracks && hasOverlayTracks
    ? (input.overlays ?? []).filter((overlay) => visibleOverlayIds?.includes(overlay.id))
    : input.overlays;
  drawStudioOverlays(ctx, overlays, input.overlayAssets, frame, timeMs, input.tracks, compTime);

  const trackEffects: StudioEffect[] | undefined = input.tracks
    ?.filter((track) => track.type === 'effects' && track.visible)
    .flatMap((track) => track.clips.flatMap((clip) => {
      const type = effectTypeFromPayload(clip.payload);
      return type
        ? [{
            id: clip.id,
            type: type as StudioEffectType,
            startMs: clip.startMs,
            endMs: clip.startMs + clip.durationMs,
            intensity: clip.payload?.intensity ?? 0.6,
          }]
        : [];
    }));
  drawStudioEffects(ctx, input.tracks ? trackEffects : input.effects, frame, compTime);
  if (showcaseMode) {
    (input.drawWindowChrome ?? drawStudioWindowChrome)(ctx, frame);
  }

  ctx.restore();

  const trackCaptions: StudioCaption[] | undefined = input.tracks
    ?.filter((track) => track.type === 'captions' && track.visible)
    .flatMap((track) => track.clips.map((clip) => {
      const existing = input.captions?.find((captionItem) => captionItem.id === clip.id);
      return {
        ...existing,
        id: clip.id,
        startMs: clip.startMs,
        endMs: clip.startMs + clip.durationMs,
        text: clip.payload?.text ?? existing?.text ?? clip.name,
      };
    }));
  const caption = styling.showCaptions
    ? resolveActiveStudioCaption(input.tracks ? trackCaptions : input.captions, compTime)
    : null;
  if (caption) {
    drawStudioCaption(ctx, {
      caption,
      style: styling.captionStyle,
      frame,
      timeMs,
    });
  }
}

/** Draw active video clips in track order, with one renderer for all sources. */
function drawMultiTrackClips(
  ctx: CanvasRenderingContext2D,
  tracks: readonly TimelineTrack[],
  assets: ReadonlyMap<string, StudioOverlayAsset> | undefined,
  frame: import('./geometry').StudioWindowFrame,
  compTimeMs: number,
  recordedVideo: HTMLVideoElement | null,
  camera: StudioCameraState,
  videoCrop?: StudioVideoCrop,
  clipTransformPreview?: { clipId: string; transform: ClipTransform } | null,
): void {
  const transitions = tracks
    .filter((track) => track.type === 'transitions' && track.visible)
    .flatMap((track) => track.clips);

  // Timeline rows are ordered top-to-bottom. Paint the lower video rows first
  // so the topmost lane is the last one composited onto the canvas.
  const videoTracks = tracks.filter((track) => track.type === 'video' && track.visible);
  for (const track of [...videoTracks].reverse()) {

    for (const clip of track.clips) {
      if (compTimeMs < clip.startMs || compTimeMs > clip.startMs + clip.durationMs) continue;

      const payload = clip.payload;
      const asset = payload?.mediaAssetId ? assets?.get(payload.mediaAssetId) : undefined;
      const isRecordedSource = !payload?.mediaAssetId && track.id === 'track-video';
      const source = asset?.element ?? (isRecordedSource ? recordedVideo : null);
      if (!source) continue;

      const sourceWidth = asset?.width ?? recordedVideo?.videoWidth ?? 0;
      const sourceHeight = asset?.height ?? recordedVideo?.videoHeight ?? 0;
      if (sourceWidth <= 0 || sourceHeight <= 0) continue;
      let sourceRect = { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
      if (isRecordedSource && recordedVideo) {
        if (videoCrop && videoCrop.width > 0 && videoCrop.height > 0) {
          sourceRect = {
            x: Math.max(0, Math.min(sourceWidth, videoCrop.x * sourceWidth)),
            y: Math.max(0, Math.min(sourceHeight, videoCrop.y * sourceHeight)),
            width: Math.max(1, videoCrop.width * sourceWidth),
            height: Math.max(1, videoCrop.height * sourceHeight),
          };
        } else {
          sourceRect = cameraSourceRect(camera, sourceWidth, sourceHeight);
        }
      }

      const localTime = compTimeMs - clip.startMs;
      const anim = evaluateClipAtTime(
        clip.durationMs,
        payload?.enterAnimation,
        payload?.exitAnimation,
        localTime,
      );

      const transition = transitions.find((candidate) =>
          candidate.payload?.targetClipId === clip.id &&
          compTimeMs >= candidate.startMs &&
          compTimeMs <= candidate.startMs + candidate.durationMs,
        );
      const transitionDuration = Math.max(1, transition?.durationMs ?? 1);
      const transitionProgress = transition
        ? Math.max(0, Math.min(1, (compTimeMs - transition.startMs) / transitionDuration))
        : 1;
      const transitionSide = transition?.payload?.transitionSide ?? 'in';
      const transitionType = transition?.payload?.transitionType;
      const transitionAmount = transitionSide === 'out'
        ? 1 - transitionProgress
        : transitionProgress;
      const transitionOpacity = transitionType === 'fade' ? transitionAmount : 1;
      const transitionX = transitionType === 'slide-left'
        ? frame.contentWidth * (transitionSide === 'out' ? -transitionProgress : 1 - transitionProgress)
        : transitionType === 'slide-right'
          ? frame.contentWidth * (transitionSide === 'out' ? transitionProgress : transitionProgress - 1)
          : 0;
      const transitionY = transitionType === 'slide-up'
        ? frame.contentHeight * (transitionSide === 'out' ? -transitionProgress : 1 - transitionProgress)
        : transitionType === 'slide-down'
          ? frame.contentHeight * (transitionSide === 'out' ? transitionProgress : transitionProgress - 1)
          : 0;
      const transitionScale = transitionType === 'scale'
        ? (transitionSide === 'out' ? 1 - 0.25 * transitionProgress : 0.75 + 0.25 * transitionProgress)
        : 1;

      const transform = clipTransformPreview?.clipId === clip.id
        ? clipTransformPreview.transform
        : payload?.transform;
      const centerX = frame.contentX + (payload?.x ?? 0.5) * frame.contentWidth + (transform?.position?.x ?? 0);
      const centerY = frame.contentY + (payload?.y ?? 0.5) * frame.contentHeight + (transform?.position?.y ?? 0);
      const baseWidth = payload?.widthPct ? payload.widthPct * frame.contentWidth : frame.contentWidth;
      const width = Math.max(1, baseWidth);
      const aspect = sourceWidth / sourceHeight;
      const height = payload?.widthPct ? Math.max(1, baseWidth / aspect) : frame.contentHeight;
      // Full-canvas clips use a cover crop so portrait or 4:3 sources keep
      // their proportions on a differently shaped output canvas. Smaller
      // picture-in-picture clips keep the full source and its native aspect.
      if (!payload?.widthPct) {
        sourceRect = coverSourceRect(sourceRect, frame.contentWidth / frame.contentHeight);
      }
      const drawX = -width / 2 + anim.x + transitionX;
      const drawY = -height / 2 + anim.y + transitionY;

      ctx.save();
      ctx.translate(centerX, centerY);
      const anchor = transform?.anchorPoint ?? { x: 0.5, y: 0.5 };
      const pivotX = (anchor.x - 0.5) * width;
      const pivotY = (anchor.y - 0.5) * height;
      ctx.translate(pivotX, pivotY);
      ctx.scale(anim.scale * transitionScale * (transform?.scale?.x ?? 1), anim.scale * transitionScale * (transform?.scale?.y ?? 1));
      ctx.rotate(((anim.rotation ?? 0) + (transform?.rotation ?? 0)) * Math.PI / 180);
      ctx.translate(-pivotX, -pivotY);
      ctx.globalAlpha = (payload?.opacity ?? 1) * anim.opacity * transitionOpacity;

      const radius = Math.max(0, payload?.cornerRadius ?? 0);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(drawX, drawY, width, height, radius);
      ctx.clip();
      ctx.drawImage(
        source,
        sourceRect.x,
        sourceRect.y,
        sourceRect.width,
        sourceRect.height,
        drawX,
        drawY,
        width,
        height,
      );
      ctx.restore();

      if (payload?.deviceFrame) drawClipDeviceFrame(ctx, payload.deviceFrame, width, height, radius);

      ctx.restore();
    }
  }
}

export function computeStudioCanvasFrame(
  width: number,
  height: number,
  styling: StudioStyling,
  contentAspect: number,
): import('./geometry').StudioWindowFrame {
  if (styling.canvasMode !== 'edit') {
    return computeStudioWindowFrame({
      canvasWidth: width,
      canvasHeight: height,
      padding: styling.padding,
      borderRadius: styling.borderRadius,
      contentAspect,
    });
  }
  return {
    x: 0,
    y: 0,
    width,
    height,
    radius: 0,
    headerHeight: 0,
    contentX: 0,
    contentY: 0,
    contentWidth: width,
    contentHeight: height,
  };
}

function coverSourceRect(
  source: { x: number; y: number; width: number; height: number },
  targetAspect: number,
): { x: number; y: number; width: number; height: number } {
  if (!Number.isFinite(targetAspect) || targetAspect <= 0) return source;
  const sourceAspect = source.width / source.height;
  if (sourceAspect > targetAspect) {
    const width = source.height * targetAspect;
    return { ...source, x: source.x + (source.width - width) / 2, width };
  }
  const height = source.width / targetAspect;
  return { ...source, y: source.y + (source.height - height) / 2, height };
}
