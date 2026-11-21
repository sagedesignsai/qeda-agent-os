/**
 * lib/studio/render/program.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tier 2.5 — the frame program builder.
 *
 * `buildFrameProgram` turns an evaluated timeline frame plus styling into an
 * immutable display list. It is pure: no canvas, no DOM, no media elements. All
 * spatial resolution (window geometry, matrices, pivots, transition progress,
 * keyframe overrides, clip domains, filters) happens here, so rasterizers only
 * have to execute the list.
 *
 * The builder intentionally mirrors the legacy `compose.ts` arithmetic — the
 * matrix composition uses the same translate/scale/rotate sequence — because a
 * golden-frame parity test compares the two pipelines.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  ClipTransform,
  ClipAnimation,
  StudioCaption,
  StudioOverlay,
  StudioStyling,
  StudioVideoCrop,
} from '../types';
import { evaluateClipAtTime } from '../animation-evaluator';
import { effectTypeFromPayload } from '../effects/catalog';
import {
  evaluateClipKeyframeValues,
  evaluateEffectIntensity,
} from '../keyframes';
import { LEGACY_VIDEO_TRACK_ID } from '../timeline/layers';
import type { EditorTimelineFrame, EvaluatedTimelineClip } from '../timeline/evaluate';
import { cameraSourceRect, type StudioCameraState } from './camera';
import { computeStudioCanvasFrame } from './geometry';
import {
  composeMatrices,
  IDENTITY_MATRIX,
  rotationMatrix,
  scaleMatrix,
  translationMatrix,
  type ChromeDrawOp,
  type DrawOp,
  type EffectDrawOp,
  type EffectRect,
  type Matrix2D,
  type FrameProgram,
  type MediaDrawOp,
  type MotionCardDrawOp,
  type OverlayDrawOp,
  type ProgramWindowFrame,
  type TextDrawOp,
} from './display-list';

// ── Inputs ────────────────────────────────────────────────────────────────────

export interface ProgramAssetDimensions {
  width: number;
  height: number;
}

/**
 * Dimensions the builder needs to lay out media. Elements themselves are only
 * required by the rasterizer, which keeps the program pure.
 */
export interface ProgramAssetRegistry {
  /** Dimensions keyed by media-pool asset id. */
  byAssetId: ReadonlyMap<string, ProgramAssetDimensions>;
  /** Dimensions keyed by timeline clip id (per-clip decoder instances). */
  byClipId?: ReadonlyMap<string, ProgramAssetDimensions>;
  /** The take's source recording, which is not a pool asset. */
  recordedVideo?: ProgramAssetDimensions | null;
}

