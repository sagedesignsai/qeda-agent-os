/**
 * components/studio/inspector/components/InspectorSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Collapsible accordion section container for the Studio Inspector.
 * Inspired by the Document Inspector section architecture:
 *   - Uppercase section title with icon
 *   - Optional state/readout badge
 *   - Toggle chevron with smooth collapse/expand
 *   - Clean bottom divider
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface InspectorSectionProps {
  title: string;
  icon?: React.ReactNode;
  badge?: string | number;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
  headerAction?: React.ReactNode;
}

export function InspectorSection({
  title,
  icon,
  badge,
  defaultOpen = true,
  children,
  className = '',
  headerAction,
}: InspectorSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`border-b border-border/40 ${className}`}>
      <div className="flex w-full items-center justify-between px-3.5 py-2 text-xs font-semibold text-foreground/90 hover:bg-muted/40 transition-colors select-none">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer py-0.5"
          aria-expanded={isOpen}
        >
          {icon && (
            <span className="text-muted-foreground shrink-0">{icon}</span>
          )}
          <span className="truncate tracking-tight uppercase text-[11px] font-medium text-foreground/80">
            {title}
          </span>
          {badge !== undefined && (
            <Badge
              variant="outline"
              className="h-4 text-[9px] font-mono px-1 font-normal bg-background/50 border-border/60 text-muted-foreground"
            >
              {badge}
            </Badge>
          )}
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {headerAction}
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            aria-label={isOpen ? 'Collapse section' : 'Expand section'}
            className="p-1 rounded hover:bg-secondary/60 text-muted-foreground cursor-pointer"
          >
            {isOpen ? (
              <ChevronDownIcon className="h-3.5 w-3.5" />
            ) : (
              <ChevronRightIcon className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="px-3.5 pb-3.5 pt-1 flex flex-col gap-3.5">
          {children}
        </div>
      )}
    </div>
  );
}
