/**
 * hooks/use-sponsor-card.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook for sponsor card generation and export.
 *
 * Usage:
 *   const { generate, exportGsap, exportSvg, loading, error } = useSponsorCard();
 *   await generate([{ title: 'Feature', subtitle: 'Subtext' }]);
 */

import { useState, useCallback } from 'react';
import type { SponsorCardFeature } from '@/lib/trace/templates/sponsor-card';
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

export function useSponsorCard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const generate = useCallback(
    async (features: SponsorCardFeature[] = []): Promise<GenerateResult | null> => {
      setLoading(true);
      setError(null);
      try {
        const result = await window.electron.ipc.invoke<GenerateResult>(
          'sponsor-card:generate',
          { features },
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
      componentName = 'SponsorCard',
    ): Promise<ExportGsapResult | null> => {
      setLoading(true);
      setError(null);
      try {
        const result = await window.electron.ipc.invoke<ExportGsapResult>(
          'sponsor-card:export-gsap',
          { project, format, componentName, loop: true },
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
          'sponsor-card:export-svg',
          { project, loop: true, includeDimensions: true },
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
