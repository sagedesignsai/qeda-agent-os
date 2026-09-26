/**
 * hooks/use-workspace.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Workspace data hooks for the renderer: notebooks, pages and page detail,
 * loaded over typed IPC. Kept deliberately thin — the store lives in main,
 * these hooks just fetch and expose loading/error state.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from 'react';
import type { Notebook, Page, PageDetail, SearchHit } from '../main/ipc/channels';

export function useNotebooks() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const data = await window.electron.ipc.invoke<Notebook[]>('notebooks:list');
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
    window.electron.ipc
      .invoke<Page[]>('pages:list', { notebookId })
      .then((data) => {
        if (!cancelled) setPages(data ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
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
      const data = await window.electron.ipc.invoke<PageDetail | null>('pages:get', { id });
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

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setHits([]);
      return;
    }
    setSearching(true);
    try {
      const data = await window.electron.ipc.invoke<SearchHit[]>('pages:search', { query });
      setHits(data ?? []);
    } finally {
      setSearching(false);
    }
  }, []);

  return { hits, searching, search };
}
