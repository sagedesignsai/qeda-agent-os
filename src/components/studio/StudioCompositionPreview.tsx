import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import { PauseIcon, PlayIcon, RotateCcwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { studioCanvasDims } from '@/lib/studio/render/geometry';
import {
  studioCompositionAssetMediaUrl,
  studioTakeMediaUrl,
} from '@/lib/studio/media';
import { drawStudioCompositionFrame } from '@/lib/studio/render/composition';
import { evaluateStudioCompositionLayerFrame } from '@/lib/studio/composition-motion';
import {
  getCompositionHandlePoint,
  hitCompositionResizeHandle,
  resizeCompositionLayerLayout,
  STUDIO_COMPOSITION_RESIZE_HANDLES,
  translateCompositionLayerLayout,
  type StudioCompositionResizeHandle,
} from '@/lib/studio/composition-layout';
import type {
  StudioComposition,
  StudioCompositionLayer,
  StudioLayerLayout,
} from '@/lib/studio/types';

function timeLabel(timeMs: number): string {
  const seconds = Math.floor(timeMs / 1000);
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function sourceUrl(layer: StudioCompositionLayer): string {
  return layer.kind === 'video'
    ? studioTakeMediaUrl(layer.sourceId)
    : studioCompositionAssetMediaUrl(layer.sourceId);
}

type DragHandle = 'move' | StudioCompositionResizeHandle;

function handleCursor(handle: StudioCompositionResizeHandle): string {
  if (handle === 'nw' || handle === 'se') return 'nwse-resize';
  if (handle === 'ne' || handle === 'sw') return 'nesw-resize';
  if (handle === 'n' || handle === 's') return 'ns-resize';
  return 'ew-resize';
}

export function StudioCompositionPreview({
  composition,
  selectedLayerId,
  playheadMs,
  disabled = false,
  onSelectLayer,
  onPlayheadChange,
  onLayoutChange,
}: {
  composition: StudioComposition;
  selectedLayerId: string | null;
  playheadMs: number;
  disabled?: boolean;
  onSelectLayer: (layerId: string | null) => void;
  onPlayheadChange: (timeMs: number) => void;
  onLayoutChange: (
    layerId: string,
    layout: StudioLayerLayout,
  ) => Promise<boolean>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());
  const imageRefs = useRef(new Map<string, HTMLImageElement>());
  const [imagesVersion, setImagesVersion] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const playheadRef = useRef(playheadMs);
  const lastPublishedPlayheadRef = useRef(0);
  const selectedLayerIdRef = useRef(selectedLayerId);
  const layoutDraftRef = useRef<{
    layerId: string;
    layout: StudioLayerLayout;
  } | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    layerId: string;
    handle: DragHandle;
    startX: number;
    startY: number;
    layout: StudioLayerLayout;
  } | null>(null);

  const dims = useMemo(
    () => studioCanvasDims(composition.document.aspectRatio),
    [composition.document.aspectRatio],
  );

  useEffect(() => {
    playheadRef.current = playheadMs;
  }, [playheadMs]);

  useEffect(() => {
    selectedLayerIdRef.current = selectedLayerId;
  }, [selectedLayerId]);

  useEffect(() => {
    const activeImageIds = new Set(
      composition.document.layers
        .filter((layer) => layer.kind === 'image')
        .map((layer) => layer.sourceId),
    );
    for (const id of imageRefs.current.keys()) {
      if (!activeImageIds.has(id)) imageRefs.current.delete(id);
    }

    for (const layer of composition.document.layers) {
      if (layer.kind !== 'image' || imageRefs.current.has(layer.sourceId))
        continue;
      const image = new Image();
      image.onload = () => setImagesVersion((version) => version + 1);
      image.onerror = () => {
        console.error(`Studio composition image failed to load: ${layer.name}`);
      };
      image.src = sourceUrl(layer);
      imageRefs.current.set(layer.sourceId, image);
    }
  }, [composition.document.layers]);

  useEffect(() => {
    for (const layer of composition.document.layers) {
      if (layer.kind !== 'video') continue;
      const video = videoRefs.current.get(layer.id);
      if (!video || video.readyState < 1) continue;
      const relativeMs = Math.max(0, playheadMs - layer.startMs);
      const sourceDurationMs = Number.isFinite(video.duration)
        ? Math.min(layer.sourceDurationMs, video.duration * 1000)
        : layer.sourceDurationMs;
      const sourceMs = Math.min(
        Math.max(0, sourceDurationMs - 20),
        layer.sourceInMs + relativeMs,
      );
      if (Math.abs(video.currentTime * 1000 - sourceMs) > 160) {
        video.currentTime = Math.max(0, sourceMs / 1000);
      }
    }
  }, [composition.document.layers, playheadMs]);

  useEffect(() => {
    for (const video of videoRefs.current.values()) {
      if (isPlaying) {
        void video.play().catch((error: unknown) => {
          console.error('[Studio composition] Video playback failed.', error);
          setIsPlaying(false);
        });
      } else {
        video.pause();
      }
    }
  }, [isPlaying, composition.document.layers]);

  useEffect(() => {
    if (!isPlaying) return;
    let frameId = 0;
    let lastTimestamp = 0;
    let lastSeekTimestamp = 0;
    const tick = (timestamp: number) => {
      if (lastTimestamp > 0) {
        const nextTime = Math.min(
          composition.document.durationMs,
          playheadRef.current + timestamp - lastTimestamp,
        );
        playheadRef.current = nextTime;
        if (
          timestamp - lastPublishedPlayheadRef.current >= 100 ||
          nextTime >= composition.document.durationMs
        ) {
          onPlayheadChange(nextTime);
          lastPublishedPlayheadRef.current = timestamp;
        }

        if (timestamp - lastSeekTimestamp > 300) {
          for (const layer of composition.document.layers) {
            if (layer.kind !== 'video') continue;
            const video = videoRefs.current.get(layer.id);
            if (!video || video.readyState < 1 || video.seeking) continue;
            const relativeMs = Math.max(0, nextTime - layer.startMs);
            const sourceDurationMs = Number.isFinite(video.duration)
              ? Math.min(layer.sourceDurationMs, video.duration * 1000)
              : layer.sourceDurationMs;
            const sourceMs = Math.min(
              Math.max(0, sourceDurationMs - 20),
              layer.sourceInMs + relativeMs,
            );
            if (Math.abs(video.currentTime * 1000 - sourceMs) > 350) {
              video.currentTime = Math.max(0, sourceMs / 1000);
            }
          }
          lastSeekTimestamp = timestamp;
        }
        if (nextTime >= composition.document.durationMs) {
          setIsPlaying(false);
          return;
        }
      }
      lastTimestamp = timestamp;
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [
    composition.document.durationMs,
    composition.document.layers,
    isPlaying,
    onPlayheadChange,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let frameId = 0;
    const render = () => {
      const media = new Map<
        string,
        { element: CanvasImageSource; width: number; height: number }
      >();
      for (const layer of composition.document.layers) {
        if (layer.kind === 'video') {
          const video = videoRefs.current.get(layer.id);
          if (video && video.readyState >= 2) {
            media.set(layer.id, {
              element: video,
              width: video.videoWidth,
              height: video.videoHeight,
            });
          }
        } else {
          const image = imageRefs.current.get(layer.sourceId);
          if (image?.complete && image.naturalWidth > 0) {
            media.set(layer.id, {
              element: image,
              width: image.naturalWidth,
              height: image.naturalHeight,
            });
          }
        }
      }
      const layoutDraft = layoutDraftRef.current;
      const previewDocument = layoutDraft
        ? {
            ...composition.document,
            layers: composition.document.layers.map((layer) =>
              layer.id === layoutDraft.layerId
                ? {
                    ...layer,
                    layouts: {
                      ...layer.layouts,
                      [composition.document.aspectRatio]: layoutDraft.layout,
                    },
                  }
                : layer,
            ),
          }
        : composition.document;
      drawStudioCompositionFrame({
        ctx,
        document: previewDocument,
        width: dims.width,
        height: dims.height,
        timeMs: playheadRef.current,
        media,
      });
      const selectedLayer = previewDocument.layers.find(
        (layer) => layer.id === selectedLayerId,
      );
      if (
        selectedLayer &&
        playheadRef.current >= selectedLayer.startMs &&
        playheadRef.current <= selectedLayer.endMs
      ) {
        const layout = evaluateStudioCompositionLayerFrame(
          selectedLayer,
          composition.document.aspectRatio,
          playheadRef.current,
        ).layout;
        const x = layout.x * dims.width;
        const y = layout.y * dims.height;
        const width = layout.width * dims.width;
        const height = layout.height * dims.height;
        ctx.save();
        ctx.strokeStyle = '#80a9ff';
        ctx.lineWidth = Math.max(2, dims.width / 960);
        ctx.setLineDash([12, 8]);
        ctx.strokeRect(x, y, width, height);
        ctx.setLineDash([]);
        for (const handle of STUDIO_COMPOSITION_RESIZE_HANDLES) {
          const point = getCompositionHandlePoint(layout, handle);
          const size = 18;
          ctx.fillStyle = '#f4f7ff';
          ctx.fillRect(
            point.x * dims.width - size / 2,
            point.y * dims.height - size / 2,
            size,
            size,
          );
          ctx.strokeStyle = '#527fe0';
          ctx.lineWidth = Math.max(2, dims.width / 960);
          ctx.strokeRect(
            point.x * dims.width - size / 2,
            point.y * dims.height - size / 2,
            size,
            size,
          );
        }
        ctx.restore();
      }
      frameId = requestAnimationFrame(render);
    };
    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [composition.document, dims, imagesVersion, selectedLayerId]);

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (disabled || dragRef.current || event.button !== 0) return;
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const layers = composition.document.layers;
    const selected = layers.find(
      (layer) => layer.id === selectedLayerIdRef.current,
    );
    const selectedLayout =
      selected
        ? evaluateStudioCompositionLayerFrame(
            selected,
            composition.document.aspectRatio,
            playheadRef.current,
          ).layout
        : null;
    const resizeHandle = selectedLayout
      ? hitCompositionResizeHandle(selectedLayout, x, y)
      : null;
    const hit = [...layers]
      .sort((a, b) => b.zIndex - a.zIndex)
      .find((layer) => {
        if (
          playheadRef.current < layer.startMs ||
          playheadRef.current > layer.endMs
        ) {
          return false;
        }
        const layout = evaluateStudioCompositionLayerFrame(
          layer,
          composition.document.aspectRatio,
          playheadRef.current,
        ).layout;
        return (
          x >= layout.x &&
          x <= layout.x + layout.width &&
          y >= layout.y &&
          y <= layout.y + layout.height
        );
      });
    const layer = resizeHandle ? selected : hit;
    if (!layer) {
      onSelectLayer(null);
      return;
    }

    const layout = layer.layouts[composition.document.aspectRatio];
    onSelectLayer(layer.id);
    selectedLayerIdRef.current = layer.id;
    dragRef.current = {
      pointerId: event.pointerId,
      layerId: layer.id,
      handle: resizeHandle ?? 'move',
      startX: x,
      startY: y,
      layout: { ...layout },
    };
    canvas.style.cursor = resizeHandle
      ? handleCursor(resizeHandle)
      : 'grabbing';
    canvas.setPointerCapture(event.pointerId);
    setIsDragging(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      const selected = composition.document.layers.find(
        (layer) => layer.id === selectedLayerIdRef.current,
      );
      if (selected) {
        const rect = event.currentTarget.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        const layout = evaluateStudioCompositionLayerFrame(
          selected,
          composition.document.aspectRatio,
          playheadRef.current,
        ).layout;
        const onHandle = hitCompositionResizeHandle(layout, x, y);
        event.currentTarget.style.cursor = onHandle
          ? handleCursor(onHandle)
          : 'move';
      }
      return;
    }
    event.currentTarget.style.cursor =
      drag.handle === 'move' ? 'grabbing' : handleCursor(drag.handle);
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const deltaX = x - drag.startX;
    const deltaY = y - drag.startY;
    const layout =
      drag.handle === 'move'
        ? translateCompositionLayerLayout(drag.layout, deltaX, deltaY)
        : resizeCompositionLayerLayout(drag.layout, drag.handle, deltaX, deltaY);
    layoutDraftRef.current = { layerId: drag.layerId, layout };
  };

  const finishPointerEdit = async (
    event: PointerEvent<HTMLCanvasElement>,
    commit: boolean,
  ) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
    event.currentTarget.style.cursor = 'move';
    const draft = layoutDraftRef.current;
    if (!commit || !draft) {
      layoutDraftRef.current = null;
      return;
    }
    const saved = await onLayoutChange(draft.layerId, draft.layout);
    layoutDraftRef.current = null;
    if (!saved) onSelectLayer(draft.layerId);
  };

  const aspectRatio =
    composition.document.aspectRatio === '9:16'
      ? '9 / 16'
      : composition.document.aspectRatio === '1:1'
        ? '1 / 1'
        : composition.document.aspectRatio === '4:3'
          ? '4 / 3'
          : '16 / 9';

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
      <div
        className="relative flex min-h-0 w-full max-h-full items-center justify-center overflow-hidden rounded-lg border border-border/50 bg-black/40"
        style={{ aspectRatio, maxWidth: '100%', maxHeight: '100%' }}
      >
        {composition.document.layers
          .filter((layer) => layer.kind === 'video')
          .map((layer) => (
            <video
              key={layer.id}
              ref={(element) => {
                if (element) videoRefs.current.set(layer.id, element);
                else videoRefs.current.delete(layer.id);
              }}
              src={sourceUrl(layer)}
              muted={composition.document.audioSourceLayerId !== layer.id}
              playsInline
              preload="auto"
              className="pointer-events-none absolute h-px w-px opacity-0"
              aria-hidden="true"
            />
          ))}
        <canvas
          ref={canvasRef}
          width={dims.width}
          height={dims.height}
          className={`h-full w-full touch-none object-contain ${isDragging ? 'cursor-grabbing' : 'cursor-move'}`}
          role="img"
          aria-label={`${composition.title} composition preview. Drag selected layer handles to position or resize.`}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => void finishPointerEdit(event, true)}
          onPointerCancel={(event) => void finishPointerEdit(event, false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              const drag = dragRef.current;
              if (
                drag &&
                event.currentTarget.hasPointerCapture(drag.pointerId)
              ) {
                event.currentTarget.releasePointerCapture(drag.pointerId);
              }
              dragRef.current = null;
              layoutDraftRef.current = null;
              setIsDragging(false);
              return;
            }
            if (
              disabled ||
              !selectedLayerId ||
              !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
                event.key,
              )
            ) {
              return;
            }
            const selected = composition.document.layers.find(
              (layer) => layer.id === selectedLayerId,
            );
            if (!selected) return;
            event.preventDefault();
            const layout = selected.layouts[composition.document.aspectRatio];
            const distance = event.shiftKey ? 0.02 : 0.005;
            const deltaX =
              event.key === 'ArrowLeft'
                ? -distance
                : event.key === 'ArrowRight'
                  ? distance
                  : 0;
            const deltaY =
              event.key === 'ArrowUp'
                ? -distance
                : event.key === 'ArrowDown'
                  ? distance
                  : 0;
            void onLayoutChange(
              selected.id,
              translateCompositionLayerLayout(layout, deltaX, deltaY),
            );
          }}
        />
      </div>
      <div className="flex w-full max-w-3xl items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8 shrink-0"
          aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
          onClick={() => setIsPlaying((playing) => !playing)}
        >
          {isPlaying ? (
            <PauseIcon className="size-4" />
          ) : (
            <PlayIcon className="size-4" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label="Restart preview"
          onClick={() => {
            setIsPlaying(false);
            playheadRef.current = 0;
            onPlayheadChange(0);
          }}
        >
          <RotateCcwIcon className="size-4" />
        </Button>
        <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {timeLabel(playheadMs)}
        </span>
        <input
          aria-label="Composition playhead"
          type="range"
          min={0}
          max={composition.document.durationMs}
          step={50}
          value={Math.min(playheadMs, composition.document.durationMs)}
          onChange={(event) => {
            setIsPlaying(false);
            const nextTime = Number(event.target.value);
            playheadRef.current = nextTime;
            onPlayheadChange(nextTime);
          }}
          className="h-1 min-w-0 flex-1 accent-primary"
        />
        <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">
          {timeLabel(composition.document.durationMs)}
        </span>
      </div>
    </div>
  );
}
