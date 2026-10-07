/**
 * components/OverflowMenu.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The single-row `PageHeader` only has room for a primary action, so every
 * screen with surplus commands needs a collapse point. This is that collapse
 * point, and it exists so the decision is made once per screen instead of once
 * per screen *and* once per item: pass the secondary commands as data.
 *
 * The alternative — hand-rolling a `DropdownMenu` per header — is what Tasks,
 * Chat and Studio were each doing separately, with three different trigger
 * sizes, three menu widths, and inconsistent destructive styling. A typed item
 * list also keeps a screen honest: there is no way to add a ninth inline button
 * without it being obvious that the ninth one belongs in here.
 *
 * Reach for the global command palette (`components/CommandPalette`, ⌘K) when
 * the commands are cross-screen or numerous; this menu is for the ones that are
 * specific to the screen you are looking at.
 *
 * Not a general-purpose dropdown. It has no submenus, no groups beyond a
 * separator, and one fixed trigger — screen-specific pickers should keep using
 * `@/components/ui/dropdown-menu` directly.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreHorizontalIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OverflowMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  /** Destructive tone. Reserve for irreversible commands. */
  destructive?: boolean;
  /** Draws a separator above this item — use to group, e.g. before Delete. */
  separatorBefore?: boolean;
}

interface OverflowMenuProps {
  items: OverflowMenuItem[];
  /** Accessible name for the trigger, e.g. "More project actions". */
  label: string;
  align?: 'start' | 'center' | 'end';
  className?: string;
}

export function OverflowMenu({
  items,
  label,
  align = 'end',
  className,
}: OverflowMenuProps) {
  // Nothing to collapse into — render nothing rather than an empty affordance.
  if (items.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className={cn('h-7 w-7 shrink-0 px-0 text-xs', className)}
          aria-label={label}
          title={label}
        >
          <MoreHorizontalIcon className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-44 text-xs">
        {items.map((item) => (
          <FragmentedItem key={item.label} item={item} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Separators are siblings of items, not children — `DropdownMenuItem` and
 *  `DropdownMenuSeparator` are both collection nodes and nesting breaks
 *  keyboard navigation through the list. */
function FragmentedItem({ item }: { item: OverflowMenuItem }) {
  return (
    <>
      {item.separatorBefore && <DropdownMenuSeparator />}
      <DropdownMenuItem
        className={cn(
          'gap-2 text-xs',
          item.destructive && 'text-destructive focus:text-destructive',
        )}
        disabled={item.disabled}
        onSelect={item.onSelect}
      >
        {item.icon}
        {item.label}
      </DropdownMenuItem>
    </>
  );
}
