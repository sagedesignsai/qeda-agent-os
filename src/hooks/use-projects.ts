/**
 * hooks/use-projects.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Loads the project spine for the renderer: every project plus its rollup
 * (task progress, overdue count, focus time). The main process broadcasts
 * `projects:changed` on any mutation, so every consumer of this hook — the
 * Projects page and the sidebar menu — stays in sync without prop drilling.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from 'react';
import type {
  Project,
  ProjectRollup,
  ProjectStatus,
} from '@/main/ipc/channels';

export interface CreateProjectInput {
  name: string;
  description?: string;
  status?: ProjectStatus;
  color?: string;
  icon?: string;
  deadline?: number | null;
  repo_path?: string | null;
  notebook_id?: string | null;
}

export type UpdateProjectPatch = Partial<
  Pick<
    Project,
    | 'name'
    | 'description'
    | 'status'
    | 'color'
    | 'icon'
    | 'deadline'
    | 'repo_path'
    | 'notebook_id'
    | 'sort_order'
  >
>;

export interface UseProjectsReturn {
  projects: Project[];
  rollups: ProjectRollup[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createProject: (input: CreateProjectInput) => Promise<Project | null>;
  updateProject: (id: string, patch: UpdateProjectPatch) => Promise<void>;
  deleteProject: (id: string) => Promise<boolean>;
}

/** Load projects + rollups and keep them fresh across process broadcasts. */
export function useProjects(): UseProjectsReturn {
  const [rollups, setRollups] = useState<ProjectRollup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next =
        await window.electron.ipc.invoke<ProjectRollup[]>('projects:rollups');
      setRollups(next ?? []);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const off = window.electron.ipc.on('projects:changed', () => {
      void refresh();
    });
    return off;
  }, [refresh]);

  const createProject = useCallback(
    async (input: CreateProjectInput): Promise<Project | null> => {
      const project = await window.electron.ipc.invoke<Project>(
        'projects:create',
        input,
      );
      await refresh();
      return project ?? null;
    },
    [refresh],
  );

  const updateProject = useCallback(
    async (id: string, patch: UpdateProjectPatch): Promise<void> => {
      await window.electron.ipc.invoke('projects:update', { id, ...patch });
      await refresh();
    },
    [refresh],
  );

  const deleteProject = useCallback(
    async (id: string): Promise<boolean> => {
      const removed = await window.electron.ipc.invoke<boolean>(
        'projects:delete',
        {
          id,
        },
      );
      await refresh();
      return removed;
    },
    [refresh],
  );

  return {
    projects: rollups.map((r) => r.project),
    rollups,
    loading,
    error,
    refresh,
    createProject,
    updateProject,
    deleteProject,
  };
}
