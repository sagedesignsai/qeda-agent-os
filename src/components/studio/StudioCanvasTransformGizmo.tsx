import { useCallback, useRef, useState } from 'react';
import { TraceTransformGizmo } from '@/components/trace/gizmo/TraceTransformGizmo';
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

interface GizmoPreview {
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

interface StudioCanvasTransformGizmoProps {
  bbox: GizmoBBox;
  transform: GizmoTransform;
  origin: GizmoPoint;
  zoom: number;
  disabled: boolean;
  /** Canvas/artboard pixel dimensions for the SVG viewBox. */
  viewBox?: { width: number; height: number };
  getCanvasPoint: (clientX: number, clientY: number) => GizmoPoint;
  onPreview: (preview: { transform: GizmoTransform; origin: GizmoPoint } | null) => void;
  onCommit: (transform: GizmoTransform, origin: GizmoPoint) => void;
}

export function StudioCanvasTransformGizmo({
  bbox,
  transform,
  origin,
  zoom,
  disabled,
  viewBox,
  getCanvasPoint,
  onPreview,
  onCommit,
}: StudioCanvasTransformGizmoProps) {
  const [preview, setPreview] = useState<GizmoPreview | null>(null);
  const previewRef = useRef<GizmoPreview | null>(null);
  previewRef.current = preview;
  const sessionRef = useRef<DragSession | null>(null);
  const propsRef = useRef({ getCanvasPoint, onPreview, onCommit, disabled });
  propsRef.current = { getCanvasPoint, onPreview, onCommit, disabled };

  const handlePointerDown = useCallback((handle: GizmoHandle, event: React.PointerEvent<SVGElement>) => {
    const props = propsRef.current;
    if (props.disabled) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    sessionRef.current = {
      pointerId: event.pointerId,
      handle,
      startPointer: props.getCanvasPoint(event.clientX, event.clientY),
      startTransform: { ...transform },
      startOrigin: { ...origin },
      startBBox: { ...bbox },
    };
  }, [bbox, origin, transform]);

  const handlePointerMove = useCallback((event: React.PointerEvent<SVGElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const currentPointer = propsRef.current.getCanvasPoint(event.clientX, event.clientY);
    const delta = {
      x: currentPointer.x - session.startPointer.x,
      y: currentPointer.y - session.startPointer.y,
    };

    let nextTransform = session.startTransform;
    let nextOrigin = session.startOrigin;
    switch (session.handle) {
      case 'move':
        nextTransform = translateTransform(session.startTransform, delta, { axisLock: event.shiftKey });
        break;
      case 'rotate':
        nextTransform = rotateTransform(
          session.startTransform,
          getPivot(session.startTransform, session.startOrigin),
          session.startPointer,
          currentPointer,
          { snap: event.shiftKey },
        );
        break;
      case 'origin': {
        const result = originTransform(session.startTransform, session.startOrigin, delta);
        nextTransform = result.transform;
        nextOrigin = result.origin;
        break;
      }
      default:
        nextTransform = scaleTransformAboutOrigin(
          session.startTransform,
          session.startOrigin,
          session.startBBox,
          session.handle,
          delta,
          { uniform: event.shiftKey, fromCenter: event.altKey },
        );
        break;
    }

    const nextPreview = {
      transform: nextTransform,
      origin: nextOrigin,
      readout: formatGizmoReadout(session.handle, nextTransform),
    };
    previewRef.current = nextPreview;
    setPreview(nextPreview);
    propsRef.current.onPreview({ transform: nextTransform, origin: nextOrigin });
  }, []);

  const finishDrag = useCallback((event: React.PointerEvent<SVGElement>, commit: boolean) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    sessionRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The browser can release capture before pointer cancellation arrives.
    }

    const currentPreview = previewRef.current;
    previewRef.current = null;
    setPreview(null);
    propsRef.current.onPreview(null);
    if (commit && currentPreview) {
      propsRef.current.onCommit(
        roundGizmoTransform(currentPreview.transform),
        {
          x: Math.round(currentPreview.origin.x * 100) / 100,
          y: Math.round(currentPreview.origin.y * 100) / 100,
        },
      );
    }
  }, []);

  return (
    <TraceTransformGizmo
      element={{ visible: true }}
      bbox={bbox}
      transform={transform}
      origin={origin}
      zoom={zoom}
      disabled={disabled}
      viewBox={viewBox}
      previewTransform={preview?.transform ?? null}
      previewOrigin={preview?.origin ?? null}
      readout={preview?.readout ?? null}
      onHandlePointerDown={handlePointerDown}
      onHandlePointerMove={handlePointerMove}
      onHandlePointerUp={(event) => finishDrag(event, true)}
      onHandlePointerCancel={(event) => finishDrag(event, false)}
    />
  );
}
