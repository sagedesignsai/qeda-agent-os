/**
 * components/studio/inspector/components/StudioLinkToggle.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Link/unlink icon button for paired fields (e.g., uniform scale X/Y).
 *
 * Sky-400 when linked, muted-foreground when unlinked.
 */

import { Link2Icon, UnlinkIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface StudioLinkToggleProps {
  linked: boolean;
  onToggle: () => void;
  /** Accessibility label for the button. */
  label?: string;
}

export function StudioLinkToggle({
  linked,
  onToggle,
  label = 'Link',
}: StudioLinkToggleProps) {
  const title = linked ? `Unlink ${label}` : `Link ${label}`;
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      aria-pressed={linked}
      aria-label={title}
      title={title}
      onClick={onToggle}
      className={cn(
        'size-6 rounded-md',
        linked
          ? 'text-sky-400 hover:text-sky-300'
          : 'text-muted-foreground/60 hover:text-foreground',
      )}
    >
      {linked ? (
        <Link2Icon className="size-3" />
      ) : (
        <UnlinkIcon className="size-3" />
      )}
    </Button>
  );
}
