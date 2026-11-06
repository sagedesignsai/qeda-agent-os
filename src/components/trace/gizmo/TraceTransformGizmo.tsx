/**
 * components/trace/gizmo/TraceTransformGizmo.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Presentational transform overlay: rotated selection frame, 8 scale
 * handles, a rotate handle on a stem, and the anchor/origin marker.
 *
 * Purely presentational — all drag math lives in useTransformDrag and
 * geometry.ts. Renders inside the scaled artboard as an SVG sibling of
 * TraceRenderer, in artboard units; handle sizes divide by zoom so they
 * stay constant screen size. During a drag it renders the preview
 * transform so the frame follows without a stage re-render.
 */

import {
  GIZMO_HANDLE_SIZE_PX,
  GIZMO_ROTATE_STEM_PX,
  getHandlePositions,
  type GizmoBBox,
  type GizmoHandle,
  type GizmoPoint,
  type GizmoTransform,
} from '@/lib/trace/gizmo/geometry';
import type { TraceElement } from '@/lib/trace/types';

export interface TraceTransformGizmoProps {
  element: TraceElement;
  bbox: GizmoBBox | null;
  /** Resolved transform at the playhead (committed state). */
  transform: GizmoTransform;
  origin: GizmoPoint;
  zoom: number;
  disabled?: boolean;
  previewTransform?: GizmoTransform | null;
  previewOrigin?: GizmoPoint | null;
  readout?: string | null;
  onHandlePointerDown?: (
    handle: GizmoHandle,
    event: React.PointerEvent<SVGElement>,
  ) => void;
  onHandlePointerMove?: (event: React.PointerEvent<SVGElement>) => void;
  onHandlePointerUp?: (event: React.PointerEvent<SVGElement>) => void;
  onHandlePointerCancel?: (event: React.PointerEvent<SVGElement>) => void;
}

const HANDLE_CURSORS: Record<GizmoHandle, string> = {
  move: 'move',
  rotate: 'grab',
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  origin: 'crosshair',
};

const SCALE_HANDLES: GizmoHandle[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
];

export function TraceTransformGizmo(props: TraceTransformGizmoProps) {
  const {
    element,
    bbox,
    transform,
    origin,
    zoom,
    disabled = false,
    previewTransform = null,
    previewOrigin = null,
    readout = null,
    onHandlePointerDown,
    onHandlePointerMove,
    onHandlePointerUp,
    onHandlePointerCancel,
  } = props;

  if (!bbox || !element.visible) return null;

  const activeTransform = previewTransform ?? transform;
  const activeOrigin = previewOrigin ?? origin;
  const positions = getHandlePositions(
    bbox,
    activeTransform,
    activeOrigin,
    zoom,
  );
  const safeZoom = zoom > 0 && Number.isFinite(zoom) ? zoom : 1;
  const handleSize = GIZMO_HANDLE_SIZE_PX / safeZoom;
  const stemLength = GIZMO_ROTATE_STEM_PX / safeZoom;
  const frameWidth = 1.5 / safeZoom;
  const points = `${positions.nw.x},${positions.nw.y} ${positions.ne.x},${positions.ne.y} ${positions.se.x},${positions.se.y} ${positions.sw.x},${positions.sw.y}`;

  const handleProps = (handle: GizmoHandle) =>
    ({
      'data-stage-overlay': 'true',
      'data-gizmo-handle': handle,
      style: {
        cursor: disabled
          ? 'default'
          : HANDLE_CURSORS[handle],
        pointerEvents: disabled ? 'none' : ('auto' as const),
        touchAction: 'none',
      },
      onPointerDown: (event: React.PointerEvent<SVGElement>) =>
        onHandlePointerDown?.(handle, event),
      onPointerMove: onHandlePointerMove,
      onPointerUp: onHandlePointerUp,
      onPointerCancel: onHandlePointerCancel,
    }) as const;

  const readoutFont = 11 / safeZoom;
  const readoutPadX = 6 / safeZoom;
  const readoutWidth = readout
    ? readout.length * readoutFont * 0.62 + readoutPadX * 2
    : 0;

  return (
    <svg
      data-stage-overlay
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',
        pointerEvents: 'none',
      }}
    >
      {/* Move hit area: the rotated frame interior. Transparent but
          hit-testable; click selects (via TraceRenderer) and drag moves. */}
      <polygon
        points={points}
        fill="#000000"
        fillOpacity={0}
        stroke="none"
        {...handleProps('move')}
      />
      <polygon
        points={points}
        fill="none"
        stroke="#38bdf8"
        strokeWidth={frameWidth}
        pointerEvents="none"
      />
      {/* Rotate stem */}
      <line
        x1={positions.topCenter.x}
        y1={positions.topCenter.y}
        x2={positions.rotate.x}
        y2={positions.rotate.y}
        stroke="#38bdf8"
        strokeWidth={frameWidth}
        pointerEvents="none"
      />
      {/* Scale handles */}
      {SCALE_HANDLES.map((handle) => {
        const pos = positions[handle];
        if (!pos) return null;
        return (
          <rect
            key={handle}
            x={pos.x - handleSize / 2}
            y={pos.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            rx={1.5 / safeZoom}
            fill="#f8fafc"
            stroke="#38bdf8"
            strokeWidth={frameWidth}
            {...handleProps(handle)}
          />
        );
      })}
      {/* Rotate handle */}
      <circle
        cx={positions.rotate.x}
        cy={positions.rotate.y}
        r={6 / safeZoom}
        fill="#38bdf8"
        stroke="#f8fafc"
        strokeWidth={frameWidth}
        {...handleProps('rotate')}
      />
      {/* Origin / anchor marker */}
      <circle
        cx={positions.originPoint.x}
        cy={positions.originPoint.y}
        r={4 / safeZoom}
        fill="#f8fafc"
        stroke="#38bdf8"
        strokeWidth={frameWidth}
        {...handleProps('origin')}
      />
      {/* Live readout near the rotate handle */}
      {readout ? (
        <g pointerEvents="none">
          <rect
            x={positions.rotate.x - readoutWidth / 2}
            y={positions.rotate.y - stemLength - readoutFont * 2.2}
            width={readoutWidth}
            height={readoutFont * 1.9}
            rx={3 / safeZoom}
            fill="#0f172a"
            stroke="#38bdf8"
            strokeWidth={frameWidth}
          />
          <text
            x={positions.rotate.x}
            y={positions.rotate.y - stemLength - readoutFont * 0.75}
            textAnchor="middle"
            fontSize={readoutFont}
            fontFamily="ui-monospace, monospace"
            fill="#e2e8f0"
          >
            {readout}
          </text>
        </g>
      ) : null}
    </svg>
  );
}
