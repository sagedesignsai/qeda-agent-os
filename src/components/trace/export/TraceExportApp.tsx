/**
 * components/trace/export/TraceExportApp.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The entire hidden Trace export window. It paints serialized SVG frames into
 * one offscreen canvas, streams chunks to main, and exits.
 *
 * Deliberately not the editor: no router, no panels, no selection. Voice audio
 * is fetched through the shared `qeda-media://` scheme, so this window never
 * receives a filesystem path.
 */

import { useEffect, useRef } from 'react';

import {
  runTraceExport,
  type TraceExportStage,
  type TraceExportTransport,
} from '@/components/trace/export/run-trace-export';
import { staticSvgMarkup } from '@/lib/trace/serialize/svg-markup';
import { DEFAULT_SCENE_BACKGROUND } from '@/lib/trace/runtime/scenes';
import type { TraceRenderJobPayload } from '@/lib/trace/export/protocol';

export function TraceExportApp({ job }: { job: TraceRenderJobPayload }) {
  const started = useRef(false);
  const cancelled = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.ipc) return undefined;
    return window.electron.ipc.on('trace:export-cancel-requested', () => {
      cancelled.current = true;
    });
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      try {
        if (typeof document !== 'undefined' && document.fonts?.ready) {
          await document.fonts.ready.catch(() => undefined);
        }

        const canvas = document.createElement('canvas');
        canvas.width = job.settings.width;
        canvas.height = job.settings.height;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error(
            'The Trace export compositor could not create a 2D canvas.',
          );
        }

        // Base fill for frames where no scene paints a background; the
        // serializer itself emits per-scene backgrounds (and blends them across
        // an entrance) so the encoded pixels match the stage.
        const fallbackBackground =
          job.project.storyboard?.scenes[0]?.background ??
          DEFAULT_SCENE_BACKGROUND;

        // A frame is the serialized SVG at time t, drawn into the canvas. The
        // serializer is shared with the editor and exporters, so the encoded
        // pixels cannot drift from what the stage shows.
        const stage: TraceExportStage = {
          canvas,
          renderFrame: async (timeMs: number) => {
            const svg = staticSvgMarkup(job.project, timeMs, {
              size: true,
              subtitles: true,
            });
            const blob = new Blob([svg], {
              type: 'image/svg+xml;charset=utf-8',
            });
            const url = URL.createObjectURL(blob);
            try {
              const image = new Image();
              image.src = url;
              await image.decode();
              context.fillStyle = fallbackBackground;
              context.fillRect(0, 0, canvas.width, canvas.height);
              context.drawImage(image, 0, 0, canvas.width, canvas.height);
            } finally {
              URL.revokeObjectURL(url);
            }
          },
        };

        const transport: TraceExportTransport = {
          report: async (phase, frame) => {
            await window.electron.ipc.invoke('trace:export-report', {
              jobId: job.jobId,
              phase,
              ...(frame === undefined ? {} : { frame }),
            });
          },
          writeChunk: async (data, position) => {
            await window.electron.ipc.invoke('trace:export-chunk', {
              jobId: job.jobId,
              data,
              position,
            });
          },
          isCancelled: () => cancelled.current,
        };

        await runTraceExport(job, stage, transport);
        // Main renames the file and destroys this window; the reply may not land.
        await window.electron.ipc
          .invoke('trace:export-complete', { jobId: job.jobId })
          .catch(() => undefined);
        window.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await window.electron.ipc
          .invoke('trace:export-failed', { jobId: job.jobId, message })
          .catch(() => undefined);
        window.close();
      }
    })();
  }, [job]);

  return null;
}