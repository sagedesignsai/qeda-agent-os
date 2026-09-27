/**
 * hooks/use-project-scope.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The `?project=<id>` lens, in one place.
 *
 * Tasks, Terminal, and Chat all scope themselves the same way: the active
 * project rides in the query string, lists filter on it, and anything created
 * while scoped is filed into it. This hook is the single reader of that param —
 * it resolves the project (name + repo path) and offers the two operations
 * every scoped surface needs: clear the scope, and carry it onto a path.
 *
 * Keeping the scope in the URL rather than a store means it survives reloads,
 * is shareable between the sidebar and the page, and disappears the moment the
 * user navigates somewhere genuinely global.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Project } from '@/main/ipc/channels';
import { useIpcEvent } from './use-ipc';

export interface ProjectScope {
  /** The scoped project id, or null when showing everything. */
  projectId: string | null;
  /** The resolved project, once loaded. */
  project: Project | null;
  projectName: string | null;
  /** Drop the `project` param, preserving any others (e.g. `goal`). */
  clear: () => void;
  /** Append `?project=` (or `&project=`) to a path when scoped. */
  withScope: (path: string) => string;
}

export function useProjectScope(): ProjectScope {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get('project');
  const [project, setProject] = useState<Project | null>(null);

  const load = useCallback(async () => {
    if (!projectId) {
      setProject(null);
      return;
    }
    try {
      const found = await window.electron.ipc.invoke<Project | null>(
        'projects:get',
        { id: projectId },
      );
      setProject(found ?? null);
    } catch {
      setProject(null);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the name fresh if the project is renamed elsewhere.
  useIpcEvent('projects:changed', () => {
    void load();
  }, [projectId]);

  const clear = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('project');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const withScope = useCallback(
    (path: string) => {
      if (!projectId) return path;
      const sep = path.includes('?') ? '&' : '?';
      return `${path}${sep}project=${encodeURIComponent(projectId)}`;
    },
    [projectId],
  );

  return {
    projectId,
    project,
    projectName: project?.name ?? null,
    clear,
    withScope,
  };
}
