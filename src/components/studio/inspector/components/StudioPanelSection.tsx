/**
 * components/studio/inspector/components/StudioPanelSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Compact collapsible section shell for the Studio inspector.
 *
 * ~28px header with chevron, title, and optional action slot.
 * Space-y-2 content spacing for dense property layout.
 */

import { useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export interface StudioPanelSectionProps {
  title: string;
  children: React.ReactNode;
  /** Optional action rendered in the header (e.g., reset button). */
  action?: React.ReactNode;
  /** Whether the section is open by default (used only when uncontrolled). */
  defaultOpen?: boolean;
  /** Controlled open state (accordion pattern). */
  open?: boolean;
  /** Called when the user toggles the section. */
  onOpenChange?: (open: boolean) => void;
}

export function StudioPanelSection({
  title,
  children,
  action,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
}: StudioPanelSectionProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
      <section className="border-b border-border/60 px-3 py-2.5">
        <div className="flex min-h-6 items-center gap-1">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-expanded={open}
              className="flex min-w-0 flex-1 items-center gap-1 rounded text-left text-[11px] font-semibold tracking-tight text-foreground outline-none hover:text-foreground/80 focus-visible:ring-2 focus-visible:ring-ring no-underline"
            >
              <ChevronDownIcon
                className={cn(
                  'size-3.5 shrink-0 text-muted-foreground transition-transform',
                  !open && '-rotate-90',
                )}
              />
              <span className="truncate no-underline">{title}</span>
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
