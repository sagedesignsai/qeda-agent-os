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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  }
}

export function TimelineTrackHeaders({
  trackHeight = 48,
  rulerHeight = 28,
}: TimelineTrackHeadersProps) {
  const tracks = useTimelineTracks();

  return (
    <div className="w-48 shrink-0 flex flex-col bg-card/60 border-r border-border/40 select-none">
      {/* ── Ruler Header Spacer ────────────────────────────────────────────── */}
      <div
        style={{ height: `${rulerHeight}px` }}
        className="w-full flex items-center px-3 border-b border-border/40 bg-secondary/30 text-[11px] font-medium text-muted-foreground"
      >
        <span>Tracks</span>
      </div>

      {/* ── Track Header Rows ──────────────────────────────────────────────── */}
      <div className="flex flex-col">
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
  );
}
