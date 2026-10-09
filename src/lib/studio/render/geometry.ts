/**
 * lib/studio/render/geometry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure geometry for the Studio canvas: bitmap size per aspect ratio and the
 * rounded "screen-recording window" framed inside it.
 *
 * Kept framework-free so the same numbers feed both the live render loop and
 * (later) an export path without duplicating layout math.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { StudioAspectRatio } from '../types';

export interface StudioCanvasDims {
  width: number;
  height: number;
}

export interface StudioWindowFrame {
  /** Outer window rect (rounded, includes the header bar). */
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  headerHeight: number;
  /** Video/overlay content rect, directly below the header bar. */
  contentX: number;
  contentY: number;
  contentWidth: number;
  contentHeight: number;
}

const HEADER_HEIGHT = 26;

export function studioCanvasDims(
  aspectRatio: StudioAspectRatio,
): StudioCanvasDims {
  switch (aspectRatio) {
    case '9:16':
      return { width: 1080, height: 1920 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '4:3':
      return { width: 1440, height: 1080 };
    case '16:9':
    default:
      return { width: 1920, height: 1080 };
  }
}

/**
 * Fit a window of the given content aspect ratio inside a padded canvas.
 *
 * `padding` is a percentage of the shorter canvas edge. The frame grows to the
 * padded bounds and then backs off the header height if needed, so the content
 * never overflows the window.
 */
export function computeStudioWindowFrame({
  canvasWidth,
  canvasHeight,
  padding,
  borderRadius,
  contentAspect,
}: {
  canvasWidth: number;
  canvasHeight: number;
  padding: number;
  borderRadius: number;
  contentAspect: number;
}): StudioWindowFrame {
  const aspect = Number.isFinite(contentAspect) && contentAspect > 0
    ? contentAspect
    : 16 / 9;

  const pad = (padding / 100) * Math.min(canvasWidth, canvasHeight) * 0.85;
  const maxWidth = Math.max(10, canvasWidth - pad * 2);
  const maxHeight = Math.max(10, canvasHeight - pad * 2);

  let contentWidth = maxWidth;
  let contentHeight = contentWidth / aspect;
  if (contentHeight + HEADER_HEIGHT > maxHeight) {
    contentHeight = Math.max(10, maxHeight - HEADER_HEIGHT);
    contentWidth = contentHeight * aspect;
  }

  const width = contentWidth;
  const height = contentHeight + HEADER_HEIGHT;

  return {
    x: (canvasWidth - width) / 2,
    y: (canvasHeight - height) / 2,
    width,
    height,
    radius: borderRadius,
    headerHeight: HEADER_HEIGHT,
    contentX: (canvasWidth - width) / 2,
    contentY: (canvasHeight - height) / 2 + HEADER_HEIGHT,
    contentWidth: contentWidth,
    contentHeight: contentHeight,
  };
}
