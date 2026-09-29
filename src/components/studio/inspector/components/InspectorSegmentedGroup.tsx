/**
 * components/studio/inspector/components/InspectorSegmentedGroup.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Segmented pill button group for discrete property options:
 *   - Aspect ratios, camera easing curves, caption styles, drop shadows
 *   - Active state styling with subtle elevation and border highlight
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { Button } from '@/components/ui/button';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  tooltip?: string;
}

interface InspectorSegmentedGroupProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (val: T) => void;
  className?: string;
  cols?: number;
}

export function InspectorSegmentedGroup<T extends string>({
  options,
  value,
  onChange,
  className = '',
  cols,
}: InspectorSegmentedGroupProps<T>) {
  const gridStyle = cols
    ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }
    : { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` };

  return (
    <div
      style={gridStyle}
      className={`grid gap-1 p-0.5 rounded-lg bg-secondary/50 border border-border/40 select-none ${className}`}
    >
      {options.map((opt) => {
        const isActive = value === opt.value;
        return (
          <Button
            key={opt.value}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(opt.value)}
            title={opt.tooltip || opt.label}
            className={`h-7 px-2 text-xs font-medium gap-1.5 transition-all rounded-md cursor-pointer ${
              isActive
                ? 'bg-background text-foreground shadow-2xs border border-border/50 font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
            }`}
          >
            {opt.icon && (
              <span
                className={`shrink-0 ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {opt.icon}
              </span>
            )}
            <span className="truncate">{opt.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
