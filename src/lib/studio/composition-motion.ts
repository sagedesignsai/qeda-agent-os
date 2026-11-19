import type {
  StudioAspectRatio,
  StudioCompositionLayer,
  StudioCompositionTransition,
  StudioLayerLayout,
} from './types';

export interface StudioCompositionLayerFrame {
  layout: StudioLayerLayout;
  opacity: number;
}

function progress(timeMs: number, startMs: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  const linear = Math.max(0, Math.min(1, (timeMs - startMs) / durationMs));
  return linear * linear * (3 - 2 * linear);
}

function slideDirection(
  type: StudioCompositionTransition['type'],
): { x: number; y: number } | null {
  switch (type) {
    case 'slide-left':
      return { x: -1, y: 0 };
    case 'slide-right':
      return { x: 1, y: 0 };
    case 'slide-up':
      return { x: 0, y: -1 };
    case 'slide-down':
      return { x: 0, y: 1 };
    default:
      return null;
  }
}

export function evaluateStudioCompositionLayerFrame(
  layer: StudioCompositionLayer,
  aspectRatio: StudioAspectRatio,
  timeMs: number,
): StudioCompositionLayerFrame {
  const base = layer.layouts[aspectRatio];
  const layerDurationMs = Math.max(0, layer.endMs - layer.startMs);
  const transitionInDurationMs = Math.min(
    layer.transitionIn.durationMs,
    layerDurationMs,
  );
  const transitionOutDurationMs = Math.min(
    layer.transitionOut.durationMs,
    layerDurationMs,
  );
  const enterProgress = progress(
    timeMs,
    layer.startMs,
    transitionInDurationMs,
  );
  const exitProgress =
    transitionOutDurationMs > 0
      ? progress(
          timeMs,
          layer.endMs - transitionOutDurationMs,
          transitionOutDurationMs,
        )
      : 0;
  let opacity = layer.opacity;
  let offsetX = 0;
  let offsetY = 0;
  let scale = 1;

  if (layer.transitionIn.type === 'fade') opacity *= enterProgress;
  if (layer.transitionOut.type === 'fade') opacity *= 1 - exitProgress;

  const enterDirection = slideDirection(layer.transitionIn.type);
  if (enterDirection) {
    offsetX += enterDirection.x * (1 - enterProgress);
    offsetY += enterDirection.y * (1 - enterProgress);
  }
  const exitDirection = slideDirection(layer.transitionOut.type);
  if (exitDirection) {
    offsetX += exitDirection.x * exitProgress;
    offsetY += exitDirection.y * exitProgress;
  }

  if (layer.transitionIn.type === 'scale') {
    scale *= 0.9 + enterProgress * 0.1;
  }
  if (layer.transitionOut.type === 'scale') {
    scale *= 1 - exitProgress * 0.1;
  }

  const width = base.width * scale;
  const height = base.height * scale;
  return {
    opacity,
    layout: {
      ...base,
      x: base.x + (base.width - width) / 2 + offsetX * base.width,
      y: base.y + (base.height - height) / 2 + offsetY * base.height,
      width,
      height,
    },
  };
}
