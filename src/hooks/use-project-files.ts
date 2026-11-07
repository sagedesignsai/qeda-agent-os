/**
 * hooks/use-project-files.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Loads the Project File Browser's catalog: roots + per-source counts once per
 * project, and one paged list per filter change.
 *
 * Search is debounced (150 ms) so typing does not fire a query per keystroke.
 * Responses carry a monotonically increasing request id, because switching
 * project or folder can leave an earlier request in flight — the late answer
 * must not overwrite the newer one.
 *
 * `project-files:changed` is broadcast when a scan finishes, so the open browser
 * refreshes itself after the first (slower) load without the caller wiring it up.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ProjectFileDirectory,
  ProjectFileEntry,
  ProjectFileKind,
  ProjectFileListResult,
  ProjectFileRoot,
  ProjectFileRootsInfo,
  ProjectFileSource,
} from '@/main/ipc/channels';

const SEARCH_DEBOUNCE_MS = 150;

export interface UseProjectFilesFilters {
  source?: ProjectFileSource;
  /** Restrict to one scan root (`repo`, `code:<id>`, `assets`). */
  rootKey?: string;
  /** Relative folder to browse; `null`/omitted means a flat list. */
  directory?: string | null;
  kind?: ProjectFileKind;
  /** Restrict to these filename extensions, without the leading dot. */
  extensions?: string[];
  query?: string;
  includeMissing?: boolean;
  limit?: number;
}

export interface UseProjectFilesReturn {
  roots: ProjectFileRoot[];
  totals: Record<ProjectFileSource, number>;
  files: ProjectFileEntry[];
  directories: ProjectFileDirectory[];
  total: number;
  scannedAt: number | null;
  stale: boolean;
  catalogTruncated: boolean;
  loading: boolean;
  scanning: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

function emptyTotals(): Record<ProjectFileSource, number> {
  return {
    repo: 0,
    'code-project': 0,
    assets: 0,
    'studio-take': 0,
    attachment: 0,
    'research-file': 0,
    indexed: 0,
  };
}

export function useProjectFiles(
  projectId: string | null | undefined,
  filters: UseProjectFilesFilters = {},
): UseProjectFilesReturn {
  const {
    source,
    rootKey,
    directory = null,
    kind,
    extensions,
    query,
    includeMissing = false,
    limit = 200,
  } = filters;

  // Arrays are new on every render; a joined key is the stable identity.
  const extensionsKey = (extensions ?? [])
    .map((extension) => extension.toLowerCase())
    .join(',');

  const [roots, setRoots] = useState<ProjectFileRoot[]>([]);
  const [totals, setTotals] =
    useState<Record<ProjectFileSource, number>>(emptyTotals);
  const [files, setFiles] = useState<ProjectFileEntry[]>([]);
  const [directories, setDirectories] = useState<ProjectFileDirectory[]>([]);
  const [total, setTotal] = useState(0);
  const [scannedAt, setScannedAt] = useState<number | null>(null);
  const [stale, setStale] = useState(false);
  const [catalogTruncated, setCatalogTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestId = useRef(0);

  const loadRoots = useCallback(async () => {
    if (!projectId) {
      setRoots([]);
      setTotals(emptyTotals());
      setScannedAt(null);
      setStale(false);
      setCatalogTruncated(false);
      return;
    }

    try {
      const info = await window.electron.ipc.invoke<ProjectFileRootsInfo>(
        'project-files:roots',
        { projectId },
      );
      setRoots(info.roots);
      setTotals(info.totals);
      setScannedAt(info.scannedAt);
      setStale(info.stale);
      setCatalogTruncated(info.truncated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [projectId]);

  const loadFiles = useCallback(
    async (options?: { refresh?: boolean }) => {
      if (!projectId) {
        setFiles([]);
        setDirectories([]);
        setTotal(0);
        setLoading(false);
        return;
      }

      const id = requestId.current + 1;
      requestId.current = id;
      setLoading(true);
      setError(null);

      try {
        const result = await window.electron.ipc.invoke<ProjectFileListResult>(
          'project-files:list',
          {
            projectId,
            source,
            rootKey,
            directory,
            kind,
            extensions: extensionsKey ? extensionsKey.split(',') : undefined,
            query: query?.trim() || undefined,
            includeMissing,
            limit,
            refresh: options?.refresh ?? false,
          },
        );

        if (id !== requestId.current) return;
        setFiles(result.files);
        setDirectories(result.directories);
        setTotal(result.total);
        setScannedAt(result.scannedAt);
        setCatalogTruncated(result.truncated);
      } catch (err) {
        if (id === requestId.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [
      projectId,
      source,
      rootKey,
      directory,
      kind,
      extensionsKey,
      query,
      includeMissing,
      limit,
    ],
  );

  // A new project invalidates everything, including any in-flight response.
  useEffect(() => {
    requestId.current += 1;
    setFiles([]);
    setDirectories([]);
    setTotal(0);
    setLoading(Boolean(projectId));
    void loadRoots();
  }, [projectId, loadRoots]);

  // Debounce every filter change; 150 ms is below the threshold of noticing.
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadFiles();
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [loadFiles]);

  useEffect(() => {
    if (!projectId) return undefined;
    const off = window.electron.ipc.on('project-files:changed', (...args) => {
      const payload = args[0] as { projectId?: string } | undefined;
      if (!payload || payload.projectId === projectId) {
        void loadRoots();
        void loadFiles();
      }
    });
    return off;
  }, [projectId, loadRoots, loadFiles]);

  const refresh = useCallback(async () => {
    await Promise.all([loadRoots(), loadFiles({ refresh: true })]);
  }, [loadRoots, loadFiles]);

  return useMemo(
    () => ({
      roots,
      totals,
      files,
      directories,
      total,
      scannedAt,
      stale,
      catalogTruncated,
      loading,
      scanning: loading && files.length === 0,
      error,
      refresh,
    }),
    [
      roots,
      totals,
      files,
      directories,
      total,
      scannedAt,
      stale,
      catalogTruncated,
      loading,
      error,
      refresh,
    ],
  );
}
