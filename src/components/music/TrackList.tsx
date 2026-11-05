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

import { memo, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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

function TrackRowImpl({
  track,
  index,
  isCurrent,
  isPlaying,
  onPlay,
  onEnqueue,
  onAddToPlaylist,
  onPreview,
}: {
  track: MusicTrack;
  index: number;
   isCurrent: boolean;
  isPlaying?: boolean;
  onPlay: (track: MusicTrack, index: number) => void;
  onEnqueue: (track: MusicTrack, mode: 'next' | 'end') => void;
  onAddToPlaylist?: (track: MusicTrack) => void;
  onPreview?: (track: MusicTrack) => void;
}) {
  const meta = useMemo(
    () =>
      [formatCodec(track.codec), formatBitrate(track.bitrate)]
        .filter(Boolean)
        .join(' · '),
    [track.codec, track.bitrate],
  );

  const [menuOpen, setMenuOpen] = useState(false);

  // Inline handlers — track reference changes each render anyway, so
  // useCallback would just add overhead without stabilizing memo().
  const handlePlayClick = () => onPlay(track, index);
  const handleEnqueueNext = () => onEnqueue(track, 'next');
  const handleEnqueueEnd = () => onEnqueue(track, 'end');
  const handleAddToPlaylist = () => onAddToPlaylist?.(track);
  const handlePreview = () => onPreview?.(track);
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') onPlay(track, index);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onDoubleClick={handlePlayClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'group flex items-center gap-3 border-b border-border/40 px-3 py-2 transition-colors',
        'hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none',
        isCurrent && 'bg-primary/5 hover:bg-primary/10',
      )}
    >
      <span className="w-6 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
        {isCurrent && isPlaying ? (
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
        onClick={handlePlayClick}
        aria-label={`Play ${track.title}`}
      >
        <PlayIcon className="size-3.5 fill-current" />
      </Button>

      {menuOpen ? (
        <DropdownMenu open onOpenChange={setMenuOpen}>
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
            <DropdownMenuItem onClick={handleEnqueueNext}>
              <ListPlusIcon className="mr-2 size-4" />
              Play next
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleEnqueueEnd}>
              <ListEndIcon className="mr-2 size-4" />
              Add to queue
            </DropdownMenuItem>
            {onAddToPlaylist && (
              <DropdownMenuItem onClick={handleAddToPlaylist}>
                <PlusIcon className="mr-2 size-4" />
                Add to playlist…
              </DropdownMenuItem>
            )}
            {onPreview && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handlePreview}>
                  Preview file
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button
          size="icon"
          variant="ghost"
          className="size-7 shrink-0 text-muted-foreground"
          aria-label={`More actions for ${track.title}`}
          onClick={() => setMenuOpen(true)}
        >
          <MoreHorizontalIcon className="size-4" />
        </Button>
      )}
    </div>
  );
}

const TrackRow = memo(TrackRowImpl);

const TrackListImpl = function TrackList({
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
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56, // Row height: py-2 (16px) + 40px track height
    overscan: 5, // Render 5 extra rows outside viewport for smoother scrolling
  });

  if (loading) {
    return (
      <div className="flex flex-col gap-1.5 px-3 py-2">
        {Array.from({ length: 12 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 rounded-lg border border-border/20 bg-muted/30 px-3 py-2"
          >
            <Skeleton className="size-10 rounded-md" />
            <div className="flex flex-1 flex-col gap-1.5 min-w-0">
              <Skeleton className="h-3 w-2/5" />
              <Skeleton className="h-2.5 w-1/3" />
            </div>
            <div className="hidden sm:flex gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-12" />
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

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div
      ref={parentRef}
      className="h-full overflow-y-auto"
      style={{
        contain: 'layout style paint',
      }}
    >
      <div
        style={{
          height: totalSize,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualItem) => (
          <div
            key={`${tracks[virtualItem.index].id}-${virtualItem.index}`}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <TrackRow
              track={tracks[virtualItem.index]}
              index={virtualItem.index}
               isCurrent={tracks[virtualItem.index].id === currentTrackId}
               isPlaying={tracks[virtualItem.index].id === currentTrackId && playing}
               onPlay={onPlay}
              onEnqueue={onEnqueue}
              onAddToPlaylist={onAddToPlaylist}
              onPreview={onPreview}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export const TrackList = memo(TrackListImpl);
