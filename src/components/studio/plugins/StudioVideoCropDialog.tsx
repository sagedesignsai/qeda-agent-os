/**
 * components/studio/plugins/StudioVideoCropDialog.tsx
 */
import { useEffect, useRef, useState } from 'react';
import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { StudioVideoCrop } from '@/lib/studio-types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoUrl: string | null;
  videoCrop?: StudioVideoCrop | null;
  onApply: (crop: StudioVideoCrop | null) => void | Promise<void>;
}

function clamp(v: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, v));
}

function normalizeCrop(c: StudioVideoCrop): StudioVideoCrop {
  let x = clamp(c.x);
  let y = clamp(c.y);
  let width = clamp(c.width, 0.01, 1);
  let height = clamp(c.height, 0.01, 1);
  if (x + width > 1) width = 1 - x;
  if (y + height > 1) height = 1 - y;
  if (width < 0.01) width = 0.01;
  if (height < 0.01) height = 0.01;
  return { x, y, width, height };
}

export function StudioVideoCropDialog({
  open,
  onOpenChange,
  videoUrl,
  videoCrop,
  onApply,
}: Props) {
  const [crop, setCrop] = useState<StudioVideoCrop>(
    videoCrop ? normalizeCrop(videoCrop) : { x: 0, y: 0, width: 1, height: 1 },
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    mode: 'move' | 'draw' | 'resize';
    handle?: string;
    startPointer: { x: number; y: number };
    startCrop: StudioVideoCrop;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setCrop(
        videoCrop ? normalizeCrop(videoCrop) : { x: 0, y: 0, width: 1, height: 1 },
      );
    }
  }, [open, videoCrop]);

  const toNorm = (e: { clientX: number; clientY: number }) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clamp((e.clientX - rect.left) / rect.width),
      y: clamp((e.clientY - rect.top) / rect.height),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = toNorm(e);
    const target = e.target as HTMLElement;
    const handle = target.getAttribute('data-handle') || undefined;
    const inside =
      p.x >= crop.x &&
      p.x <= crop.x + crop.width &&
      p.y >= crop.y &&
      p.y <= crop.y + crop.height;

    if (handle) {
      dragRef.current = {
        mode: 'resize',
        handle,
        startPointer: p,
        startCrop: crop,
      };
    } else if (inside) {
      dragRef.current = {
        mode: 'move',
        startPointer: p,
        startCrop: crop,
      };
    } else {
      const nc = { x: p.x, y: p.y, width: 0.01, height: 0.01 };
      setCrop(nc);
      dragRef.current = {
        mode: 'draw',
        startPointer: p,
        startCrop: nc,
      };
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const p = toNorm(e);
    const dx = p.x - d.startPointer.x;
    const dy = p.y - d.startPointer.y;
    const sc = d.startCrop;
    if (d.mode === 'move') {
      setCrop(
        normalizeCrop({
          x: sc.x + dx,
          y: sc.y + dy,
          width: sc.width,
          height: sc.height,
        }),
      );
    } else if (d.mode === 'draw') {
      const x = Math.min(d.startPointer.x, p.x);
      const y = Math.min(d.startPointer.y, p.y);
      const w = Math.abs(p.x - d.startPointer.x);
      const h = Math.abs(p.y - d.startPointer.y);
      setCrop(normalizeCrop({ x, y, width: Math.max(0.01, w), height: Math.max(0.01, h) }));
    } else if (d.mode === 'resize' && d.handle) {
      const hh = d.handle;
      let { x, y, width, height } = sc;
      if (hh.includes('e')) width = Math.max(0.01, sc.width + dx);
      if (hh.includes('s')) height = Math.max(0.01, sc.height + dy);
      if (hh.includes('w')) {
        x = sc.x + dx;
        width = Math.max(0.01, sc.width - dx);
      }
      if (hh.includes('n')) {
        y = sc.y + dy;
        height = Math.max(0.01, sc.height - dy);
      }
      setCrop(normalizeCrop({ x, y, width, height }));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleApply = async () => {
    await onApply(normalizeCrop(crop));
    onOpenChange(false);
  };

  const handleReset = async () => {
    await onApply(null);
    onOpenChange(false);
  };

  const handleFull = () => {
    setCrop({ x: 0, y: 0, width: 1, height: 1 });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-none max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Crop video region</DialogTitle>
        </DialogHeader>
        <div
          ref={containerRef}
          className="relative w-full max-h-[60vh] aspect-video bg-black overflow-hidden rounded-md select-none touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {videoUrl && (
            <video
              src={videoUrl}
              muted
              playsInline
              autoPlay
              loop
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            />
          )}
          <div
            className="absolute border-2 border-primary bg-primary/10"
            style={{
              left: `${crop.x * 100}%`,
              top: `${crop.y * 100}%`,
              width: `${crop.width * 100}%`,
              height: `${crop.height * 100}%`,
            }}
          >
            {['nw', 'ne', 'sw', 'se'].map((hh) => (
              <div
                key={hh}
                data-handle={hh}
                className="absolute size-3 bg-primary border border-background rounded-sm"
                style={{
                  left: hh.includes('w') ? -6 : undefined,
                  right: hh.includes('e') ? -6 : undefined,
                  top: hh.includes('n') ? -6 : undefined,
                  bottom: hh.includes('s') ? -6 : undefined,
                }}
              />
            ))}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={handleFull}>
            Full frame
          </Button>
          <Button variant="ghost" size="sm" onClick={handleReset}>
            Reset (clear)
          </Button>
          <Button size="sm" onClick={handleApply}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
