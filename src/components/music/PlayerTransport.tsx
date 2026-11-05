/**
 * components/music/PlayerTransport.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Transport controls, shared by the dock and the Music page.
 *
 * The seek slider is *controlled by the store*, not by the media element. That
 * keeps two mounted transports (dock + page) in sync and prevents the thumb
 * from fighting the element's `timeupdate` events while the user is dragging.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  ListMusicIcon,
  PauseIcon,
  PlayIcon,
  Repeat1Icon,
  RepeatIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  Volume1Icon,
  Volume2Icon,
  VolumeXIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { useMusicPlayer } from '@/hooks/use-music-player';
import { formatDuration } from '@/lib/music/format';
import { MusicArtwork } from './MusicArtwork';

export interface PlayerTransportProps {
  className?: string;
  compact?: boolean;
  onOpenQueue?: () => void;
}

export function PlayerTransport({
  className,
  compact,
  onOpenQueue,
}: PlayerTransportProps) {
  const {
    current,
    playing,
    positionMs,
    durationMs,
    volume,
    muted,
    repeat,
    shuffle,
    next,
    previous,
    toggle,
    seek,
    setVolume,
    toggleMute,
    setRepeat,
    toggleShuffle,
  } = useMusicPlayer();

  const elapsed = Math.min(positionMs, durationMs || positionMs);
  const max = Math.max(1, durationMs);
  const VolumeIcon =
    muted || volume === 0 ? VolumeXIcon : volume < 0.45 ? Volume1Icon : Volume2Icon;

  return (
    <div
      className={cn(
        'flex items-center gap-3',
        compact ? 'px-2 py-1.5' : 'gap-4',
        className,
      )}
    >
      <MusicArtwork
        trackId={current?.id}
        title={current?.title}
        className={cn(compact ? 'size-10' : 'size-20 rounded-xl shadow-md')}
        iconClassName={compact ? 'size-4' : 'size-7'}
      />

      <div className={cn('min-w-0 flex-1', compact ? 'flex flex-col gap-0.5' : 'flex flex-col gap-2')}>
        <div className="min-w-0">
          <p
            className={cn(
              'truncate font-medium text-foreground',
              compact ? 'text-xs' : 'text-base',
            )}
          >
            {current?.title ?? 'Nothing playing'}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {current
              ? [current.artist, current.album].filter(Boolean).join(' — ')
              : 'Choose a track to begin'}
          </p>
        </div>

        {!compact && (
          <div className="flex items-center gap-2">
            <span className="w-10 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
              {formatDuration(elapsed)}
            </span>
            <Slider
              value={[Math.round(elapsed)]}
              onValueChange={([value]) => seek(value)}
              max={max}
              step={500}
              disabled={!current}
              aria-label="Seek"
            />
            <span className="w-10 font-mono text-[10px] tabular-nums text-muted-foreground">
              {formatDuration(durationMs)}
            </span>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {!compact && (
          <Button
            size="icon"
            variant="ghost"
            className={cn('size-8 rounded-full', shuffle && 'text-primary')}
            onClick={toggleShuffle}
            aria-label="Toggle shuffle"
          >
            <ShuffleIcon className="size-3.5" />
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="size-8 rounded-full"
          onClick={() => void previous()}
          disabled={!current}
          aria-label="Previous track"
        >
          <SkipBackIcon className="size-3.5 fill-current" />
        </Button>
        <Button
          size="icon"
          className={cn('rounded-full', compact ? 'size-8' : 'size-10')}
          onClick={() => void toggle()}
          disabled={!current}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? (
            <PauseIcon className={cn('fill-current', compact ? 'size-3.5' : 'size-4')} />
          ) : (
            <PlayIcon className={cn('ml-0.5 fill-current', compact ? 'size-3.5' : 'size-4')} />
          )}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 rounded-full"
          onClick={() => void next()}
          disabled={!current}
          aria-label="Next track"
        >
          <SkipForwardIcon className="size-3.5 fill-current" />
        </Button>
        {!compact && (
          <Button
            size="icon"
            variant="ghost"
            className={cn('size-8 rounded-full', repeat !== 'off' && 'text-primary')}
            onClick={() => setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')}
            aria-label={`Repeat: ${repeat}`}
          >
            {repeat === 'one' ? (
              <Repeat1Icon className="size-3.5" />
            ) : (
              <RepeatIcon className="size-3.5" />
            )}
          </Button>
        )}
      </div>

      {compact && current && (
        <div className="hidden w-32 shrink-0 items-center gap-1.5 sm:flex">
          <Button
            size="icon"
            variant="ghost"
            className="size-7 rounded-full"
            onClick={toggleMute}
            aria-label="Mute"
          >
            <VolumeIcon className="size-3.5" />
          </Button>
          <Slider
            value={[Math.round((muted ? 0 : volume) * 100)]}
            onValueChange={([value]) => setVolume(value / 100)}
            max={100}
            step={1}
            aria-label="Volume"
          />
        </div>
      )}

      {onOpenQueue && (
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 rounded-full"
          onClick={onOpenQueue}
          aria-label="Open queue"
        >
          <ListMusicIcon className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
