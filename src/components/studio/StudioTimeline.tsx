/**
 * components/studio/StudioTimeline.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Interactive playback timeline & scrubber for Studio takes.
 *
 * Visualizes:
 *   - Playhead scrubber with millisecond precision
 *   - Kinetic zoom keyframe blocks
 *   - Cut / pruned silence segments
 *   - Synchronized speech caption regions
 *   - Play, pause, step, and speed controls
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useRef } from 'react';
import {
  PlayIcon,
  PauseIcon,
  RotateCcwIcon,
  FastForwardIcon,
  RewindIcon,
  ZoomInIcon,
  ScissorsIcon,
  MessageSquareIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { StudioZoom, StudioCut, StudioCaption } from '@/main/ipc/channels';

interface StudioTimelineProps {
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  zooms: StudioZoom[];
  cuts: StudioCut[];
  captions: StudioCaption[];
  playbackRate?: number;
  onSeek: (ms: number) => void;
  onTogglePlay: () => void;
  onChangePlaybackRate?: (rate: number) => void;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((ms % 1000) / 100);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${tenths}`;
}

export function StudioTimeline({
  currentTimeMs,
  durationMs,
  isPlaying,
  zooms,
  cuts,
  captions,
  playbackRate = 1.0,
  onSeek,
  onTogglePlay,
  onChangePlaybackRate,
}: StudioTimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);

  const safeDuration = Math.max(durationMs, 1000);
  const progressPercent = Math.min(
    100,
    Math.max(0, (currentTimeMs / safeDuration) * 100),
  );

  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const track = trackRef.current;
      if (!track) return;

      const rect = track.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, clickX / rect.width));
      onSeek(ratio * safeDuration);
    },
    [safeDuration, onSeek],
  );

  return (
    <div className="w-full flex flex-col gap-2 rounded-xl bg-card/60 backdrop-blur-md border border-border/40 p-3 shadow-lg select-none">
      {/* ── Scrubber Track with Zoom & Cut Markers ───────────────────────────── */}
      <div className="relative flex flex-col gap-1">
        {/* Scrubber background rail */}
        <div
          ref={trackRef}
          role="slider"
          aria-label="Timeline scrubber"
          aria-valuemin={0}
          aria-valuemax={safeDuration}
          aria-valuenow={currentTimeMs}
          tabIndex={0}
          onClick={handleTrackClick}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') {
              onSeek(Math.min(safeDuration, currentTimeMs + 1000));
            }
            if (e.key === 'ArrowLeft') {
              onSeek(Math.max(0, currentTimeMs - 1000));
            }
          }}
          className="relative h-10 w-full cursor-pointer overflow-hidden rounded-lg bg-secondary/50 hover:bg-secondary/70 transition-colors border border-border/30 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        >
          {/* Zoom Keyframe Markers */}
          {zooms.map((z) => {
            const leftPct = (z.startMs / safeDuration) * 100;
            const widthPct = ((z.endMs - z.startMs) / safeDuration) * 100;
            return (
              <div
                key={z.id}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                title={`Zoom ${z.scale}x`}
                className="absolute top-1 bottom-1 rounded bg-indigo-500/25 border border-indigo-400/50 flex items-center px-1 overflow-hidden pointer-events-none"
              >
                <ZoomInIcon className="w-3 h-3 text-indigo-300 shrink-0" />
                <span className="text-[10px] text-indigo-200 ml-0.5 truncate font-mono">
                  {z.scale}x
                </span>
              </div>
            );
          })}

          {/* Cut / Silence Markers */}
          {cuts.map((c) => {
            const leftPct = (c.startMs / safeDuration) * 100;
            const widthPct = ((c.endMs - c.startMs) / safeDuration) * 100;
            return (
              <div
                key={c.id}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                title={`Silence Cut: ${c.reason || 'cut'}`}
                className="absolute top-1 bottom-1 rounded bg-rose-500/20 border border-dashed border-rose-400/50 flex items-center px-1 overflow-hidden pointer-events-none"
              >
                <ScissorsIcon className="w-3 h-3 text-rose-300 shrink-0" />
              </div>
            );
          })}

          {/* Captions Track Band */}
          {captions.map((cap) => {
            const leftPct = (cap.startMs / safeDuration) * 100;
            const widthPct = ((cap.endMs - cap.startMs) / safeDuration) * 100;
            return (
              <div
                key={cap.id}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                title={cap.text}
                className="absolute bottom-0 h-1.5 rounded-sm bg-amber-400/60 pointer-events-none"
              />
            );
          })}

          {/* Elapsed Progress Fill */}
          <div
            style={{ width: `${progressPercent}%` }}
            className="absolute top-0 bottom-0 left-0 bg-primary/15 pointer-events-none border-r border-primary/60"
          />

          {/* Playhead Needle */}
          <div
            style={{ left: `${progressPercent}%` }}
            className="absolute top-0 bottom-0 w-0.5 bg-primary shadow-[0_0_8px_rgba(99,102,241,0.8)] pointer-events-none flex flex-col items-center"
          >
            <div className="w-2.5 h-2.5 rounded-full bg-primary -mt-0.5 shadow-md" />
          </div>
        </div>
      </div>

      {/* ── Playback Controls & Timecode ─────────────────────────────────────── */}
      <div className="flex items-center justify-between px-1">
        {/* Play/Pause, Replay, Skips */}
        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => onSeek(0)}
              >
                <RotateCcwIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Restart (0s)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => onSeek(Math.max(0, currentTimeMs - 3000))}
              >
                <RewindIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Back 3s</TooltipContent>
          </Tooltip>

          <Button
            variant="default"
            size="icon"
            className="h-9 w-9 rounded-full shadow-md bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={onTogglePlay}
          >
            {isPlaying ? (
              <PauseIcon className="h-4 w-4 fill-current" />
            ) : (
              <PlayIcon className="h-4 w-4 fill-current ml-0.5" />
            )}
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() =>
                  onSeek(Math.min(safeDuration, currentTimeMs + 3000))
                }
              >
                <FastForwardIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Forward 3s</TooltipContent>
          </Tooltip>
        </div>

        {/* Timecode display */}
        <div className="font-mono text-xs text-muted-foreground flex items-center gap-1.5">
          <span className="text-foreground font-medium">
            {formatTime(currentTimeMs)}
          </span>
          <span className="opacity-40">/</span>
          <span>{formatTime(safeDuration)}</span>
        </div>

        {/* Legend / Badges & Speed */}
        <div className="flex items-center gap-2">
          {zooms.length > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
              <ZoomInIcon className="w-3 h-3" />
              {zooms.length} {zooms.length === 1 ? 'zoom' : 'zooms'}
            </span>
          )}

          {captions.length > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              <MessageSquareIcon className="w-3 h-3" />
              captions
            </span>
          )}

          {/* Speed Toggle */}
          {onChangePlaybackRate && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs font-mono px-2"
              onClick={() => {
                const nextRate =
                  playbackRate === 1.0
                    ? 1.25
                    : playbackRate === 1.25
                      ? 1.5
                      : 1.0;
                onChangePlaybackRate(nextRate);
              }}
            >
              {playbackRate}x
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
