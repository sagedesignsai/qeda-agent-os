/**
 * hooks/use-project-overview.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Loads the rich single-project read for the detail page: rollup, trailing
 * focus trend, recent tasks, and adjacent-work counts.
 *
 * This is a dedicated hook rather than a `useDbResource` call because
 * `useDbResource` invokes its channel with no payload, and overview needs a
 * project id. It keeps the same shape (load, refetch on `projects:changed`,
 * cleanup on unmount) so callers can treat the two interchangeably.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from 'react';
import type { ProjectOverview } from '@/main/ipc/channels';

export interface UseProjectOverviewReturn {
  overview: ProjectOverview | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useProjectOverview(
  projectId: string | null | undefined,
  days = 14,
): UseProjectOverviewReturn {
  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setOverview(null);
      setLoading(false);
      return;
    }
    try {
      const next = await window.electron.ipc.invoke<ProjectOverview | null>(
        'projects:overview',
        { id: projectId, days },
      );
      setOverview(next ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId, days]);

  useEffect(() => {
    setLoading(Boolean(projectId));
    void refresh();
  }, [refresh, projectId]);

  useEffect(() => {
    const off = window.electron.ipc.on('projects:changed', () => {
      void refresh();
    });
    return off;
  }, [refresh]);

  return { overview, loading, error, refresh };
}
