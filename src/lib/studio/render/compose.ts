/**
 * lib/studio/render/compose.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The single composition pass for a Studio preview frame.
 *
 * Order (bottom → top):
 *   1. wallpaper + ambient glow
 *   2. window shadow
 *   3. active video clips from bottom to top, clipped to the rounded window
 *      (each clip's effects render immediately after the clip is drawn)
 *   4. media overlays
 *   5. window chrome (header, dots, border)
 *   6. captions
 *
 * Effects are now clip-attached (not global). Each clip's effects render in
 * stackOrder sequence immediately after the clip is drawn, before the next
 * clip. This enables depth-ordered effects where effects on top clips can
 * blend onto bottom clips.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { resolveActiveStudioCaption } from '../captions/presets';
import type {
  StudioCaption,
  ClipAnimation,
  ClipTransform,
  ClipEffect,
  StudioEffect,
  StudioEffectType,
  StudioOverlay,
  StudioStyling,
  StudioVideoCrop,
  TextAnimatorMode,
  TimelineTrack,
} from '../types';
import { effectTypeFromPayload } from '../effects/catalog';
import { evaluateClipAtTime } from '../animation-evaluator';
import {
  evaluateClipKeyframeValues,
  evaluateEffectIntensity,
} from '../keyframes';
import { drawStudioBackground } from './background';
import { cameraSourceRect, type StudioCameraState } from './camera';
import { drawStudioCaption } from './captions';
import {
  computeStudioTextAnimatorProgress,
  drawStudioFreeText,
  resolveStudioTextStyle,
  usesStudioFreeTextClip,
} from './text-style';
import { drawStudioEffects, drawStudioEffectPass } from './effects';
import { drawKeyedSource } from './gl-effect-pass';
import { drawMaskedSource } from './gl-masks';
import {
  drawGpuTransitionFallback,
  isGpuTransitionType,
  renderGpuTransitionPass,
} from './gl-transitions';
import { findChromaKeyEffect, resolveChromaKeyParams } from './chroma-key';
import { blendModeToComposite } from '../blend-modes';
import { drawStudioWindowChrome, drawStudioWindowShadow } from './frame';
import { computeStudioCanvasFrame } from './geometry';

// Re-exported for callers that historically imported it from this module.
export { computeStudioCanvasFrame };
import { drawClipDeviceFrame } from './clip-device-frame';
import { drawStudioOverlays, type StudioOverlayAsset } from './overlays';
import {
  evaluateEditorTimeline,
  type EditorTimelineFrame,
  type EvaluatedTimelineClip,
} from '../timeline/evaluate';

const sortedEffectsCache = new WeakMap<object, readonly ClipEffect[]>();
const overlayIndexCache = new WeakMap<object, ReadonlyMap<string, StudioOverlay>>();

function sortedEffects(effects: readonly ClipEffect[]): readonly ClipEffect[] {
  const cached = sortedEffectsCache.get(effects);
  if (cached) return cached;
  const sorted = [...effects].sort((a, b) => a.stackOrder - b.stackOrder);
  sortedEffectsCache.set(effects, sorted);
  return sorted;
}

function indexOverlays(
  overlays: readonly StudioOverlay[] | undefined,
): ReadonlyMap<string, StudioOverlay> {
  if (!overlays) return new Map();
  const cached = overlayIndexCache.get(overlays);
  if (cached) return cached;
  const index = new Map(overlays.map((overlay) => [overlay.id, overlay]));
  overlayIndexCache.set(overlays, index);
  return index;
}

export interface StudioComposeInput {
  width: number;
  height: number;
  styling: StudioStyling;
  timeMs: number;
  video: HTMLVideoElement | null;
  videoReady: boolean;
  camera: StudioCameraState;
  /**
   * Global canvas camera. Unlike `camera` (which crops the source video inside
   * the framed window), this scales/pans the *entire* composed canvas, like a
   * virtual camera over the finished frame. Used by timeline zoom clips.
   */
  canvasCamera?: StudioCameraState;
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
  /** Timeline evaluation shared by callers that already resolved this frame. */
  evaluatedTimeline?: EditorTimelineFrame;
  clipAssets?: ReadonlyMap<string, StudioOverlayAsset>;
  /** Independent video elements keyed by timeline clip ID. */
  clipInstances?: ReadonlyMap<string, StudioOverlayAsset>;
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
  const timelineFrame = input.evaluatedTimeline ?? (input.tracks
    ? evaluateEditorTimeline(input.tracks, compTime)
    : null);

  drawStudioBackground(ctx, {
    width,
    height,
    background: styling.background,
    glowGradient: input.glowGradient,
    timeMs: compTime,
  });

  const crop = input.videoCrop;
  const activeVideoItems = (timelineFrame?.video ?? []).filter(
    ({ itemType }) => itemType === 'video' || itemType === 'image',
  );
  const activeVideoClip = activeVideoItems.length > 0
    ? activeVideoItems[activeVideoItems.length - 1].clip
    : undefined;
  const activeVideoAsset = activeVideoClip?.payload?.mediaAssetId
    ? input.clipInstances?.get(activeVideoClip.id) ?? input.clipAssets?.get(activeVideoClip.payload.mediaAssetId)
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
  } else if (showcaseMode) {
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
      activeVideoItems,
      timelineFrame?.transitions ?? [],
      input.clipAssets,
      input.clipInstances,
      frame,
      compTime,
      input.videoReady ? input.video : null,
      input.camera,
      input.videoCrop,
      input.clipTransformPreview,
    );
  }

  const visibleOverlayIds = new Set(
    (timelineFrame?.overlays ?? [])
      .filter(({ itemType }) => itemType === 'overlay')
      .map(({ clip }) => clip.id),
  );
  const hasOverlayTracks = input.tracks?.some((track) => track.type === 'overlays');
  const overlays = input.tracks && hasOverlayTracks
    ? (input.overlays ?? []).filter((overlay) => visibleOverlayIds.has(overlay.id))
    : input.overlays;
  const overlayById = indexOverlays(input.overlays);
  drawStudioOverlays(ctx, overlays, input.overlayAssets, frame, timeMs, input.tracks, compTime);

  // Overlay clips can carry clip-attached effects too. They are drawn in
  // composition space (the overlay renderer resolves their geometry), which is
  // the same space the display-list overlay op uses.
  if (timelineFrame) {
    for (const item of timelineFrame.overlays) {
      const record = overlayById.get(item.clip.id);
      if (!record) continue;
      const effects = item.clip.payload?.effects;
      if (!effects || effects.length === 0) continue;
      const width = Math.max(24, record.widthPct * frame.contentWidth);
      const height = width; // Overlay renderer preserves aspect; effects only
      const rect = {
        x: frame.contentX + record.x * frame.contentWidth - width / 2,
        y: frame.contentY + record.y * frame.contentHeight - height / 2,
        width,
        height,
      };
      for (const effect of sortedEffects(effects)) {
        // Keying needs the overlay's own pixels before compositing. The overlay
        // renderer owns that draw, so a lane-level/overlay key is a no-op here
        // rather than a readback that would key the frame below it.
        if (effect.type === 'chroma-key') continue;
        drawStudioEffectPass(ctx, {
          type: effect.type,
          intensity: evaluateEffectIntensity(
            item.clip,
            effect,
            item.localTimeMs,
          ),
          frame,
          timeMs: compTime,
          params: effect.params,
          rect,
        });
      }
    }
  }

  // Vector shape clips live on any visual track (usually overlays) and paint
  // inside the window, below the chrome.
  if (timelineFrame && input.tracks) {
    drawTimelineShapes(ctx, timelineFrame, frame, compTime);
  }

  // Legacy path: apply global effects (only when not using tracks)
  // When using tracks, effects are per-clip and applied in drawMultiTrackClips()
  if (!input.tracks) {
    drawStudioEffects(ctx, input.effects, frame, compTime);
  }
  if (showcaseMode) {
    (input.drawWindowChrome ?? drawStudioWindowChrome)(ctx, frame);
  }

  ctx.restore();

  const trackTextItems = (timelineFrame?.captions ?? []).filter(
    ({ itemType }) => itemType === 'text',
  );
  const freeTextItems = trackTextItems.filter(({ clip }) =>
    usesStudioFreeTextClip(clip),
  );

  if (styling.showCaptions) {
    for (const { clip, localTimeMs } of freeTextItems) {
      const style = resolveStudioTextStyle(clip.payload?.textStyle);
      const baseCaption: StudioCaption = {
        id: clip.id,
        startMs: clip.startMs,
        endMs: clip.startMs + clip.durationMs,
        text: clip.payload?.text ?? clip.name,
        ...(clip.payload?.words?.length ? { words: clip.payload.words } : {}),
      };
      const textAnimator = clip.payload?.textAnimator;
      const textAnimatorState = textAnimator
        ? {
            mode: textAnimator.mode,
            progress: computeStudioTextAnimatorProgress(
              baseCaption.text,
              textAnimator,
              Math.max(0, compTime - clip.startMs),
            ),
          }
        : undefined;
      const transform = input.clipTransformPreview?.clipId === clip.id
        ? input.clipTransformPreview.transform
        : clip.payload?.transform;
      const kf = evaluateClipKeyframeValues(clip, localTimeMs);
      const anim = evaluateClipAtTime(
        clip.durationMs,
        clip.payload?.enterAnimation,
        clip.payload?.exitAnimation,
        localTimeMs,
      );
      const centerX =
        frame.contentX +
        (clip.payload?.x ?? 0.5) * frame.contentWidth +
        (transform?.position?.x ?? 0) +
        (kf.x ?? 0) +
        (anim.x ?? 0);
      const centerY =
        frame.contentY +
        (clip.payload?.y ?? 0.5) * frame.contentHeight +
        (transform?.position?.y ?? 0) +
        (kf.y ?? 0) +
        (anim.y ?? 0);

      ctx.save();
      ctx.globalCompositeOperation = blendModeToComposite(
        clip.payload?.blendMode,
      );
      ctx.globalAlpha =
        (kf.opacity ?? clip.payload?.opacity ?? 1) * (anim.opacity ?? 1);
      ctx.translate(centerX, centerY);
      ctx.rotate(
        (((transform?.rotation ?? 0) + (kf.rotation ?? anim.rotation ?? 0)) *
          Math.PI) /
          180,
      );
      const textScale = kf.scale ?? anim.scale ?? 1;
      ctx.scale(
        (transform?.scale?.x ?? 1) * textScale,
        (transform?.scale?.y ?? 1) * textScale,
      );
      drawStudioFreeText(ctx, baseCaption.text, { ...style, fontWeight: 600 }, textAnimatorState);
      ctx.restore();
    }
  }

  const trackCaptions: StudioCaption[] | undefined = trackTextItems
    .filter(({ clip }) => !usesStudioFreeTextClip(clip))
    .filter(({ itemType }) => itemType === 'text')
    .map(({ clip }) => {
      const existing = input.captions?.find((captionItem) => captionItem.id === clip.id);
      return {
        id: clip.id,
        startMs: clip.startMs,
        endMs: clip.startMs + clip.durationMs,
        text: clip.payload?.text ?? existing?.text ?? clip.name,
        // Word timings on the track path are composition-addressed. Spreading
        // the legacy caption here would import source-time timings and desync
        // the karaoke highlight whenever cuts are present.
        ...(clip.payload?.words && clip.payload.words.length > 0
          ? { words: clip.payload.words }
          : {}),
      };
    });

  // Caption spans are composition time on the track path and source time on the
  // legacy path. Selection and the karaoke clock must use the matching axis.
  const usingTracks = Boolean(input.tracks);
  const captionPool = usingTracks ? trackCaptions : input.captions;
  const caption = styling.showCaptions
    ? resolveActiveStudioCaption(captionPool, usingTracks ? compTime : timeMs)
    : null;
  if (caption) {
    let captionAnimator: { mode: TextAnimatorMode; progress: number } | undefined;
    if (usingTracks) {
      const activeItem = trackTextItems.find(
        ({ clip }) => clip.id === caption.id,
      );
      const animator = activeItem?.clip.payload?.textAnimator;
      if (activeItem && animator) {
        captionAnimator = {
          mode: animator.mode,
          progress: computeStudioTextAnimatorProgress(
            caption.text,
            animator,
            Math.max(0, compTime - activeItem.clip.startMs),
          ),
        };
      }
    }
    drawStudioCaption(ctx, {
      caption,
      style: styling.captionStyle,
      frame,
      timeMs: usingTracks ? compTime : timeMs,
      animator: captionAnimator,
    });
  }
}

