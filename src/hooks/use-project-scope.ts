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
  /**
   * The project an AGENT will act on this turn — not the same as `projectId`.
   * Mirrors `resolveActiveProjectId` in main: an explicit scope wins, otherwise
   * the persisted default applies.
   *
   * Null means no project at all — the state where the copilot cannot resolve a
   * repository and will refuse rather than guess. `projectId === null` alone
   * cannot express that, which is why this exists.
   */
  activeProjectId: string | null;
  activeProject: Project | null;
  activeProjectName: string | null;
  /**
   * True when the active project came from the persisted default rather than an
   * explicit `?project=` here. Drives quiet-vs-explicit styling: a restored
   * default is the happy path and must not be dressed up as a problem.
   */
  isActiveProjectDefaulted: boolean;
  /** Drop the `project` param, preserving any others (e.g. `goal`). */
  clear: () => void;
  /** Append `?project=` (or `&project=`) to a path when scoped. */
  withScope: (path: string) => string;
}

export function useProjectScope(): ProjectScope {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get('project');
  const [project, setProject] = useState<Project | null>(null);
  /** The restored default from settings.json; '' means none is set. */
  const [defaultProjectId, setDefaultProjectId] = useState('');

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

  // The persisted default. Read through `settings:get` rather than a new
  // channel, and kept fresh on `settings:changed` — the same broadcast the
  // sidebar's own write triggers.
  const loadDefault = useCallback(async () => {
    try {
      const s = await window.electron.ipc.invoke<{ activeProjectId?: string }>(
        'settings:get',
      );
      setDefaultProjectId(s?.activeProjectId ?? '');
    } catch {
      setDefaultProjectId('');
    }
  }, []);

  useEffect(() => {
    void loadDefault();
  }, [loadDefault]);

  useIpcEvent('settings:changed', () => {
    void loadDefault();
  });

  // Scope wins; the default only applies when nothing is scoped. When scoped we
  // reuse the already-loaded `project` rather than issuing a second projects:get.
  const activeProjectId = projectId || defaultProjectId || null;
  const isActiveProjectDefaulted = !projectId && Boolean(defaultProjectId);

  // Resolve the default project's row (name for the UI). Best-effort.
  const [defaultProject, setDefaultProject] = useState<Project | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (projectId || !defaultProjectId) {
      setDefaultProject(null);
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      try {
        const found = await window.electron.ipc.invoke<Project | null>('projects:get', {
          id: defaultProjectId,
        });
        if (!cancelled) setDefaultProject(found ?? null);
      } catch {
        if (!cancelled) setDefaultProject(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, defaultProjectId]);

  const activeProject = projectId ? project : defaultProject;

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
    activeProjectId,
    activeProject,
    activeProjectName: activeProject?.name ?? null,
    isActiveProjectDefaulted,
    clear,
    withScope,
  };
}
