/**
 * hooks/use-workspace.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Workspace data hooks for the renderer: notebooks, pages and page detail,
 * loaded over typed IPC. Kept deliberately thin — the store lives in main,
 * these hooks just fetch and expose loading/error state.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Notebook,
  Page,
  PageDetail,
  SearchHit,
  RecentPage,
} from '../main/ipc/channels';

export function useNotebooks() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const data =
        await window.electron.ipc.invoke<Notebook[]>('notebooks:list');
      setNotebooks(data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // The notebook list is affected by two things outside this hook: knowledge
  // mutations (rename, re-scope, delete, agent-created notebook) and project
  // changes (a project delete re-homes or removes its notebooks, and the
  // project dialog's link picker reads the same rows).
  useEffect(() => {
    const offWorkspace = window.electron.ipc.on('workspace:changed', () => {
      void reload();
    });
    const offProjects = window.electron.ipc.on('projects:changed', () => {
      void reload();
    });
    return () => {
      offWorkspace();
      offProjects();
    };
  }, [reload]);

  return { notebooks, loading, reload };
}

export function usePages(notebookId: string | null) {
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(Boolean(notebookId));
  /**
   * Which notebook the current `pages` array describes.
   *
   * `pages === []` is ambiguous — "this notebook has no pages" and "the list is
   * still in flight" look identical. That ambiguity used to make the Workspace
   * page auto-create a duplicate "Page 1" every time an existing notebook was
   * opened from the index, so consumers get an explicit readiness signal.
   */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  /** Latest selection, so a slow response for the previous notebook is dropped. */
  const currentNotebook = useRef(notebookId);
  currentNotebook.current = notebookId;

  const reload = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const data = await window.electron.ipc.invoke<Page[]>('pages:list', {
        notebookId: id,
      });
      if (currentNotebook.current !== id) return;
      setPages(data ?? []);
      setLoadedFor(id);
    } catch {
      if (currentNotebook.current !== id) return;
      setPages([]);
      setLoadedFor(id);
    } finally {
      if (currentNotebook.current === id) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!notebookId) {
      setPages([]);
      setLoadedFor(null);
      setLoading(false);
      return;
    }
    // Clear immediately: the previous notebook's pages must never render under
    // the new notebook's id, nor feed the auto-navigate/auto-create effects.
    setPages([]);
    setLoadedFor(null);
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const data = await window.electron.ipc.invoke<Page[]>('pages:list', {
          notebookId,
        });
        if (cancelled) return;
        setPages(data ?? []);
      } catch {
        if (!cancelled) setPages([]);
      } finally {
        if (!cancelled) {
          setLoadedFor(notebookId);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notebookId]);

  // Any tree mutation — from this rail, the page header, an agent tool or
  // another window — refetches the selected notebook's list.
  useEffect(() => {
    if (!notebookId) return;
    return window.electron.ipc.on('workspace:changed', () => {
      void reload(notebookId);
    });
  }, [notebookId, reload]);

  /** True once `pages` is guaranteed to describe `notebookId`. */
  const ready = notebookId === null || loadedFor === notebookId;

  return { pages, loading, ready, loadedFor, reload, setPages };
}

export function usePageDetail(pageId: string | null) {
  const [detail, setDetail] = useState<PageDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const data = await window.electron.ipc.invoke<PageDetail | null>(
        'pages:get',
        { id },
      );
      setDetail(data);
      return data;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!pageId) {
      setDetail(null);
      return;
    }
    void reload(pageId);
  }, [pageId, reload]);

  return { detail, loading, reload };
}

/** Search pages via FTS. Returns an empty list for empty queries. */
export function usePageSearch() {
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const requestSequence = useRef(0);

  const search = useCallback(async (query: string) => {
    const requestId = ++requestSequence.current;
    if (!query.trim()) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const data = await window.electron.ipc.invoke<SearchHit[]>(
        'pages:search',
        { query },
      );
      if (requestId === requestSequence.current) setHits(data ?? []);
    } catch {
      if (requestId === requestSequence.current) setHits([]);
    } finally {
      if (requestId === requestSequence.current) setSearching(false);
    }
  }, []);

  return { hits, searching, search };
}

/** Recent pages used by the Knowledge landing page. */
export function useRecentPages() {
  const [pages, setPages] = useState<RecentPage[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    try {
      const data = await window.electron.ipc.invoke<RecentPage[]>(
        'pages:recent',
        { limit: 8 },
      );
      setPages(data ?? []);
    } catch {
      setPages([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { pages, loading, reload };
}
