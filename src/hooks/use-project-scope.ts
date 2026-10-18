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
 * What survives a restart is the PERSISTED DEFAULT in settings.json. Startup
 * restores that default into the route scope, and navigation carries it onto
 * destination paths. An explicit All Projects choice clears the default and
 * suppresses auto-picking.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
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
  /** Clear the route/query scope, preserving unrelated query params where possible. */
  clear: () => void;
  /** Append the surface scope, or remembered default, to a destination path. */
  withScope: (path: string) => string;
}

export function useProjectScope(): ProjectScope {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const routeProjectId = location.pathname.match(/^\/projects\/([^/]+)$/)?.[1];
  const projectId = searchParams.get('project') || routeProjectId || null;
  const [project, setProject] = useState<Project | null>(null);
  /** The restored default from settings.json; '' means none is set. */
  const [defaultProjectId, setDefaultProjectId] = useState('');

  // Declared above `load` because the self-heal below calls it.
  const clear = useCallback(() => {
    if (routeProjectId) {
      navigate('/projects', { replace: true });
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete('project');
    setSearchParams(next, { replace: true });
  }, [navigate, routeProjectId, searchParams, setSearchParams]);

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
      // A DEFINITIVE null means the row is gone — deleting a project clears the
      // persisted `settings.activeProjectId` in main (ipc/handlers/projects.ts)
      // but nothing strips `?project=` from the URL, leaving a dead scope that
      // renders as "no project" while the URL still names it. Self-heal by
      // reusing `clear` rather than duplicating the delete-and-replace.
      //
      // Only on a resolved null. A REJECTED invoke below is a transient IPC
      // failure and must never destroy the user's scope, so the catch branch is
      // left alone.
      if (found == null) clear();
      setProject(found ?? null);
    } catch {
      setProject(null);
    }
  }, [projectId, clear]);

  // Terminates: `clear()` drops `?project=`, so the `searchParams` change makes
  // `projectId` null, which rebuilds `load` and re-runs this effect. That second
  // pass takes the `!projectId` early return above and never calls `clear` again
  // — so the self-heal fires at most once per dead id, with no ping-pong.
  useEffect(() => {
    void load();
  }, [load]);

  // Keep the name fresh if the project is renamed elsewhere.
  useIpcEvent(
    'projects:changed',
    () => {
      void load();
    },
    [projectId],
  );

  // The persisted default. Read through `settings:get` rather than a new
  // channel, and kept fresh on `settings:changed` — the same broadcast the
  // sidebar's own write triggers.
  //
  // `settings:get` may now resolve a launch-time default on first read (when none
  // was persisted), so a first load can receive a non-empty default even on a
  // fresh install with one project.
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
        const found = await window.electron.ipc.invoke<Project | null>(
          'projects:get',
          {
            id: defaultProjectId,
          },
        );
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

  const withScope = useCallback(
    (path: string) => {
      const scopeId = projectId || defaultProjectId;
      if (!scopeId) return path;
      const sep = path.includes('?') ? '&' : '?';
      return `${path}${sep}project=${encodeURIComponent(scopeId)}`;
    },
    [defaultProjectId, projectId],
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
