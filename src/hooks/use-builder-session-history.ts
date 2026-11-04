/**
 * hooks/use-builder-session-history.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the session history list and orphaned worktree scan. Used by
 * BuilderWelcome to show recent sessions and stale worktrees.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type {
  BuilderSessionHistoryEntry,
  BuilderWorktreeEntry,
} from '@/main/ipc/channels';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useBuilderSessionHistory() {
  const [sessions, setSessions] = useState<BuilderSessionHistoryEntry[]>([]);
  const [worktrees, setWorktrees] = useState<BuilderWorktreeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [history, trees] = await Promise.all([
        window.electron.ipc.invoke<BuilderSessionHistoryEntry[]>(
          'builder:sessions:list',
        ),
        window.electron.ipc.invoke<BuilderWorktreeEntry[]>(
          'builder:worktrees:list',
        ),
      ]);
      setSessions(history);
      setWorktrees(trees);
    } catch (cause) {
      // Non-fatal: history is a nice-to-have.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const restoreSession = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await window.electron.ipc.invoke('builder:sessions:restore', { id });
        await refresh();
        toast.success('Session restored');
        return true;
      } catch (cause) {
        const message = messageOf(cause);
        console.error('Failed to restore session:', message);
        toast.error(`Failed to restore session: ${message}`);
        return false;
      }
    },
    [refresh],
  );

  const deleteSession = useCallback(
    async (id: string, deleteWorktree = false): Promise<boolean> => {
      try {
        await window.electron.ipc.invoke('builder:sessions:delete', {
          id,
          deleteWorktree,
        });
        await refresh();
        toast.success('Session deleted');
        return true;
      } catch (cause) {
        const message = messageOf(cause);
        console.error('Failed to delete session:', message);
        toast.error(`Failed to delete session: ${message}`);
        return false;
      }
    },
    [refresh],
  );

  const focusSession = useCallback(async (id: string) => {
    try {
      await window.electron.ipc.invoke('builder:sessions:focus', { id });
    } catch {
      // Best effort.
    }
  }, []);

  const cleanupWorktree = useCallback(
    async (path: string): Promise<boolean> => {
      try {
        await window.electron.ipc.invoke('builder:worktrees:cleanup', { path });
        await refresh();
        toast.success('Worktree cleaned up');
        return true;
      } catch (cause) {
        const message = messageOf(cause);
        console.error('Failed to cleanup worktree:', message);
        toast.error(`Failed to cleanup worktree: ${message}`);
        return false;
      }
    },
    [refresh],
  );

  return {
    sessions,
    worktrees,
    loading,
    refresh,
    restoreSession,
    deleteSession,
    focusSession,
    cleanupWorktree,
  };
}
