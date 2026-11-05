/**
 * components/motion/inspector/controls/color-field.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Colour editing for Motion props: the native swatch for free selection, a hex
 * field for exact values, and a small preset palette for the colours scenes
 * actually reuse. Hex validation lives here so the document never receives a
 * colour string a renderer has to guess at.
 */

import { useEffect, useState } from 'react';
import { PaletteIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

/** Common scene colours; values, not Tailwind classes, so they are exact. */
const PRESETS = [
  '#ffffff',
  '#e5e7eb',
  '#9ca3af',
  '#4b5563',
  '#111827',
  '#000000',
  '#5885f7',
  '#22d3ee',
  '#34d399',
  '#fbbf24',
  '#fb7185',
  '#a78bfa',
];

function isHexColor(value: string): boolean {
  return /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value.trim());
}

function isOklchColor(value: string): boolean {
  return /^oklch\([^)]*\)$/i.test(value.trim());
}

function isColor(value: string): boolean {
  return isHexColor(value) || isOklchColor(value);
}

function toHexByte(n: number): string {
  return Math.round(n).toString(16).padStart(2, '0');
}

function parseHex(value: string): string | null {
  if (/^#[\da-f]{6}$/i.test(value)) return value;
  if (/^#[\da-f]{3}$/i.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  return null;
}

function parseRgb(value: string): string | null {
  const m = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (!m) return null;
  return `#${toHexByte(Number(m[1]))}${toHexByte(Number(m[2]))}${toHexByte(Number(m[3]))}`;
}

function toHexColor(value: string): string {
  const trimmed = value.trim();
  const direct = parseHex(trimmed) ?? parseRgb(trimmed);
  if (direct) return direct;
  if (isOklchColor(trimmed) || trimmed.startsWith('color(') || trimmed.startsWith('lab(') || trimmed.startsWith('lch(')) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = trimmed;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
      }
    } catch {
      // fall through
    }
  }
  return '#ffffff';
}

export type ColorFieldProps = {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

export function ColorField({
  id,
  label,
  value,
  disabled = false,
  onChange,
}: ColorFieldProps) {
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);

  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const next = draft.trim();
    // Reject anything that is not a colour literal instead of writing an
    // invalid colour into the document and letting the renderer guess.
    if (!isColor(next)) {
      setDraft(value);
      return;
    }
    if (next !== value) onChange(next);
  };

  const applyPreset = (preset: string) => {
    setDraft(preset);
    setOpen(false);
    if (preset !== value) onChange(preset);
  };

  return (
    <Field className="gap-1">
      <FieldLabel htmlFor={id} className="text-[10px] text-muted-foreground">
        {label}
      </FieldLabel>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          aria-label={`${label} color picker`}
          value={toHexColor(draft)}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            if (isHexColor(next) && next !== value) onChange(next);
          }}
          className="size-7 shrink-0 cursor-pointer appearance-none overflow-hidden rounded border border-input bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-moz-color-swatch]:border-none"
        />
        <Input
          id={id}
          type="text"
          value={draft}
          disabled={disabled}
          aria-invalid={!isColor(draft)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          className="h-7 text-xs"
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={`${label} color presets`}
              title={`${label} presets`}
              disabled={disabled}
              className="size-7 shrink-0"
            >
              <PaletteIcon className="size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-2">
            <div className="grid grid-cols-6 gap-1">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-label={`${label} preset ${preset}`}
                  title={preset}
                  aria-pressed={toHexColor(value) === preset}
                  onClick={() => applyPreset(preset)}
                  className="size-5 rounded border border-border/60 outline-none ring-offset-2 ring-offset-popover hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring aria-pressed:ring-2 aria-pressed:ring-ring"
                  style={{ backgroundColor: preset }}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </Field>
  );
}
