/**
 * components/projects/ProjectScopeChip.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The "you are viewing one project" indicator shown in a scoped page header.
 * Clicking it clears the scope. Shared by Tasks, Terminal, and Chat so the
 * scoping affordance looks and behaves identically everywhere.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { FolderKanbanIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ProjectScopeChipProps {
  /** Resolved project name; when null the chip renders nothing. */
  name: string | null;
  onClear: () => void;
  className?: string;
}

export function ProjectScopeChip({
  name,
  onClear,
  className,
}: ProjectScopeChipProps) {
  if (!name) return null;

  return (
    <Button
      size="sm"
      variant="secondary"
      className={cn('h-7 gap-1.5 text-xs', className)}
      title="Clear project filter"
      onClick={onClear}
    >
      <FolderKanbanIcon className="size-3" />
      {name}
      <XIcon className="size-3" />
    </Button>
  );
}
