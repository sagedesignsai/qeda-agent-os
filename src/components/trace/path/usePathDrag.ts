/**
 * components/trace/path/usePathDrag.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pointer-drag state machine for path anchor/handle editing.
 *
 * Mirrors the gizmo pattern: preview mutates the mounted SVG path node
 * directly (no store write) and only the editor overlay re-renders from
 * preview state. On pointer-up it commits exactly one updateAttributes
 * call with the serialised geometry, so a drag lands as a single undo
 * entry. Segment clicks insert-and-drag in the same gesture.
 */

import { useCallback, useRef, useState } from 'react';

import {
  addPointOnSegment,
  deleteAnchor,
  moveAnchor,
  moveHandle,
  nearestPointOnSegment,
  toggleSmooth,
  type AnchorRef,
} from '@/lib/trace/path/edit';
import {
  clonePathModel,
  parsePathData,
  parsePointsString,
  serializePathData,
  serializePointsString,
  type PathModel,
} from '@/lib/trace/path/model';
import { artboardToLocal } from '@/lib/trace/gizmo/geometry';
import { findElementDom } from '@/lib/trace/runtime/dom-renderer';
import type { GizmoPoint, GizmoTransform } from '@/lib/trace/gizmo/geometry';
import type { TraceElement } from '@/lib/trace/types';

export type PathDragTarget =
  | { kind: 'anchor'; ref: AnchorRef }
  | { kind: 'handle'; ref: AnchorRef; which: 'in' | 'out' }
  | {
      kind: 'segment';
      subpath: number;
      segment: number;
    };

export interface PathEditSelection {
  ref: AnchorRef;
  handle: 'in' | 'out' | null;
}

interface DragSession {
  pointerId: number;
  target: PathDragTarget;
  /** Model at drag start (committed). */
  startModel: PathModel;
  /** For segment drags: the inserted anchor being dragged. */
  insertedRef: AnchorRef | null;
  /** Model after a segment insertion, before any move. */
  insertedModel: PathModel | null;
}

export interface UsePathDragOptions {
  element: TraceElement | null;
  model: PathModel;
  transform: GizmoTransform;
  origin: GizmoPoint;
  disabled: boolean;
  getArtboardPoint: (clientX: number, clientY: number) => GizmoPoint;
  onCommit: (model: PathModel) => void;
  onSelectionChange?: (selection: PathEditSelection | null) => void;
}

function modelToGeometry(
  model: PathModel,
  elementType: string,
): string {
  if (elementType === 'polyline' || elementType === 'polygon') {
    return serializePointsString(model);
  }
  return serializePathData(model);
}

export function parseElementModel(element: TraceElement): PathModel {
  const attributes = element.attributes ?? {};
  if (element.type === 'polyline') {
    return parsePointsString(String(attributes.points ?? ''), false);
  }
  if (element.type === 'polygon') {
    return parsePointsString(String(attributes.points ?? ''), true);
  }
  return parsePathData(String(attributes.d ?? ''));
}

