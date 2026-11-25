/**
 * components/studio/timeline/TimelineTrackHeaders.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Left-side track header panel:
 *   - Lock, Eye (Visibility), and Mute toggles per track
 *   - Track type badges and titles
 *   - Collapsible animation/effect lanes (mirrors the Trace timeline)
 *   - Matches vertical canvas row spacing exactly
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useMemo } from 'react';
import {
  LockIcon,
  UnlockIcon,
  EyeIcon,
  EyeOffIcon,
  Volume2Icon,
  VolumeXIcon,
  SparklesIcon,
  ZapIcon,
  SubtitlesIcon,
  VideoIcon,
  MusicIcon,
  ImageIcon,
  ArrowLeftRightIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  PlusIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
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
import {
  timelineStore,
  useTimelineState,
} from '@/hooks/use-timeline-store';
import type { TrackType } from '@/lib/studio-types';
import {
  buildTimelineRows,
  type TimelineAnimationRow,
  type TimelineEffectRow,
  type TimelineGroupRow,
  type TimelineTrackRow,
} from '@/lib/studio/timeline/rows';

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
  rulerHeight = 28,
  contentRef,
  onWheel,
}: TimelineTrackHeadersProps) {
  const { tracks, expandedTrackIds, selectedTrackId } = useTimelineState();

  const rows = useMemo(
    () => buildTimelineRows(tracks, expandedTrackIds),
    [tracks, expandedTrackIds],
  );

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

      {/* ── Track / Lane Rows (Synchronized Smooth Slide) ──────────────────── */}
      <div className="flex-1 overflow-hidden relative">
        <div ref={contentRef} className="flex flex-col will-change-transform">
          {rows.map((row) => {
            if (row.kind === 'track') {
              return (
                <TrackHeaderRow
                  key={row.id}
                  row={row}
                  tracks={tracks}
                  selected={selectedTrackId === row.track.id}
                />
              );
            }

            if (row.kind === 'group') {
              return (
                <GroupHeaderRow
                  key={row.id}
                  row={row}
                  expanded={expandedTrackIds.has(row.trackId)}
                />
              );
            }

            return <LaneHeaderRow key={row.id} row={row} />;
          })}
        </div>
      </div>
    </div>
  );
}

