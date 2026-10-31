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
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  SkipBackIcon,
  SkipForwardIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
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
    <div className={cn('flex items-center gap-1.5', className)}>
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

      <TimecodeReadout clock={clock} fps={fps} />
      <span className="text-[10px] text-muted-foreground">/ {formatSeconds(duration)}</span>
      <span className="text-[10px] text-muted-foreground/60">{Math.round(fps)} fps</span>

      <div className="mx-1 h-4 w-px bg-border" />

      <Button
        type="button"
        size="sm"
        variant={loopEnabled ? 'secondary' : 'ghost'}
        className="h-7 gap-1 px-2 text-[11px]"
        aria-pressed={loopEnabled}
        onClick={onToggleLoop}
      >
        <RepeatIcon className="size-3" />
        Work area
      </Button>

      <select
        aria-label="Playback mode"
        className="h-7 rounded-md border border-border/60 bg-background px-1.5 text-[11px]"
        value={playMode}
        onChange={(event) =>
          onPlayModeChange?.(event.target.value as 'once' | 'loop' | 'ping-pong')
        }
      >
        <option value="once">Once</option>
        <option value="loop">Loop</option>
        <option value="ping-pong">Ping-pong</option>
      </select>

      <Button
        type="button"
        size="sm"
        variant={snapEnabled ? 'secondary' : 'ghost'}
        className="h-7 px-2 text-[11px]"
        aria-pressed={snapEnabled}
        onClick={onToggleSnap}
      >
        Snap
      </Button>

      <Button
        type="button"
        size="sm"
        variant={autoKeyEnabled ? 'secondary' : 'ghost'}
        className="h-7 px-2 text-[11px]"
        aria-pressed={autoKeyEnabled}
        onClick={onToggleAutoKey}
        title="Automatically key animatable inspector edits"
      >
        Auto-key
      </Button>

      <div className="mx-1 h-4 w-px bg-border" />

      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7"
        aria-label="Zoom out"
        onClick={onZoomOut}
      >
        <ZoomOutIcon className="size-3.5" />
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={onZoomFit}>
        Fit
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7"
        aria-label="Zoom in"
        onClick={onZoomIn}
      >
        <ZoomInIcon className="size-3.5" />
      </Button>
    </div>
  );
}
