/**
 * components/motion/export/MotionExportApp.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The entire hidden render window. It mounts one document at output size, paints
 * frames on demand, streams chunks to main, and exits.
 *
 * Deliberately not the editor: no router, no panels, no selection, no grid, and
 * no editor floor. Asset URLs still go through the shared `qeda-media://` scheme,
 * so this window never receives a filesystem path.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { MotionSceneCanvas } from '@/components/motion/scene/MotionSceneCanvas';
import {
  MotionExportCodecError,
  runMotionExport,
  type MotionExportStage,
  type MotionExportTransport,
} from '@/components/motion/export/run-motion-export';
import type { MotionRenderJobPayload } from '@/lib/motion/export/protocol';
import { PlaybackClock } from '@/lib/timeline/clock';

/** Textures and troika fonts load outside React; frame 0 must see them. */
const ASSET_SETTLE_MS = 1200;

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      setTimeout(resolve, 16);
      return;
    }
    requestAnimationFrame(() => resolve());
  });
}

function backgroundOf(job: MotionRenderJobPayload): string {
  const scene = job.document.scenes.find((candidate) => candidate.id === job.document.activeSceneId);
  if (scene?.background?.type === 'color') return scene.background.color;
  return job.document.brand.colors.background || '#171a22';
}

export function MotionExportStageView({
  job,
  onStage,
}: {
  job: MotionRenderJobPayload;
  onStage: (stage: MotionExportStage) => void;
}) {
  const clock = useMemo(
    () => new PlaybackClock({ duration: () => job.document.timeline.duration }),
    [job],
  );

  const handleCanvas = useCallback(
    (canvas: HTMLCanvasElement) => {
      onStage({
        canvas,
        renderFrame: async (sceneTime: number) => {
          // `seek` is a no-op when the time is unchanged, which would skip the
          // first paint at t=0; nudge by an epsilon so every frame invalidates.
          if (clock.getTime() === sceneTime) {
            clock.seek(sceneTime === 0 ? 1e-6 : sceneTime - 1e-6);
          }
          clock.seek(sceneTime);
          await nextPaint();
          await nextPaint();
        },
      });
    },
    [clock, onStage],
  );

  return (
    <div
      data-motion-export-stage=""
      style={{ width: job.settings.width, height: job.settings.height, overflow: 'hidden' }}
    >
      <MotionSceneCanvas
        doc={job.document}
        clock={clock}
        viewMode="perspective"
        stageColor={backgroundOf(job)}
        gridVisible={false}
        zoom={1}
        showEditorStage={false}
        dpr={1}
        preserveDrawingBuffer
        onCanvasReady={handleCanvas}
      />
    </div>
  );
}

export function MotionExportApp({ job }: { job: MotionRenderJobPayload }) {
  const [stage, setStage] = useState<MotionExportStage | null>(null);
  const started = useRef(false);
  const cancelled = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.ipc) return undefined;
    return window.electron.ipc.on('motion:export-cancel-requested', () => {
      cancelled.current = true;
    });
  }, []);

  useEffect(() => {
    if (!stage || started.current) return;
    started.current = true;

    const report = async (phase: 'prepare' | 'render' | 'finalize', frame?: number) => {
      await window.electron.ipc.invoke('motion:export-report', {
        jobId: job.jobId,
        phase,
        ...(frame === undefined ? {} : { frame }),
      });
    };
    const transport: MotionExportTransport = {
      report,
      writeChunk: async (data, position) => {
        await window.electron.ipc.invoke('motion:export-chunk', { jobId: job.jobId, data, position });
      },
      isCancelled: () => cancelled.current,
    };

    void (async () => {
      try {
        if (typeof document !== 'undefined' && document.fonts?.ready) {
          await document.fonts.ready.catch(() => undefined);
        }
        await new Promise((resolve) => setTimeout(resolve, ASSET_SETTLE_MS));
        await runMotionExport(job, stage, transport);
        // Main renames the file and destroys this window; the reply may not land.
        await window.electron.ipc.invoke('motion:export-complete', { jobId: job.jobId }).catch(() => undefined);
        window.close();
      } catch (error) {
        const message = error instanceof MotionExportCodecError
          ? error.message
          : error instanceof Error ? error.message : String(error);
        await window.electron.ipc
          .invoke('motion:export-failed', { jobId: job.jobId, message })
          .catch(() => undefined);
        window.close();
      }
    })();
  }, [job, stage]);

  return <MotionExportStageView job={job} onStage={setStage} />;
}
