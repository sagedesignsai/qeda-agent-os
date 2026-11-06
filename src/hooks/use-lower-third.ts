/**
 * hooks/use-lower-third.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook for lower third overlay generation and export.
 *
 * Usage:
 *   const { generate, exportGsap, exportSvg, loading, error } = useLowerThird();
 *   await generate({ title: 'Status', subtitle: 'Subtext', metric: '5/10' });
 */

import { useState, useCallback } from 'react';
import type { LowerThirdConfig } from '@/lib/trace/templates/lower-third';
import type { TraceDocument } from '@/lib/trace/types';

interface GenerateResult {
  project: TraceDocument;
  elementCount: number;
  durationMs: number;
}

interface ExportGsapResult {
  code: string;
  format: 'react' | 'vanilla';
  codeLength: number;
}

interface ExportSvgResult {
  svg: string;
  svgLength: number;
}

export function useLowerThird() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const generate = useCallback(
    async (config: LowerThirdConfig): Promise<GenerateResult | null> => {
      setLoading(true);
      setError(null);
      try {
        const result = await window.electron.ipc.invoke<GenerateResult>(
          'lower-third:generate',
          config,
        );
        return result;
      } catch (cause) {
        const err = cause instanceof Error ? cause : new Error(String(cause));
        setError(err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const exportGsap = useCallback(
    async (
      project: TraceDocument,
      format: 'react' | 'vanilla' = 'react',
      componentName = 'LowerThirdOverlay',
    ): Promise<ExportGsapResult | null> => {
      setLoading(true);
      setError(null);
      try {
        const result = await window.electron.ipc.invoke<ExportGsapResult>(
          'lower-third:export-gsap',
          { project, format, componentName, loop: false },
        );
        return result;
      } catch (cause) {
        const err = cause instanceof Error ? cause : new Error(String(cause));
        setError(err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const exportSvg = useCallback(
    async (project: TraceDocument): Promise<ExportSvgResult | null> => {
      setLoading(true);
      setError(null);
      try {
        const result = await window.electron.ipc.invoke<ExportSvgResult>(
          'lower-third:export-svg',
          { project, loop: false, includeDimensions: true },
        );
        return result;
      } catch (cause) {
        const err = cause instanceof Error ? cause : new Error(String(cause));
        setError(err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    generate,
    exportGsap,
    exportSvg,
    loading,
    error,
    clearError,
  };
}
