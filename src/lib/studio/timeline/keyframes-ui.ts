/**
 * lib/studio/timeline/keyframes-ui.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared metadata for canvas-side keyframe UI.
 *
 * Used by `TimelineCanvasViewport` (diamond markers on clip rows) and the
 * inspector's "Keyframes" section: per-property display info, value ranges,
 * and the vertical drag sensitivity of the canvas editor.
 *
 * Two diamond rows are drawn per clip (transform row above, effect row below
 * the center): `x`, `y`, `scale`, `rotation`, `intensity` stack on the center
 * line; `speed`, `opacity` stack slightly below it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  StudioKeyframe,
  TimelineClip,
  TimelineTrack,
} from '../types';
import { staticSpeed } from '../keyframes';
import { isStudioZoomClip } from '../effects/zoom-presets';

export interface KeyframeUiInfo {
  /** Keyframe property namespace (see `StudioKeyframe.property`). */
  property: string;
  /** Human label, e.g. "Position X". */
  label: string;
  /** Marker color (hex). */
  color: string;
  /** Value range used by the inspector + canvas value dragging. */
  min: number;
  max: number;
  /** Unit suffix for value display ("px", "°", "x", "%"). */
  suffix?: string;
  /** Increment for the inspector value field. */
  step: number;
  /** Magnitude of value change per pixel of downward drag. */
  unitsPerPixelDown: number;
  /** Absolute y offset from the clip center (px) for canvas diamonds. */
  rowOffset: number;
}

/**
 * Universal keyframe properties that can be drawn as diamonds on the
 * timeline canvas for a given track type.
 */
export function keyframeUiRowProperties(
  trackType: TimelineTrack['type'],
): string[] {
  switch (trackType) {
    case 'video':
      return ['x', 'y', 'scale', 'rotation', 'speed', 'opacity'];
    case 'overlays':
    case 'captions':
      // Universal keyframes cover every visual track, not just video.
      return ['x', 'y', 'scale', 'rotation', 'opacity'];
    case 'audio':
      return ['speed'];
    case 'effects':
      // Effects track holds canvas-effect intensity plus kinetic-zoom
      // scale/pan keyframes (zoom clips never have intensity keyframes and
      // vice-versa, so the shared rows never collide in practice).
      return ['intensity', 'zoomScale', 'zoomTargetX', 'zoomTargetY'];
    default:
      return [];
  }
}

/** Property to add when the user double-clicks a clip (`null` when none). */
export function defaultAddKeyframePropertyForTrack(
  trackType: TimelineTrack['type'],
): string | null {
  switch (trackType) {
    case 'video':
      return 'x';
    case 'overlays':
    case 'captions':
      return 'x';
    case 'audio':
      return 'speed';
    case 'effects':
      return 'intensity';
    default:
      return null;
  }
}

/**
 * Like `defaultAddKeyframePropertyForTrack`, but returns `zoomScale` for
 * kinetic-camera zoom clips so double-clicking a zoom adds a meaningful key.
 */
export function defaultAddKeyframePropertyForClip(
  trackType: TimelineTrack['type'],
  clip: Pick<TimelineClip, 'itemType' | 'payload'>,
): string | null {
  if (
    trackType === 'effects' &&
    isStudioZoomClip(clip)
  ) {
    return 'zoomScale';
  }
  return defaultAddKeyframePropertyForTrack(trackType);
}

export function keyframeUiInfoFor(property: string): KeyframeUiInfo | undefined {
  return KEYFRAME_UI_INFO[property];
}

const KEYFRAME_UI_INFO: Record<string, KeyframeUiInfo> = {
  x: { property: 'x', label: 'Position X', color: '#f59e0b', min: -2000, max: 2000, suffix: 'px', step: 2, unitsPerPixelDown: 1, rowOffset: 0 },
  y: { property: 'y', label: 'Position Y', color: '#84cc16', min: -2000, max: 2000, suffix: 'px', step: 2, unitsPerPixelDown: 1, rowOffset: 0 },
  scale: { property: 'scale', label: 'Scale', color: '#a855f7', min: 0.1, max: 20, suffix: 'x', step: 0.05, unitsPerPixelDown: 0.05, rowOffset: 0 },
  rotation: { property: 'rotation', label: 'Rotation', color: '#38bdf8', min: -360, max: 360, suffix: '°', step: 1, unitsPerPixelDown: 0.5, rowOffset: 0 },
  opacity: { property: 'opacity', label: 'Opacity', color: '#f87171', min: 0, max: 1, suffix: '%', step: 0.02, unitsPerPixelDown: 0.02, rowOffset: 6 },
  speed: { property: 'speed', label: 'Speed', color: '#2dd4bf', min: 0.05, max: 20, suffix: 'x', step: 0.05, unitsPerPixelDown: 0.05, rowOffset: 6 },
  intensity: { property: 'intensity', label: 'Intensity', color: '#4ade80', min: 0, max: 1, suffix: '%', step: 0.02, unitsPerPixelDown: 0.02, rowOffset: 0 },
  zoomScale: { property: 'zoomScale', label: 'Zoom Scale', color: '#c084fc', min: 1, max: 5, suffix: 'x', step: 0.05, unitsPerPixelDown: 0.02, rowOffset: 0 },
  zoomTargetX: { property: 'zoomTargetX', label: 'Zoom X', color: '#fb923c', min: 0, max: 1, suffix: '', step: 0.01, unitsPerPixelDown: 0.004, rowOffset: 0 },
  zoomTargetY: { property: 'zoomTargetY', label: 'Zoom Y', color: '#a3e635', min: 0, max: 1, suffix: '', step: 0.01, unitsPerPixelDown: 0.004, rowOffset: 0 },
};