export function usePathDrag(options: UsePathDragOptions) {
  const [previewModel, setPreviewModel] = useState<PathModel | null>(null);
  const [selection, setSelection] = useState<PathEditSelection | null>(null);
  const previewRef = useRef<PathModel | null>(null);
  previewRef.current = previewModel;
  const selectionRef = useRef<PathEditSelection | null>(null);
  selectionRef.current = selection;
  const sessionRef = useRef<DragSession | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const select = useCallback(
    (next: PathEditSelection | null) => {
      setSelection(next);
      optionsRef.current.onSelectionChange?.(next);
    },
    [],
  );

  const applyPreviewToDom = useCallback((model: PathModel) => {
    const { element } = optionsRef.current;
    if (!element) return;
    const node = findElementDom(element.id);
    if (!node) return;
    const geometry = modelToGeometry(model, element.type);
    const child =
      element.type === 'polyline'
        ? node.querySelector('polyline')
        : element.type === 'polygon'
          ? node.querySelector('polygon')
          : node.querySelector('path');
    if (!child) return;
    if (element.type === 'polyline' || element.type === 'polygon') {
      child.setAttribute('points', geometry);
    } else {
      child.setAttribute('d', geometry);
    }
  }, []);

  const toLocal = useCallback(
    (clientX: number, clientY: number): GizmoPoint => {
      const opts = optionsRef.current;
      const artboard = opts.getArtboardPoint(clientX, clientY);
      return artboardToLocal(artboard, opts.transform, opts.origin);
    },
    [],
  );

  const handlePointerDown = useCallback(
    (target: PathDragTarget, event: React.PointerEvent<SVGElement>) => {
      const opts = optionsRef.current;
      if (opts.disabled || !opts.element) return;
      event.stopPropagation();
      event.preventDefault();
      (event.currentTarget as Element).setPointerCapture(
        event.pointerId,
      );

      const base = previewRef.current ?? opts.model;

      if (target.kind === 'segment') {
        // Insert-and-drag: split the segment under the pointer, then
        // drag the new anchor in the same gesture.
        const local = toLocal(event.clientX, event.clientY);
        const subpath = base.subpaths[target.subpath];
        if (!subpath) return;
        const count = subpath.nodes.length;
        const wraps =
          subpath.closed && target.segment === count - 1;
        const fromIndex = wraps ? count - 1 : target.segment;
        const toIndex = wraps ? 0 : target.segment + 1;
        const from = subpath.nodes[fromIndex];
        const to = subpath.nodes[toIndex];
        if (!from || !to) return;
        const nearest = nearestPointOnSegment(from, to, local);
        const split = addPointOnSegment(
          base,
          target.subpath,
          target.segment,
          nearest.t,
        );
        if (!split) return;
        sessionRef.current = {
          pointerId: event.pointerId,
          target: { kind: 'anchor', ref: split.ref },
          startModel: clonePathModel(base),
          insertedRef: split.ref,
          insertedModel: split.model,
        };
        setPreviewModel(split.model);
        applyPreviewToDom(split.model);
        select({ ref: split.ref, handle: null });
        return;
      }

      if (target.kind === 'anchor') {
        select({ ref: target.ref, handle: null });
      } else {
        select({ ref: target.ref, handle: target.which });
      }
      sessionRef.current = {
        pointerId: event.pointerId,
        target,
        startModel: clonePathModel(base),
        insertedRef: null,
        insertedModel: null,
      };
    },
    [applyPreviewToDom, select, toLocal],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGElement>) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      const local = toLocal(event.clientX, event.clientY);
      const base = session.insertedModel ?? session.startModel;
      let next: PathModel = base;
      if (session.target.kind === 'anchor') {
        next = moveAnchor(base, session.target.ref, local);
      } else if (session.target.kind === 'handle') {
        next = moveHandle(
          base,
          session.target.ref,
          session.target.which,
          local,
          { breakSmooth: event.altKey },
        );
      }
      setPreviewModel(next);
      applyPreviewToDom(next);
    },
    [applyPreviewToDom, toLocal],
  );

  const finishDrag = useCallback(
    (event: React.PointerEvent<SVGElement>, commit: boolean) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      sessionRef.current = null;
      const opts = optionsRef.current;
      const current = previewRef.current;
      try {
        (event.currentTarget as Element).releasePointerCapture(
          event.pointerId,
        );
      } catch {
        // Capture may already be released; resync below covers it.
      }
      setPreviewModel(null);
      if (commit && current) {
        opts.onCommit(current);
      } else if (!commit) {
        // Discard: restore committed geometry on the mounted node.
        const node =
          opts.element && findElementDom(opts.element.id);
        const child = node?.querySelector(
          opts.element?.type === 'polyline'
            ? 'polyline'
            : opts.element?.type === 'polygon'
              ? 'polygon'
              : 'path',
        );
        if (child && opts.element) {
          const geometry = modelToGeometry(opts.model, opts.element.type);
          if (
            opts.element.type === 'polyline' ||
            opts.element.type === 'polygon'
          ) {
            child.setAttribute('points', geometry);
          } else {
            child.setAttribute('d', geometry);
          }
        }
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

  /** Immediate (non-drag) committed edits: delete / toggle / nudge. */
  const deleteSelected = useCallback(() => {
    const current = selectionRef.current;
    const opts = optionsRef.current;
    if (!current) return;
    const next = deleteAnchor(opts.model, current.ref);
    if (next === opts.model) return;
    select(null);
    opts.onCommit(next);
  }, [select]);

  const toggleSelectedSmooth = useCallback(() => {
    const current = selectionRef.current;
    const opts = optionsRef.current;
    if (!current) return;
    opts.onCommit(toggleSmooth(opts.model, current.ref));
  }, []);

  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      const current = selectionRef.current;
      const opts = optionsRef.current;
      if (!current) return;
      const node =
        opts.model.subpaths[current.ref.subpath]?.nodes[current.ref.index];
      if (!node) return;
      opts.onCommit(
        moveAnchor(opts.model, current.ref, {
          x: node.point.x + dx,
          y: node.point.y + dy,
        }),
      );
    },
    [],
  );

  return {
    previewModel,
    selection,
    select,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    deleteSelected,
    toggleSelectedSmooth,
    nudgeSelected,
  };
}
