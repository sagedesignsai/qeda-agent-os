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
import { PauseIcon, PlayIcon, RepeatIcon, ZoomInIcon, ZoomOutIcon } from 'lucide-react';

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
  onToggleLoop?: () => void;
  onToggleSnap?: () => void;
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
  onToggleLoop,
  onToggleSnap,
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
        aria-label={playing ? 'Pause' : 'Play'}
        onClick={() => clock.toggle()}
      >
        {playing ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
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
        Loop
      </Button>

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
