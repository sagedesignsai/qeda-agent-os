/**
 * hooks/use-builder-files.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Loads the active Builder workspace's file tree through IPC. The tree is
 * workspace-scoped (main reads from its active worktree), so reload it when a
 * session is attached and after a tool finishes writing to the workspace.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useState } from 'react';
import type { BuilderSessionEvent } from '@/lib/builder-session';
import type { BuilderFileNode } from '@/lib/builder-workspace';

export function useBuilderFiles(
  sessionId: string | undefined,
  events: BuilderSessionEvent[],
) {
  const [files, setFiles] = useState<BuilderFileNode[]>([]);
  const [loading, setLoading] = useState(false);

  // A completed tool can create, edit, or remove files. Use its event ID as a
  // stable refresh trigger instead of reloading the tree for every token delta.
  const lastCompletedTool = useMemo(() => {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event.type === 'tool-completed' || event.type === 'tool-failed') {
        return event.eventId;
      }
    }
    return '';
  }, [events]);

  useEffect(() => {
    let cancelled = false;

    if (!sessionId) {
      setFiles([]);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    void window.electron.ipc
      .invoke<BuilderFileNode[]>('builder:workspace-files')
      .then((result) => {
        if (!cancelled) setFiles(result);
      })
      .catch(() => {
        // Keep the last successful tree visible if a refresh fails; the main
        // process remains authoritative for whether a file can be opened.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, lastCompletedTool]);

  return { files, loading };
}
