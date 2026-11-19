import type {
  StudioCompositionDocument,
  StudioCompositionLayer,
} from '../types';
import { evaluateStudioCompositionLayerFrame } from '../composition-motion';
import { drawStudioEffects } from './effects';

export interface StudioCompositionMedia {
  element: CanvasImageSource;
  width: number;
  height: number;
}

function drawLayerMedia(
  ctx: CanvasRenderingContext2D,
  element: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  x: number,
  y: number,
  width: number,
  height: number,
  fit: 'cover' | 'contain',
): void {
  if (!sourceWidth || !sourceHeight || !width || !height) return;
  const scale =
    fit === 'cover'
      ? Math.max(width / sourceWidth, height / sourceHeight)
      : Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  ctx.drawImage(
    element,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

export function drawStudioCompositionFrame({
  ctx,
  document,
  width,
  height,
  timeMs,
  media,
}: {
  ctx: CanvasRenderingContext2D;
  document: StudioCompositionDocument;
  width: number;
  height: number;
  timeMs: number;
  media: ReadonlyMap<string, StudioCompositionMedia>;
}): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = document.background;
  ctx.fillRect(0, 0, width, height);

  const layers = [...document.layers].sort((a, b) => a.zIndex - b.zIndex);
  for (const layer of layers) {
    if (timeMs < layer.startMs || timeMs > layer.endMs) continue;
    const source = media.get(layer.id);
    if (!source) continue;

    drawStudioCompositionLayer({
      ctx,
      layer,
      source,
      aspectRatio: document.aspectRatio,
      width,
      height,
      timeMs,
    });
  }

  drawStudioEffects(
    ctx,
    document.effects,
    {
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
    },
    timeMs,
  );
}

export function drawStudioCompositionLayer({
  ctx,
  layer,
  source,
  aspectRatio,
  width,
  height,
  timeMs,
}: {
  ctx: CanvasRenderingContext2D;
  layer: StudioCompositionLayer;
  source: StudioCompositionMedia;
  aspectRatio: StudioCompositionDocument['aspectRatio'];
  width: number;
  height: number;
  timeMs: number;
}): void {
  const frame = evaluateStudioCompositionLayerFrame(
    layer,
    aspectRatio,
    timeMs,
  );
  const layout = frame.layout;
  const x = layout.x * width;
  const y = layout.y * height;
  const layerWidth = layout.width * width;
  const layerHeight = layout.height * height;

  ctx.save();
  ctx.globalAlpha = frame.opacity;
  ctx.beginPath();
  ctx.roundRect(x, y, layerWidth, layerHeight, layout.cornerRadius);
  ctx.clip();
  ctx.fillStyle = '#090b0f';
  ctx.fillRect(x, y, layerWidth, layerHeight);
  drawLayerMedia(
    ctx,
    source.element,
    source.width,
    source.height,
    x,
    y,
    layerWidth,
    layerHeight,
    layout.fit,
  );
  ctx.restore();
}
