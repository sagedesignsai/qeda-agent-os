/**
 * hooks/use-presence-browser.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Renderer side of the embedded Presence browser.
 *
 * The native `WebContentsView` lives in the main process and is drawn *over* the
 * React tree. This hook only sends placement and lifecycle commands; the tab
 * strip stays ordinary DOM, which is why it can sit above the site without being
 * covered by it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIpcEvent } from '@/hooks/use-ipc';
import type { PresenceBrowserBounds } from '@/main/ipc/channels';

async function call(channel: string, payload?: unknown): Promise<void> {
  await window.electron.ipc.invoke(channel, payload);
}

export interface BrowserTabState {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  error: string | null;
}

export interface PresenceBrowserControls {
  show: (
    id: string,
    url: string,
    bounds: PresenceBrowserBounds,
  ) => Promise<void>;
  setBounds: (id: string, bounds: PresenceBrowserBounds) => Promise<void>;
  hide: () => Promise<void>;
  close: (id: string) => Promise<void>;
  closeAll: () => Promise<void>;
  navigate: (id: string, url: string) => Promise<void>;
  reload: (id: string) => Promise<void>;
  back: (id: string) => Promise<void>;
  forward: (id: string) => Promise<void>;
  openExternal: (id: string) => Promise<void>;
}

export function usePresenceBrowser(): PresenceBrowserControls & {
  browserState: BrowserTabState | null;
} {
  const show = useCallback(
    (id: string, url: string, bounds: PresenceBrowserBounds) =>
      call('presence:browser-show', { id, url, bounds }),
    [],
  );

  const setBounds = useCallback(
    (id: string, bounds: PresenceBrowserBounds) =>
      call('presence:browser-bounds', { id, bounds }),
    [],
  );

  const hide = useCallback(() => call('presence:browser-hide'), []);

  const close = useCallback(
    (id: string) => call('presence:browser-close', { id }),
    [],
  );

  const closeAll = useCallback(() => call('presence:browser-close-all'), []);

  const navigate = useCallback(
    (id: string, url: string) => call('presence:browser-navigate', { id, url }),
    [],
  );

  const reload = useCallback(
    (id: string) => call('presence:browser-reload', { id }),
    [],
  );

  const back = useCallback(
    (id: string) => call('presence:browser-back', { id }),
    [],
  );

  const forward = useCallback(
    (id: string) => call('presence:browser-forward', { id }),
    [],
  );

  const openExternal = useCallback(
    (id: string) => call('presence:browser-open-external', { id }),
    [],
  );

  // ── Browser state from main process ──────────────────────────────────────

  const [browserState, setBrowserState] = useState<BrowserTabState | null>(null);

  useIpcEvent('presence:browser-state', (...args: unknown[]) => {
    const data = args[0] as { id: string; url: string; title: string; canGoBack: boolean; canGoForward: boolean };
    setBrowserState((prev) => {
      if (prev?.url === data.url && prev?.title === data.title) return prev;
      return prev
        ? { ...prev, ...data, error: null }
        : { ...data, loading: false, error: null };
    });
  });

  useIpcEvent('presence:browser-loading', (...args: unknown[]) => {
    const data = args[0] as { id: string; loading: boolean };
    setBrowserState((prev) =>
      prev ? { ...prev, loading: data.loading } : prev,
    );
  });

  useIpcEvent('presence:browser-error', (...args: unknown[]) => {
    const data = args[0] as { id: string; error: string };
    setBrowserState((prev) =>
      prev ? { ...prev, error: data.error, loading: false } : prev,
    );
  });

  // Leaving the page must not leave a logged-in social tab floating above the
  // next route. Hiding is enough for the route change itself; the pane closes
  // its own tabs on unmount.
  useEffect(() => {
    return () => {
      void window.electron.ipc
        .invoke('presence:browser-hide')
        .catch(() => undefined);
    };
  }, []);

  // Stable identity: the pane uses this object as an effect dependency, and a
  // fresh literal each render would re-send placement commands continuously.
  return useMemo(
    () => ({
      show,
      setBounds,
      hide,
      close,
      closeAll,
      navigate,
      reload,
      back,
      forward,
      openExternal,
      browserState,
    }),
    [show, setBounds, hide, close, closeAll, navigate, reload, back, forward, openExternal, browserState],
  );
}