export interface BuildFrameProgramInput {
  width: number;
  height: number;
  /** Composition time — the axis every timeline decision is made on. */
  compTimeMs: number;
  styling: StudioStyling;
  evaluatedFrame: EditorTimelineFrame;
  /** Resolved, history-dependent camera state (see `render/camera.ts`). */
  camera: StudioCameraState;
  videoCrop?: StudioVideoCrop;
  assets: ProgramAssetRegistry;
  /** Legacy overlay records that still carry overlay geometry. */
  overlays?: readonly StudioOverlay[];
  /** Dimensions of overlay media, keyed by overlay id. */
  overlayAssets?: ReadonlyMap<string, ProgramAssetDimensions>;
  /** Live transform override while the canvas gizmo is dragged. */
  clipTransformPreview?: { clipId: string; transform: ClipTransform } | null;
  /** Composition length; required for intro/outro cards. */
  totalDurationMs?: number;
  /** Set false when the caller paints motion cards itself. */
  includeMotionCards?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isMediaItem(item: EvaluatedTimelineClip): boolean {
  return item.itemType === 'video' || item.itemType === 'image';
}

function mediaDimensions(
  item: EvaluatedTimelineClip,
  assets: ProgramAssetRegistry,
): ProgramAssetDimensions | null {
  const mediaAssetId = item.clip.payload?.mediaAssetId;
  const fromClip = assets.byClipId?.get(item.clip.id);
  if (fromClip && fromClip.width > 0 && fromClip.height > 0) return fromClip;
  if (mediaAssetId) {
    const fromAsset = assets.byAssetId.get(mediaAssetId);
    if (fromAsset && fromAsset.width > 0 && fromAsset.height > 0) return fromAsset;
  }
  const isRecordedSource =
    !mediaAssetId && item.track.id === LEGACY_VIDEO_TRACK_ID;
  if (isRecordedSource && assets.recordedVideo) {
    const recorded = assets.recordedVideo;
    if (recorded.width > 0 && recorded.height > 0) return recorded;
  }
  return null;
}

/**
 * Window geometry depends on the aspect of the top-most active media clip, so
 * the builder needs dimensions before it can lay anything out.
 */
function resolveContentAspect(input: BuildFrameProgramInput): number {
  const media = input.evaluatedFrame.video.filter(isMediaItem);
  const topmost = media[media.length - 1];
  if (topmost) {
    const dims = mediaDimensions(topmost, input.assets);
    if (dims) return dims.width / dims.height;
    const crop = input.videoCrop;
    if (
      !topmost.clip.payload?.mediaAssetId &&
      topmost.track.id === LEGACY_VIDEO_TRACK_ID &&
      crop &&
      crop.width > 0 &&
      crop.height > 0
    ) {
      return crop.width / crop.height;
    }
  }
  const recorded = input.assets.recordedVideo;
  if (recorded && recorded.width > 0 && recorded.height > 0) {
    return recorded.width / recorded.height;
  }
  return 16 / 9;
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

interface TransitionState {
  opacity: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  blurPx?: number;
}

/**
 * Resolve transition contribution for a video clip.
 *
 * Mirrors `compose.ts` exactly, including the legacy `targetClipId` fallback so
 * projects authored before paired cut transitions still render identically.
 * The fade is an "over" transition: the outgoing clip stays opaque while the
 * incoming clip ramps in, which avoids the luminance dip a symmetric crossfade
 * produces under `source-over`.
 */
function resolveTransition(
  item: EvaluatedTimelineClip,
  activeTransitions: readonly EvaluatedTimelineClip[],
  frame: ProgramWindowFrame,
  compTimeMs: number,
): TransitionState {
  const pairedTransition = item.transition;
  const legacyTransition = pairedTransition
    ? undefined
    : activeTransitions.find(
        ({ clip, itemType }) =>
          itemType === 'transition' &&
          clip.payload?.targetClipId === item.clip.id,
      )?.clip;
  const transition = legacyTransition;
  const transitionDuration = Math.max(1, transition?.durationMs ?? 1);
  const progress =
    pairedTransition?.progress ??
    (transition
      ? clamp01((compTimeMs - transition.startMs) / transitionDuration)
      : 1);
  const side = transition?.payload?.transitionSide ?? 'in';
  const type = pairedTransition?.type ?? transition?.payload?.transitionType;

  const amount = pairedTransition
    ? pairedTransition.role === 'outgoing'
      ? 1 - progress
      : progress
    : side === 'out'
      ? 1 - progress
      : progress;

  const opacity = pairedTransition
    ? type === 'fade' || type === 'blur'
      ? pairedTransition.role === 'outgoing'
        ? 1
        : progress
      : 1
    : type === 'fade'
      ? amount
      : 1;

  const offsetX = pairedTransition
    ? type === 'slide-left'
      ? frame.contentWidth *
        (pairedTransition.role === 'outgoing' ? -progress : 1 - progress)
      : type === 'slide-right'
        ? frame.contentWidth *
          (pairedTransition.role === 'outgoing' ? progress : progress - 1)
        : 0
    : type === 'slide-left'
      ? frame.contentWidth * (side === 'out' ? -progress : 1 - progress)
      : type === 'slide-right'
        ? frame.contentWidth * (side === 'out' ? progress : progress - 1)
        : 0;

  const offsetY = pairedTransition
    ? type === 'slide-up'
      ? frame.contentHeight *
        (pairedTransition.role === 'outgoing' ? -progress : 1 - progress)
      : type === 'slide-down'
        ? frame.contentHeight *
          (pairedTransition.role === 'outgoing' ? progress : progress - 1)
        : 0
    : type === 'slide-up'
      ? frame.contentHeight * (side === 'out' ? -progress : 1 - progress)
      : type === 'slide-down'
        ? frame.contentHeight * (side === 'out' ? progress : progress - 1)
        : 0;

  const scale =
    type === 'scale'
      ? pairedTransition
        ? pairedTransition.role === 'outgoing'
          ? 1 - 0.25 * progress
          : 0.75 + 0.25 * progress
        : side === 'out'
          ? 1 - 0.25 * progress
          : 0.75 + 0.25 * progress
      : 1;

  const blurPx =
    pairedTransition && type === 'blur'
      ? Math.sin(progress * Math.PI) * 12
      : undefined;

  return { opacity, offsetX, offsetY, scale, blurPx };
}

// ── Op builders ───────────────────────────────────────────────────────────────

function buildMediaOp(
  input: BuildFrameProgramInput,
  item: EvaluatedTimelineClip,
  frame: ProgramWindowFrame,
): MediaDrawOp | null {
  const { clip, track, localTimeMs } = item;
  const payload = clip.payload;
  const dims = mediaDimensions(item, input.assets);
  if (!dims) return null;

  const kf = evaluateClipKeyframeValues(clip, localTimeMs);
  const isRecordedSource =
    !payload?.mediaAssetId && track.id === LEGACY_VIDEO_TRACK_ID;

  let sourceRect = { x: 0, y: 0, width: dims.width, height: dims.height };
  if (isRecordedSource) {
    const crop = input.videoCrop;
    if (crop && crop.width > 0 && crop.height > 0) {
      sourceRect = {
        x: Math.max(0, Math.min(dims.width, crop.x * dims.width)),
        y: Math.max(0, Math.min(dims.height, crop.y * dims.height)),
        width: Math.max(1, crop.width * dims.width),
        height: Math.max(1, crop.height * dims.height),
      };
    } else {
      sourceRect = cameraSourceRect(input.camera, dims.width, dims.height);
    }
  }

  const anim = evaluateClipAtTime(
    clip.durationMs,
    payload?.enterAnimation,
    payload?.exitAnimation,
    localTimeMs,
  );

  const transition = resolveTransition(
    item,
    input.evaluatedFrame.transitions,
    frame,
    input.compTimeMs,
  );

  const transform =
    input.clipTransformPreview?.clipId === clip.id
      ? input.clipTransformPreview.transform
      : payload?.transform;

  const centerX =
    frame.contentX +
    (payload?.x ?? 0.5) * frame.contentWidth +
    (transform?.position?.x ?? 0);
  const centerY =
    frame.contentY +
    (payload?.y ?? 0.5) * frame.contentHeight +
    (transform?.position?.y ?? 0);

  const baseWidth = payload?.widthPct
    ? payload.widthPct * frame.contentWidth
    : frame.contentWidth;
  const width = Math.max(1, baseWidth);
  const aspect = dims.width / dims.height;
  const height = payload?.widthPct
    ? Math.max(1, baseWidth / aspect)
    : frame.contentHeight;

  // Full-canvas clips cover-crop so portrait sources fill the frame; smaller
  // picture-in-picture clips keep their native aspect.
  if (!payload?.widthPct) {
    sourceRect = coverSourceRect(
      sourceRect,
      frame.contentWidth / frame.contentHeight,
    );
  }

  const drawX = -width / 2 + (kf.x ?? anim.x) + transition.offsetX;
  const drawY = -height / 2 + (kf.y ?? anim.y) + transition.offsetY;

  const anchor = transform?.anchorPoint ?? { x: 0.5, y: 0.5 };
  const pivotX = (anchor.x - 0.5) * width;
  const pivotY = (anchor.y - 0.5) * height;
  const clipScale = kf.scale ?? anim.scale;
  const scaleX =
    clipScale * transition.scale * (transform?.scale?.x ?? 1);
  const scaleY =
    clipScale * transition.scale * (transform?.scale?.y ?? 1);
  const rotationRad =
    (((kf.rotation ?? anim.rotation ?? 0) + (transform?.rotation ?? 0)) *
      Math.PI) /
    180;

  // Same primitive sequence as the legacy renderer: translate → pivot →
  // scale → rotate → un-pivot. Keeping the order identical means the composed
  // matrix reproduces the sequential canvas transforms bit for bit.
  const matrix = composeMatrices(
    translationMatrix(centerX, centerY),
    translationMatrix(pivotX, pivotY),
    scaleMatrix(scaleX, scaleY),
    rotationMatrix(rotationRad),
    translationMatrix(-pivotX, -pivotY),
  );

  const opacity =
    (kf.opacity ?? payload?.opacity ?? 1) * anim.opacity * transition.opacity;

  const source: MediaDrawOp['source'] = payload?.mediaAssetId
    ? { kind: 'asset', assetId: payload.mediaAssetId, clipId: clip.id }
    : { kind: 'recorded' };

  return {
    id: `media:${clip.id}`,
    clipId: clip.id,
    kind: item.itemType === 'image' ? 'image' : 'video',
    transform: matrix,
    opacity,
    blendMode: (payload?.blendMode ?? 'source-over') as any,
    clip: 'window',
    filter:
      transition.blurPx !== undefined
        ? { blurPx: transition.blurPx }
        : undefined,
    source,
    sourceRect,
    destRect: {
      x: drawX,
      y: drawY,
      width,
      height,
      cornerRadius: Math.max(0, payload?.cornerRadius ?? 0),
    },
    deviceFrame: payload?.deviceFrame,
  };
}

function buildOverlayOp(
  input: BuildFrameProgramInput,
  item: EvaluatedTimelineClip,
  frame: ProgramWindowFrame,
): OverlayDrawOp | null {
  const { clip } = item;
  const record = input.overlays?.find((overlay) => overlay.id === clip.id);
  if (!record) return null;

  const dims =
    input.assets.byClipId?.get(clip.id) ??
    input.overlayAssets?.get(record.id) ??
    null;
  if (!dims || dims.width <= 0 || dims.height <= 0) return null;

  const aspect = dims.width / dims.height;
  const width = Math.max(24, record.widthPct * frame.contentWidth);
  const height = width / aspect;
  const centerX = frame.contentX + record.x * frame.contentWidth;
  const centerY = frame.contentY + record.y * frame.contentHeight;

  const transform = clip.payload?.transform;
  const anim = evaluateClipAtTime(
    clip.durationMs,
    clip.payload?.enterAnimation,
    clip.payload?.exitAnimation,
    item.localTimeMs,
  );
  const scaleX = (transform?.scale?.x ?? 1) * anim.scale;
  const scaleY = (transform?.scale?.y ?? 1) * anim.scale;
  const rotationDeg =
    record.rotation + (transform?.rotation ?? 0) + anim.rotation;

  const matrix = composeMatrices(
    translationMatrix(centerX, centerY),
    translationMatrix(transform?.position?.x ?? 0, transform?.position?.y ?? 0),
    rotationMatrix((rotationDeg * Math.PI) / 180),
    scaleMatrix(scaleX, scaleY),
  );

  return {
    id: `overlay:${clip.id}`,
    clipId: clip.id,
    kind: 'overlay',
    transform: matrix,
    opacity: clamp01(record.opacity) * anim.opacity,
    blendMode: (clip.payload?.blendMode ?? 'source-over') as any,
    clip: 'window',
    source: { kind: 'asset', assetId: record.id, clipId: clip.id },
    width,
    height,
    cornerRadius: Math.max(0, record.cornerRadius),
    imageOffset: { x: anim.x, y: anim.y },
    deviceFrame: clip.payload?.deviceFrame,
    shadow: true,
    border: true,
  };
}

function buildEffectOps(input: BuildFrameProgramInput): EffectDrawOp[] {
  const ops: EffectDrawOp[] = [];

  // Process effects from the effects track (zooms, and legacy effects)
  for (const item of input.evaluatedFrame.effects) {
    if (item.itemType !== 'effect') continue;
    const effectType = effectTypeFromPayload(item.clip.payload);
    if (!effectType) continue;
    const intensity =
      evaluateClipKeyframeValues(item.clip, item.localTimeMs).intensity ??
      item.clip.payload?.intensity ??
      0.6;
    if (intensity <= 0) continue;
    ops.push({
      id: `effect:${item.clip.id}`,
      clipId: item.clip.id,
      kind: 'effect',
      transform: IDENTITY_MATRIX,
      opacity: 1,
      blendMode: (item.clip.payload?.blendMode ?? 'source-over') as any,
      // Neon glow's shadow-blur bloom intentionally extends past the content
      // box; clipping it to `content` would amputate the falloff.
      clip: effectType === 'neon-glow' ? 'window' : 'content',
      effectType,
      intensity,
      timeMs: input.compTimeMs,
    });
  }

  // The evaluator returns effects in track order; keep the lane's row order.
  return ops;
}

/**
 * Clip-attached effect ops for one media/overlay draw op.
 *
 * The effect op reuses the clip's matrix and local draw box, so the pass follows
 * the clip through transforms, transitions and picture-in-picture layouts rather
 * than painting over the whole window. `stackOrder` is authoritative: effects
 * paint in ascending order immediately after the clip, which is what makes the
 * depth-ordered stack in the inspector match the output.
 */
function buildClipEffectOps(
  item: EvaluatedTimelineClip,
  anchor: { transform: Matrix2D; rect: EffectRect },
  compTimeMs: number,
): EffectDrawOp[] {
  const effects = item.clip.payload?.effects;
  if (!effects || effects.length === 0) return [];

  const ops: EffectDrawOp[] = [];
  const sorted = [...effects].sort((a, b) => a.stackOrder - b.stackOrder);

  for (const effect of sorted) {
    const intensity = evaluateEffectIntensity(
      item.clip,
      effect,
      item.localTimeMs,
    );
    if (intensity <= 0) continue;

    ops.push({
      id: `clip-effect:${item.clip.id}:${effect.id}`,
      clipId: item.clip.id,
      kind: 'effect',
      transform: anchor.transform,
      opacity: 1,
      blendMode: 'source-over',
      // Neon bloom intentionally extends past the clip box; keep it window
      // clipped so the falloff is not amputated.
      clip: effect.type === 'neon-glow' ? 'window' : 'content',
      effectType: effect.type,
      intensity,
      params: effect.params,
      rect: anchor.rect,
      timeMs: compTimeMs,
    });
  }

  return ops;
}

function buildShapeOps(input: BuildFrameProgramInput): DrawOp[] {
  const ops: DrawOp[] = [];

  // Iterate through all clip types to find shape items
  // Note: shapes can appear on any track in the timeline
  const allItems = [
    ...input.evaluatedFrame.video,
    ...input.evaluatedFrame.audio,
    ...input.evaluatedFrame.effects,
    ...input.evaluatedFrame.captions,
    ...input.evaluatedFrame.overlays,
    ...input.evaluatedFrame.transitions,
  ];

  for (const item of allItems) {
    if (item.itemType !== 'shape') continue;
    const { clip, localTimeMs } = item;
    const payload = clip.payload;
    if (!payload || !('shapeKind' in payload)) continue;

    const shapePayload = payload as unknown as {
      shapeKind: string;
      pathData: string;
      fill?: string;
      stroke?: { color: string; width: number };
      trim?: { start: number; end: number; offset: number };
      pathLengthPx?: number;
      transform?: ClipTransform;
      enterAnimation?: ClipAnimation;
      exitAnimation?: ClipAnimation;
    };

    if (!shapePayload.pathData) continue;

    // Evaluate animations
    const anim = evaluateClipAtTime(
      clip.durationMs,
      shapePayload.enterAnimation,
      shapePayload.exitAnimation,
      localTimeMs,
    );

    // Build affine transform
    const transform = shapePayload.transform;
    const centerX = (transform?.position?.x ?? 0) + (anim.x ?? 0);
    const centerY = (transform?.position?.y ?? 0) + (anim.y ?? 0);
    const scale = (transform?.scale?.x ?? 1) * (anim.scale ?? 1);
    const rotationRad = (((transform?.rotation ?? 0) + (anim.rotation ?? 0)) * Math.PI) / 180;

    const matrix = composeMatrices(
      translationMatrix(centerX, centerY),
      scaleMatrix(scale, scale),
      rotationMatrix(rotationRad),
    );

    const opacity = (anim.opacity ?? 1) * (clip.payload?.opacity ?? 1);

    ops.push({
      id: `shape:${clip.id}`,
      clipId: clip.id,
      kind: 'shape' as const,
      transform: matrix,
      opacity,
      blendMode: ((shapePayload as { blendMode?: string }).blendMode ??
        'source-over') as any,
      clip: 'window',
      pathData: shapePayload.pathData,
      fill: shapePayload.fill,
      stroke: shapePayload.stroke,
      trim: shapePayload.trim,
      pathLengthPx: shapePayload.pathLengthPx,
    } as DrawOp);
  }

  return ops;
}

function buildTextOps(input: BuildFrameProgramInput): TextDrawOp[] {
  const styling = input.styling;
  if (!styling.showCaptions) return [];

  const ops: TextDrawOp[] = [];
  for (const item of input.evaluatedFrame.captions) {
    if (item.itemType !== 'text') continue;
    const { clip } = item;
    const caption: StudioCaption = {
      id: clip.id,
      startMs: clip.startMs,
      endMs: clip.startMs + clip.durationMs,
      text: clip.payload?.text ?? clip.name,
      ...(clip.payload?.words && clip.payload.words.length > 0
        ? { words: clip.payload.words }
        : {}),
    };

    // Compute text animator progress if one is defined
    let animator: TextDrawOp['animator'] | undefined;
    if (clip.payload?.textAnimator) {
      const textAnimConfig = clip.payload.textAnimator;
      const relativeTimeMs = Math.max(
        0,
        input.compTimeMs - clip.startMs,
      );
      const animator_progress = Math.min(
        1,
        relativeTimeMs / (clip.durationMs || 1),
      );
      animator = {
        mode: textAnimConfig.mode,
        progress: animator_progress,
        timeMs: input.compTimeMs,
      };
    }

    ops.push({
      id: `text:${clip.id}`,
      clipId: clip.id,
      kind: 'text',
      transform: IDENTITY_MATRIX,
      opacity: 1,
      blendMode: (clip.payload?.blendMode ?? 'source-over') as any,
      // Captions are painted outside the window clip — the historical look.
      clip: 'none',
      layout: {
        mode: 'caption',
        caption,
        style: styling.captionStyle,
        timeMs: input.compTimeMs,
      },
      animator,
    });
  }
  return ops;
}

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildFrameProgram(input: BuildFrameProgramInput): FrameProgram {
  const { width, height, styling, compTimeMs } = input;
  const showcaseMode = styling.canvasMode !== 'edit';

  const contentAspect = resolveContentAspect(input);
  const windowFrame = computeStudioCanvasFrame(
    width,
    height,
    styling,
    contentAspect,
  );
  const frame: ProgramWindowFrame = {
    ...windowFrame,
    shadow: showcaseMode,
  };

  const ops: DrawOp[] = [];

  // 1. Content — bottom track first, top track last (evaluator already ordered).
  for (const item of input.evaluatedFrame.video) {
    if (!isMediaItem(item)) continue;
    const op = buildMediaOp(input, item, frame);
    if (!op) continue;
    ops.push(op);
    ops.push(
      ...buildClipEffectOps(
        item,
        { transform: op.transform, rect: op.destRect },
        compTimeMs,
      ),
    );
  }

  // 2. Picture-in-picture overlays.
  for (const item of input.evaluatedFrame.overlays) {
    if (item.itemType !== 'overlay') continue;
    const op = buildOverlayOp(input, item, frame);
    if (!op) continue;
    ops.push(op);
    ops.push(
      ...buildClipEffectOps(
        item,
        {
          transform: op.transform,
          rect: {
            x: -op.width / 2,
            y: -op.height / 2,
            width: op.width,
            height: op.height,
          },
        },
        compTimeMs,
      ),
    );
  }

  // 2.5. Vector shapes (SVG paths with optional trim animation).
  ops.push(...buildShapeOps(input));

  // 3. Canvas effect passes.
  ops.push(...buildEffectOps(input));

  // 4. Window chrome / device frame.
  if (showcaseMode) {
    const chrome: ChromeDrawOp = {
      id: 'chrome',
      kind: 'chrome',
      transform: IDENTITY_MATRIX,
      opacity: 1,
      blendMode: 'source-over',
      clip: 'window',
      deviceFrame:
        styling.deviceFrame && styling.deviceFrame.type !== 'none'
          ? styling.deviceFrame
          : undefined,
    };
    ops.push(chrome);
  }

  // 5. Unclipped text.
  ops.push(...buildTextOps(input));

  // 6. Intro / outro cards — painted last, over everything.
  const includeCards = input.includeMotionCards !== false;
  const totalDurationMs = input.totalDurationMs ?? 0;
  if (includeCards && totalDurationMs > 0) {
    if (styling.introCard?.enabled) {
      const op: MotionCardDrawOp = {
        id: 'motion-card:intro',
        kind: 'motion-card',
        transform: IDENTITY_MATRIX,
        opacity: 1,
        blendMode: 'source-over',
        clip: 'none',
        cardType: 'intro',
        card: styling.introCard,
        totalDurationMs,
        timeMs: compTimeMs,
      };
      ops.push(op);
    }
    if (styling.outroCard?.enabled) {
      const op: MotionCardDrawOp = {
        id: 'motion-card:outro',
        kind: 'motion-card',
        transform: IDENTITY_MATRIX,
        opacity: 1,
        blendMode: 'source-over',
        clip: 'none',
        cardType: 'outro',
        card: styling.outroCard,
        totalDurationMs,
        timeMs: compTimeMs,
      };
      ops.push(op);
    }
  }

  return {
    width,
    height,
    compTimeMs,
    background: { paint: styling.background, glow: true },
    windowFrame: frame,
    contentBackdrop: {
      x: frame.contentX,
      y: frame.contentY,
      width: frame.contentWidth,
      height: frame.contentHeight,
      color: '#0b0d12',
    },
    ops,
  };
}
