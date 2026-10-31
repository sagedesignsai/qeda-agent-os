/**
 * hooks/use-motion-export.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Editor-side export transport: pick a destination, start a job, and follow the
 * main-process progress pushes. The renderer never learns the job's filesystem
 * layout, only the chosen output path.
 */

import { useCallback, useEffect, useState } from 'react';

import type { MotionRenderProgress } from '@/lib/motion/export/protocol';
import type { MotionDocument } from '@/lib/motion/types';

export type MotionExportStartOptions = {
  document: MotionDocument;
  presetId: string;
  range: { start: number; end: number };
};

export type MotionExportStartResult = {
  jobId: string;
  outputPath: string;
  frameCount: number;
};

export type MotionExportState = {
  progress: MotionRenderProgress | null;
  error: string | null;
  busy: boolean;
  start: (options: MotionExportStartOptions) => Promise<MotionExportStartResult | null>;
  cancel: () => Promise<void>;
  dismiss: () => void;
};

const TERMINAL: MotionRenderProgress['phase'][] = ['done', 'failed', 'cancelled'];

export function useMotionExport(): MotionExportState {
  const [progress, setProgress] = useState<MotionRenderProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.ipc) return undefined;
    return window.electron.ipc.on('motion:export-progress', (value) => {
      const next = value as MotionRenderProgress;
      setProgress(next);
      if (next.phase === 'failed') setError(next.error ?? 'The export failed.');
    });
  }, []);

  const start = useCallback(async (options: MotionExportStartOptions) => {
    setError(null);
    try {
      const target = await window.electron.ipc.invoke<{ path: string } | null>('motion:pick-export-path', {
        projectName: options.document.meta.name,
        presetId: options.presetId,
      });
      if (!target) return null;
      const result = await window.electron.ipc.invoke<MotionExportStartResult>('motion:export-start', {
        projectId: options.document.meta.id,
        document: options.document,
        presetId: options.presetId,
        range: options.range,
        outputPath: target.path,
      });
      setProgress({
        jobId: result.jobId,
        phase: 'prepare',
        frame: 0,
        frameCount: result.frameCount,
        fraction: 0,
      });
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    }
  }, []);

  const cancel = useCallback(async () => {
    if (!progress || TERMINAL.includes(progress.phase)) return;
    try {
      await window.electron.ipc.invoke('motion:export-cancel', { jobId: progress.jobId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [progress]);

  const dismiss = useCallback(() => {
    if (progress && !TERMINAL.includes(progress.phase)) return;
    setProgress(null);
    setError(null);
  }, [progress]);

  return {
    progress,
    error,
    busy: Boolean(progress && !TERMINAL.includes(progress.phase)),
    start,
    cancel,
    dismiss,
  };
}
