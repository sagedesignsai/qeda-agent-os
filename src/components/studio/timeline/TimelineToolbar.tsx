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

import { useEffect, useState, type ReactNode } from 'react';
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
  CopyIcon,
  ChevronDownIcon,
  ChevronUpIcon,
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
  collapsed?: boolean;
  /** Scene scope switcher, rendered next to the transport. */
  sceneSelector?: ReactNode;
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
  collapsed = false,
  sceneSelector,
}: TimelineToolbarProps) {
  const {
    activeTool,
    snappingEnabled,
    zoomPxPerMs,
    selectedClipId,
    canUndo,
    canRedo,
    selectedTrackExpanded,
    canToggleSelectedTrack,
    toggleSelectedTrackExpanded,
    setActiveTool,
    toggleSnapping,
    setZoomPxPerMs,
    splitAtPlayhead,
    duplicateSelectedClip,
    deleteSelectedClip,
    undo,
    redo,
  } = useTimelineTools();

  return (
    <div
      role="toolbar"
      aria-label={
        collapsed ? 'Timeline playback controls' : 'Timeline editing controls'
      }
      className={`h-9 w-full flex items-center px-2 bg-background/40 border-b border-border/40 select-none text-xs gap-2 ${
        collapsed ? 'justify-center' : 'justify-between'
      }`}
    >
      {/* ── Left: Edit Tools (Compact Group) ─────────────────────────────────── */}
      <div className={collapsed ? 'hidden' : 'flex items-center gap-0.5'}>
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
              className="h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-all duration-150 hover:bg-secondary/50 active:scale-95"
              onClick={duplicateSelectedClip}
              disabled={!selectedClipId}
              aria-label="Duplicate selected clip"
            >
              <CopyIcon className="w-3 h-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Duplicate selected clip (Ctrl/⌘+D)
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive disabled:opacity-30 transition-all duration-150 hover:bg-destructive/10 active:scale-95"
              onClick={() => deleteSelectedClip(false)}
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

      {/* ── Center: Scene scope, Transport Controls & Timecode ───────────────── */}
      <div className="flex min-w-0 items-center gap-1.5">
        {sceneSelector}
        {sceneSelector && <div className="h-3 w-px bg-border/40" />}
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
          aria-label={isPlaying ? 'Pause playback' : 'Play playback'}
        >
          {isPlaying ? (
            <PauseIcon className="w-2.5 h-2.5 fill-current" />
          ) : (
            <PlayIcon className="w-2.5 h-2.5 fill-current ml-0.5" />
          )}
        </Button>

        <TimelineTimecodeDisplay durationMs={durationMs} />
      </div>

      {/* ── Right: Lane Visibility & Zoom Controls (Compact) ────────────────── */}
      <div className={collapsed ? 'hidden' : 'flex items-center gap-1'}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={!canToggleSelectedTrack}
              className="h-6 gap-1 px-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-all duration-150 hover:bg-secondary/50 active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
              onClick={toggleSelectedTrackExpanded}
              aria-label={
                selectedTrackExpanded
                  ? 'Collapse selected track lanes'
                  : 'Expand selected track lanes'
              }
            >
              {selectedTrackExpanded ? (
                <ChevronUpIcon className="w-3 h-3" />
              ) : (
                <ChevronDownIcon className="w-3 h-3" />
              )}
              <span className="hidden sm:inline">
                {selectedTrackExpanded ? 'Collapse' : 'Expand'}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {selectedTrackExpanded
              ? 'Collapse selected track lanes'
              : 'Expand selected track lanes'}
          </TooltipContent>
        </Tooltip>

        <div className="mx-0.5 h-3 w-px bg-border/40" />

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
