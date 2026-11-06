/**
 * components/trace/TraceStage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The vector stage: a zoomable, pannable artboard with selection and direct
 * manipulation.
 *
 * During playback the stage is not re-rendered — the runtime engine mutates the
 * mounted SVG. This component only renders on document or committed-playhead
 * changes, and renders the selection overlay from measured geometry.
 *
 * Transform editing is delegated to TraceTransformGizmo + useTransformDrag:
 * translate (body), rotate (stem handle) and scale (8 handles) plus the
 * anchor/origin marker. The gizmo previews on the mounted node directly
 * and commits a single updateTransform on pointer-up.
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
import { TraceTransformGizmo } from '@/components/trace/gizmo/TraceTransformGizmo';
import { useTransformDrag } from '@/components/trace/gizmo/useTransformDrag';
import { TracePathEditor } from '@/components/trace/path/TracePathEditor';
import {
  isPathEditableType,
  type PathModel,
} from '@/lib/trace/path/model';
import { traceStageTheme } from '@/components/trace/theme';
import {
  getHandlePositions,
  type GizmoBBox,
  type GizmoPoint,
  type GizmoTransform,
} from '@/lib/trace/gizmo/geometry';
import { resolveElementAtTime } from '@/lib/trace/runtime/resolve-element';
import {
  findElementDom,
  measureElementBBox,
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
  onTransformElement?: (
    elementId: string,
    transform: GizmoTransform,
    origin?: GizmoPoint,
  ) => void;
  editingPathElementId?: string | null;
  onEnterPathEdit?: (elementId: string) => void;
  onExitPathEdit?: () => void;
  onCommitPath?: (elementId: string, model: PathModel) => void;
  isPlaying: boolean;
};

type Viewport = { zoom: number; panX: number; panY: number };

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;

export function TraceStage(props: TraceStageProps) {
  const {
    project,
    timeMs,
    selectedElementId,
    onSelectElement,
    onMoveElement,
    onTransformElement,
    editingPathElementId = null,
    onEnterPathEdit,
    onExitPathEdit,
    onCommitPath,
    isPlaying,
  } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>({
    zoom: 1,
    panX: 0,
    panY: 0,
  });
  const [selectionBBox, setSelectionBBox] = useState<GizmoBBox | null>(null);
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

  const selectedTransform: GizmoTransform | null = useMemo(() => {
    if (!selectedElement) return null;
    const { transform } = resolveElementAtTime(selectedElement, timeMs);
    return {
      x: transform.x,
      y: transform.y,
      rotation: transform.rotation,
      scaleX: transform.scaleX,
      scaleY: transform.scaleY,
    };
  }, [selectedElement, timeMs]);

  const selectedOrigin: GizmoPoint = selectedElement?.origin ?? {
    x: 0,
    y: 0,
  };

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

  // Measure the selection in element-local space (own transform
  // neutralised, so the gizmo can compose the OBB itself). Runs on
  // selection/document changes only — never per frame.
  useLayoutEffect(() => {
    if (!selectedElement) {
      setSelectionBBox(null);
      return;
    }
    const fallback = findElementDom(
      selectedElement.id,
    ) as SVGGraphicsElement | null;
    if (!fallback) {
      setSelectionBBox(null);
      return;
    }
    const box = measureElementBBox(fallback);
    if (!box) {
      setSelectionBBox(null);
      return;
    }
    setSelectionBBox({
      x: box.x,
      y: box.y,
      width: Math.max(1, box.width),
      height: Math.max(1, box.height),
    });
  }, [selectedElement, project, timeMs]);

  const getArtboardPoint = useCallback(
    (clientX: number, clientY: number): GizmoPoint => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return { x: 0, y: 0 };
      return {
        x: ((clientX - rect.left) / rect.width) * project.width,
        y: ((clientY - rect.top) / rect.height) * project.height,
      };
    },
    [project.width, project.height],
  );

  const gizmoDisabled =
    isPlaying || !selectedElement || selectedElement.locked;

  const transformDrag = useTransformDrag({
    elementId: selectedElement?.id ?? null,
    bbox: selectionBBox,
    transform: selectedTransform ?? {
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
    origin: selectedOrigin,
    timeMs,
    project,
    disabled: gizmoDisabled,
    getArtboardPoint,
    onCommit: (transform, origin) => {
      if (!selectedElement) return;
      if (onTransformElement) {
        onTransformElement(selectedElement.id, transform, origin);
      } else {
        onMoveElement(selectedElement.id, {
          x: transform.x,
          y: transform.y,
        });
      }
    },
  });

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

  const labelPosition =
    selectedElement && selectionBBox && selectedTransform
      ? getHandlePositions(
          selectionBBox,
          transformDrag.preview?.transform ?? selectedTransform,
          transformDrag.preview?.origin ?? selectedOrigin,
          viewport.zoom,
        ).topCenter
      : null;

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
            onDoubleClickElement={(elementId) => {
              const target = project.elements[elementId];
              if (!target || target.locked || isPlaying) return;
              if (!isPathEditableType(target.type)) return;
              if (editingPathElementId === elementId) {
                onExitPathEdit?.();
              } else {
                onEnterPathEdit?.(elementId);
              }
            }}
          />

          {editingPathElementId &&
          selectedElement &&
          selectedElement.id === editingPathElementId &&
          selectedTransform &&
          isPathEditableType(selectedElement.type) ? (
            <TracePathEditor
              element={selectedElement}
              transform={selectedTransform}
              origin={selectedOrigin}
              zoom={viewport.zoom}
              disabled={isPlaying || selectedElement.locked}
              getArtboardPoint={getArtboardPoint}
              onCommit={(model) =>
                onCommitPath?.(selectedElement.id, model)
              }
            />
          ) : selectedElement && selectedTransform ? (
            <TraceTransformGizmo
              element={selectedElement}
              bbox={selectionBBox}
              transform={selectedTransform}
              origin={selectedOrigin}
              zoom={viewport.zoom}
              disabled={gizmoDisabled}
              previewTransform={transformDrag.preview?.transform ?? null}
              previewOrigin={transformDrag.preview?.origin ?? null}
              readout={transformDrag.preview?.readout ?? null}
              onHandlePointerDown={transformDrag.handlePointerDown}
              onHandlePointerMove={transformDrag.handlePointerMove}
              onHandlePointerUp={transformDrag.handlePointerUp}
              onHandlePointerCancel={transformDrag.handlePointerCancel}
            />
          ) : null}

          {selectedElement && labelPosition ? (
            <span
              data-stage-overlay
              className="pointer-events-none absolute whitespace-nowrap rounded bg-sky-500/90 px-1.5 py-0.5 text-[10px] font-medium text-slate-950"
              style={{
                left: labelPosition.x,
                top: labelPosition.y,
                transform: 'translate(-50%, -160%)',
              }}
            >
              {selectedElement.name}
            </span>
          ) : null}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-card/85 px-2 py-1 text-foreground backdrop-blur">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 text-muted-foreground hover:bg-accent/30 hover:text-foreground"
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
              className="size-7 text-muted-foreground hover:bg-accent/30 hover:text-foreground"
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
              className="size-7 text-muted-foreground hover:bg-accent/30 hover:text-foreground"
              onClick={fitToView}
              aria-label="Fit artboard"
            >
              <MaximizeIcon className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 text-muted-foreground hover:bg-accent/30 hover:text-foreground"
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
