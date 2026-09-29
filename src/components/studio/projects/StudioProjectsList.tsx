/**
 * components/studio/projects/StudioProjectsList.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Compact Media List / Table Layout for Showcase Studio Takes / Projects.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { StudioProjectRow } from './StudioProjectRow';
import type { StudioTakeSummary } from '@/lib/studio-types';

interface StudioProjectsListProps {
  takes: StudioTakeSummary[];
  onOpen: (id: string) => void;
  onRename: (id: string, newTitle: string) => Promise<void>;
  onQuickExport: (id: string) => Promise<void>;
  onDelete: (take: StudioTakeSummary) => void;
}

export function StudioProjectsList({
  takes,
  onOpen,
  onRename,
  onQuickExport,
  onDelete,
}: StudioProjectsListProps) {
  return (
    <div className="flex flex-col gap-2 animate-in fade-in duration-300">
      {takes.map((take) => (
        <StudioProjectRow
          key={take.id}
          take={take}
          onOpen={onOpen}
          onRename={onRename}
          onQuickExport={onQuickExport}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
