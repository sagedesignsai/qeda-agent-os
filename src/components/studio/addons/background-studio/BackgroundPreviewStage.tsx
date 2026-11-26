import { useEffect, useRef } from 'react';
import {
  drawGenerativeBackground,
  type GenerativeBackgroundConfig,
} from '@/lib/studio/render/background-generator';

export interface BackgroundPreviewStageProps {
  open: boolean;
  mode: 'generative' | 'classic';
  genConfig: GenerativeBackgroundConfig;
  classicCss: string;
}

export function BackgroundPreviewStage({
  open,
  mode,
  genConfig,
  classicCss,
}: BackgroundPreviewStageProps) {
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!open || mode !== 'generative') return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const start = performance.now();

    const paint = (now: number) => {
      drawGenerativeBackground(ctx, {
        width: canvas.width,
        height: canvas.height,
        config: genConfig,
        timeMs: genConfig.animated ? now - start : 0,
      });
      if (genConfig.animated) {
        rafId = requestAnimationFrame(paint);
      }
    };

    paint(start);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [open, mode, genConfig]);

  return (
    <div className="relative flex aspect-video max-h-[260px] w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-black/40 shadow-inner">
      {mode === 'generative' ? (
        <canvas
          ref={previewCanvasRef}
          width={640}
          height={360}
          aria-label="Canvas background preview"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: classicCss }}
          aria-label="Canvas background preview"
        />
      )}
    </div>
  );
}
