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
 * Keeping the scope in the query string rather than a store means the sidebar and
 * the page agree on it for free, and it disappears the moment the user navigates
 * somewhere genuinely global.
 *
 * IMPORTANT: this scope is deliberately TRANSIENT. The router is a
 * `MemoryRouter` (renderer/App.tsx), so there is no real URL — the param lives
 * in in-memory history and is destroyed by any reload or app restart. An earlier
 * version of this comment claimed the scope "survives reloads"; that was false.
 *
 * What survives a restart is the separate PERSISTED DEFAULT in settings.json
 * (`AppSettings.activeProjectId`, written via `settings:set-active-project` when
 * the user picks a project). The two are different concepts and do not
 * conflict: this is a per-surface lens, the default is "what I was last doing".
 * Agents resolve a scoped id first and fall back to the default
 * (`resolveActiveProjectId`), so a fresh launch still has a project.
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
