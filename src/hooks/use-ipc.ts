/**
 * hooks/use-ipc.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin React hook that wraps window.electron.ipc for use in components.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect } from 'react';

/** Make a typed IPC invoke call. */
export function useIpcInvoke() {
  return useCallback(
    <T = unknown>(channel: string, payload?: unknown): Promise<T> =>
      window.electron.ipc.invoke<T>(channel, payload),
    [],
  );
}

/**
 * Subscribe to IPC events pushed from main process.
 * Automatically unsubscribes when the component unmounts.
 */
export function useIpcEvent(
  channel: string,
  listener: (...args: unknown[]) => void,
  deps: React.DependencyList = [],
): void {
  useEffect(() => {
    const cleanup = window.electron.ipc.on(channel, listener);
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, ...deps]);
}
