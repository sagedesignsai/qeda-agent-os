/**
 * components/music/TrackList.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The library table. One row per track, with the actions a library actually
 * needs (play, queue next, queue last, add to playlist) kept one click away.
 *
 * The playing row is indicated three ways — colour, an equaliser, and the
 * artwork ring — because colour alone is easy to miss in a dense list.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  ListEndIcon,
  ListPlusIcon,
  MoreHorizontalIcon,
  PlayIcon,
  PlusIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatBitrate, formatCodec, formatDuration } from '@/lib/music/format';
import type { MusicTrack } from '@/lib/music/types';
import { MusicArtwork } from './MusicArtwork';

export interface TrackListProps {
  tracks: MusicTrack[];
  loading?: boolean;
  currentTrackId?: string | null;
  playing?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onPlay: (track: MusicTrack, index: number) => void;
  onEnqueue: (track: MusicTrack, mode: 'next' | 'end') => void;
  onAddToPlaylist?: (track: MusicTrack) => void;
  onPreview?: (track: MusicTrack) => void;
}

function Equaliser() {
  const bars = [
    { height: '60%', delay: '0ms' },
    { height: '100%', delay: '150ms' },
    { height: '45%', delay: '300ms' },
  ];
  return (
    <span className="flex h-3.5 items-end gap-[2px]" aria-label="Now playing">
      {bars.map((bar) => (
        <span
          key={bar.delay}
          className="w-[2px] animate-pulse rounded-full bg-primary"
          style={{ height: bar.height, animationDelay: bar.delay }}
        />
      ))}
    </span>
  );
}

export function TrackList({
  tracks,
  loading,
  currentTrackId,
  playing,
  emptyTitle = 'Nothing here yet',
  emptyDescription = 'Add a folder or change the filter to find tracks.',
  onPlay,
  onEnqueue,
  onAddToPlaylist,
  onPreview,
}: TrackListProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-3">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-md" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-2.5 w-1/5" />
            </div>
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 px-6 py-16 text-center">
        <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {emptyDescription}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {tracks.map((track, index) => {
        const isCurrent = track.id === currentTrackId;
        const meta = [formatCodec(track.codec), formatBitrate(track.bitrate)]
          .filter(Boolean)
          .join(' · ');
        return (
          <div
            key={track.id}
            role="button"
            tabIndex={0}
            onDoubleClick={() => onPlay(track, index)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onPlay(track, index);
            }}
            className={cn(
              'group flex items-center gap-3 border-b border-border/40 px-3 py-2 transition-colors',
              'hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none',
              isCurrent && 'bg-primary/5 hover:bg-primary/10',
            )}
          >
            <span className="w-6 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
              {isCurrent && playing ? (
                <Equaliser />
              ) : (
                String(index + 1).padStart(2, '0')
              )}
            </span>

            <MusicArtwork
              trackId={track.id}
              title={track.title}
              className={cn('size-10', isCurrent && 'ring-2 ring-primary/50')}
            />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p
                  className={cn(
                    'truncate text-sm font-medium',
                    isCurrent ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {track.title}
                </p>
                {track.missing_at && (
                  <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-destructive">
                    Missing
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {track.artist ?? 'Unknown artist'}
                {track.album ? ` — ${track.album}` : ''}
              </p>
            </div>

            <span className="hidden shrink-0 text-[10px] text-muted-foreground/70 sm:block">
              {meta}
            </span>
            <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
              {formatDuration(track.duration_ms)}
            </span>

            <Button
              size="icon"
              variant="ghost"
              className="size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              onClick={() => onPlay(track, index)}
              aria-label={`Play ${track.title}`}
            >
              <PlayIcon className="size-3.5 fill-current" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 shrink-0 text-muted-foreground"
                  aria-label={`More actions for ${track.title}`}
                >
                  <MoreHorizontalIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => onEnqueue(track, 'next')}>
                  <ListPlusIcon className="mr-2 size-4" />
                  Play next
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEnqueue(track, 'end')}>
                  <ListEndIcon className="mr-2 size-4" />
                  Add to queue
                </DropdownMenuItem>
                {onAddToPlaylist && (
                  <DropdownMenuItem onClick={() => onAddToPlaylist(track)}>
                    <PlusIcon className="mr-2 size-4" />
                    Add to playlist…
                  </DropdownMenuItem>
                )}
                {onPreview && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onPreview(track)}>
                      Preview file
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}
    </div>
  );
}
