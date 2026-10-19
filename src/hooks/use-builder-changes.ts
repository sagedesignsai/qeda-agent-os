/**
 * hooks/use-builder-changes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Loads the active worktree's reviewable change set, refreshes it as tools
 * finish, and owns the Keep/Discard operations so every caller gets the same
 * refresh semantics.
 *
 * WHY A REVISION COUNTER
 * ──────────────────────
 * A `file-changed` event can arrive many times per second and a Keep/Discard
 * changes the answer without an event at all. The effect keys off a revision
 * that is bumped by both signals instead of trying to reconcile partial event
 * streams in the renderer. Main remains the only writer; this hook only asks.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BuilderSessionEvent } from '@/lib/builder-session';
import type { BuilderFileChange } from '@/lib/builder-workspace';

export function useBuilderChanges(
  sessionId: string | undefined,
  events: BuilderSessionEvent[],
) {
  const [changes, setChanges] = useState<BuilderFileChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [revision, setRevision] = useState(0);

  // Local tools emit `file-changed`; the OpenCode feed only has tool results.
  // Either one is a reason to re-read the diff.
  const lastWorkspaceMutation = useMemo(() => {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (
        event.type === 'file-changed' ||
        event.type === 'tool-completed' ||
        event.type === 'tool-failed'
      ) {
        return event.eventId;
      }
    }
    return '';
  }, [events]);

  useEffect(() => {
    let cancelled = false;

    if (!sessionId) {
      setChanges([]);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    void window.electron.ipc
      .invoke<BuilderFileChange[]>('builder:workspace-changes')
      .then((result) => {
        if (!cancelled) setChanges(result);
        return undefined;
      })
      .catch(() => {
        // Keep the last successful list visible; main stays authoritative.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, lastWorkspaceMutation, revision]);

  const refresh = useCallback(() => {
    setRevision((current) => current + 1);
  }, []);

  const keep = useCallback(async (): Promise<string[]> => {
    setKeeping(true);
    try {
      const result = await window.electron.ipc.invoke<{ paths: string[] }>(
        'builder:changes-keep',
      );
      refresh();
      return result.paths;
    } finally {
      setKeeping(false);
    }
  }, [refresh]);

  const discard = useCallback(async (): Promise<void> => {
    setDiscarding(true);
    try {
      await window.electron.ipc.invoke('builder:changes-discard');
      refresh();
    } finally {
      setDiscarding(false);
    }
  }, [refresh]);

  return {
    changes,
    loading,
    keeping,
    discarding,
    revision,
    refresh,
    keep,
    discard,
  };
}
