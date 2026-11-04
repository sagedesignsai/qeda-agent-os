/**
 * components/motion/inspector/controls/vector-field.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A vector as a row of scrubbable axis fields. Kept value-shape agnostic so the
 * same row serves a 3D transform and a 2D layout vector; the renderer owns the
 * cast back to its document tuple.
 */

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { ScrubNumberField, type ScrubAxis } from './scrub-number';

const DEFAULT_AXES: readonly ScrubAxis[] = ['x', 'y', 'z'];

export type VectorFieldProps = {
  id: string;
  label: string;
  value: readonly number[];
  onChange: (value: number[]) => void;
  mixed?: boolean;
  disabled?: boolean;
  step?: number;
  min?: number;
  max?: number;
  axes?: readonly ScrubAxis[];
  action?: ReactNode;
  className?: string;
};

export function VectorField({
  id,
  label,
  value,
  onChange,
  mixed = false,
  disabled = false,
  step,
  min,
  max,
  axes = DEFAULT_AXES,
  action,
  className,
}: VectorFieldProps) {
  const commit = (axis: ScrubAxis, next: number) => {
    const index = axes.indexOf(axis);
    if (index === -1) return;
    onChange(axes.map((_, itemIndex) => (itemIndex === index ? next : value[itemIndex] ?? 0)));
  };

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex min-h-4 items-center gap-2 text-[10px] text-muted-foreground">
        <span>{label}</span>
        {mixed && <span className="text-[9px] font-normal">Mixed</span>}
        {action && <span className="ml-auto flex items-center">{action}</span>}
      </div>
      <div
        className={cn(
          'grid gap-1',
          axes.length === 2 ? 'grid-cols-2' : axes.length === 1 ? 'grid-cols-1' : 'grid-cols-3',
        )}
      >
        {axes.map((axis) => (
          <ScrubNumberField
            key={axis}
            id={`${id}-${axis}`}
            label={`${label} ${axis.toUpperCase()}`}
            value={value[axes.indexOf(axis)] ?? 0}
            step={step}
            min={min}
            max={max}
            axis={axis}
            disabled={disabled}
            onChange={(next) => commit(axis, next)}
          />
        ))}
      </div>
    </div>
  );
}
