/**
 * hooks/use-builder-runtime.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Owns the renderer's OpenCode preflight state and refresh lifecycle. UI
 * components consume a single status source rather than issuing duplicate IPC.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from 'react';
import type { BuilderConnectionStatus } from '@/lib/builder-types';

export function useBuilderRuntime() {
  const [status, setStatus] = useState<BuilderConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.electron.ipc.invoke<BuilderConnectionStatus>(
        'builder:connection-status',
      );
      setStatus(result);
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, loading, refresh };
}
