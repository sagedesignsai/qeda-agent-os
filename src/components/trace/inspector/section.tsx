/**
 * components/trace/inspector/section.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Collapsible section shell for the Trace inspector. Section titles carry the
 * meaning ("Transform", "Layout"…), so callers never repeat them as sub-labels
 * — the duplicate headings were the main visual noise in the old panel.
 */

import { useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export function PanelSection({
  title,
  children,
  action,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <section className="border-b border-border/60 px-3 py-2.5">
        <div className="flex min-h-6 items-center gap-1">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-expanded={open}
              className="flex min-w-0 flex-1 items-center gap-1 rounded text-left text-[11px] font-semibold tracking-tight text-foreground outline-none hover:text-foreground/80 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronDownIcon
                className={cn(
                  'size-3.5 shrink-0 text-muted-foreground transition-transform',
                  !open && '-rotate-90',
                )}
              />
              <span className="truncate">{title}</span>
            </button>
          </CollapsibleTrigger>
          {action ? (
            <div className="flex shrink-0 items-center gap-0.5">{action}</div>
          ) : null}
        </div>
        <CollapsibleContent>
          <div className="mt-2 space-y-2">{children}</div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

export function SubLabel({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-[10px] text-muted-foreground">{children}</p>
      {action}
    </div>
  );
}
