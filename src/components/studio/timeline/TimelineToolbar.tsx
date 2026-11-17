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
  RotateCcwIcon,
  SplitIcon,
  Undo2Icon,
  Redo2Icon,
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
  onRestartPlayback: () => void;
  onZoomToFit: () => void;
}

function formatTimecode(ms: number): string {
  const totalSeconds = Math.max(0, ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const frames = Math.floor(((ms % 1000) / 1000) * 30); // 30fps frames
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

function TimelineTimecodeDisplay({ durationMs }: { durationMs: number }) {
  const [displayTimeMs, setDisplayTimeMs] = useState(
    timelineStore.getState().currentTimeMs,
  );

  useEffect(() => {
    let lastTenth = -1;
    return timelineStore.subscribeTime((ms) => {
      // Throttle display updates to tenths of a second to eliminate 60fps render churn
      const tenth = Math.floor(ms / 100);
      if (tenth !== lastTenth) {
        lastTenth = tenth;
        setDisplayTimeMs(ms);
      }
    });
  }, []);

  return (
    <div className="font-mono text-xs flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-background/50 border border-border/40">
      <span className="text-foreground font-bold tabular-nums">
        {formatTimecode(displayTimeMs)}
      </span>
      <span className="opacity-40 text-[10px]">/</span>
      <span className="text-muted-foreground text-[10px] tabular-nums">
        {formatTimecode(durationMs)}
      </span>
    </div>
  );
}

export function TimelineToolbar({
  durationMs,
  isPlaying,
  onTogglePlay,
  onRestartPlayback,
  onZoomToFit,
}: TimelineToolbarProps) {
  const {
    activeTool,
    snappingEnabled,
    zoomPxPerMs,
    selectedClipId,
    canUndo,
    canRedo,
    setActiveTool,
    toggleSnapping,
    setZoomPxPerMs,
    splitAtPlayhead,
    deleteSelectedClip,
    undo,
    redo,
  } = useTimelineTools();

  return (
    <div className="h-9 w-full flex items-center justify-between px-2 bg-background/40 border-b border-border/40 select-none text-xs gap-2">
      {/* ── Left: Edit Tools (Compact Group) ─────────────────────────────────── */}
      <div className="flex items-center gap-0.5">
        {/* Undo/Redo */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-all duration-150 hover:bg-secondary/50 active:scale-95"
              onClick={undo}
              disabled={!canUndo}
            >
              <Undo2Icon className="w-3 h-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Undo (Z)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-all duration-150 hover:bg-secondary/50 active:scale-95"
              onClick={redo}
              disabled={!canRedo}
            >
              <Redo2Icon className="w-3 h-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Redo (Shift+Z)</TooltipContent>
        </Tooltip>

        <div className="w-px h-3 bg-border/40 mx-0.5" />

        {/* Tool Selection: Select vs Blade */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={activeTool === 'select' ? 'secondary' : 'ghost'}
              size="icon"
              className={`h-6 w-6 transition-all duration-200 active:scale-95 ${
                activeTool === 'select'
                  ? 'bg-primary/15 text-primary border border-primary/40'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
              onClick={() => setActiveTool('select')}
            >
              <MousePointerIcon className="w-3 h-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Select (V)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={activeTool === 'blade' ? 'secondary' : 'ghost'}
              size="icon"
              className={`h-6 w-6 transition-all duration-200 active:scale-95 ${
                activeTool === 'blade'
                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/40'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
              onClick={() =>
                setActiveTool(activeTool === 'blade' ? 'select' : 'blade')
              }
            >
              <ScissorsIcon className="w-3 h-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Razor Blade (C)</TooltipContent>
        </Tooltip>

        <div className="w-px h-3 bg-border/40 mx-0.5" />

        {/* Clip Operations */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground transition-all duration-150 hover:bg-secondary/50 active:scale-95"
              onClick={splitAtPlayhead}
            >
              <SplitIcon className="w-3 h-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Split at Playhead (B)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive disabled:opacity-30 transition-all duration-150 hover:bg-destructive/10 active:scale-95"
              onClick={deleteSelectedClip}
              disabled={!selectedClipId}
            >
              <Trash2Icon className="w-3 h-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Delete (Del)</TooltipContent>
        </Tooltip>

        <div className="w-px h-3 bg-border/40 mx-0.5" />

        {/* Snapping */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={snappingEnabled ? 'secondary' : 'ghost'}
              size="icon"
              className={`h-6 w-6 transition-all duration-200 active:scale-95 ${
                snappingEnabled
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/40'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
              onClick={toggleSnapping}
            >
              <MagnetIcon className="w-3 h-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Snapping {snappingEnabled ? '(ON)' : '(OFF)'}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* ── Center: Transport Controls & Timecode ────────────────────────────── */}
      <div className="flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground transition-all duration-150 hover:bg-secondary/50 active:scale-95"
              onClick={onRestartPlayback}
              aria-label="Restart playback"
            >
              <RotateCcwIcon className="w-3 h-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Restart (Home)</TooltipContent>
        </Tooltip>

        <Button
          variant="default"
          size="icon"
          className="h-6 w-6 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-200 active:scale-95 shadow-sm hover:shadow-md"
          onClick={onTogglePlay}
        >
          {isPlaying ? (
            <PauseIcon className="w-2.5 h-2.5 fill-current" />
          ) : (
            <PlayIcon className="w-2.5 h-2.5 fill-current ml-0.5" />
          )}
        </Button>

        <TimelineTimecodeDisplay durationMs={durationMs} />
      </div>

      {/* ── Right: Zoom Controls (Compact) ──────────────────────────────────── */}
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground transition-all duration-150 hover:bg-secondary/50 active:scale-95"
              onClick={onZoomToFit}
            >
              <Maximize2Icon className="w-3 h-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Fit Timeline</TooltipContent>
        </Tooltip>

        <div className="flex items-center gap-0.5 px-1 transition-all duration-200">
          <ZoomOutIcon className="w-2.5 h-2.5 text-muted-foreground opacity-60" />
          <div className="w-20">
            <Slider
              value={[zoomPxPerMs]}
              min={0.02}
              max={0.35}
              step={0.005}
              onValueChange={([val]) => setZoomPxPerMs(val)}
              className="cursor-pointer"
            />
          </div>
          <ZoomInIcon className="w-2.5 h-2.5 text-muted-foreground opacity-60" />
        </div>
      </div>
    </div>
  );
}
