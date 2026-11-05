/**
 * components/music/QueuePanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The play queue. It lives in the store as an ordered list of ids, and the
 * tracks themselves are hydrated in order, so reordering here is the same
 * operation the player uses for auto-advance.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ListXIcon,
  PlayIcon,
  Trash2Icon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useMusicPlayer } from '@/hooks/use-music-player';
import { formatDuration, formatTotalDuration } from '@/lib/music/format';
import { MusicArtwork } from './MusicArtwork';

export interface QueuePanelProps {
  className?: string;
  onClose?: () => void;
}

export function QueuePanel({ className, onClose }: QueuePanelProps) {
  const {
    queue,
    index,
    playing,
    playTracks,
    removeAt,
    move,
    clearQueue,
  } = useMusicPlayer();

  const total = queue.reduce((sum, track) => sum + track.duration_ms, 0);
  const upNext = queue.length - Math.max(0, index + 1);

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Queue
          </p>
          <p className="truncate text-[10px] text-muted-foreground/70">
            {queue.length} track{queue.length === 1 ? '' : 's'} ·{' '}
            {formatTotalDuration(total)} · {upNext} up next
          </p>
        </div>
        <div className="flex items-center gap-1">
          {queue.length > 0 && (
            <Button
              size="icon"
              variant="ghost"
              className="size-7 text-muted-foreground hover:text-destructive"
              onClick={clearQueue}
              aria-label="Clear queue"
            >
              <ListXIcon className="size-3.5" />
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {queue.length === 0 ? (
          <p className="px-3 py-10 text-center text-xs text-muted-foreground">
            The queue is empty. Play an album or add tracks from the library.
          </p>
        ) : (
          <div className="flex flex-col">
            {queue.map((track, trackIndex) => {
              const isCurrent = trackIndex === index;
              return (
                <div
                  key={`${track.id}-${trackIndex}`}
                  className={cn(
                    'group flex items-center gap-2 border-b border-border/30 px-3 py-2',
                    isCurrent && 'bg-primary/5',
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => void playTracks(queue, trackIndex)}
                  >
                    <MusicArtwork
                      trackId={track.id}
                      title={track.title}
                      className="size-8"
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block truncate text-xs font-medium',
                          isCurrent ? 'text-primary' : 'text-foreground',
                        )}
                      >
                        {track.title}
                      </span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {track.artist ?? 'Unknown artist'}
                      </span>
                    </span>
                  </button>

                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {formatDuration(track.duration_ms)}
                  </span>

                  <span className="flex shrink-0 items-center">
                    {isCurrent ? (
                      <PlayIcon
                        className={cn(
                          'mx-1 size-3 text-primary',
                          playing && 'animate-pulse',
                        )}
                      />
                    ) : (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6 opacity-0 group-hover:opacity-100"
                          onClick={() => move(trackIndex, trackIndex - 1)}
                          disabled={trackIndex === 0}
                          aria-label="Move up"
                        >
                          <ArrowUpIcon className="size-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6 opacity-0 group-hover:opacity-100"
                          onClick={() => move(trackIndex, trackIndex + 1)}
                          disabled={trackIndex === queue.length - 1}
                          aria-label="Move down"
                        >
                          <ArrowDownIcon className="size-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
                          onClick={() => void removeAt(trackIndex)}
                          aria-label="Remove from queue"
                        >
                          <Trash2Icon className="size-3" />
                        </Button>
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
