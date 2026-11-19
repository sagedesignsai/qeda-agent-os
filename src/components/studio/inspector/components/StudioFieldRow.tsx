/**
 * components/studio/inspector/components/StudioFieldRow.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Label + control row layout primitive for the Studio inspector.
 *
 * Fixed label width (~74px) with control column (~150px or wide variant).
 * 28px row height, items-center alignment.
 */

import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface StudioFieldRowProps {
  label: string;
  children: ReactNode;
  /** Let the control fill the row instead of a fixed 150px column. */
  wide?: boolean;
  className?: string;
}

export function StudioFieldRow({
  label,
  children,
  wide = false,
  className,
}: StudioFieldRowProps) {
  return (
    <div
      className={cn(
        'group/row flex items-center gap-2',
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
