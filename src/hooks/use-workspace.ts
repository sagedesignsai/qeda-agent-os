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

  return { notebooks, loading, reload };
}

export function usePages(notebookId: string | null) {
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!notebookId) {
      setPages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const data = await window.electron.ipc.invoke<Page[]>('pages:list', {
          notebookId,
        });
        if (!cancelled) setPages(data ?? []);
      } catch {
        if (!cancelled) setPages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notebookId]);

  return { pages, loading, setPages };
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
