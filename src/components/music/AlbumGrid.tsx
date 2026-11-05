/**
 * components/music/AlbumGrid.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Grid of album cards shown when browsing albums.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { memo } from 'react';
import { AlbumIcon } from 'lucide-react';
import { hueForId } from '@/lib/music/format';
type AlbumRow = { name: string; artist: string | null; count: number };

function gradientFor(id: string): string {
  const hue = hueForId(id);
  return `linear-gradient(140deg, hsl(${hue} 46% 34%), hsl(${(hue + 52) % 360} 38% 16%))`;
}

export interface AlbumGridProps {
  albums: AlbumRow[];
  onSelect: (name: string, artist: string | null) => void;
}

export function AlbumGridImpl({ albums, onSelect }: AlbumGridProps) {
  if (albums.length === 0) {
    return (
      <p className="px-2 py-12 text-center text-xs text-muted-foreground">
        No albums indexed yet.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {albums.map((row) => (
        <button
          key={`${row.name}-${row.artist ?? ''}`}
          type="button"
          onClick={() => onSelect(row.name, row.artist)}
          className="group flex flex-col gap-2 rounded-xl border border-border/50 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
        >
          <span
            className="flex aspect-square w-full items-center justify-center rounded-lg"
            style={{
              background: gradientFor(`${row.name}${row.artist ?? ''}`),
            }}
          >
            <AlbumIcon className="size-7 text-white/70" />
          </span>
          <span className="min-w-0 px-0.5">
            <span className="block truncate text-sm font-medium text-foreground">
              {row.name}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {row.artist ?? 'Unknown artist'} · {row.count} track
              {row.count === 1 ? '' : 's'}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

export const AlbumGrid = memo(AlbumGridImpl);
