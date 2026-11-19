/**
 * components/studio/projects/StudioProjectsGrid.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsive Grid Layout for Showcase Studio Takes / Projects.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { StudioProjectCard } from './StudioProjectCard';
import type { StudioTakeSummary } from '@/lib/studio-types';

interface StudioProjectsGridProps {
  takes: StudioTakeSummary[];
  onOpen: (id: string) => void;
  onEdit?: (take: StudioTakeSummary) => void;
  onRename: (id: string, newTitle: string) => Promise<void>;
  onQuickExport: (id: string) => Promise<void>;
  onDelete: (take: StudioTakeSummary) => void;
}

export function StudioProjectsGrid({
  takes,
  onOpen,
  onEdit,
  onRename,
  onQuickExport,
  onDelete,
}: StudioProjectsGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-in fade-in duration-300">
      {takes.map((take) => (
        <StudioProjectCard
          key={take.id}
          take={take}
          onOpen={onOpen}
          onEdit={onEdit}
          onRename={onRename}
          onQuickExport={onQuickExport}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
