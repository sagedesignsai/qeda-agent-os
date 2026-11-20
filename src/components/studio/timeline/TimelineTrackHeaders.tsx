/**
 * components/studio/timeline/TimelineTrackHeaders.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Left-side track header panel:
 *   - Lock, Eye (Visibility), and Mute toggles per track
 *   - Track type badges and titles
 *   - Matches vertical canvas track spacing exactly
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  LockIcon,
  UnlockIcon,
  EyeIcon,
  EyeOffIcon,
  Volume2Icon,
  VolumeXIcon,
  SparklesIcon,
  SubtitlesIcon,
  VideoIcon,
  MusicIcon,
  ImageIcon,
  ArrowLeftRightIcon,
  PlusIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { timelineStore, useTimelineTracks } from '@/hooks/use-timeline-store';
import type { TrackType } from '@/lib/studio-types';

interface TimelineTrackHeadersProps {
  trackHeight?: number;
  rulerHeight?: number;
  /**
   * Ref to the translated header strip. Vertical scrolling mutates this
   * element's transform directly instead of re-rendering React per frame.
   */
  contentRef?: React.Ref<HTMLDivElement>;
  onWheel?: (e: React.WheelEvent) => void;
}

function getTrackIcon(type: TrackType) {
  switch (type) {
    case 'effects':
      return <SparklesIcon className="w-3.5 h-3.5 text-purple-400" />;
    case 'captions':
      return <SubtitlesIcon className="w-3.5 h-3.5 text-teal-400" />;
    case 'video':
      return <VideoIcon className="w-3.5 h-3.5 text-slate-300" />;
    case 'audio':
      return <MusicIcon className="w-3.5 h-3.5 text-sky-400" />;
    case 'overlays':
      return <ImageIcon className="w-3.5 h-3.5 text-amber-400" />;
    case 'transitions':
      return <ArrowLeftRightIcon className="w-3.5 h-3.5 text-pink-400" />;
    default:
      return <SparklesIcon className="w-3.5 h-3.5 text-primary" />;
  }
}

export function TimelineTrackHeaders({
  trackHeight = 48,
  rulerHeight = 28,
  contentRef,
  onWheel,
}: TimelineTrackHeadersProps) {
  const tracks = useTimelineTracks();

  return (
    <div
      onWheel={onWheel}
      className="w-48 shrink-0 flex flex-col bg-card/60 border-r border-border/40 select-none overflow-hidden"
    >
      {/* ── Ruler Header Spacer (Always Fixed at Top) ────────────────────── */}
      <div
        style={{ height: `${rulerHeight}px` }}
        className="w-full flex items-center px-3 border-b border-border/40 bg-secondary/30 text-[11px] font-medium text-muted-foreground shrink-0 z-10"
      >
        <span className="flex-1">Tracks</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label="Add track"
              title="Add track"
            >
              <PlusIcon className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={() => timelineStore.addTrack('video')}>
              <VideoIcon className="mr-2 h-4 w-4" /> Video track
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => timelineStore.addTrack('audio')}>
              <MusicIcon className="mr-2 h-4 w-4" /> Audio track
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => timelineStore.addTrack('effects')}>
              <SparklesIcon className="mr-2 h-4 w-4" /> Effects track
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => timelineStore.addTrack('transitions')}>
              <ArrowLeftRightIcon className="mr-2 h-4 w-4" /> Transitions track
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => timelineStore.addTrack('captions')}>
              <SubtitlesIcon className="mr-2 h-4 w-4" /> Text track
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => timelineStore.addTrack('overlays')}>
              <ImageIcon className="mr-2 h-4 w-4" /> Overlay track
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Track Header Rows (Synchronized Smooth Slide) ──────────────────── */}
      <div className="flex-1 overflow-hidden relative">
        <div
          ref={contentRef}
          className="flex flex-col will-change-transform"
        >
          {tracks.map((track) => (
            <div
              key={track.id}
              style={{ height: `${trackHeight}px` }}
              className={`flex items-center justify-between px-2.5 border-b border-border/30 transition-colors ${
                track.locked
                  ? 'bg-secondary/40 opacity-70'
                  : 'bg-transparent hover:bg-secondary/20'
              }`}
            >
              {/* Title & Icon */}
              <div className="flex items-center gap-1.5 min-w-0">
                {getTrackIcon(track.type)}
                <span className="text-xs font-medium truncate text-foreground/90">
                  {track.name}
                </span>
              </div>

              {/* Track Control Buttons (Lock, Eye, Mute) */}
              <div className="flex items-center gap-0.5 shrink-0">
                {/* Lock Toggle */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={() => timelineStore.toggleTrackLock(track.id)}
                    >
                      {track.locked ? (
                        <LockIcon className="w-3 h-3 text-amber-400" />
                      ) : (
                        <UnlockIcon className="w-3 h-3 opacity-40 hover:opacity-100" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {track.locked ? 'Unlock Track' : 'Lock Track'}
                  </TooltipContent>
                </Tooltip>

                {/* Visibility Toggle */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        timelineStore.toggleTrackVisibility(track.id)
                      }
                    >
                      {track.visible ? (
                        <EyeIcon className="w-3 h-3 opacity-70 hover:opacity-100" />
                      ) : (
                        <EyeOffIcon className="w-3 h-3 text-rose-400" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {track.visible ? 'Hide Track' : 'Show Track'}
                  </TooltipContent>
                </Tooltip>

                {/* Mute Toggle (Audio only) */}
                {track.type === 'audio' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={() => timelineStore.toggleTrackMute(track.id)}
                      >
                        {track.muted ? (
                          <VolumeXIcon className="w-3 h-3 text-rose-400" />
                        ) : (
                          <Volume2Icon className="w-3 h-3 text-sky-400" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {track.muted ? 'Unmute Audio' : 'Mute Audio'}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
