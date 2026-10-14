/**
 * components/studio/renderers/svg-animator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Canvas 2D Vector & SVG Animation Engine for Showcase Studio:
 *   - Path Trim Path / Write-on self-drawing animation (strokeDashoffset math)
 *   - Matrix transform & keyframe interpolation (translate, scale, rotate, opacity)
 *   - Vector filter effects (glow, neon, drop-shadow, blur)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { StudioSvgLayer, StudioSvgKeyframe } from '@/lib/studio/svg-types';

export interface SvgRenderOptions {
  layer: StudioSvgLayer;
  currentTimeMs: number;
  cw: number;
  ch: number;
}

/**
 * Interpolates numeric value between two keyframes based on easing function.
 */
function interpolate(
  v1: number,
  v2: number,
  progress: number,
  easing?: string,
): number {
  let p = Math.max(0, Math.min(1, progress));
  if (easing === 'easeIn') {
    p = p * p;
  } else if (easing === 'easeOut') {
    p = p * (2 - p);
  } else if (easing === 'easeInOut') {
    p = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
  }
  return v1 + (v2 - v1) * p;
}

/**
 * Renders an animated SVG vector layer onto a 2D Canvas context.
 */
export function drawSvgAnimatedLayer(
  ctx: CanvasRenderingContext2D,
  options: SvgRenderOptions,
): void {
  const { layer, currentTimeMs, cw, ch } = options;

  if (!layer) return;

  const layerTime = currentTimeMs - layer.startMs;
  if (layerTime < 0 || layerTime > layer.durationMs) {
    return; // Out of active layer playback window
  }

  const layerProgress = layerTime / layer.durationMs;

  ctx.save();

  // 1. Calculate Transforms & Keyframes
  let currentTrim = layer.trimPath.enabled ? layerProgress : 1.0;
  let tx = (layer.transform.x || 0) * (cw / 2);
  let ty = (layer.transform.y || 0) * (ch / 2);
  let scaleX = layer.transform.scale || 1.0;
  let scaleY = layer.transform.scale || 1.0;
  let rotate = layer.transform.rotation || 0;
  let alpha = layer.transform.opacity ?? 1.0;

  // Keyframe Interpolation if keyframes exist
  if (layer.keyframes && layer.keyframes.length > 0) {
    const kfs = [...layer.keyframes].sort((a, b) => a.timeMs - b.timeMs);
    let prevKf: StudioSvgKeyframe = kfs[0];
    let nextKf: StudioSvgKeyframe = kfs[kfs.length - 1];

    for (let i = 0; i < kfs.length; i++) {
      if (layerTime <= kfs[i].timeMs) {
        nextKf = kfs[i];
        prevKf = i > 0 ? kfs[i - 1] : kfs[0];
        break;
      }
    }

    if (prevKf && nextKf && prevKf !== nextKf) {
      const segmentDur = nextKf.timeMs - prevKf.timeMs;
      const segmentProg =
        segmentDur > 0 ? (layerTime - prevKf.timeMs) / segmentDur : 1.0;
      const ease = nextKf.easing || 'easeInOut';

      currentTrim = interpolate(
        prevKf.trimPathProgress,
        nextKf.trimPathProgress,
        segmentProg,
        ease,
      );
      tx = interpolate(prevKf.translateX, nextKf.translateX, segmentProg, ease);
      ty = interpolate(prevKf.translateY, nextKf.translateY, segmentProg, ease);
      scaleX = interpolate(prevKf.scaleX, nextKf.scaleX, segmentProg, ease);
      scaleY = interpolate(prevKf.scaleY, nextKf.scaleY, segmentProg, ease);
      rotate = interpolate(prevKf.rotateDeg, nextKf.rotateDeg, segmentProg, ease);
      alpha = interpolate(prevKf.opacity, nextKf.opacity, segmentProg, ease);
    } else if (prevKf) {
      currentTrim = prevKf.trimPathProgress;
      tx = prevKf.translateX;
      ty = prevKf.translateY;
      scaleX = prevKf.scaleX;
      scaleY = prevKf.scaleY;
      rotate = prevKf.rotateDeg;
      alpha = prevKf.opacity;
    }
  }

  // Apply Global Alpha
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

  // 2. Vector Filters (Glow, Neon, Shadow)
  if (layer.filter && layer.filter.type !== 'none') {
    if (layer.filter.type === 'glow' || layer.filter.type === 'neon') {
      ctx.shadowColor = layer.filter.color || '#6366f1';
      ctx.shadowBlur = layer.filter.blurRadius || 16;
    } else if (layer.filter.type === 'drop-shadow') {
      ctx.shadowColor = layer.filter.color || 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = layer.filter.blurRadius || 12;
      ctx.shadowOffsetX = layer.filter.offsetX || 4;
      ctx.shadowOffsetY = layer.filter.offsetY || 6;
    }
  }

  // 3. Canvas Center Transform Matrix
  const centerX = cw / 2 + tx;
  const centerY = ch / 2 + ty;

  ctx.translate(centerX, centerY);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.scale(scaleX, scaleY);

  // 4. Render Vector Paths with Trim Path
  for (const pathObj of layer.paths || []) {
    ctx.save();

    const path2D = new Path2D(pathObj.d);
    const strokeColor = pathObj.stroke || '#818cf8';
    const strokeWidth = pathObj.strokeWidth || 4;
    const fillColor = pathObj.fill || 'none';

    // Approximate Path Length for Trim Path
    const estimatedLen = pathObj.length || 300;
    const dashLen = Math.max(1, estimatedLen * Math.min(1, Math.max(0, currentTrim)));

    if (fillColor !== 'none' && currentTrim >= 0.95) {
      ctx.fillStyle = fillColor;
      ctx.fill(path2D);
    }

    if (strokeColor !== 'none' && strokeWidth > 0) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (layer.trimPath.enabled) {
        ctx.setLineDash([dashLen, estimatedLen]);
        ctx.lineDashOffset = 0;
      }

      ctx.stroke(path2D);
    }

    ctx.restore();
  }

  ctx.restore();
}
