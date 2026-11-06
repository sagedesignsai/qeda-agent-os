/**
 * components/trace/path/TracePathEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Canvas overlay for editing a path element's anchors and Bézier
 * handles. Renders in artboard units as an SVG sibling of TraceRenderer
 * (same contract as the transform gizmo): anchor squares, handle
 * circles + stems for the selected anchor only, and wide invisible
 * segment strokes for click-to-insert. Point positions are converted
 * local -> artboard with the element transform, so editing stays
 * correct under rotation/scale.
 */

import { useEffect } from 'react';

import {
  localToArtboard,
  type GizmoPoint,
  type GizmoTransform,
} from '@/lib/trace/gizmo/geometry';
import {
  isCurveSegment,
  parsePathData,
  parsePointsString,
  type PathModel,
} from '@/lib/trace/path/model';
import type { TraceElement } from '@/lib/trace/types';

import {
  usePathDrag,
  parseElementModel,
  type PathDragTarget,
} from './usePathDrag';

export interface TracePathEditorProps {
  element: TraceElement;
  transform: GizmoTransform;
  origin: GizmoPoint;
  zoom: number;
  disabled?: boolean;
  getArtboardPoint: (clientX: number, clientY: number) => GizmoPoint;
  onCommit: (model: PathModel) => void;
}

