/**
 * components/trace/gizmo/useTransformDrag.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pointer-drag state machine for the transform gizmo.
 *
 * Preview mutates the mounted SVG node directly (no React state, no
 * store write) and only the gizmo frame re-renders from preview state.
 * On pointer-up it commits exactly one updateTransform call, so the
 * drag lands as a single undo entry. Modifiers are read per-move:
 * Shift = axis-lock (translate) / 15° snap (rotate) / aspect-lock
 * (scale); Alt = scale from centre.
 */

import { useCallback, useRef, useState } from 'react';

import {
  formatGizmoReadout,
  getPivot,
  originTransform,
  rotateTransform,
  roundGizmoTransform,
  scaleTransformAboutOrigin,
  translateTransform,
  type GizmoBBox,
  type GizmoHandle,
  type GizmoPoint,
  type GizmoTransform,
} from '@/lib/trace/gizmo/geometry';
import {
  applyTransformPreview,
  findElementDom,
  syncTraceDomAtTime,
} from '@/lib/trace/runtime/dom-renderer';
import type { TraceProject } from '@/lib/trace/types';

export interface TransformDragPreview {
  transform: GizmoTransform;
  origin: GizmoPoint;
  readout: string;
}

interface DragSession {
  pointerId: number;
  handle: GizmoHandle;
  startPointer: GizmoPoint;
  startTransform: GizmoTransform;
  startOrigin: GizmoPoint;
  startBBox: GizmoBBox;
}

export interface UseTransformDragOptions {
  elementId: string | null;
  bbox: GizmoBBox | null;
  /** Resolved transform at the playhead (committed). */
  transform: GizmoTransform;
  origin: GizmoPoint;
  timeMs: number;
  project: TraceProject | null;
  disabled: boolean;
  getArtboardPoint: (clientX: number, clientY: number) => GizmoPoint;
  onCommit: (
    transform: GizmoTransform,
    origin?: GizmoPoint,
  ) => void;
}

export function useTransformDrag(options: UseTransformDragOptions) {
  const [preview, setPreview] = useState<TransformDragPreview | null>(null);
  const previewRef = useRef<TransformDragPreview | null>(null);
  previewRef.current = preview;
  const sessionRef = useRef<DragSession | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const applyPreviewToDom = useCallback(
    (transform: GizmoTransform, origin: GizmoPoint) => {
      const { elementId } = optionsRef.current;
      if (!elementId) return;
      const node = findElementDom(elementId);
      if (node) applyTransformPreview(node, transform, origin);
    },
    [],
  );

  const handlePointerDown = useCallback(
    (handle: GizmoHandle, event: React.PointerEvent<SVGElement>) => {
      const opts = optionsRef.current;
      if (opts.disabled || !opts.elementId || !opts.bbox) return;
      event.stopPropagation();
      event.preventDefault();
      (event.currentTarget as Element).setPointerCapture(
        event.pointerId,
      );
      sessionRef.current = {
        pointerId: event.pointerId,
        handle,
        startPointer: opts.getArtboardPoint(
          event.clientX,
          event.clientY,
        ),
        startTransform: { ...opts.transform },
        startOrigin: { ...opts.origin },
        startBBox: { ...opts.bbox },
      };
    },
    [],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGElement>) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      const opts = optionsRef.current;
      const currentPointer = opts.getArtboardPoint(
        event.clientX,
        event.clientY,
      );
      const delta = {
        x: currentPointer.x - session.startPointer.x,
        y: currentPointer.y - session.startPointer.y,
      };

      let nextTransform: GizmoTransform = session.startTransform;
      let nextOrigin: GizmoPoint = session.startOrigin;

      switch (session.handle) {
        case 'move': {
          nextTransform = translateTransform(
            session.startTransform,
            delta,
            { axisLock: event.shiftKey },
          );
          break;
        }
        case 'rotate': {
          const center = getPivot(
            session.startTransform,
            session.startOrigin,
          );
          nextTransform = rotateTransform(
            session.startTransform,
            center,
            session.startPointer,
            currentPointer,
            { snap: event.shiftKey },
          );
          break;
        }
        case 'origin': {
          const result = originTransform(
            session.startTransform,
            session.startOrigin,
            delta,
          );
          nextTransform = result.transform;
          nextOrigin = result.origin;
          break;
        }
        default: {
          nextTransform = scaleTransformAboutOrigin(
            session.startTransform,
            session.startOrigin,
            session.startBBox,
            session.handle,
            delta,
            {
              uniform: event.shiftKey,
              fromCenter: event.altKey,
            },
          );
          break;
        }
      }

      applyPreviewToDom(nextTransform, nextOrigin);
      setPreview({
        transform: nextTransform,
        origin: nextOrigin,
        readout: formatGizmoReadout(session.handle, nextTransform),
      });
    },
    [applyPreviewToDom],
  );

  const finishDrag = useCallback(
    (event: React.PointerEvent<SVGElement>, commit: boolean) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      sessionRef.current = null;
      const opts = optionsRef.current;
      const currentPreview = previewRef.current;
      try {
        (event.currentTarget as Element).releasePointerCapture(
          event.pointerId,
        );
      } catch {
        // Capture may already be released; resync below covers it.
      }
      setPreview(null);
      if (commit && currentPreview && opts.elementId) {
        const rounded = roundGizmoTransform(currentPreview.transform);
        const originChanged =
          Math.abs(currentPreview.origin.x - session.startOrigin.x) > 0.001 ||
          Math.abs(currentPreview.origin.y - session.startOrigin.y) > 0.001;
        opts.onCommit(
          rounded,
          originChanged
            ? {
                x: Math.round(currentPreview.origin.x * 100) / 100,
                y: Math.round(currentPreview.origin.y * 100) / 100,
              }
            : undefined,
        );
      } else {
        // Discard: restore the committed frame on the mounted node.
        syncTraceDomAtTime(opts.timeMs, opts.project);
      }
    },
    [],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<SVGElement>) => finishDrag(event, true),
    [finishDrag],
  );

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<SVGElement>) => finishDrag(event, false),
    [finishDrag],
  );

  return {
    preview,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  };
}
