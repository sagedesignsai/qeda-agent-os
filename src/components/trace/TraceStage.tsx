/**
 * components/trace/TraceStage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The vector stage: a zoomable, pannable artboard with selection and direct
 * manipulation.
 *
 * During playback the stage is not re-rendered — the runtime engine mutates the
 * mounted SVG. This component only renders on document or committed-playhead
 * changes, and renders the selection overlay from measured geometry.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CrosshairIcon, MaximizeIcon, MinusIcon, PlusIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { TraceRenderer } from '@/components/trace/renderer/TraceRenderer';
import { traceStageTheme } from '@/components/trace/theme';
import { resolveElementAtTime } from '@/lib/trace/runtime/resolve-element';
import { getElementPosition } from '@/lib/trace/resolve';
import {
  findElementDom,
  syncTraceDomAtTime,
} from '@/lib/trace/runtime/dom-renderer';
import type { TraceProject } from '@/lib/trace/types';

export type TraceStageProps = {
  project: TraceProject;
  timeMs: number;
  selectedElementId: string | null;
  onSelectElement: (elementId: string | null) => void;
  onMoveElement: (
    elementId: string,
    position: { x: number; y: number },
  ) => void;
  isPlaying: boolean;
};

type Rect = { x: number; y: number; width: number; height: number };
type Viewport = { zoom: number; panX: number; panY: number };

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;

export function TraceStage({
  project,
  timeMs,
  selectedElementId,
  onSelectElement,
  onMoveElement,
  isPlaying,
}: TraceStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>({
    zoom: 1,
    panX: 0,
    panY: 0,
  });
  const [selectionRect, setSelectionRect] = useState<Rect | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    dx: number;
    dy: number;
    elementId: string;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pan, setPan] = useState<{
    pointerId: number;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);

  const selectedElement = selectedElementId
    ? (project.elements[selectedElementId] ?? null)
    : null;

  const fitToView = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    const zoom = Math.min(
      (bounds.width - 96) / project.width,
      (bounds.height - 96) / project.height,
    );
    setViewport({
      zoom: Math.max(MIN_ZOOM, Math.min(2, Number.isFinite(zoom) ? zoom : 1)),
      panX: 0,
      panY: 0,
    });
  }, [project.width, project.height]);

  useEffect(() => {
    fitToView();
  }, [fitToView]);

  // Sync the mounted SVG to the committed playhead after every render.
  useLayoutEffect(() => {
    syncTraceDomAtTime(timeMs, project);
  }, [project, timeMs]);

  // Measure the selection in artboard units. Runs on selection/document changes
  // only — never per frame.
  useLayoutEffect(() => {
    if (!selectedElement) {
      setSelectionRect(null);
      return;
    }
    const node = findElementDom(
      selectedElement.id,
    ) as SVGGraphicsElement | null;
    if (!node || typeof node.getBBox !== 'function') {
      setSelectionRect(null);
      return;
    }
    try {
      const box = node.getBBox();
      setSelectionRect({
        x: box.x,
        y: box.y,
        width: Math.max(2, box.width),
        height: Math.max(2, box.height),
      });
    } catch {
      setSelectionRect(null);
    }
  }, [selectedElement, project, timeMs]);

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (
      !event.ctrlKey &&
      !event.metaKey &&
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
    ) {
      setViewport((current) => ({
        ...current,
        panX: current.panX - event.deltaX,
      }));
      return;
    }
    event.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    const cursorX = event.clientX - bounds.left - bounds.width / 2;
    const cursorY = event.clientY - bounds.top - bounds.height / 2;
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    setViewport((current) => {
      const nextZoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, current.zoom * factor),
      );
      const ratio = nextZoom / current.zoom;
      return {
        zoom: nextZoom,
        panX: cursorX - (cursorX - current.panX) * ratio,
        panY: cursorY - (cursorY - current.panY) * ratio,
      };
    });
  };

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!selectedElement || isPlaying || selectedElement.locked) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const position = getElementPosition(selectedElement, timeMs);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      dx: 0,
      dy: 0,
      elementId: selectedElement.id,
    };
    setDragging(true);
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = (event.clientX - drag.startX) / viewport.zoom;
    const dy = (event.clientY - drag.startY) / viewport.zoom;
    drag.dx = dx;
    drag.dy = dy;

    // Live preview mutates the DOM directly: no React state, so the stage is
    // not re-rendered (and cannot snap back) while the pointer is down.
    const node = findElementDom(drag.elementId);
    const element = project.elements[drag.elementId];
    if (!node || !element) return;
    const resolved = resolveElementAtTime(element, timeMs).transform;
    node.style.transform = `translate(${resolved.x + dx}px, ${resolved.y + dy}px) rotate(${
      resolved.rotation
    }deg) scale(${resolved.scaleX}, ${resolved.scaleY})`;

    if (overlayRef.current) {
      overlayRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drag.dx !== 0 || drag.dy !== 0) {
      onMoveElement(drag.elementId, {
        x: Math.round(drag.originX + drag.dx),
        y: Math.round(drag.originY + drag.dy),
      });
    }
    dragRef.current = null;
    setDragging(false);
    if (overlayRef.current) overlayRef.current.style.transform = '';
    syncTraceDomAtTime(timeMs, project);
  };

  const startPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    const target = event.target as HTMLElement;
    if (
      target.closest('[data-trace-id]') ||
      target.closest('[data-stage-overlay]')
    )
      return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPan({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: viewport.panX,
      panY: viewport.panY,
    });
  };

  const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pan || event.pointerId !== pan.pointerId) return;
    setViewport((current) => ({
      ...current,
      panX: pan.panX + (event.clientX - pan.startX),
      panY: pan.panY + (event.clientY - pan.startY),
    }));
  };

  const endPan = () => setPan(null);

  const zoomPercent = Math.round(viewport.zoom * 100);
  const artboardStyle = useMemo(
    () => ({
      width: project.width,
      height: project.height,
      transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
      transformOrigin: 'center center',
    }),
    [project.width, project.height, viewport],
  );

  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col"
      style={traceStageTheme}
    >
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 overflow-hidden"
        onWheel={onWheel}
        onPointerDown={startPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        style={{ cursor: pan ? 'grabbing' : 'default', touchAction: 'none' }}
      >
        <div
          ref={canvasRef}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 shadow-[0_30px_120px_-20px_rgba(2,6,23,0.9)] ring-1 ring-white/10"
          style={artboardStyle}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) onSelectElement(null);
          }}
        >
          <TraceRenderer
            project={project}
            timeMs={timeMs}
            selectedElementId={selectedElementId}
            onSelectElement={onSelectElement}
          />

          {selectedElement && selectionRect ? (
            <div
              ref={overlayRef}
              data-stage-overlay
              className="pointer-events-none absolute border border-sky-400/90"
              style={{
                left: selectionRect.x,
                top: selectionRect.y,
                width: selectionRect.width,
                height: selectionRect.height,
              }}
            >
              <div
                data-stage-overlay
                className="pointer-events-auto absolute -left-px -top-px h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-sky-400"
                onPointerDown={startDrag}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                style={{
                  cursor: isPlaying
                    ? 'default'
                    : dragging
                      ? 'grabbing'
                      : 'move',
                }}
              />
              <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-sky-500/90 px-1.5 py-0.5 text-[10px] font-medium text-slate-950">
                {selectedElement.name}
              </span>
            </div>
          ) : null}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-slate-950/85 px-2 py-1 text-slate-200 backdrop-blur">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 text-slate-300 hover:bg-white/10 hover:text-white"
              onClick={() =>
                setViewport((current) => ({
                  ...current,
                  zoom: Math.max(MIN_ZOOM, current.zoom - 0.1),
                }))
              }
              aria-label="Zoom out"
            >
              <MinusIcon className="size-3.5" />
            </Button>
            <span className="min-w-12 text-center font-mono text-[10px] tabular-nums">
              {zoomPercent}%
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 text-slate-300 hover:bg-white/10 hover:text-white"
              onClick={() =>
                setViewport((current) => ({
                  ...current,
                  zoom: Math.min(MAX_ZOOM, current.zoom + 0.1),
                }))
              }
              aria-label="Zoom in"
            >
              <PlusIcon className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 text-slate-300 hover:bg-white/10 hover:text-white"
              onClick={fitToView}
              aria-label="Fit artboard"
            >
              <MaximizeIcon className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 text-slate-300 hover:bg-white/10 hover:text-white"
              onClick={() => setViewport({ zoom: 1, panX: 0, panY: 0 })}
              aria-label="Reset view"
            >
              <CrosshairIcon className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