/** Paint `itemType: 'shape'` clips as live SVG paths inside the window. */
function drawTimelineShapes(
  ctx: CanvasRenderingContext2D,
  timelineFrame: EditorTimelineFrame,
  frame: import('./geometry').StudioWindowFrame,
  compTimeMs: number,
): void {
  if (typeof Path2D === 'undefined') return;
  const items = [
    ...timelineFrame.video,
    ...timelineFrame.overlays,
    ...timelineFrame.captions,
  ];
  for (const item of items) {
    if (item.itemType !== 'shape') continue;
    const payload = item.clip.payload as unknown as
      | {
          pathData?: string;
          shapeKind?: string;
          fill?: string;
          stroke?: { color: string; width: number };
          trim?: { start: number; end: number; offset: number };
          pathLengthPx?: number;
          transform?: ClipTransform;
          enterAnimation?: ClipAnimation;
          exitAnimation?: ClipAnimation;
          x?: number;
          y?: number;
          opacity?: number;
          blendMode?: string;
        }
      | undefined;
    if (!payload?.pathData) continue;

    let path: Path2D;
    try {
      path = new Path2D(payload.pathData);
    } catch {
      continue;
    }

    const anim = evaluateClipAtTime(
      item.clip.durationMs,
      payload.enterAnimation,
      payload.exitAnimation,
      item.localTimeMs,
    );
    const kf = evaluateClipKeyframeValues(item.clip, item.localTimeMs);
    const transform = payload.transform;
    const centerX =
      frame.contentX +
      (payload.x ?? 0.5) * frame.contentWidth +
      (transform?.position?.x ?? 0) +
      (kf.x ?? 0) +
      (anim.x ?? 0);
    const centerY =
      frame.contentY +
      (payload.y ?? 0.5) * frame.contentHeight +
      (transform?.position?.y ?? 0) +
      (kf.y ?? 0) +
      (anim.y ?? 0);
    const scale =
      (transform?.scale?.x ?? 1) *
      (kf.scale ?? anim.scale ?? 1);
    const rotation =
      ((transform?.rotation ?? 0) + (kf.rotation ?? anim.rotation ?? 0)) *
      (Math.PI / 180);

    ctx.save();
    ctx.globalCompositeOperation = blendModeToComposite(payload.blendMode);
    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);
    ctx.rotate(rotation);
    ctx.globalAlpha = Math.max(
      0,
      Math.min(1, (payload.opacity ?? 1) * (kf.opacity ?? anim.opacity ?? 1)),
    );

    if (payload.fill) {
      ctx.fillStyle = payload.fill;
      ctx.fill(path);
    }
    if (payload.stroke) {
      const total = payload.pathLengthPx ?? 0;
      const trim = payload.trim;
      if (trim && total > 0) {
        const start = Math.max(0, Math.min(1, trim.start)) * total;
        const end = Math.max(0, Math.min(1, trim.end)) * total;
        const visible = Math.max(1, end - start);
        ctx.setLineDash([visible, Math.max(total, visible + 1)]);
        ctx.lineDashOffset = -start - trim.offset * total;
      }
      ctx.strokeStyle = payload.stroke.color;
      ctx.lineWidth = payload.stroke.width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke(path);
    }
    ctx.restore();
  }
}

