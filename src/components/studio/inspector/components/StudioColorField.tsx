/**
 * components/studio/inspector/components/StudioColorField.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Compact color swatch + hex text input for the Studio inspector.
 *
 * Single 28px row: color swatch (16px) + hex input.
 * Native color picker overlay on swatch click. Hex validation,
 * draft value during edit, Enter to commit, Escape to revert.
 */

import { useState } from 'react';

import { cn } from '@/lib/utils';

const HEX_COLOR = /^#[0-9a-f]{3,8}$/i;
const FALLBACK_SWATCH =
  'linear-gradient(135deg, #38bdf8 25%, #0ea5e9 25% 50%, #38bdf8 50% 75%, #0ea5e9 75%)';

export interface StudioColorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function StudioColorField({
  label,
  value,
  onChange,
  className,
}: StudioColorFieldProps) {
  const plain = HEX_COLOR.test(value);
  const [draft, setDraft] = useState(value);
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
    </div>
  );
}
