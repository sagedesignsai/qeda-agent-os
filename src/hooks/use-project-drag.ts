/**
 * hooks/use-project-drag.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * HTML5 drag-and-drop for reordering the project grid/list.
 *
 * Deliberately native, matching `use-task-drag.ts` and the studio clip drag:
 * the repo already does DnD this way and a board/list reorder needs neither
 * touch support nor a dependency.
 *
 * The custom MIME type is load-bearing — `text/plain` would let a project be
 * dropped into unrelated targets (a text field, another window), so a drop is
 * only recognised by something that opts into this exact type.
 *
 * Reorder is index-based: dropping `dragged` onto `target` removes it from its
 * old slot and inserts it at the target's slot (splice-out-then-in), which is
 * the intuitive "put it where that one is" behaviour. The hook computes the
 * next id array and hands it to `onReorder`; it does not persist anything.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useRef, useState } from 'react';

export const PROJECT_DRAG_MIME = 'application/x-qeda-project';

export interface UseProjectDragOptions {
  /** Ids in their current visual order. */
  ids: string[];
  /** Called with the full next order when a drop lands. */
  onReorder: (nextIds: string[]) => void;
}

export interface UseProjectDragReturn {
  /** Project currently being dragged, or null. Drives source styling. */
  draggingId: string | null;
  /** Drop target currently hovered, or null. Drives the insertion highlight. */
  overId: string | null;
  /** Spread onto a draggable project card/row. */
  getItemProps: (id: string) => {
    draggable: true;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  /** Spread onto a drop target to accept a reorder at its position. */
  getDropProps: (id: string) => {
    onDragOver: (e: React.DragEvent) => void;
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  isDragging: (id: string) => boolean;
  isOver: (id: string) => boolean;
}

export function useProjectDrag({
  ids,
  onReorder,
}: UseProjectDragOptions): UseProjectDragReturn {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const draggingRef = useRef<string | null>(null);

  const endDrag = useCallback(() => {
    draggingRef.current = null;
    setDraggingId(null);
    setOverId(null);
  }, []);

  const getItemProps = useCallback(
    (id: string) => ({
      draggable: true as const,
      onDragStart: (e: React.DragEvent) => {
        draggingRef.current = id;
        setDraggingId(id);
        e.dataTransfer.setData(PROJECT_DRAG_MIME, id);
        e.dataTransfer.effectAllowed = 'move';
      },
      onDragEnd: endDrag,
    }),
    [endDrag],
  );

  const getDropProps = useCallback(
    (id: string) => ({
      onDragOver: (e: React.DragEvent) => {
        // Only accept our own drags so an unrelated text/file drop is ignored.
        if (!e.dataTransfer.types.includes(PROJECT_DRAG_MIME)) return;
        // Required on every repeat event or the browser never fires `drop`.
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOverId(id);
      },
      onDragEnter: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(PROJECT_DRAG_MIME)) return;
        e.preventDefault();
        setOverId(id);
      },
      onDragLeave: (e: React.DragEvent) => {
        // dragleave fires when crossing child nodes too; ignore those.
        const next = e.relatedTarget as Node | null;
        if (next && e.currentTarget.contains(next)) return;
        setOverId((prev) => (prev === id ? null : prev));
      },
      onDrop: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(PROJECT_DRAG_MIME)) {
          endDrag();
          return;
        }
        e.preventDefault();
        const dragged =
          e.dataTransfer.getData(PROJECT_DRAG_MIME) || draggingRef.current;
        endDrag();
        if (!dragged || dragged === id) return;

        const from = ids.indexOf(dragged);
        const to = ids.indexOf(id);
        if (from < 0 || to < 0) return;
        const next = [...ids];
        next.splice(from, 1);
        next.splice(to, 0, dragged);
        onReorder(next);
      },
    }),
    [endDrag, ids, onReorder],
  );

  const isDragging = useCallback(
    (id: string) => draggingId === id,
    [draggingId],
  );
  const isOver = useCallback((id: string) => overId === id, [overId]);

  return { draggingId, overId, getItemProps, getDropProps, isDragging, isOver };
}
