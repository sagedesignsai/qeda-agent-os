/**
 * components/motion/inspector/controls/scrub-number.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Numeric inspector input with drag-to-scrub, the interaction 3D and motion
 * editors use for transforms. The value is drafted while the pointer moves and
 * committed once on release, so dragging is one undoable op rather than one per
 * pointer event.
 *
 * Axis identity comes from the chart tokens rather than raw palette ramps so the
 * X/Y/Z colours follow the theme.
 */

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type ScrubAxis = 'x' | 'y' | 'z';

const AXIS_COLOR: Record<ScrubAxis, string> = {
  x: 'var(--chart-5)',
  y: 'var(--chart-3)',
  z: 'var(--chart-1)',
};

function clamp(value: number, min?: number, max?: number): number {
  return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));
}

function decimalsFor(step?: number): number {
  if (!step || !Number.isFinite(step)) return 4;
  const text = String(step);
  if (text.includes('e-')) return Number(text.split('e-')[1]);
  const [, fraction] = text.split('.');
  return fraction ? fraction.length : 0;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export type ScrubNumberFieldProps = {
  id?: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  axis?: ScrubAxis;
  align?: 'left' | 'center' | 'right';
  className?: string;
};

export function ScrubNumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
  disabled = false,
  axis,
  align = 'center',
  className,
}: ScrubNumberFieldProps) {
  const decimals = decimalsFor(step);
  const hasStep = Boolean(step && step > 0);
  const format = (next: number) =>
    hasStep ? String(roundTo(next, decimals)) : String(next);
  const normalize = (next: number) => {
    const bounded = clamp(next, min, max);
    return hasStep ? roundTo(bounded, decimals) : bounded;
  };

  const [draft, setDraft] = useState(() => format(value));
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startValue: number } | null>(null);
  const dragValue = useRef<number | null>(null);

  useEffect(() => setDraft(format(value)), [value]);

  const commit = (next: number) => {
    const normalized = normalize(next);
    setDraft(format(normalized));
    if (normalized !== value) onChange(normalized);
  };

  const commitDraft = () => {
    const parsed = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(parsed)) {
      setDraft(format(value));
      return;
    }
    commit(parsed);
  };

  // Steps are already sensible per-pixel increments; without one, map a
  // reasonable range onto the width of a typical inspector column.
  const perPixel = hasStep
    ? step!
    : (() => {
        const span = (max ?? 1) - (min ?? 0);
        return span > 0 ? span / 200 : 0.01;
      })();

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { startX: event.clientX, startValue: value };
    dragValue.current = value;
    setDragging(true);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    if (!state) return;
    const raw = state.startValue + (event.clientX - state.startX) * perPixel;
    // Keep scrub increments readable even when the prop has no explicit step.
    const next = normalize(roundTo(raw, hasStep ? decimals : 3));
    dragValue.current = next;
    setDraft(format(next));
  };

  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    const next = dragValue.current;
    dragValue.current = null;
    if (next === null) return;
    setDraft(format(next));
    if (next !== value) onChange(next);
  };

  return (
    <div
      className={cn(
        'flex h-7 min-w-0 items-center rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30',
        dragging && 'border-ring bg-accent/30',
        disabled && 'opacity-50',
        className,
      )}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={`${label} scrub handle`}
        title={`Drag ${label} to scrub`}
        disabled={disabled}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={cn(
          'flex h-full w-4 shrink-0 touch-none items-center justify-center rounded-l-lg border-r border-border/40 text-[9px] font-semibold uppercase select-none',
          axis ? 'cursor-ew-resize' : 'cursor-ew-resize text-muted-foreground',
          disabled && 'cursor-not-allowed',
        )}
        style={axis ? { color: AXIS_COLOR[axis] } : undefined}
      >
        {axis ?? '↔'}
      </button>
      <Input
        id={id}
        aria-label={label}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step ?? 'any'}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        className={cn(
          'h-6 min-w-0 flex-1 rounded-none border-0 bg-transparent px-1 text-xs tabular-nums shadow-none focus-visible:ring-0 dark:bg-transparent',
          align === 'left' && 'text-left',
          align === 'center' && 'text-center',
          align === 'right' && 'text-right',
        )}
      />
    </div>
  );
}