// ── Effect keyframe colors (visual distinction) ────────────────────────────

/**
 * Color mapping for effect keyframes (circles instead of diamonds).
 * Property format: 'effect:<effectId>:intensity' → effect type color
 */
const EFFECT_TYPE_COLORS: Record<string, string> = {
  'spotlight': '#f59e0b',     // orange
  'neon-glow': '#6366f1',     // indigo
  'vignette': '#475569',      // slate
  'film-grain': '#a8a29e',    // brown
  'scanlines': '#22d3ee',     // cyan
};

/**
 * Check if a keyframe property is an effect intensity keyframe.
 * Format: 'effect:<effectId>:intensity'
 */
export function isEffectKeyframe(property: string): boolean {
  return property.startsWith('effect:') && property.endsWith(':intensity');
}

/**
 * Extract effect type from effect keyframe property.
 * From 'effect:<effectId>:intensity', return null (effect ID is not the type).
 * This function is used to get the base color; actual type comes from the clip's effects.
 */
export function parseEffectKeyframeProperty(property: string): {
  effectId: string;
} | null {
  if (!isEffectKeyframe(property)) return null;
  const match = property.match(/^effect:([^:]+):intensity$/);
  if (!match) return null;
  return { effectId: match[1] };
}

/**
 * Get effect keyframe color. Defaults to indigo if effect type unknown.
 * Note: effect type is not in the property string, so we return a generic effect color.
 */
export function getEffectKeyframeColor(property: string): string {
  // For now, return a neutral effect color since we don't have effect type in property
  // Future enhancement: pass clip context to get effect type
  return '#6366f1'; // indigo as default effect color
}

/** Static value a new keyframe should start from (the "Add" preview value). */
export function staticValueForProperty(clip: TimelineClip, property: string): number {
  switch (property) {
    case 'x':
      return clip.payload?.transform?.position?.x ?? 0;
    case 'y':
      return clip.payload?.transform?.position?.y ?? 0;
    case 'scale':
      return clip.payload?.transform?.scale?.x ?? 1;
    case 'rotation':
      return clip.payload?.transform?.rotation ?? 0;
    case 'opacity':
      return clip.payload?.opacity ?? 1;
    case 'speed':
      return staticSpeed(clip);
    case 'intensity':
      return clip.payload?.intensity ?? 0.6;
    case 'zoomScale':
      return clip.payload?.scale ?? 1.5;
    case 'zoomTargetX':
      return clip.payload?.targetX ?? 0.5;
    case 'zoomTargetY':
      return clip.payload?.targetY ?? 0.5;
    default:
      return 0;
  }
}

export interface KeyframeHit {
  keyframe: StudioKeyframe;
  property: string;
}

/** Diamond hit-test radius (px) around a keyframe diamond center. */
const DIAMOND_HIT_RADIUS = 6;

/**
 * Find the keyframe diamond nearest the pointer for a clip.
 *
 * `clipX`/`clipY`/`clipH` are the clip's screen rect on the timeline;
 * `zoomPxPerMs` is the timeline zoom. Returns `null` when no diamond is hit.
 */
