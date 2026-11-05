/**
 * components/music/MusicFilterBar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Filter badges, sort controls, and action buttons above the track list.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  ArrowDownAZIcon,
  ArrowUpAZIcon,
  PlayIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { memo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SORT_LABELS } from '@/hooks/use-music-library';
import type { LibrarySort, MusicFolder } from '@/lib/music/types';

export interface MusicFilterBarProps {
  heading: string;
  trackCount: number;
  query: string;
  artist: string | null;
  album: string | null;
  folderId: string | null;
  folders: MusicFolder[];
  browse: 'tracks' | 'artists' | 'albums' | 'playlists';
  playlistId?: string | null;
  visibleTracksLength: number;
  onSetFolderId: (id: string | null) => void;
  onSetArtist: (name: string | null) => void;
  onSetAlbum: (name: string | null) => void;
  onResetFilters: () => void;
  sort: LibrarySort;
  onSortChange: (sort: LibrarySort) => void;
  ascending: boolean;
  onToggleAscending: () => void;
  onPlayAll: () => void;
  onDeletePlaylist?: () => void;
}

function MusicFilterBarImpl({
  heading,
  trackCount,
  query,
  artist,
  album,
  folderId,
  folders,
  browse,
  playlistId,
  visibleTracksLength,
  onSetFolderId,
  onSetArtist,
  onSetAlbum,
  onResetFilters,
  sort,
  onSortChange,
  ascending,
  onToggleAscending,
  onPlayAll,
  onDeletePlaylist,
}: MusicFilterBarProps) {
  return (
    <>
      <div className="flex flex-col gap-2 border-b border-border/60 px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 className="truncate text-sm font-semibold text-foreground">
              {heading}
            </h2>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {trackCount} track{trackCount === 1 ? '' : 's'}
          </span>
          {query && (
            <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-medium text-primary">
              Search: {query}
            </span>
          )}
        </div>

        {(artist || album || folderId || query) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {folderId && (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 pl-2.5 pr-1.5 py-1">
                <span className="text-[10px] font-medium text-muted-foreground">
                  📁{' '}
                  {folders
                    .find((f) => f.id === folderId)
                    ?.path.split(/[\\/]/)
                    .filter(Boolean)
                    .pop()}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-4 rounded-full text-muted-foreground/70 hover:text-foreground"
                  onClick={() => onSetFolderId(null)}
                  aria-label="Remove folder filter"
                >
                  <XIcon className="size-2.5" />
                </Button>
              </div>
            )}
            {artist && (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 pl-2.5 pr-1.5 py-1">
                <span className="truncate text-[10px] font-medium text-muted-foreground">
                  👤 {artist}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-4 rounded-full text-muted-foreground/70 hover:text-foreground shrink-0"
                  onClick={() => onSetArtist(null)}
                  aria-label="Remove artist filter"
                >
                  <XIcon className="size-2.5" />
                </Button>
              </div>
            )}
            {album && (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 pl-2.5 pr-1.5 py-1">
                <span className="truncate text-[10px] font-medium text-muted-foreground">
                  💿 {album}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-4 rounded-full text-muted-foreground/70 hover:text-foreground shrink-0"
                  onClick={() => onSetAlbum(null)}
                  aria-label="Remove album filter"
                >
                  <XIcon className="size-2.5" />
                </Button>
              </div>
            )}
            {(artist || album || folderId || query) && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2 text-[10px]"
                onClick={onResetFilters}
              >
                <XIcon className="size-3" /> Clear all
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-2">
        <div className="ml-auto flex items-center gap-1.5">
          {browse === 'tracks' && !playlistId && (
            <>
              <Select value={sort} onValueChange={(value) => onSortChange(value as LibrarySort)}>
                <SelectTrigger size="sm" className="h-7 w-[7.5rem] text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SORT_LABELS) as LibrarySort[]).map((key) => (
                    <SelectItem key={key} value={key} className="text-xs">
                      {SORT_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                onClick={onToggleAscending}
                aria-label={ascending ? 'Sort descending' : 'Sort ascending'}
              >
                {ascending ? (
                  <ArrowDownAZIcon className="size-3.5" />
                ) : (
                  <ArrowUpAZIcon className="size-3.5" />
                )}
              </Button>
            </>
          )}

          {visibleTracksLength > 0 && (
            <Button
              size="sm"
              className="h-7 gap-1.5 text-[11px]"
              onClick={onPlayAll}
            >
              <PlayIcon className="size-3 fill-current" /> Play all
            </Button>
          )}

          {playlistId && onDeletePlaylist && (
            <Button
              size="icon"
              variant="ghost"
              className="size-7 text-muted-foreground hover:text-destructive"
              onClick={onDeletePlaylist}
              aria-label="Delete playlist"
            >
              <Trash2Icon className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

export const MusicFilterBar = memo(MusicFilterBarImpl);
