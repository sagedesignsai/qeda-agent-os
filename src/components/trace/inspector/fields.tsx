/**
 * components/trace/inspector/fields.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Layout primitives shared by every Trace inspector section: labelled rows,
 * paired fields with a link toggle, the animation stopwatch, the compact
 * color field, and the alignment segmented control.
 *
 * Keeping these here means sections describe *what* they edit, while spacing,
 * hover states and the stopwatch placement stay identical panel-wide.
 */

import { useState } from 'react';
import {
  AlignCenterHorizontalIcon,
  AlignCenterVerticalIcon,
  AlignEndHorizontalIcon,
  AlignEndVerticalIcon,
  AlignStartHorizontalIcon,
  AlignStartVerticalIcon,
  ClockIcon,
  Link2Icon,
  UnlinkIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { AnimatableProperty, TraceElement } from '@/lib/trace/types';
import { useTraceStore } from '@/stores/trace-store';
import { cn } from '@/lib/utils';

/* ── Rows ─────────────────────────────────────────────────────────────────── */

export function FieldRow({
  label,
  children,
  wide = false,
  align = 'center',
  className,
}: {
  label: string;
  children: React.ReactNode;
  /** Let the control fill the row instead of a fixed 150px column. */
  wide?: boolean;
  align?: 'center' | 'start';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'group/row flex gap-2',
        align === 'start' ? 'items-start' : 'items-center',
        className,
      )}
    >
      <span
        title={label}
        className={cn(
          'truncate text-[11px] leading-7 text-muted-foreground',
          wide ? 'w-[74px] shrink-0' : 'min-w-0 flex-1',
        )}
      >
        {label}
      </span>
      <div className={cn('min-w-0', wide ? 'flex-1' : 'w-[150px] shrink-0')}>
        {children}
      </div>
    </div>
  );
}

export function PairRow({
  left,
  right,
  link,
  className,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  link?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid items-center gap-1.5',
        link
          ? 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]'
          : 'grid-cols-2',
        className,
      )}
    >
      {left}
      {link ? <div className="flex items-center justify-center">{link}</div> : null}
      {right}
    </div>
  );
}

/* ── Stopwatch ────────────────────────────────────────────────────────────── */

export function TrackButton({
  element,
  property,
  label,
  className,
}: {
  element: TraceElement;
  property: AnimatableProperty;
  label: string;
  className?: string;
}) {
  const togglePropertyTrack = useTraceStore(
    (state) => state.togglePropertyTrack,
  );
  const hasTrack = element.tracks.some(
    (track) => track.property === property,
  );
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        togglePropertyTrack(element.id, property);
      }}
      title={hasTrack ? `Remove ${label} track` : `Animate ${label}`}
      aria-label={hasTrack ? `Remove ${label} track` : `Animate ${label}`}
      aria-pressed={hasTrack}
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/50 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
        hasTrack
          ? 'text-sky-400 opacity-100 hover:text-sky-300'
          : 'opacity-40 hover:opacity-100 group-hover/row:opacity-100 group-focus-within/row:opacity-100 group-hover/scrub:opacity-100 group-focus-within/scrub:opacity-100',
        className,
      )}
    >
      <ClockIcon className="size-3" />
    </button>
  );
}

/* ── Link toggle ──────────────────────────────────────────────────────────── */

export function LinkToggle({
  linked,
  onToggle,
  label,
}: {
  linked: boolean;
  onToggle: () => void;
  label: string;
}) {
  const title = linked ? `Unlink ${label}` : `Link ${label}`;
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      aria-pressed={linked}
      aria-label={title}
      title={title}
      onClick={onToggle}
      className={cn(
        'size-6 rounded-md',
        linked
          ? 'text-sky-400 hover:text-sky-300'
          : 'text-muted-foreground/60 hover:text-foreground',
      )}
    >
      {linked ? (
        <Link2Icon className="size-3" />
      ) : (
        <UnlinkIcon className="size-3" />
      )}
    </Button>
  );
}

/* ── Color ───────────────────────────────────────────────────────────────── */

const HEX_COLOR = /^#[0-9a-f]{3,8}$/i;
const FALLBACK_SWATCH =
  'linear-gradient(135deg, #38bdf8 25%, #0ea5e9 25% 50%, #38bdf8 50% 75%, #0ea5e9 75%)';

export function ColorField({
  label,
  value,
  onChange,
  trailing,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  trailing?: React.ReactNode;
  className?: string;
}) {
  const plain = HEX_COLOR.test(value);
  const [draft, setDraft] = useState(value);
  // Keep the hex draft in step with the playhead-resolved value.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }

  const apply = (next: string) => {
    setDraft(next);
    if (next && next !== value) onChange(next);
  };

  return (
    <div
      className={cn(
        'flex h-7 min-w-0 items-center gap-1 rounded-md border border-input bg-muted/20 pl-1 pr-0.5 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25',
        className,
      )}
    >
      <label
        className="relative size-4 shrink-0 cursor-pointer overflow-hidden rounded-[3px] ring-1 ring-black/20 ring-inset"
        title={`${label} color`}
      >
        <span
          className="absolute inset-0"
          style={{ background: plain ? value : FALLBACK_SWATCH }}
        />
        <input
          type="color"
          value={plain ? value : '#38bdf8'}
          onChange={(event) => apply(event.target.value)}
          aria-label={`${label} color picker`}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const next = draft.trim();
          if (next && next !== value) onChange(next);
          else setDraft(value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setDraft(value);
            event.currentTarget.blur();
          }
        }}
        aria-label={`${label} hex`}
        spellCheck={false}
        className="h-full min-w-0 flex-1 bg-transparent px-1 font-mono text-[11px] uppercase text-foreground outline-none"
      />
      {trailing}
    </div>
  );
}

/* ── Alignment ────────────────────────────────────────────────────────────── */

export type AlignKind =
  | 'left'
  | 'centerH'
  | 'right'
  | 'top'
  | 'centerV'
  | 'bottom';

const ALIGNMENTS: Array<{
  kind: AlignKind;
  label: string;
  Icon: typeof AlignStartVerticalIcon;
}> = [
  { kind: 'left', label: 'Align left to artboard', Icon: AlignStartVerticalIcon },
  {
    kind: 'centerH',
    label: 'Align centre horizontally',
    Icon: AlignCenterVerticalIcon,
  },
  {
    kind: 'right',
    label: 'Align right to artboard',
    Icon: AlignEndVerticalIcon,
  },
  { kind: 'top', label: 'Align top to artboard', Icon: AlignStartHorizontalIcon },
  {
    kind: 'centerV',
    label: 'Align centre vertically',
    Icon: AlignCenterHorizontalIcon,
  },
  {
    kind: 'bottom',
    label: 'Align bottom to artboard',
    Icon: AlignEndHorizontalIcon,
  },
];

export function AlignGroup({
  onAlign,
}: {
  onAlign: (kind: AlignKind) => void;
}) {
  return (
    <div className="grid grid-cols-6 overflow-hidden rounded-md border border-input bg-muted/20">
      {ALIGNMENTS.map(({ kind, label, Icon }) => (
        <button
          key={kind}
          type="button"
          onClick={() => onAlign(kind)}
          title={label}
          aria-label={label}
          className="flex h-7 items-center justify-center border-r border-border/50 text-muted-foreground outline-none transition-colors last:border-r-0 hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground"
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