export function findClipKeyframeDiamond(
  track: TimelineTrack,
  clip: TimelineClip,
  clipX: number,
  clipY: number,
  clipH: number,
  pointerX: number,
  pointerY: number,
  zoomPxPerMs: number,
): KeyframeHit | null {
  const properties = keyframeUiRowProperties(track.type);
  const centerY = clipY + clipH / 2;
  const keyframes = clip.payload?.keyframes ?? [];
  let best: KeyframeHit | null = null;
  let bestDist = DIAMOND_HIT_RADIUS;

  // Check standard keyframes for this track type
  for (const property of properties) {
    const info = keyframeUiInfoFor(property);
    if (!info) continue;
    const rowY = centerY + info.rowOffset;
    for (const kf of keyframes) {
      if (kf.property !== property) continue;
      const cx = clipX + kf.timeMs * zoomPxPerMs;
      const dx = pointerX - cx;
      const dy = pointerY - rowY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= bestDist) {
        bestDist = dist;
        best = { keyframe: kf, property };
      }
    }
  }

  // Also check for effect keyframes on this clip
  // Effect keyframes appear in a separate row (rowOffset: 12, below opacity/speed)
  const effectRowY = centerY + 12;
  for (const kf of keyframes) {
    if (!isEffectKeyframe(kf.property)) continue;
    const cx = clipX + kf.timeMs * zoomPxPerMs;
    const dx = pointerX - cx;
    const dy = pointerY - effectRowY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= bestDist) {
      bestDist = dist;
      best = { keyframe: kf, property: kf.property };
    }
  }

  return best;
}

/** Draw the diamond marker for one keyframe (selected/hovered aware). */
export function drawKeyframeDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  info: KeyframeUiInfo,
  opts: { isSelected?: boolean; isHovered?: boolean } = {},
): void {
  const size = opts.isSelected || opts.isHovered ? 5.5 : 4.5;
  ctx.fillStyle = info.color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx + size, cy);
  ctx.lineTo(cx, cy + size);
  ctx.lineTo(cx - size, cy);
  ctx.closePath();
  ctx.fill();
  if (opts.isSelected) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else if (opts.isHovered) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/**
 * Draw a circle marker for an effect keyframe (visual distinction from diamonds).
 * Circles are used for effect intensity keyframes with effect-type colors.
 */
export function drawEffectKeyframeCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string,
  opts: { isSelected?: boolean; isHovered?: boolean } = {},
): void {
  const radius = opts.isSelected || opts.isHovered ? 4 : 3.5;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  if (opts.isSelected) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else if (opts.isHovered) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/** Draw all diamonds for a clip's universal keyframes (rows, then culled by viewport). */
export function drawClipKeyframeDiamonds(
  ctx: CanvasRenderingContext2D,
  options: {
    track: TimelineTrack;
    clip: TimelineClip;
    clipX: number;
    clipY: number;
    clipH: number;
    zoomPxPerMs: number;
    selectedKeyframeId?: string | null;
    hoveredKeyframeId?: string | null;
    maxRight?: number;
    onTooltip?: (text: string, x: number, y: number, maxWidth: number) => void;
  },
): void {
  const {
    track,
    clip,
    clipX,
    clipY,
    clipH,
    zoomPxPerMs,
    selectedKeyframeId,
    hoveredKeyframeId,
    maxRight,
    onTooltip,
  } = options;

  const centerY = clipY + clipH / 2;
  
  // Draw standard keyframes (transform, speed, etc.)
  for (const property of keyframeUiRowProperties(track.type)) {
    const info = keyframeUiInfoFor(property);
    if (!info) continue;
    const rowY = centerY + info.rowOffset;
    for (const kf of clip.payload?.keyframes ?? []) {
      if (kf.property !== property) continue;
      const cx = clipX + kf.timeMs * zoomPxPerMs;
      const isSelected = selectedKeyframeId === kf.id;
      const isHovered = hoveredKeyframeId === kf.id;
      drawKeyframeDiamond(ctx, cx, rowY, info, { isSelected, isHovered });

      // Value tooltip for the hovered diamond.
      if (isHovered && onTooltip && maxRight) {
        const text = `${info.label}: ${Math.round(kf.value * 10) / 10}${info.suffix ?? ''}`;
        onTooltip(text, cx, rowY - 12, maxRight - cx - 8);
      }
    }
  }

  // Draw effect keyframes as circles (visual distinction)
  // Effect keyframes appear in their own row (rowOffset: 12)
  const effectRowY = centerY + 12;
  for (const kf of clip.payload?.keyframes ?? []) {
    if (!isEffectKeyframe(kf.property)) continue;
    const cx = clipX + kf.timeMs * zoomPxPerMs;
    if (maxRight && cx > maxRight) continue;  // Cull off-screen

    const isSelected = selectedKeyframeId === kf.id;
    const isHovered = hoveredKeyframeId === kf.id;
    const color = getEffectKeyframeColor(kf.property);

    drawEffectKeyframeCircle(ctx, cx, effectRowY, color, { isSelected, isHovered });

    // Value tooltip for hovered circle
    if (isHovered && onTooltip && maxRight) {
      const parsed = parseEffectKeyframeProperty(kf.property);
      const label = parsed ? `Effect Intensity (${parsed.effectId})` : 'Effect Intensity';
      const text = `${label}: ${Math.round(kf.value * 10) / 10}`;
      onTooltip(text, cx, effectRowY - 12, maxRight - cx - 8);
    }
  }
}