function TrackHeaderRow({
  row,
  tracks,
  selected,
}: {
  row: TimelineTrackRow;
  tracks: ReturnType<typeof useTimelineState>['tracks'];
  selected: boolean;
}) {
  const track = row.track;
  const siblings = tracks.filter((t) => t.type === track.type);
  const position = siblings.findIndex((t) => t.id === track.id);
  const canMoveUp = position > 0;
  const canMoveDown = position >= 0 && position < siblings.length - 1;

  return (
    <div
      data-row-kind="track"
      data-selected={selected ? 'true' : 'false'}
      style={{ height: `${row.height}px` }}
      className={`flex items-center justify-between pl-1 pr-2 border-b border-border/30 transition-colors cursor-pointer ${
        track.locked
          ? 'bg-secondary/40 opacity-70'
          : selected
            ? 'bg-primary/[0.08] hover:bg-primary/[0.12]'
            : 'bg-transparent hover:bg-secondary/20'
      }`}
      onClick={() => timelineStore.setSelectedTrackId(track.id)}
    >
      {/* Expand / collapse animation & effect lanes */}
      <div className="w-4 shrink-0 flex items-center justify-center">
        {row.canExpand ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 text-muted-foreground hover:text-foreground"
                aria-label={
                  row.expanded
                    ? `Collapse ${track.name} lanes`
                    : `Expand ${track.name} lanes`
                }
                onClick={() => timelineStore.toggleTrackExpanded(track.id)}
              >
                {row.expanded ? (
                  <ChevronDownIcon className="w-3 h-3" />
                ) : (
                  <ChevronRightIcon className="w-3 h-3" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {row.expanded ? 'Collapse lanes' : 'Expand lanes'}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="block w-3" />
        )}
      </div>

      {/* Title & Icon */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {getTrackIcon(track.type)}
        <span className="text-xs font-medium truncate text-foreground/90">
          {track.name}
        </span>
      </div>

      {/* Track Control Buttons (Reorder, Lock, Eye, Mute) */}
      <div className="flex items-center gap-0.5 shrink-0">
        {/* Reorder within lane */}
        <div className="flex flex-col -my-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-3.5 w-5 text-muted-foreground hover:text-foreground disabled:opacity-25"
            disabled={!canMoveUp}
            onClick={() => timelineStore.reorderTrack(track.id, -1)}
            aria-label={`Move ${track.name} up`}
            title="Move layer up"
          >
            <ChevronUpIcon className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-3.5 w-5 text-muted-foreground hover:text-foreground disabled:opacity-25"
            disabled={!canMoveDown}
            onClick={() => timelineStore.reorderTrack(track.id, 1)}
            aria-label={`Move ${track.name} down`}
            title="Move layer down"
          >
            <ChevronDownIcon className="w-3 h-3" />
          </Button>
        </div>

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
              onClick={() => timelineStore.toggleTrackVisibility(track.id)}
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
        {/* Volume Slider (Audio only) */}
        {track.type === 'audio' && (
          <div className="w-10 shrink-0">
            <Slider
              defaultValue={[track.volume ?? 1]}
              max={1}
              step={0.01}
              value={[track.volume ?? 1]}
              onValueChange={([v]) => timelineStore.setTrackVolume(track.id, v)}
              className="hover:cursor-grab"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function GroupHeaderRow({
  row,
  expanded,
}: {
  row: TimelineGroupRow;
  expanded: boolean;
}) {
  const isAnimations = row.group === 'animations';
  const accent = isAnimations ? '#a855f7' : '#6366f1';

  return (
    <button
      type="button"
      data-row-kind="group"
      style={{ height: `${row.height}px` }}
      onClick={() => timelineStore.toggleTrackExpanded(row.trackId)}
      className={`group flex w-full items-center gap-1.5 pl-6 pr-2 text-left border-b border-border/20 transition-colors ${
        isAnimations
          ? 'bg-purple-500/[0.055] hover:bg-purple-500/[0.1]'
          : 'bg-indigo-500/[0.055] hover:bg-indigo-500/[0.1]'
      }`}
      aria-expanded={expanded}
      title={
        expanded
          ? `Collapse ${row.label.toLowerCase()} lanes`
          : `Expand ${row.label.toLowerCase()} lanes`
      }
    >
      <span
        className="h-3 w-0.5 shrink-0 rounded-full"
        style={{ backgroundColor: accent }}
      />
      {isAnimations ? (
        <SparklesIcon className="h-3 w-3 shrink-0" style={{ color: accent }} />
      ) : (
        <ZapIcon className="h-3 w-3 shrink-0" style={{ color: accent }} />
      )}
      <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
        {row.label}
      </span>
      <span className="rounded bg-background/50 px-1 py-px text-[9px] font-mono tabular-nums text-muted-foreground">
        {row.count}
      </span>
      <span className="ml-auto text-muted-foreground/70">
        {expanded ? (
          <ChevronDownIcon className="h-3 w-3" />
        ) : (
          <ChevronRightIcon className="h-3 w-3" />
        )}
      </span>
    </button>
  );
}

function LaneHeaderRow({
  row,
}: {
  row: TimelineAnimationRow | TimelineEffectRow;
}) {
  const countLabel =
    row.kind === 'effect' && row.count === 0 ? 'static' : String(row.count);

  return (
    <div
      data-row-kind={row.kind}
      style={{ height: `${row.height}px` }}
      className="flex items-center gap-1.5 pl-10 pr-2 border-b border-border/15 bg-background/20"
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: row.color }}
      />
      <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
        {row.label}
      </span>
      <span className="shrink-0 text-[9px] font-mono tabular-nums text-muted-foreground/60">
        {countLabel}
      </span>
    </div>
  );
}
