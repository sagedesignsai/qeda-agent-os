/**
 * components/studio/inspector/components/InspectorSliderInput.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Dual slider & numerical text input component for tactile property scrubbing:
 *   - Continuous slider track with hover glow
 *   - Monospace numeric input with explicit unit tag (px, %, x, ms, s)
 *   - Clamped bounds with min/max enforcement
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect } from 'react';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { InspectorFieldRow } from './InspectorFieldRow';

interface InspectorSliderInputProps {
  label: string;
  icon?: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  formatValue?: (val: number) => string;
  onChange: (val: number) => void;
  className?: string;
}

export function InspectorSliderInput({
  label,
  icon,
  value,
  min,
  max,
  step = 1,
  unit = '',
  formatValue,
  onChange,
  className = '',
}: InspectorSliderInputProps) {
  const [localInput, setLocalInput] = useState(String(value));

  useEffect(() => {
    setLocalInput(String(value));
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalInput(e.target.value);
  };

  const handleInputBlur = () => {
    const parsed = parseFloat(localInput);
    if (isNaN(parsed)) {
      setLocalInput(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, parsed));
    onChange(clamped);
    setLocalInput(String(clamped));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleInputBlur();
      e.currentTarget.blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(max, (parseFloat(localInput) || value) + step);
      onChange(next);
      setLocalInput(String(next));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const prev = Math.max(min, (parseFloat(localInput) || value) - step);
      onChange(prev);
      setLocalInput(String(prev));
    }
  };

  const formattedReadout = formatValue ? formatValue(value) : `${value}${unit}`;

  return (
    <InspectorFieldRow
      label={label}
      icon={icon}
      readout={formattedReadout}
      className={className}
    >
      <div className="flex items-center gap-2.5">
        <Slider
          value={[value]}
          min={min}
          max={max}
          step={step}
          onValueChange={([val]) => onChange(val)}
          className="flex-1 cursor-pointer"
        />
        <div className="flex w-18 items-center gap-0.5 rounded-md border border-border/70 px-1.5 py-0.5 bg-background shadow-2xs shrink-0 focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/30 transition-all">
          <Input
            type="number"
            min={min}
            max={max}
            step={step}
            value={localInput}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            className="h-5 w-full border-0 p-0 text-right text-xs focus-visible:ring-0 shadow-none font-mono text-foreground"
          />
          {unit && (
            <span className="text-[10px] text-muted-foreground font-mono select-none">
              {unit}
            </span>
          )}
        </div>
      </div>
    </InspectorFieldRow>
  );
}
