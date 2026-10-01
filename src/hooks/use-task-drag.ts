/**
 * hooks/use-task-drag.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * HTML5 drag-and-drop for the Board columns (Backlog / Active / Done).
 *
 * Deliberately native rather than a library: the repo already drags studio
 * clips this way (`application/x-qeda-studio-clip` in
 * `components/studio/content`), and a board needs neither touch support,
 * keyboard reordering, nor nested groups. A dependency would be more surface
 * than the feature needs.
 *
 * The custom MIME type is load-bearing. `text/plain` would let a task be
 * dropped into unrelated targets (a text field, another window), so a drag is
 * only ever recognised by something that opts into this exact type.
 *
 * `dragover` must call `preventDefault()` on every repeat event or the browser
 * never fires `drop`, and `dropEffect` has to be set on *both* events or the
 * cursor shows "no drop" while hovering a valid column.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useRef, useState } from 'react';
import type { Task } from '@/main/ipc/channels';

export const TASK_DRAG_MIME = 'application/x-qeda-task';

export interface UseTaskDragOptions {
  /** Called with the dropped task id and its destination column. */
  onDrop: (taskId: string, to: Task['status']) => void;
}

export interface UseTaskDragReturn {
  /** Task currently being dragged, or null. Drives the source card's styling. */
  draggingId: string | null;
  /** Column currently hovered, or null. Drives the drop-target highlight. */
  overColumn: Task['status'] | null;
  /** Spread onto a draggable card. */
  getCardProps: (taskId: string) => {
    draggable: true;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  /** Spread onto a column drop zone. */
  getColumnProps: (status: Task['status']) => {
    onDragOver: (e: React.DragEvent) => void;
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  /** True when `taskId` is the in-flight drag. */
  isDragging: (taskId: string) => boolean;
}

export function useTaskDrag({ onDrop }: UseTaskDragOptions): UseTaskDragReturn {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<Task['status'] | null>(null);

  // `dragover` fires repeatedly and `drop` only once, but reading the id back
  // out of `dataTransfer` is unreliable mid-drag in some browsers, so it is
  // captured on dragstart and kept in a ref for `drop` to read synchronously.
  const draggingIdRef = useRef<string | null>(null);

  const endDrag = useCallback(() => {
    draggingIdRef.current = null;
    setDraggingId(null);
    setOverColumn(null);
  }, []);

  const getCardProps = useCallback(
    (taskId: string) => ({
      draggable: true as const,
      onDragStart: (e: React.DragEvent) => {
        draggingIdRef.current = taskId;
        setDraggingId(taskId);
        e.dataTransfer.setData(TASK_DRAG_MIME, taskId);
        e.dataTransfer.effectAllowed = 'move';
      },
      onDragEnd: endDrag,
    }),
    [endDrag],
  );

  const getColumnProps = useCallback(
    (status: Task['status']) => ({
      onDragOver: (e: React.DragEvent) => {
        // Only accept our own drags; ignoring others keeps an unrelated text
        // drop from being swallowed by a column.
        if (!e.dataTransfer.types.includes(TASK_DRAG_MIME)) return;
        // Required on *every* repeat event, not just the first.
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOverColumn(status);
      },
      onDragEnter: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(TASK_DRAG_MIME)) return;
        e.preventDefault();
        setOverColumn(status);
      },
      onDragLeave: (e: React.DragEvent) => {
        // dragleave also fires when moving between child cards, so ignore it
        // unless the pointer genuinely left the column.
        const next = e.relatedTarget as Node | null;
        if (next && e.currentTarget.contains(next)) return;
        setOverColumn((prev) => (prev === status ? null : prev));
      },
      onDrop: (e: React.DragEvent) => {
        // Same type gate as `dragover`. Without it a *foreign* drop (a file, a
        // studio clip, selected text) would reach `onDrop` with no payload and
        // fall through to the ref — which is only non-null mid-drag, but a drop
        // from another window can still land here with stale ref state.
        if (!e.dataTransfer.types.includes(TASK_DRAG_MIME)) {
          endDrag();
          return;
        }
        e.preventDefault();
        const id =
          e.dataTransfer.getData(TASK_DRAG_MIME) || draggingIdRef.current;
        endDrag();
        if (id) onDrop(id, status);
      },
    }),
    [endDrag, onDrop],
  );

  const isDragging = useCallback(
    (taskId: string) => draggingId === taskId,
    [draggingId],
  );

  return { draggingId, overColumn, getCardProps, getColumnProps, isDragging };
}
