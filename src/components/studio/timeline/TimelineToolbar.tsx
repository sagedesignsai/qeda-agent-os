/**
 * components/studio/timeline/TimelineToolbar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Master editing toolbar for Studio Timeline:
 *   - Tool selection: Arrow/Select (V) vs Split Blade (C)
 *   - Playhead splitting & ripple delete
 *   - Snapping / Magnetic alignment toggle
 *   - Horizontal zoom scale slider and zoom-to-fit
 *   - High-precision timecode display
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import {
  MousePointerIcon,
  ScissorsIcon,
  MagnetIcon,
  Trash2Icon,
  ZoomInIcon,
  ZoomOutIcon,
  Maximize2Icon,
  PlayIcon,
  PauseIcon,
  SplitIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { timelineStore, useTimelineTools } from '@/hooks/use-timeline-store';

interface TimelineToolbarProps {
  durationMs: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onZoomToFit: () => void;
}

function formatTimecode(ms: number): string {
  const totalSeconds = Math.max(0, ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const frames = Math.floor(((ms % 1000) / 1000) * 30); // 30fps frames
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

export function TimelineToolbar({
  durationMs,
  isPlaying,
  onTogglePlay,
  onZoomToFit,
}: TimelineToolbarProps) {
  const {
    activeTool,
    snappingEnabled,
    zoomPxPerMs,
    selectedClipId,
    setActiveTool,
    toggleSnapping,
    setZoomPxPerMs,
    splitAtPlayhead,
    deleteSelectedClip,
  } = useTimelineTools();

  // High-frequency timecode subscription without causing general toolbar re-renders
  const [displayTimeMs, setDisplayTimeMs] = useState(
    timelineStore.getState().currentTimeMs,
  );

  useEffect(() => {
    return timelineStore.subscribeTime((ms) => {
      setDisplayTimeMs(ms);
    });
  }, []);

  return (
    <div className="h-10 w-full flex items-center justify-between px-3 bg-secondary/40 border-b border-border/40 select-none text-xs">
      {/* ── Left Editing Tools ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-1">
        {/* Pointer / Select Tool */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={activeTool === 'select' ? 'secondary' : 'ghost'}
              size="icon"
              className={`h-7 w-7 ${activeTool === 'select' ? 'text-primary font-bold shadow-sm' : 'text-muted-foreground'}`}
              onClick={() => setActiveTool('select')}
            >
              <MousePointerIcon className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Select Tool (V)</TooltipContent>
        </Tooltip>

        {/* Split Blade Tool */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={activeTool === 'blade' ? 'secondary' : 'ghost'}
              size="icon"
              className={`h-7 w-7 ${activeTool === 'blade' ? 'text-rose-400 font-bold shadow-sm' : 'text-muted-foreground'}`}
              onClick={() =>
                setActiveTool(activeTool === 'blade' ? 'select' : 'blade')
              }
            >
              <ScissorsIcon className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Razor Blade Tool (C) — Click clip to cut
          </TooltipContent>
        </Tooltip>

        {/* Split at Playhead */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={splitAtPlayhead}
            >
              <SplitIcon className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Split at Playhead (Cmd+B)</TooltipContent>
        </Tooltip>

        {/* Delete Selected */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={deleteSelectedClip}
              disabled={!selectedClipId}
            >
              <Trash2Icon className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete Clip (Del)</TooltipContent>
        </Tooltip>

        <div className="w-[1px] h-4 bg-border/60 mx-1" />

        {/* Magnetic Snapping Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={snappingEnabled ? 'secondary' : 'ghost'}
              size="icon"
              className={`h-7 w-7 ${snappingEnabled ? 'text-cyan-400' : 'text-muted-foreground/60'}`}
              onClick={toggleSnapping}
            >
              <MagnetIcon className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Magnetic Snapping {snappingEnabled ? '(ON)' : '(OFF)'}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* ── Center Transport & Timecode ─────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Button
          variant="default"
          size="icon"
          className="h-7 w-7 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
          onClick={onTogglePlay}
        >
          {isPlaying ? (
            <PauseIcon className="w-3.5 h-3.5 fill-current" />
          ) : (
            <PlayIcon className="w-3.5 h-3.5 fill-current ml-0.5" />
          )}
        </Button>

        <div className="font-mono text-xs flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/30 border border-border/30">
          <span className="text-foreground font-semibold">
            {formatTimecode(displayTimeMs)}
          </span>
          <span className="opacity-40">/</span>
          <span className="text-muted-foreground">
            {formatTimecode(durationMs)}
          </span>
        </div>
      </div>

      {/* ── Right Zoom Controls ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <ZoomOutIcon className="w-3 h-3 text-muted-foreground" />
        <div className="w-24">
          <Slider
            value={[zoomPxPerMs]}
            min={0.02}
            max={0.35}
            step={0.005}
            onValueChange={([val]) => setZoomPxPerMs(val)}
            className="cursor-pointer"
          />
        </div>
        <ZoomInIcon className="w-3 h-3 text-muted-foreground" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={onZoomToFit}
            >
              <Maximize2Icon className="w-3 h-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom to Fit Timeline</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
