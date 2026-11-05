/**
 * components/music/ArtistGrid.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Grid of artist cards shown when browsing artists.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { memo } from 'react';
import { MicVocalIcon } from 'lucide-react';
import { hueForId } from '@/lib/music/format';

type ArtistRow = { name: string; count: number };

function gradientFor(id: string): string {
  const hue = hueForId(id);
  return `linear-gradient(140deg, hsl(${hue} 46% 34%), hsl(${(hue + 52) % 360} 38% 16%))`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export interface ArtistGridProps {
  artists: ArtistRow[];
  onSelect: (name: string) => void;
}

export function ArtistGridImpl({ artists, onSelect }: ArtistGridProps) {
  if (artists.length === 0) {
    return (
      <p className="px-2 py-12 text-center text-xs text-muted-foreground">
        No artists indexed yet.
      </p>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {artists.map((row) => (
        <button
          key={row.name}
          type="button"
          onClick={() => onSelect(row.name)}
          className="group flex items-center gap-3 rounded-xl border border-border/50 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
        >
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white/90"
            style={{ background: gradientFor(row.name) }}
          >
            {initials(row.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">
              {row.name}
            </span>
            <span className="block text-[11px] text-muted-foreground">
              {row.count} track{row.count === 1 ? '' : 's'}
            </span>
          </span>
          <MicVocalIcon className="size-4 shrink-0 text-muted-foreground/40 group-hover:text-primary" />
        </button>
      ))}
    </div>
  );
}

export const ArtistGrid = memo(ArtistGridImpl);
