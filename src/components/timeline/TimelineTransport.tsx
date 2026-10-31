/**
 * components/timeline/TimelineTransport.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Transport controls for the reusable timeline: play/pause, timecode, loop,
 * snapping and zoom.
 *
 * The timecode is written through a ref from the clock subscription, not React
 * state. A transport that re-rendered 60 times a second would drag the whole
 * editor with it; only play/pause changes state, which happens once per press.
 */

import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  SkipBackIcon,
  SkipForwardIcon,
  ZoomInIcon,
  ZoomOutIcon,
  Maximize2 as ZoomFitIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatSeconds, formatTimecode } from '@/lib/timeline/time';
import type { TimelineClock } from '@/lib/timeline/types';
import { cn } from '@/lib/utils';

function TimecodeReadout({ clock, fps }: { clock: TimelineClock; fps: number }) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const update = () => {
      if (ref.current) ref.current.textContent = formatTimecode(clock.getTime(), fps);
    };
    update();
    return clock.subscribe(update);
  }, [clock, fps]);

  return <span ref={ref} className="font-mono text-xs tabular-nums text-foreground" />;
}

export type TimelineTransportProps = {
  clock: TimelineClock;
  duration: number;
  fps: number;
  loopEnabled?: boolean;
  snapEnabled?: boolean;
  autoKeyEnabled?: boolean;
  playMode?: 'once' | 'loop' | 'ping-pong';
  onToggleLoop?: () => void;
  onToggleSnap?: () => void;
  onToggleAutoKey?: () => void;
  onPlayModeChange?: (mode: 'once' | 'loop' | 'ping-pong') => void;
  onStep?: (direction: -1 | 1) => void;
  onGoToStart?: () => void;
  onGoToEnd?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomFit?: () => void;
  className?: string;
};

export function TimelineTransport({
  clock,
  duration,
  fps,
  loopEnabled = false,
  snapEnabled = true,
  autoKeyEnabled = false,
  playMode = 'once',
  onToggleLoop,
  onToggleSnap,
  onToggleAutoKey,
  onPlayModeChange,
  onStep,
  onGoToStart,
  onGoToEnd,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  className,
}: TimelineTransportProps) {
  const [playing, setPlaying] = useState(clock.isPlaying());

  useEffect(() => {
    const update = () => setPlaying(clock.isPlaying());
    update();
    return clock.subscribe(update);
  }, [clock]);

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {/* Playback controls */}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7"
        aria-label="Go to start"
        title="Go to start (Home)"
        disabled={!onGoToStart}
        onClick={() => onGoToStart?.()}
      >
        <SkipBackIcon className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7"
        aria-label="Step back one frame"
        title="Step back one frame (,)"
        disabled={!onStep}
        onClick={() => onStep?.(-1)}
      >
        <ChevronLeftIcon className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7"
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={() => clock.toggle()}
      >
        {playing ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7"
        aria-label="Step forward one frame"
        title="Step forward one frame (.)"
        disabled={!onStep}
        onClick={() => onStep?.(1)}
      >
        <ChevronRightIcon className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7"
        aria-label="Go to end"
        title="Go to end (End)"
        disabled={!onGoToEnd}
        onClick={() => onGoToEnd?.()}
      >
        <SkipForwardIcon className="size-3.5" />
      </Button>

      {/* Timecode */}
      <TimecodeReadout clock={clock} fps={fps} />
      <span className="text-[10px] text-muted-foreground">/ {formatSeconds(duration)}</span>

      {/* Settings dropdown — consolidates work area, play mode, snap, auto-key, and zoom */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Timeline settings" title="Timeline settings">
            <MoreHorizontalIcon className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel>Playback</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={loopEnabled}
            onCheckedChange={onToggleLoop}
          >
            <RepeatIcon className="size-3.5" data-icon />
            Work Area
          </DropdownMenuCheckboxItem>
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => onPlayModeChange?.('once')} className={playMode === 'once' ? 'bg-accent' : ''}>
              Once
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onPlayModeChange?.('loop')} className={playMode === 'loop' ? 'bg-accent' : ''}>
              Loop
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onPlayModeChange?.('ping-pong')} className={playMode === 'ping-pong' ? 'bg-accent' : ''}>
              Ping-pong
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Editing</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={snapEnabled}
            onCheckedChange={onToggleSnap}
          >
            Snap to Grid
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={autoKeyEnabled}
            onCheckedChange={onToggleAutoKey}
          >
            Auto-key
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Zoom</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onZoomOut}>
            <ZoomOutIcon className="size-3.5" data-icon />
            Zoom Out
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onZoomFit}>
            <ZoomFitIcon className="size-3.5" data-icon />
            Fit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onZoomIn}>
            <ZoomInIcon className="size-3.5" data-icon />
            Zoom In
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
