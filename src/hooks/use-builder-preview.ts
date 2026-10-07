/**
 * hooks/use-builder-preview.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Renderer side of the Builder preview: it asks main to start a dev server,
 * mirrors the status main publishes, and exposes the two things the canvas needs
 * (open in the user's browser, stop what we started).
 *
 * WHY THE STATE LIVES IN MAIN
 * ───────────────────────────
 * The process outlives any one route. If this hook owned the status it would
 * reset to `idle` on every navigation and the canvas would claim "no preview"
 * while a server was still running — the same lie the session feed avoids by
 * keeping its buffer in main and re-attaching through `builder:session-state`.
 * So this hook holds nothing authoritative: it subscribes to
 * `builder:preview-changed` and re-reads `builder:preview-status` on mount.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from 'react';
import {
  EMPTY_PREVIEW_STATUS,
  type BuilderPreviewStatus,
} from '@/lib/builder-preview';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useBuilderPreview() {
  const [status, setStatus] = useState<BuilderPreviewStatus>(
    EMPTY_PREVIEW_STATUS,
  );
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = window.electron.ipc.on(
      'builder:preview-changed',
      (next) => {
        setStatus(next as BuilderPreviewStatus);
      },
    );
    // Re-attach to whatever main is already running.
    void (async () => {
      try {
        const snapshot =
          await window.electron.ipc.invoke<BuilderPreviewStatus>(
            'builder:preview-status',
          );
        if (snapshot) setStatus(snapshot);
      } catch (cause) {
        setError(messageOf(cause));
      }
    })();
    return unsubscribe;
  }, []);

  /** `script` overrides the auto-detected package script for this start. */
  const start = useCallback(async (script?: string) => {
    setStarting(true);
    setError(null);
    try {
      const next = await window.electron.ipc.invoke<BuilderPreviewStatus>(
        'builder:preview-start',
        script ? { script } : {},
      );
      setStatus(next);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setStarting(false);
    }
  }, []);

  const stop = useCallback(async () => {
    setStopping(true);
    setError(null);
    try {
      setStatus(
        await window.electron.ipc.invoke<BuilderPreviewStatus>(
          'builder:preview-stop',
        ),
      );
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setStopping(false);
    }
  }, []);

  const openExternal = useCallback((url: string) => {
    void window.electron.ipc.invoke('builder:preview-open', { url });
  }, []);

  return { status, starting, stopping, error, start, stop, openExternal };
}
