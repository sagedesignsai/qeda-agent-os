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
import { sampleMotionSequence, resolveMotionSequence } from '@/lib/motion/sequence';
import { selectMotionScene } from '@/lib/motion/scene-select';
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

export function MotionExportStageView({
  job,
  onStage,
}: {
  job: MotionRenderJobPayload;
  onStage: (stage: MotionExportStage) => void;
}) {
  const sequence = useMemo(() => resolveMotionSequence(job.document), [job.document]);
  const firstSceneId = job.range.sequence
    ? sequence.items[0]?.sceneId ?? job.document.activeSceneId
    : job.document.activeSceneId;
  const secondSceneId = job.document.scenes.find((scene) => scene.id !== firstSceneId)?.id ?? firstSceneId;
  const maxSceneDuration = Math.max(0, ...job.document.scenes.map((scene) => scene.timeline.duration));
  const clockA = useMemo(() => new PlaybackClock({ duration: () => maxSceneDuration }), [job, maxSceneDuration]);
  const clockB = useMemo(() => new PlaybackClock({ duration: () => maxSceneDuration }), [job, maxSceneDuration]);
  const [sceneDocs, setSceneDocs] = useState(() => [
    selectMotionScene(job.document, firstSceneId),
    selectMotionScene(job.document, secondSceneId),
  ]);
  const canvasesRef = useRef<Array<HTMLCanvasElement | null>>([null, null]);
  const sceneIdsRef = useRef<[string, string]>([firstSceneId, secondSceneId]);
  const settledSceneIdsRef = useRef(new Set([firstSceneId, secondSceneId]));
  const stageCreatedRef = useRef(false);

  const onSceneCanvas = useCallback((slot: 0 | 1, sceneCanvas: HTMLCanvasElement) => {
    canvasesRef.current[slot] = sceneCanvas;
    if (stageCreatedRef.current || !canvasesRef.current[0] || !canvasesRef.current[1]) return;
    stageCreatedRef.current = true;

    const canvas = document.createElement('canvas');
    canvas.width = job.settings.width;
    canvas.height = job.settings.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The export compositor could not create a 2D canvas.');
    const clocks = [clockA, clockB] as const;

    onStage({
      canvas,
      renderFrame: async (sequenceTime: number) => {
        const frame = job.range.sequence
          ? sampleMotionSequence(job.document, sequence, sequenceTime)
          : {
              layers: [{
                item: { id: 'active', sceneId: firstSceneId, start: 0, duration: job.document.scenes.find((scene) => scene.id === firstSceneId)?.timeline.duration ?? 0 },
                // Preflight requires at least one scene; retain a definite scene
                // here so the renderer's fallback frame stays fully typed.
                scene: job.document.scenes.find((scene) => scene.id === firstSceneId) ?? job.document.scenes[0]!,
                sceneTime: sequenceTime,
              }],
            };

        const activeLayers: Array<{ sceneId: string; slot: 0 | 1; sceneTime: number }> = [];
        const usedSlots = new Set<number>();
        let needsAssetSettle = false;
        for (const layer of frame.layers.slice(-2)) {
          let slot = sceneIdsRef.current.indexOf(layer.scene.id) as 0 | 1 | -1;
          if (slot < 0 || usedSlots.has(slot)) slot = usedSlots.has(0) ? 1 : 0;
          usedSlots.add(slot);
          if (sceneIdsRef.current[slot] !== layer.scene.id) {
            sceneIdsRef.current[slot] = layer.scene.id;
            setSceneDocs((current) => {
              const next = [...current];
              next[slot] = selectMotionScene(job.document, layer.scene.id);
              return next;
            });
            if (!settledSceneIdsRef.current.has(layer.scene.id)) needsAssetSettle = true;
          }
          activeLayers.push({ sceneId: layer.scene.id, slot, sceneTime: layer.sceneTime });
          const clock = clocks[slot];
          if (clock.getTime() === layer.sceneTime) {
            clock.seek(layer.sceneTime === 0 ? 1e-6 : layer.sceneTime - 1e-6);
          }
          clock.seek(layer.sceneTime);
        }

        if (needsAssetSettle) {
          await new Promise((resolve) => setTimeout(resolve, ASSET_SETTLE_MS));
          for (const layer of activeLayers) settledSceneIdsRef.current.add(layer.sceneId);
        }
        await nextPaint();
        await nextPaint();

        context.globalAlpha = 1;
        context.globalCompositeOperation = 'source-over';
        context.fillStyle = job.document.brand.colors.background || '#171a22';
        context.fillRect(0, 0, canvas.width, canvas.height);
        if (activeLayers.length === 0) return;

        if (activeLayers.length === 1) {
          const source = canvasesRef.current[activeLayers[0].slot];
          if (source) context.drawImage(source, 0, 0, canvas.width, canvas.height);
          return;
        }

        const outgoing = activeLayers[0];
        const incoming = activeLayers[1];
        const outgoingCanvas = canvasesRef.current[outgoing.slot];
        const incomingCanvas = canvasesRef.current[incoming.slot];
        if (!outgoingCanvas || !incomingCanvas) return;
        const progress = frame.transition?.progress ?? 1;
        if (frame.transition?.type === 'dip') {
          context.fillStyle = frame.transition.color ?? '#000000';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.globalAlpha = progress < 0.5 ? 1 - progress * 2 : (progress - 0.5) * 2;
          const source = progress < 0.5 ? outgoingCanvas : incomingCanvas;
          context.drawImage(source, 0, 0, canvas.width, canvas.height);
        } else {
          context.globalAlpha = 1 - progress;
          context.drawImage(outgoingCanvas, 0, 0, canvas.width, canvas.height);
          context.globalAlpha = progress;
          context.drawImage(incomingCanvas, 0, 0, canvas.width, canvas.height);
        }
        context.globalAlpha = 1;
      },
    });
  }, [clockA, clockB, firstSceneId, job, onStage, sequence]);

  const onCanvasA = useCallback((canvas: HTMLCanvasElement) => onSceneCanvas(0, canvas), [onSceneCanvas]);
  const onCanvasB = useCallback((canvas: HTMLCanvasElement) => onSceneCanvas(1, canvas), [onSceneCanvas]);

  return (
    <div
      data-motion-export-stage=""
      style={{ width: job.settings.width, height: job.settings.height, overflow: 'hidden', position: 'relative' }}
    >
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <MotionSceneCanvas doc={sceneDocs[0]} clock={clockA} viewMode="perspective" stageColor={job.document.brand.colors.background || '#171a22'} gridVisible={false} zoom={1} showEditorStage={false} dpr={1} preserveDrawingBuffer onCanvasReady={onCanvasA} />
      </div>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <MotionSceneCanvas doc={sceneDocs[1]} clock={clockB} viewMode="perspective" stageColor={job.document.brand.colors.background || '#171a22'} gridVisible={false} zoom={1} showEditorStage={false} dpr={1} preserveDrawingBuffer onCanvasReady={onCanvasB} />
      </div>
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
