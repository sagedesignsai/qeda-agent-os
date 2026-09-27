/**
 * hooks/use-db-resource.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * One client-side read pattern for DB-backed data, so invalidation cannot be
 * forgotten.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The app already had the right idea in exactly one place — `use-projects` loads
 * `projects:rollups` and re-fetches when main broadcasts `projects:changed`. The
 * problem was that this discipline lived in each hook's memory. Four hooks load
 * DB data and resync on nothing, so the UI silently disagrees with the database
 * until something forces a remount. Two real bugs of exactly this shape shipped
 * and were fixed by hand: the sidebar's provider/model readout and the chat
 * composer's indicator.
 *
 * So: encode the pattern once here, and make the resync impossible to omit.
 * `useDbResource` subscribes to the change event for the resource it reads, so a
 * hook that uses it cannot "forget" — there is no optional subscribe.
 *
 * WHY NOT ZUSTAND
 * ───────────────
 * Considered and rejected. The bug is an *invalidation* bug, not a storage bug:
 * a store still has to be told the DB changed. Worse, a store with setters
 * creates a second write path — the database is authoritative, and every write
 * must go main → DB → broadcast → refetch — so local writes invite drift
 * between two sources of truth. This hook is a read cache only. It exposes no
 * writer, so it cannot become a second source of truth.
 *
 * MUTATION IS NOT THIS HOOK'S JOB
 * ───────────────────────────────
 * Writes go through the existing mutation hooks and then land back here via the
 * broadcast. That keeps the write path single and in the main process, where the
 * transaction is.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from 'react';

export interface DbResourceOptions<T> {
  /** IPC channel to read from. Must be a `req: void | {}` list-style channel. */
  channel: string;
  /**
   * Channel main broadcasts after any mutation of this resource. This is not
   * optional: a resource with no invalidation event is the bug this hook exists
   * to prevent.
   */
  event: string;
  /**
   * Transform the raw IPC payload into the shape the component wants. Omit when
   * the response is already the right shape.
   */
  select?: (raw: unknown) => T;
  /** Skip loading (e.g. the caller has no id yet). The resource stays null. */
  enabled?: boolean;
  /**
   * Stable key that identifies WHICH row is being read. Changing it refetches —
   * use it for per-entity resources such as one notebook's pages.
   */
  resourceKey?: string;
}

export interface DbResource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Refetch now. Also fires on every change broadcast. */
  refresh: () => Promise<void>;
}

export function useDbResource<T>({
  channel,
  event,
  select,
  enabled = true,
  resourceKey,
}: DbResourceOptions<T>): DbResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    try {
      const raw = await window.electron.ipc.invoke(channel);
      // `select` is the consumer's transform; without it the payload is the shape.
      setData(select ? select(raw) : (raw as T));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [channel, select, enabled]);

  // Load on mount, and whenever the identity of the resource changes.
  useEffect(() => {
    setLoading(true);
    void refresh();
    // `resourceKey` is the dependency that matters for per-entity resources;
    // `refresh` already closes over everything else it needs.
  }, [refresh, resourceKey]);

  // Invalidate on the broadcast. Returning the unsubscribe matters: Base UI /
  // Radix both hand back a cleanup from `ipc.on`, and leaking one per mount
  // would accumulate duplicate listeners that all refetch.
  useEffect(() => {
    if (!enabled) return undefined;
    return window.electron.ipc.on(event, () => {
      void refresh();
    });
  }, [event, refresh, enabled]);

  return { data, loading, error, refresh };
}
