/**
 * components/studio/inspector/components/StudioPairRow.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Two fields side-by-side with optional link toggle in the center.
 *
 * Grid layout: two equal columns without link, or three columns with auto-sized
 * center slot when a link toggle is present.
 */

import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface StudioPairRowProps {
  left: ReactNode;
  right: ReactNode;
  /** Optional link toggle rendered between the two fields. */
  link?: ReactNode;
  className?: string;
}

export function StudioPairRow({
  left,
  right,
  link,
  className,
}: StudioPairRowProps) {
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
      {link ? (
        <div className="flex items-center justify-center">{link}</div>
      ) : null}
      {right}
    </div>
  );
}
