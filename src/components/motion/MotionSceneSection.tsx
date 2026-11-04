/**
 * components/motion/MotionSceneSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Collapsible section container for Motion Scene Panel sections.
 * Shows header with count badge, expand/collapse, and optional action button.
 */

import { ReactNode } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export interface MotionSceneSectionProps {
  title: string;
  count: number;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  children: ReactNode;
  onAddClick?: () => void;
  className?: string;
  emptyMessage?: string;
}

export function MotionSceneSection({
  title,
  count,
  expanded,
  onExpandedChange,
  children,
  onAddClick,
  className,
  emptyMessage,
}: MotionSceneSectionProps) {
  return (
    <Collapsible open={expanded} onOpenChange={onExpandedChange} className={className}>
      <div className="border-t border-border/40">
        <CollapsibleTrigger className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left outline-none focus-visible:ring-1 focus-visible:ring-ring">
          {expanded ? (
            <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground" />
          )}
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </span>
          <span className="text-[10px] font-normal tabular-nums text-muted-foreground/70">
            {count}
          </span>
          {onAddClick && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto size-5 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onAddClick();
              }}
              aria-label={`Add ${title.toLowerCase()}`}
              title={`Add ${title.toLowerCase()}`}
            >
              <PlusIcon className="size-3" />
            </Button>
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-2 py-1">
            {children}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
