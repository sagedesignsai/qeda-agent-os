/**
 * components/music/PlaylistGrid.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Grid of playlist cards shown when browsing playlists.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ListMusicIcon, PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MusicPlaylist } from '@/lib/music/types';

export interface PlaylistGridProps {
  playlists: MusicPlaylist[];
  onSelect: (id: string) => void;
  onCreatePlaylist: () => void;
}

export function PlaylistGrid({
  playlists,
  onSelect,
  onCreatePlaylist,
}: PlaylistGridProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          Playlists group tracks from anywhere in the library.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-[11px]"
          onClick={onCreatePlaylist}
        >
          <PlusIcon className="size-3" /> New playlist
        </Button>
      </div>
      {playlists.length === 0 ? (
        <p className="px-2 py-12 text-center text-xs text-muted-foreground">
          No playlists yet. Create one, then add tracks from the library or the
          queue.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {playlists.map((playlist) => (
            <button
              key={playlist.id}
              type="button"
              onClick={() => onSelect(playlist.id)}
              className="group flex items-center gap-3 rounded-xl border border-border/50 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ListMusicIcon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {playlist.name}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {playlist.track_count} track
                  {playlist.track_count === 1 ? '' : 's'}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
