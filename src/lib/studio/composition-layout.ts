import type { StudioLayerLayout } from './types';

export type StudioCompositionResizeHandle =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w';

export const STUDIO_COMPOSITION_RESIZE_HANDLES: StudioCompositionResizeHandle[] =
  ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export function getCompositionHandlePoint(
  layout: StudioLayerLayout,
  handle: StudioCompositionResizeHandle,
): { x: number; y: number } {
  const left = layout.x;
  const top = layout.y;
  const right = left + layout.width;
  const bottom = top + layout.height;
  const centerX = left + layout.width / 2;
  const centerY = top + layout.height / 2;
  switch (handle) {
    case 'nw':
      return { x: left, y: top };
    case 'n':
      return { x: centerX, y: top };
    case 'ne':
      return { x: right, y: top };
    case 'e':
      return { x: right, y: centerY };
    case 'se':
      return { x: right, y: bottom };
    case 's':
      return { x: centerX, y: bottom };
    case 'sw':
      return { x: left, y: bottom };
    case 'w':
      return { x: left, y: centerY };
  }
}

export function hitCompositionResizeHandle(
  layout: StudioLayerLayout,
  x: number,
  y: number,
  radius = 0.018,
): StudioCompositionResizeHandle | null {
  return (
    STUDIO_COMPOSITION_RESIZE_HANDLES.find((handle) => {
      const point = getCompositionHandlePoint(layout, handle);
      return Math.abs(x - point.x) <= radius && Math.abs(y - point.y) <= radius;
    }) ?? null
  );
}

export function translateCompositionLayerLayout(
  layout: StudioLayerLayout,
  deltaX: number,
  deltaY: number,
): StudioLayerLayout {
  return {
    ...layout,
    x: Math.max(0, Math.min(1 - layout.width, layout.x + deltaX)),
    y: Math.max(0, Math.min(1 - layout.height, layout.y + deltaY)),
  };
}

export function resizeCompositionLayerLayout(
  start: StudioLayerLayout,
  handle: StudioCompositionResizeHandle,
  deltaX: number,
  deltaY: number,
  minSize = 0.04,
): StudioLayerLayout {
  const right = start.x + start.width;
  const bottom = start.y + start.height;
  let left = start.x;
  let top = start.y;
  let nextRight = right;
  let nextBottom = bottom;

  if (handle.includes('w')) {
    left = Math.max(0, Math.min(right - minSize, start.x + deltaX));
  }
  if (handle.includes('e')) {
    nextRight = Math.min(1, Math.max(left + minSize, right + deltaX));
  }
  if (handle.includes('n')) {
    top = Math.max(0, Math.min(bottom - minSize, start.y + deltaY));
  }
  if (handle.includes('s')) {
    nextBottom = Math.min(1, Math.max(top + minSize, bottom + deltaY));
  }

  return {
    ...start,
    x: left,
    y: top,
    width: nextRight - left,
    height: nextBottom - top,
  };
}
