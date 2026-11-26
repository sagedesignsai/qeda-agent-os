/**
 * components/studio/features/BlendModeDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Full blend-mode picker with a live compositing preview.
 *
 * The preview paints the same two-layer scene for every mode, so switching
 * modes is instantly comparable. Apply writes `clip.payload.blendMode`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from 'react';
import { LayersIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FeatureDialog } from './FeatureDialog';
import {
  STUDIO_BLEND_MODES,
  blendModeToComposite,
  type StudioBlendModeOption,
} from '@/lib/studio/blend-modes';

interface BlendModeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clipName: string;
  value: string | undefined;
  onApply: (blendMode: string) => void;
}

function paintPreview(
  canvas: HTMLCanvasElement,
  option: StudioBlendModeOption,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.clientWidth || 480;
  const height = 190;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  // Light, high-contrast base so every mode (darken and lighten alike) reads.
  const base = ctx.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, '#e2e8f0');
  base.addColorStop(0.48, '#94a3b8');
  base.addColorStop(1, '#1e293b');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(14, 165, 233, 0.75)';
  ctx.beginPath();
  ctx.arc(width * 0.28, height * 0.62, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(250, 204, 21, 0.8)';
  ctx.beginPath();
  ctx.arc(width * 0.7, height * 0.36, 42, 0, Math.PI * 2);
  ctx.fill();

  // The "clip" layer whose blend mode we are previewing.
  const clipLayer = ctx.createLinearGradient(
    width * 0.34,
    0,
    width * 0.88,
    height,
  );
  clipLayer.addColorStop(0, '#f97316');
  clipLayer.addColorStop(0.5, '#ec4899');
  clipLayer.addColorStop(1, '#8b5cf6');
  ctx.globalCompositeOperation = blendModeToComposite(option.value);
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = clipLayer;
  ctx.beginPath();
  ctx.roundRect(width * 0.34, height * 0.18, width * 0.5, height * 0.64, 14);
  ctx.fill();

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(2, 6, 23, 0.72)';
  ctx.beginPath();
  ctx.roundRect(10, height - 34, 156, 24, 6);
  ctx.fill();
  ctx.fillStyle = '#f8fafc';
  ctx.font =
    '600 12px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillText(`${option.label} · ${option.group}`, 20, height - 18);
}

export function BlendModeDialog({
  open,
  onOpenChange,
  clipName,
  value,
  onApply,
}: BlendModeDialogProps) {
  const [mode, setMode] = useState(value ?? 'source-over');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (open) setMode(value ?? 'source-over');
  }, [open, value]);

  const selected = STUDIO_BLEND_MODES.find((option) => option.value === mode) ??
    STUDIO_BLEND_MODES[0];

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    paintPreview(canvasRef.current, selected);
  }, [open, selected]);

  const moveFocus = (index: number, delta: number) => {
    const next =
      (index + delta + STUDIO_BLEND_MODES.length) % STUDIO_BLEND_MODES.length;
    setMode(STUDIO_BLEND_MODES[next].value);
    buttonRefs.current[next]?.focus();
  };

  return (
    <FeatureDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Blend Mode"
      description={clipName}
      icon={<LayersIcon className="size-4 text-sky-400" />}
      helpText="Blend modes control how this clip composites over the layers below it. Try Multiply for shadows, Screen for light leaks, and Overlay for contrast."
      width="lg"
      onApply={() => onApply(mode)}
      testId="blend-mode-dialog"
      preview={
        <div
          role="img"
          aria-label={`Live preview of the ${selected.label} blend mode`}
          className="overflow-hidden rounded-lg border border-border/60 bg-secondary/30"
        >
          <canvas ref={canvasRef} className="block h-[190px] w-full" />
        </div>
      }
    >
      <div
        role="radiogroup"
        aria-label="Blend mode"
        className="grid grid-cols-2 gap-1.5 sm:grid-cols-3"
      >
        {STUDIO_BLEND_MODES.map((option, index) => {
          const active = option.value === mode;
          return (
            <button
              key={option.value}
              ref={(node) => {
                buttonRefs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={option.label}
              tabIndex={active ? 0 : -1}
              title={option.description}
              onClick={() => setMode(option.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                  event.preventDefault();
                  moveFocus(index, 1);
                } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  moveFocus(index, -1);
                } else if (event.key === 'Home') {
                  event.preventDefault();
                  setMode(STUDIO_BLEND_MODES[0].value);
                  buttonRefs.current[0]?.focus();
                } else if (event.key === 'End') {
                  event.preventDefault();
                  const last = STUDIO_BLEND_MODES.length - 1;
                  setMode(STUDIO_BLEND_MODES[last].value);
                  buttonRefs.current[last]?.focus();
                }
              }}
              className={cn(
                'flex min-h-10 flex-col items-start gap-0.5 rounded-md border px-2 py-1.5 text-left transition-colors',
                active
                  ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                  : 'border-border/50 hover:border-primary/40 hover:bg-muted/50',
              )}
            >
              <span className="flex w-full items-center justify-between gap-1 text-[11px] font-semibold text-foreground">
                {option.label}
                <span className="text-[9px] font-normal text-muted-foreground">
                  {option.group}
                </span>
              </span>
              <span className="line-clamp-2 text-[9px] leading-tight text-muted-foreground">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
    </FeatureDialog>
  );
}