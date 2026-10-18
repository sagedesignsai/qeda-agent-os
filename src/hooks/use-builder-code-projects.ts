/**
 * hooks/use-builder-code-projects.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Loads and mutates codebases owned by the active Project; all filesystem and
 * embedding work stays behind typed main-process IPC.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from 'react';
import type { CodeProject } from '@/main/ipc/channels';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useBuilderCodeProjects(projectId: string | null) {
  const [codeProjects, setCodeProjects] = useState<CodeProject[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [indexingId, setIndexingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setCodeProjects([]);
      setLoadedFor(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await window.electron.ipc.invoke<CodeProject[]>(
        'builder:code-projects:list',
        { projectId },
      );
      setCodeProjects(result);
      setLoadedFor(projectId);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const register = useCallback(
    async (directory: string) => {
      if (!projectId) return null;
      setBusy(true);
      setError(null);
      try {
        const result = await window.electron.ipc.invoke<CodeProject>(
          'builder:code-projects:register',
          { projectId, directory },
        );
        await refresh();
        return result;
      } catch (cause) {
        setError(messageOf(cause));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [projectId, refresh],
  );

  const provision = useCallback(
    async (input: {
      parentDirectory: string;
      name: string;
      source: 'created' | 'clone';
      remoteUrl?: string;
    }) => {
      if (!projectId) return null;
      setBusy(true);
      setError(null);
      try {
        const result = await window.electron.ipc.invoke<CodeProject>(
          'builder:code-projects:provision',
          { ...input, projectId },
        );
        await refresh();
        return result;
      } catch (cause) {
        setError(messageOf(cause));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [projectId, refresh],
  );

  const index = useCallback(
    async (codeProjectId: string) => {
      setIndexingId(codeProjectId);
      setError(null);
      try {
        const result = await window.electron.ipc.invoke<{
          indexedFiles: number;
          indexedChunks: number;
          skippedFiles: number;
        }>('builder:code-projects:index', { codeProjectId });
        await refresh();
        return result;
      } catch (cause) {
        setError(messageOf(cause));
        await refresh();
        return null;
      } finally {
        setIndexingId(null);
      }
    },
    [refresh],
  );

  const unlink = useCallback(
    async (codeProjectId: string) => {
      setError(null);
      try {
        await window.electron.ipc.invoke<boolean>(
          'builder:code-projects:delete',
          { codeProjectId },
        );
        await refresh();
      } catch (cause) {
        setError(messageOf(cause));
      }
    },
    [refresh],
  );

  return {
    codeProjects: loadedFor === projectId ? codeProjects : [],
    loading,
    busy,
    indexingId,
    error,
    refresh,
    register,
    provision,
    index,
    unlink,
  };
}
