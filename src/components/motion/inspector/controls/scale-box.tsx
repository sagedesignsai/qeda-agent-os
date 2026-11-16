/**
 * components/motion/inspector/controls/scale-box.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A bounding-box scale control: the rectangle is the node's footprint, and you
 * drag its edges (one axis) or corners (both axes) outwards to grow and inwards
 * to shrink. Shift, or the link toggle, makes any handle uniform.
 *
 * A 2D box can only show X and Y; Z stays on the numeric row. That is the same
 * compromise the position pad makes, and it keeps the panel honest about which
 * axes the mouse is touching.
 */

import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { LinkIcon, UnlinkIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { MotionVector3 } from '@/lib/motion/types';
import { cn } from '@/lib/utils';

/** Scale units applied across one full container width of dragging. */
const DRAG_UNITS = 1.5;
const MIN_SCALE = 0.01;
const MAX_SCALE = 100;
const KEY_STEP = 0.01;
/** Scale value that fills the box; anything above is drawn at full size. */
const DISPLAY_CEILING = 3;

type Handle = {
  id: string;
  label: string;
  /** -1 / 0 / 1 on each axis: which way is "outwards" for this handle. */
  x: -1 | 0 | 1;
  y: -1 | 0 | 1;
};

const HANDLES: readonly Handle[] = [
  { id: 'nw', label: 'Scale handle top-left', x: -1, y: -1 },
  { id: 'n', label: 'Scale handle top', x: 0, y: -1 },
  { id: 'ne', label: 'Scale handle top-right', x: 1, y: -1 },
  { id: 'e', label: 'Scale handle right', x: 1, y: 0 },
  { id: 'se', label: 'Scale handle bottom-right', x: 1, y: 1 },
  { id: 's', label: 'Scale handle bottom', x: 0, y: 1 },
  { id: 'sw', label: 'Scale handle bottom-left', x: -1, y: 1 },
  { id: 'w', label: 'Scale handle left', x: -1, y: 0 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function quantize(value: number): number {
  return Math.round(clamp(value, MIN_SCALE, MAX_SCALE) * 100) / 100;
}

function toPercent(value: number): number {
  return clamp(value / DISPLAY_CEILING, 0.08, 1) * 100;
}

export type ScaleBoxProps = {
  id: string;
  label?: string;
  value: MotionVector3;
  onChange: (value: MotionVector3) => void;
  /** Link all axes: every handle edits one uniform value. */
  uniform?: boolean;
  onUniformChange?: () => void;
  disabled?: boolean;
  className?: string;
};

export function ScaleBox({
  id,
  label = 'Scale canvas',
  value,
  onChange,
  uniform = false,
  onUniformChange,
  disabled = false,
  className,
}: ScaleBoxProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{
    startX: number;
    startY: number;
    width: number;
    height: number;
    origin: MotionVector3;
    handle: Handle;
  } | null>(null);
  const draftRef = useRef<MotionVector3 | null>(null);
  const [draft, setDraft] = useState<MotionVector3 | null>(null);

  const shown = draft ?? value;
  const [x, y, z] = shown;

  const updateDraft = (next: MotionVector3 | null) => {
    draftRef.current = next;
    setDraft(next);
  };

  const beginDrag = (handle: Handle, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.stopPropagation();
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      height: rect.height,
      origin: value,
      handle,
    };
    updateDraft(value);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    if (!state) return;
    const { handle, origin } = state;
    const dx = ((event.clientX - state.startX) / state.width) * DRAG_UNITS;
    // Screen Y grows downwards; a handle's sign flips it into "outwards".
    const dy = ((event.clientY - state.startY) / state.height) * DRAG_UNITS;
    const axisX = handle.x === 0 ? 0 : dx * handle.x;
    const axisY = handle.y === 0 ? 0 : dy * handle.y;

    if (uniform || event.shiftKey) {
      // Respect the link: the axis the pointer moved furthest wins, so a
      // corner drag feels proportional rather than double-counted.
      const delta = Math.abs(axisX) >= Math.abs(axisY) ? axisX : axisY;
      const next = quantize(origin[0] + delta);
      updateDraft([next, next, next]);
      return;
    }

    updateDraft([
      handle.x === 0 ? origin[0] : quantize(origin[0] + axisX),
      handle.y === 0 ? origin[1] : quantize(origin[1] + axisY),
      origin[2],
    ]);
  };

  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    const next = draftRef.current;
    updateDraft(null);
    if (!next) return;
    if (next[0] !== value[0] || next[1] !== value[1] || next[2] !== value[2]) {
      onChange(next);
    }
  };

  const nudge = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = event.shiftKey ? KEY_STEP * 10 : KEY_STEP;
    const adjust = (axes: ReadonlyArray<0 | 1 | 2>, delta: number) => {
      const next = [...value] as MotionVector3;
      for (const axis of axes) next[axis] = quantize(next[axis] + delta);
      return next;
    };
    // A linked box moves all axes together, matching what dragging does.
    const axis = (index: 0 | 1 | 2): ReadonlyArray<0 | 1 | 2> =>
      uniform ? [0, 1, 2] : [index];
    const all: ReadonlyArray<0 | 1 | 2> = [0, 1, 2];

    if (event.key === 'ArrowRight') onChange(adjust(axis(0), step));
    else if (event.key === 'ArrowLeft') onChange(adjust(axis(0), -step));
    else if (event.key === 'ArrowUp') onChange(adjust(axis(1), step));
    else if (event.key === 'ArrowDown') onChange(adjust(axis(1), -step));
    else if (event.key === '+' || event.key === '=') onChange(adjust(all, step));
    else if (event.key === '-' || event.key === '_') onChange(adjust(all, -step));
    else if (event.key === 'Home') onChange([1, 1, 1]);
    else return;

    event.preventDefault();
  };

  const reset = () => {
    if (!disabled) onChange([1, 1, 1]);
  };

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span className="ml-auto tabular-nums">
          {shown.map((axis) => axis.toFixed(2)).join(' · ')}
        </span>
        {onUniformChange && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="size-4"
            aria-pressed={uniform}
            aria-label={uniform ? 'Unlink scale axes' : 'Link scale axes'}
            title={uniform ? 'Unlink scale axes' : 'Link scale axes'}
            disabled={disabled}
            onClick={onUniformChange}
          >
            {uniform ? <LinkIcon className="size-3" /> : <UnlinkIcon className="size-3" />}
          </Button>
        )}
      </div>

      <div
        ref={boxRef}
        id={id}
        role="application"
        aria-label={label}
        aria-description="Drag an edge to scale one axis, a corner to scale two. Shift for uniform. Double-click to reset."
        tabIndex={disabled ? -1 : 0}
        onKeyDown={nudge}
        onDoubleClick={reset}
        className={cn(
          'relative mx-auto aspect-square w-full max-w-[170px] touch-none overflow-hidden rounded-lg border border-border/60 bg-background/60 outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          disabled ? 'opacity-50' : 'cursor-default',
        )}
      >
        {/* Origin guides. */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-border/30" />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-border/30" />

        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-sm border border-primary/50 bg-primary/10"
          style={{ left: '50%', top: '50%', width: `${toPercent(x)}%`, height: `${toPercent(y)}%` }}
        >
          {HANDLES.map((handle) => (
            <button
              key={handle.id}
              type="button"
              aria-label={handle.label}
              tabIndex={-1}
              disabled={disabled}
              onPointerDown={(event) => beginDrag(handle, event)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className={cn(
                'pointer-events-auto absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[3px] border border-primary/70 bg-background transition-colors',
                !disabled && 'hover:bg-primary focus-visible:bg-primary',
                (handle.x === 0 || handle.y === 0) && 'rounded-full',
              )}
              style={{ left: `${50 + handle.x * 50}%`, top: `${50 + handle.y * 50}%` }}
            />
          ))}
        </div>

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
