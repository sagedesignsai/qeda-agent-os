/**
 * components/trace/inspector/scrub-field.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The compact numeric control every Trace inspector row is built from.
 *
 * One flat field: a scrub handle on the left (axis letter, unit glyph or icon),
 * the value, an optional unit suffix, and an optional trailing slot used for
 * the animation stopwatch. Drag the handle to scrub; the value is drafted while
 * the pointer moves and committed once on release, so a scrub is a single
 * undoable op. Arrow keys step, Enter commits, Escape reverts.
 */

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { MoveHorizontalIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

const TONE_COLOR = {
  x: 'var(--chart-5)',
  y: 'var(--chart-3)',
} as const;

export type ScrubTone = keyof typeof TONE_COLOR | 'neutral';

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

export type ScrubFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** Glyph shown in the scrub handle. Defaults to a horizontal-scrub icon. */
  prefix?: ReactNode;
  /** Unit rendered after the value, e.g. "°" or "%". */
  suffix?: string;
  /** Axis color applied to a text prefix. */
  tone?: ScrubTone;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** Trailing slot, used for the animation stopwatch. */
  trailing?: ReactNode;
  className?: string;
};

export function ScrubField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  tone = 'neutral',
  min,
  max,
  step,
  disabled = false,
  trailing,
  className,
}: ScrubFieldProps) {
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
    const raw =
      state.startValue +
      (event.clientX - state.startX) *
        perPixel *
        (event.shiftKey ? 10 : 1);
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

  const stepBy = (direction: 1 | -1, multiplier: number) => {
    const typed = Number(draft);
    const start = draft.trim() !== '' && Number.isFinite(typed) ? typed : value;
    const next = normalize(start + direction * (step ?? 1) * multiplier);
    setDraft(format(next));
    if (next !== value) onChange(next);
  };

  const toneColor = tone === 'neutral' ? undefined : TONE_COLOR[tone];

  return (
    <div
      className={cn(
        'group/scrub flex h-7 min-w-0 items-center rounded-md border border-input bg-muted/20 pr-0.5 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25',
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
          'flex h-full shrink-0 touch-none items-center justify-center gap-0.5 rounded-l-md border-r border-border/50 px-1.5 text-[9px] font-semibold uppercase select-none',
          tone === 'neutral'
            ? 'text-muted-foreground'
            : 'cursor-ew-resize',
          disabled ? 'cursor-not-allowed' : 'cursor-ew-resize',
        )}
        style={toneColor ? { color: toneColor } : undefined}
      >
        {prefix ?? <MoveHorizontalIcon className="size-3" />}
      </button>
      <input
        aria-label={label}
        inputMode="decimal"
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
            return;
          }
          if (event.key === 'Escape') {
            setDraft(format(value));
            event.currentTarget.blur();
            return;
          }
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            stepBy(
              event.key === 'ArrowUp' ? 1 : -1,
              event.shiftKey ? 10 : 1,
            );
          }
        }}
        className="h-full min-w-0 flex-1 bg-transparent px-1.5 text-right text-[11px] tabular-nums text-foreground outline-none placeholder:text-muted-foreground"
      />
      {suffix ? (
        <span className="shrink-0 pr-1.5 text-[9px] text-muted-foreground">
          {suffix}
        </span>
      ) : null}
      {trailing}
    </div>
  );
}
