/**
 * components/motion/inspector/controls/segmented-select.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A segmented control for enums that fit in one row (alignment, fit). Short
 * enumerations are faster to scan as mutually exclusive buttons than as a select
 * that hides every alternative until it is opened.
 */

import { Field, FieldLabel } from '@/components/ui/field';
import { cn } from '@/lib/utils';

export type SegmentedOption = { value: string; label: string };

export type SegmentedSelectProps = {
  id: string;
  label: string;
  value: string;
  options: readonly SegmentedOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
};

export function SegmentedSelect({
  id,
  label,
  value,
  options,
  disabled = false,
  onChange,
}: SegmentedSelectProps) {
  const hasUnlistedValue =
    value !== '' && !options.some((option) => option.value === value);

  return (
    <Field className="gap-1">
      <FieldLabel id={`${id}-label`} className="text-[10px] text-muted-foreground">
        {label}
      </FieldLabel>
      <div
        id={id}
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        className="grid gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-0.5"
        style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(options.length, 1), 4)}, minmax(0, 1fr))` }}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            disabled={disabled}
            onClick={() => {
              if (option.value !== value) onChange(option.value);
            }}
            className={cn(
              'rounded-md px-1.5 py-1 text-[10px] font-medium transition-colors',
              value === option.value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
              disabled && 'opacity-50',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {hasUnlistedValue && (
        <p className="text-[9px] text-muted-foreground">
          Current value unavailable ({value})
        </p>
      )}
    </Field>
  );
}
