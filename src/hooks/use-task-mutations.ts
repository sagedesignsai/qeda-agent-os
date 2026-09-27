/**
 * hooks/use-task-mutations.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin, optimistic wrappers over the task IPC channels, so the Tasks page (and
 * any future surface) gets create/update/move/delete without re-implementing
 * the optimistic-apply-then-reload dance in every handler.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import type { Task } from '@/main/ipc/channels';

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: 1 | 2 | 3;
  estimate_mins?: number | null;
  due_at?: number | null;
  /** Omit or null to file in the Inbox. */
  project_id?: string | null;
  status?: Task['status'];
}

export type UpdateTaskPatch = Partial<
  Pick<
    Task,
    | 'title'
    | 'description'
    | 'status'
    | 'priority'
    | 'due_at'
    | 'estimate_mins'
    | 'project_id'
    | 'position'
  >
>;

export interface UseTaskMutationsReturn {
  creating: boolean;
  updating: boolean;
  create: (input: CreateTaskInput) => Promise<Task | null>;
  update: (id: string, patch: UpdateTaskPatch) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
}

export function useTaskMutations(opts?: {
  onCreated?: (task: Task) => void;
  onUpdated?: (id: string, patch: UpdateTaskPatch) => void;
  onRemoved?: (id: string) => void;
}): UseTaskMutationsReturn {
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);

  const create = useCallback(
    async (input: CreateTaskInput): Promise<Task | null> => {
      setCreating(true);
      try {
        const task = await window.electron.ipc.invoke<Task>('tasks:create', input);
        opts?.onCreated?.(task);
        return task ?? null;
      } catch {
        toast.error('Could not create task');
        return null;
      } finally {
        setCreating(false);
      }
    },
    [opts?.onCreated], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const update = useCallback(
    async (id: string, patch: UpdateTaskPatch): Promise<boolean> => {
      setUpdating(true);
      try {
        await window.electron.ipc.invoke('tasks:update', { id, ...patch });
        opts?.onUpdated?.(id, patch);
        return true;
      } catch {
        toast.error('Could not update task');
        return false;
      } finally {
        setUpdating(false);
      }
    },
    [opts?.onUpdated], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await window.electron.ipc.invoke('tasks:delete', { id });
        opts?.onRemoved?.(id);
        return true;
      } catch {
        toast.error('Could not delete task');
        return false;
      }
    },
    [opts?.onRemoved], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return { creating, updating, create, update, remove };
}
