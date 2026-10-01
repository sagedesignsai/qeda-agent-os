/**
 * components/HeaderTabStrip.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A tab strip sized for a single dense `PageHeader` row (min-h-10).
 *
 * The vendored shadcn `TabsList`/`TabsTrigger` are built for a full-width tab
 * bar that owns its own row, and layering them into a 36px header stacks four
 * competing surfaces: a `bg-muted` container with `p-[3px]`, a `bg-background`
 * active pill with `border-input` and `shadow-sm`, and on focus a 3px ring
 * *and* a 1px outline simultaneously. That reads as a double box, not a switch.
 *
 * This strips it back to one idea: the active tab is an `accent` fill, the
 * track is transparent, and focus is a single quiet 1px ring. Still Radix, so
 * arrow-key roving and `role="tab"` semantics are unchanged — it only replaces
 * the *appearance* of the trigger.
 *
 * Not a general-purpose tabs replacement. Anything below ~40px tall or with more
 * than a handful of tabs should keep using `@/components/ui/tabs`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ComponentProps } from 'react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

// The vendored `ui/tabs` does not re-export its prop types, so derive them from
// the components. This also keeps the `variant` axis off these wrappers, which is
// intentional: the strip has one look.
type TabsListProps = ComponentProps<typeof TabsList>;
type TabsTriggerProps = ComponentProps<typeof TabsTrigger>;

/** Transparent track, no container padding, sized to the header row. */
export function HeaderTabStrip({ className, ...props }: TabsListProps) {
  return (
    <TabsList
      // `bg-transparent` + `p-0` drop the track fill so the active tab's own
      // `accent` fill is the only thing the eye lands on.
      className={cn('h-6 gap-0.5 rounded-md bg-transparent p-0', className)}
      {...props}
    />
  );
}

export function HeaderTab({ className, ...props }: TabsTriggerProps) {
  return (
    <TabsTrigger
      className={cn(
        // `flex-1` off: triggers size to their label instead of splitting the
        // track evenly, which keeps a two-tab strip compact.
        'h-5 flex-none gap-1.5 rounded-sm px-2 text-xs font-medium',
        // One surface for the active state. `data-active:` (not
        // `data-[state=active]:`) matches the vendored trigger's own convention.
        'text-muted-foreground hover:text-foreground',
        'data-active:bg-accent data-active:text-accent-foreground',
        // The vendored trigger also ships `dark:data-active:*` overrides, and a
        // modifier mismatch means tailwind-merge keeps BOTH — so in dark mode
        // (the default theme) its border+input fill would win the cascade and
        // undo everything above. Repeating each override with the `dark:`
        // prefix is what actually displaces them.
        'dark:data-active:border-transparent dark:data-active:bg-accent dark:data-active:text-accent-foreground',
        // Likewise the default-variant shadow, which is scoped to the group.
        'group-data-[variant=default]/tabs-list:data-active:shadow-none',
        // Kill the inherited ring+outline pair, then add one 1px ring. The
        // vendored trigger sets `ring-[3px]` and `outline-1` together, which is
        // the double outline seen on the focused tab.
        'focus-visible:ring-1 focus-visible:ring-ring/60 focus-visible:outline-none',
        'focus-visible:border-ring',
        // Icons inherit trigger sizing; pin them small so a 20px row stays calm.
        '[&_svg]:size-3 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  );
}