/** Draw active video clips in track order, with one renderer for all sources. */
function drawMultiTrackClips(
  ctx: CanvasRenderingContext2D,
  activeVideoItems: readonly EvaluatedTimelineClip[],
  activeTransitions: readonly EvaluatedTimelineClip[],
  assets: ReadonlyMap<string, StudioOverlayAsset> | undefined,
  clipInstances: ReadonlyMap<string, StudioOverlayAsset> | undefined,
  frame: import('./geometry').StudioWindowFrame,
  compTimeMs: number,
  recordedVideo: HTMLVideoElement | null,
  camera: StudioCameraState,
  videoCrop?: StudioVideoCrop,
  clipTransformPreview?: { clipId: string; transform: ClipTransform } | null,
): void {
  const lastOutgoingSourceByTrack = new Map<string, CanvasImageSource>();
  for (const evaluatedItem of activeVideoItems) {
    const { track, clip, localTimeMs } = evaluatedItem;
    const payload = clip.payload;
    // Universal keyframes override the enter/exit animation values for
    // x/y/scale/rotation/opacity; absent keyframes fall through to `anim`.
    const kf = evaluateClipKeyframeValues(clip, localTimeMs);
    const asset = clipInstances?.get(clip.id) ?? (payload?.mediaAssetId ? assets?.get(payload.mediaAssetId) : undefined);
    const isRecordedSource = !payload?.mediaAssetId && track.id === 'track-video';
    const source = asset?.element ?? (isRecordedSource ? recordedVideo : null);
    if (!source) continue;
    if (source instanceof HTMLVideoElement && source.readyState < 2) continue;

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

    const anim = evaluateClipAtTime(
      clip.durationMs,
      payload?.enterAnimation,
      payload?.exitAnimation,
      localTimeMs,
    );

    const pairedTransition = evaluatedItem.transition;
    const legacyTransition = pairedTransition
      ? undefined
      : activeTransitions.find(
          ({ clip: candidate, itemType }) =>
            itemType === 'transition' &&
            candidate.payload?.targetClipId === clip.id,
        )?.clip;
    const transition = legacyTransition;
    const transitionDuration = Math.max(1, transition?.durationMs ?? 1);
    const transitionProgress = pairedTransition?.progress ?? (transition
      ? Math.max(0, Math.min(1, (compTimeMs - transition.startMs) / transitionDuration))
      : 1);
    const transitionSide = transition?.payload?.transitionSide ?? 'in';
    const transitionType = pairedTransition?.type ?? transition?.payload?.transitionType;
    const isPairedGpuTransition = Boolean(
      pairedTransition && transitionType && isGpuTransitionType(transitionType),
    );
    if (isPairedGpuTransition && pairedTransition?.role === 'outgoing') {
      lastOutgoingSourceByTrack.set(clip.trackId, source);
      continue;
    }
    const gpuTransitionFromSource =
      isPairedGpuTransition && pairedTransition?.role === 'incoming'
        ? lastOutgoingSourceByTrack.get(clip.trackId)
        : undefined;
    const transitionAmount = pairedTransition
      ? pairedTransition.role === 'outgoing'
        ? 1 - transitionProgress
        : transitionProgress
      : transitionSide === 'out'
        ? 1 - transitionProgress
        : transitionProgress;
    const transitionOpacity = pairedTransition
      ? transitionType === 'fade' || transitionType === 'blur'
        ? pairedTransition.role === 'outgoing'
          ? 1
          : transitionProgress
        : 1
      : transitionType === 'fade'
        ? transitionAmount
        : 1;
    const transitionX = pairedTransition
      ? transitionType === 'slide-left'
        ? frame.contentWidth * (pairedTransition.role === 'outgoing' ? -transitionProgress : 1 - transitionProgress)
        : transitionType === 'slide-right'
          ? frame.contentWidth * (pairedTransition.role === 'outgoing' ? transitionProgress : transitionProgress - 1)
          : 0
      : transitionType === 'slide-left'
        ? frame.contentWidth * (transitionSide === 'out' ? -transitionProgress : 1 - transitionProgress)
        : transitionType === 'slide-right'
          ? frame.contentWidth * (transitionSide === 'out' ? transitionProgress : transitionProgress - 1)
          : 0;
    const transitionY = pairedTransition
      ? transitionType === 'slide-up'
        ? frame.contentHeight * (pairedTransition.role === 'outgoing' ? -transitionProgress : 1 - transitionProgress)
        : transitionType === 'slide-down'
          ? frame.contentHeight * (pairedTransition.role === 'outgoing' ? transitionProgress : transitionProgress - 1)
          : 0
      : transitionType === 'slide-up'
        ? frame.contentHeight * (transitionSide === 'out' ? -transitionProgress : 1 - transitionProgress)
        : transitionType === 'slide-down'
          ? frame.contentHeight * (transitionSide === 'out' ? transitionProgress : transitionProgress - 1)
          : 0;
    const transitionScale = transitionType === 'scale'
      ? pairedTransition
        ? pairedTransition.role === 'outgoing'
          ? 1 - 0.25 * transitionProgress
          : 0.75 + 0.25 * transitionProgress
        : transitionSide === 'out'
          ? 1 - 0.25 * transitionProgress
          : 0.75 + 0.25 * transitionProgress
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
    const drawX = -width / 2 + (kf.x ?? anim.x) + transitionX;
    const drawY = -height / 2 + (kf.y ?? anim.y) + transitionY;

    ctx.save();
    ctx.translate(centerX, centerY);
    const anchor = transform?.anchorPoint ?? { x: 0.5, y: 0.5 };
    const pivotX = (anchor.x - 0.5) * width;
    const pivotY = (anchor.y - 0.5) * height;
    ctx.translate(pivotX, pivotY);
    const clipScale = kf.scale ?? anim.scale;
    ctx.scale(clipScale * transitionScale * (transform?.scale?.x ?? 1), clipScale * transitionScale * (transform?.scale?.y ?? 1));
    ctx.rotate(((kf.rotation ?? anim.rotation ?? 0) + (transform?.rotation ?? 0)) * Math.PI / 180);
    ctx.translate(-pivotX, -pivotY);
    ctx.globalAlpha = (kf.opacity ?? payload?.opacity ?? 1) * anim.opacity * transitionOpacity;
    ctx.globalCompositeOperation = blendModeToComposite(payload?.blendMode);

    const radius = Math.max(0, payload?.cornerRadius ?? 0);

    // A key is a source filter: resolve it before the clip is composited and
    // suppress the matching adjustment-layer pass below.
    const chromaKeyEffect = findChromaKeyEffect(payload?.effects);
    const chromaKey = chromaKeyEffect
      ? resolveChromaKeyParams(
          chromaKeyEffect,
          evaluateEffectIntensity(clip, chromaKeyEffect, localTimeMs),
        )
      : undefined;

    ctx.save();
    if (pairedTransition && transitionType === 'blur') {
      const blurPx = Math.sin(transitionProgress * Math.PI) * 12;
      ctx.filter = `blur(${blurPx}px)`;
    }
    ctx.beginPath();
    ctx.roundRect(drawX, drawY, width, height, radius);
    ctx.clip();

    const maskParams = payload?.mask?.enabled ? payload.mask : undefined;

    const gpuTransitionRendered =
      gpuTransitionFromSource &&
      transitionType &&
      isGpuTransitionType(transitionType)
        ? renderGpuTransitionPass(ctx, {
            type: transitionType,
            progress: transitionProgress,
            fromSource: gpuTransitionFromSource,
            toSource: source,
            rect: { x: drawX, y: drawY, width, height },
          }) ||
          (drawGpuTransitionFallback(ctx, {
            type: transitionType,
            progress: transitionProgress,
            fromSource: gpuTransitionFromSource,
            toSource: source,
            rect: { x: drawX, y: drawY, width, height },
          }),
          true)
        : false;

    const keyed =
      !gpuTransitionRendered && chromaKey
        ? drawKeyedSource(
            ctx,
            { x: drawX, y: drawY, width, height },
            chromaKey,
            (layerCtx) => {
              layerCtx.beginPath();
              layerCtx.roundRect(drawX, drawY, width, height, radius);
              layerCtx.save();
              layerCtx.clip();
              layerCtx.drawImage(
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
              layerCtx.restore();
            },
          )
        : false;

    const masked =
      !gpuTransitionRendered && !keyed && maskParams
        ? drawMaskedSource(
            ctx,
            { x: drawX, y: drawY, width, height },
            { kind: 'shape', params: maskParams },
            (layerCtx) => {
              layerCtx.beginPath();
              layerCtx.roundRect(drawX, drawY, width, height, radius);
              layerCtx.save();
              layerCtx.clip();
              layerCtx.drawImage(
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
              layerCtx.restore();
            },
          )
        : false;

    if (!gpuTransitionRendered && !keyed && !masked) {
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
    }
    ctx.restore();

    if (payload?.deviceFrame) drawClipDeviceFrame(ctx, payload.deviceFrame, width, height, radius);

    // Clip-attached effects paint in ascending stackOrder immediately after
    // the clip, inside the clip's transform and local draw box, so the pass
    // follows the clip through transforms and PiP layouts.
    if (payload?.effects && payload.effects.length > 0) {
      for (const effect of sortedEffects(payload.effects)) {
        // Resolved onto the clip draw above, not painted as an effect pass.
        if (effect.type === 'chroma-key') continue;
        const intensity = evaluateEffectIntensity(
          clip,
          effect,
          localTimeMs,
        );
        drawStudioEffectPass(ctx, {
          type: effect.type,
          intensity,
          frame,
          timeMs: compTimeMs,
          params: effect.params,
          rect: { x: drawX, y: drawY, width, height },
        });
      }
    }

    ctx.restore();
  }
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