export function TracePathEditor(props: TracePathEditorProps) {
  const {
    element,
    transform,
    origin,
    zoom,
    disabled = false,
    getArtboardPoint,
    onCommit,
  } = props;

  const committedModel = parseElementModel(element);
  const pathDrag = usePathDrag({
    element,
    model: committedModel,
    transform,
    origin,
    disabled,
    getArtboardPoint,
    onCommit,
  });
  const model = pathDrag.previewModel ?? committedModel;
  const selection = pathDrag.selection;

  // Keyboard: Delete removes the selected anchor, arrows nudge it.
  // Escape/Enter (exit) and element-delete guarding live in TraceEditor,
  // which skips its own Delete handling while a path is being edited.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (disabled) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        pathDrag.deleteSelected();
        return;
      }
      if (
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight' ||
        event.key === 'ArrowUp' ||
        event.key === 'ArrowDown'
      ) {
        const step = event.shiftKey ? 10 : 1;
        const dx =
          event.key === 'ArrowLeft'
            ? -step
            : event.key === 'ArrowRight'
              ? step
              : 0;
        const dy =
          event.key === 'ArrowUp'
            ? -step
            : event.key === 'ArrowDown'
              ? step
              : 0;
        event.preventDefault();
        pathDrag.nudgeSelected(dx, dy);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // pathDrag callbacks are stable via refs; re-subscribing on every
    // preview change would drop in-flight key handling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  const safeZoom = zoom > 0 && Number.isFinite(zoom) ? zoom : 1;
  const anchorSize = 8 / safeZoom;
  const handleRadius = 4 / safeZoom;
  const lineWidth = 1 / safeZoom;
  const hitWidth = 14 / safeZoom;

  const toArtboard = (point: GizmoPoint): GizmoPoint =>
    localToArtboard(point, transform, origin);

  const selectedNode =
    selection &&
    selection.handle === null
      ? model.subpaths[selection.ref.subpath]?.nodes[selection.ref.index]
      : selection
        ? model.subpaths[selection.ref.subpath]?.nodes[selection.ref.index]
        : null;

  const segmentTarget = (
    subpath: number,
    segment: number,
  ): PathDragTarget => ({ kind: 'segment', subpath, segment });

  const handleProps = (target: PathDragTarget) =>
    ({
      'data-stage-overlay': 'true',
      'data-path-handle': 'true',
      style: {
        cursor: disabled ? 'default' : 'move',
        pointerEvents: disabled ? 'none' : ('auto' as const),
        touchAction: 'none',
      },
      onPointerDown: (event: React.PointerEvent<SVGElement>) =>
        pathDrag.handlePointerDown(target, event),
      onPointerMove: pathDrag.handlePointerMove,
      onPointerUp: pathDrag.handlePointerUp,
      onPointerCancel: pathDrag.handlePointerCancel,
    }) as const;

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
      {/* Segment hit strokes first (under anchors). */}
      {model.subpaths.map((subpath, subpathIndex) => {
        const segments = subpath.closed
          ? subpath.nodes.map((_, index) => index)
          : subpath.nodes.slice(0, -1).map((_, index) => index);
        return segments.map((segmentIndex) => {
          const from = subpath.nodes[segmentIndex];
          const to = subpath.closed
            ? subpath.nodes[(segmentIndex + 1) % subpath.nodes.length]
            : subpath.nodes[segmentIndex + 1];
          if (!from || !to) return null;
          const curve = isCurveSegment(from, to);
          const c1 = toArtboard(from.handleOut);
          const c2 = toArtboard(to.handleIn);
          const p0 = toArtboard(from.point);
          const p1 = toArtboard(to.point);
          const d = curve
            ? `M ${p0.x} ${p0.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p1.x} ${p1.y}`
            : `M ${p0.x} ${p0.y} L ${p1.x} ${p1.y}`;
          return (
            <path
              key={`seg-${subpathIndex}-${segmentIndex}`}
              d={d}
              fill="none"
              stroke="#000000"
              strokeOpacity={0}
              strokeWidth={hitWidth}
              style={{
                cursor: disabled ? 'default' : 'crosshair',
                pointerEvents: disabled ? 'none' : ('stroke' as const),
                touchAction: 'none',
              }}
              onPointerDown={(event) =>
                pathDrag.handlePointerDown(
                  segmentTarget(subpathIndex, segmentIndex),
                  event,
                )
              }
              onPointerMove={pathDrag.handlePointerMove}
              onPointerUp={pathDrag.handlePointerUp}
              onPointerCancel={pathDrag.handlePointerCancel}
            />
          );
        });
      })}

      {/* Selected anchor's Bézier handles + stems. */}
      {selectedNode && selection ? (
        <>
          {(() => {
            const anchor = toArtboard(selectedNode.point);
            const hasIn =
              Math.hypot(
                selectedNode.handleIn.x - selectedNode.point.x,
                selectedNode.handleIn.y - selectedNode.point.y,
              ) > 0.01;
            const hasOut =
              Math.hypot(
                selectedNode.handleOut.x - selectedNode.point.x,
                selectedNode.handleOut.y - selectedNode.point.y,
              ) > 0.01;
            return (
              <>
                {hasIn ? (
                  <line
                    x1={anchor.x}
                    y1={anchor.y}
                    x2={toArtboard(selectedNode.handleIn).x}
                    y2={toArtboard(selectedNode.handleIn).y}
                    stroke="#38bdf8"
                    strokeWidth={lineWidth}
                    pointerEvents="none"
                  />
                ) : null}
                {hasOut ? (
                  <line
                    x1={anchor.x}
                    y1={anchor.y}
                    x2={toArtboard(selectedNode.handleOut).x}
                    y2={toArtboard(selectedNode.handleOut).y}
                    stroke="#38bdf8"
                    strokeWidth={lineWidth}
                    pointerEvents="none"
                  />
                ) : null}
                {hasIn ? (
                  <circle
                    cx={toArtboard(selectedNode.handleIn).x}
                    cy={toArtboard(selectedNode.handleIn).y}
                    r={handleRadius}
                    fill="#f8fafc"
                    stroke="#38bdf8"
                    strokeWidth={lineWidth}
                    {...handleProps({
                      kind: 'handle',
                      ref: selection.ref,
                      which: 'in',
                    })}
                  />
                ) : null}
                {hasOut ? (
                  <circle
                    cx={toArtboard(selectedNode.handleOut).x}
                    cy={toArtboard(selectedNode.handleOut).y}
                    r={handleRadius}
                    fill="#f8fafc"
                    stroke="#38bdf8"
                    strokeWidth={lineWidth}
                    {...handleProps({
                      kind: 'handle',
                      ref: selection.ref,
                      which: 'out',
                    })}
                  />
                ) : null}
              </>
            );
          })()}
        </>
      ) : null}

      {/* Anchors. */}
      {model.subpaths.map((subpath, subpathIndex) =>
        subpath.nodes.map((node, nodeIndex) => {
          const pos = toArtboard(node.point);
          const isSelected =
            selection?.ref.subpath === subpathIndex &&
            selection?.ref.index === nodeIndex;
          return (
            <rect
              key={`anchor-${subpathIndex}-${nodeIndex}`}
              x={pos.x - anchorSize / 2}
              y={pos.y - anchorSize / 2}
              width={anchorSize}
              height={anchorSize}
              rx={1 / safeZoom}
              fill={isSelected ? '#38bdf8' : '#f8fafc'}
              stroke="#0ea5e9"
              strokeWidth={lineWidth}
              {...handleProps({
                kind: 'anchor',
                ref: { subpath: subpathIndex, index: nodeIndex },
              })}
              onDoubleClick={(event) => {
                event.stopPropagation();
                pathDrag.toggleSelectedSmooth();
              }}
            />
          );
        }),
      )}

      {/* Hint (screen-constant size via artboard units). */}
      <text
        x={8 / safeZoom}
        y={16 / safeZoom}
        fontSize={11 / safeZoom}
        fontFamily="system-ui, sans-serif"
        fill="#94a3b8"
        pointerEvents="none"
      >
        Path edit: drag anchors/handles · click segment to add · double-click
        anchor for smooth · Delete removes · Esc exits
      </text>
    </svg>
  );
}

// Re-exported so callers can parse without importing the hook module.
export { parsePathData, parsePointsString };
