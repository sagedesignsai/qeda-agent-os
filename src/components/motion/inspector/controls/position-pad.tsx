/**
 * components/motion/inspector/controls/position-pad.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A top-down cartesian pad for the X/Y half of a position. Dragging jumps the
 * handle to the pointer (the direct-manipulation model motion designers expect),
 * Shift locks the dominant axis, and Escape-free release commits once.
 *
 * The numeric vector row stays next to it: a canvas is faster to aim, but text
 * is how you set an exact value or use a keyboard.
 */

import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import type { MotionVector3 } from '@/lib/motion/types';
import { cn } from '@/lib/utils';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function snap(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function toPercent(value: number, extent: number): number {
  return ((clamp(value, -extent, extent) / extent) + 1) * 50;
}

export type PositionPadProps = {
  id: string;
  label?: string;
  value: MotionVector3;
  onChange: (value: MotionVector3) => void;
  disabled?: boolean;
  extent?: number;
  step?: number;
  className?: string;
};

export function PositionPad({
  id,
  label = 'Position plane',
  value,
  onChange,
  disabled = false,
  extent = 5,
  step = 0.05,
  className,
}: PositionPadProps) {
  const padRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const draftRef = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);

  const [x, y, z] = value;
  const shownX = draft?.x ?? x;
  const shownY = draft?.y ?? y;

  const updateDraft = (point: { x: number; y: number } | null) => {
    draftRef.current = point;
    setDraft(point);
  };

  const pointFromEvent = (event: ReactPointerEvent<HTMLElement>) => {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    const nx = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
    const ny = -clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
    return {
      x: snap(clamp(nx * extent, -extent, extent), step),
      y: snap(clamp(ny * extent, -extent, extent), step),
    };
  };

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: point.x,
      originY: point.y,
    };
    updateDraft(point);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    const point = pointFromEvent(event);
    if (!point) return;
    if (event.shiftKey) {
      const dx = Math.abs(event.clientX - state.startX);
      const dy = Math.abs(event.clientY - state.startY);
      updateDraft({
        x: dx >= dy ? point.x : state.originX,
        y: dx >= dy ? state.originY : point.y,
      });
      return;
    }
    updateDraft(point);
  };

  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    const next = draftRef.current;
    updateDraft(null);
    if (!next) return;
    if (next.x !== x || next.y !== y) onChange([next.x, next.y, z]);
  };

  const nudge = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const delta = event.shiftKey ? step * 10 : step;
    let nextX = x;
    let nextY = y;
    if (event.key === 'ArrowLeft') nextX = clamp(x - delta, -extent, extent);
    else if (event.key === 'ArrowRight') nextX = clamp(x + delta, -extent, extent);
    else if (event.key === 'ArrowUp') nextY = clamp(y + delta, -extent, extent);
    else if (event.key === 'ArrowDown') nextY = clamp(y - delta, -extent, extent);
    else if (event.key === 'Home') {
      nextX = 0;
      nextY = 0;
    } else {
      return;
    }
    event.preventDefault();
    onChange([snap(nextX, step), snap(nextY, step), z]);
  };

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">
          {shownX.toFixed(2)} · {shownY.toFixed(2)}
        </span>
      </div>
      <div
        ref={padRef}
        id={id}
        role="application"
        aria-label={label}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={nudge}
        onDoubleClick={() => {
          if (!disabled && (x !== 0 || y !== 0)) onChange([0, 0, z]);
        }}
        className={cn(
          'relative mx-auto aspect-square w-full max-w-[160px] touch-none overflow-hidden rounded-lg border border-border/60 bg-background/60 outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          disabled ? 'opacity-50' : 'cursor-crosshair',
        )}
      >
        {/* Quarter guides and the origin crosshair. */}
        <div className="pointer-events-none absolute inset-y-0 left-1/4 w-px bg-border/25" />
        <div className="pointer-events-none absolute inset-y-0 left-3/4 w-px bg-border/25" />
        <div className="pointer-events-none absolute inset-x-0 top-1/4 h-px bg-border/25" />
        <div className="pointer-events-none absolute inset-x-0 top-3/4 h-px bg-border/25" />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-border/70" />
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-border/70" />
        <div
          className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-primary/30"
          style={{ left: `${toPercent(shownX, extent)}%`, top: `${100 - toPercent(shownY, extent)}%` }}
        />
        <span className="pointer-events-none absolute bottom-1 left-1.5 text-[8px] uppercase tracking-wide text-muted-foreground">
          x
        </span>
        <span className="pointer-events-none absolute left-1.5 top-1 text-[8px] uppercase tracking-wide text-muted-foreground">
          y
        </span>
      </div>
    </div>
  );
}
