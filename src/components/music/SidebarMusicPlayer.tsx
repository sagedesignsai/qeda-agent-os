/**
 * components/music/SidebarMusicPlayer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * App-wide now-playing, living in the rail instead of a floating bottom pill.
 *
 * Three densities, same store:
 *   collapsed  — artwork + EQ pulse; click opens the popover
 *   popover    — full transport + scene + queue sheet entry, anchored to the rail
 *   expanded   — vertical mini player above the sidebar footer chrome
 *
 * Hidden on `/music` (that page already owns a full transport) and when nothing
 * is playing and no ambience scene is running.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import {
  AudioLinesIcon,
  ChevronUpIcon,
  HeadphonesIcon,
  ListMusicIcon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SparklesIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useSidebar } from '@/components/ui/sidebar';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/music/format';
import { useMusicPlayer } from '@/hooks/use-music-player';
import { useSoundscape } from '@/hooks/use-soundscape';
import { MusicArtwork } from './MusicArtwork';
import { NowPlaying, type NowPlayingTab } from './NowPlaying';
import { PlayerTransport } from './PlayerTransport';

function EqBars({ active }: { active: boolean }) {
  return (
    <div
      className={cn(
        'music-eq pointer-events-none absolute inset-x-0 bottom-0.5 flex h-2.5 items-end justify-center gap-px',
        !active && 'opacity-40',
      )}
      aria-hidden
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            'music-eq-bar w-0.5 rounded-full bg-primary-foreground/90',
            active && 'music-eq-bar-active',
          )}
          style={{ animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </div>
  );
}

export function SidebarMusicPlayer() {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<NowPlayingTab>('queue');
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  const {
    current,
    playing,
    positionMs,
    durationMs,
    next,
    previous,
    toggle,
    seek,
  } = useMusicPlayer();
  const { started, sceneId } = useSoundscape();

  const onMusic = location.pathname.startsWith('/music');
  const audible = Boolean(current) || started;
  if (!audible || onMusic) return null;

  const elapsed = Math.min(positionMs, durationMs || positionMs);
  const max = Math.max(1, durationMs);
  const sceneLabel = sceneId.replace(/-/g, ' ');
  const subtitle = current
    ? [current.artist, current.album].filter(Boolean).join(' — ')
    : started
      ? 'Ambience playing'
      : 'Nothing playing';

  const openSheet = (tab: NowPlayingTab) => {
    setSheetTab(tab);
    setSheetOpen(true);
    setPopoverOpen(false);
  };

  const art = (
    <MusicArtwork
      trackId={current?.id}
      title={current?.title}
      className="size-full rounded-[5px]"
      iconClassName="size-3.5"
    />
  );

  const collapsedButton = (
    <button
      type="button"
      className={cn(
        'relative mx-auto flex size-8 items-center justify-center overflow-hidden rounded-md',
        'ring-1 ring-sidebar-border/70 transition-colors',
        'hover:ring-primary/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
      )}
      aria-label={
        current
          ? `${playing ? 'Playing' : 'Paused'}: ${current.title}`
          : 'Open audio controls'
      }
    >
      <span className="relative size-full overflow-hidden rounded-md">
        {current ? (
          art
        ) : (
          <span className="flex size-full items-center justify-center rounded-md bg-primary/15 text-primary">
            <HeadphonesIcon className="size-3.5" />
          </span>
        )}
        <EqBars active={playing || started} />
      </span>
    </button>
  );

  const expandedCard = (
    <div className="overflow-hidden rounded-lg border border-sidebar-border/70 bg-sidebar-accent/35 shadow-sm">
      <div className="relative">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background: current
              ? undefined
              : 'linear-gradient(135deg, color-mix(in oklab, var(--primary) 28%, transparent), transparent 70%)',
          }}
          aria-hidden
        />
        <button
          type="button"
          className="flex w-full items-center gap-2 px-2 pt-2 pb-1.5 text-left transition-colors hover:bg-sidebar-accent/50"
          onClick={() => openSheet('queue')}
          aria-label="Open audio panel"
        >
          <span className="relative size-10 shrink-0 overflow-hidden rounded-md ring-1 ring-black/10 dark:ring-white/10">
            {current ? (
              <MusicArtwork
                trackId={current.id}
                title={current.title}
                className="size-full rounded-md"
                iconClassName="size-4"
              />
            ) : (
              <span className="flex size-full items-center justify-center bg-primary/15 text-primary">
                <HeadphonesIcon className="size-4" />
              </span>
            )}
            {(playing || started) && (
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent pt-3 pb-0.5">
                <EqBars active />
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-semibold text-sidebar-foreground">
              {current?.title ?? (started ? 'Ambience' : 'Nothing playing')}
            </span>
            <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
              {subtitle}
            </span>
          </span>
          <ChevronUpIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </button>

        <div className="px-2.5 pb-1">
          <Slider
            value={[Math.round(elapsed)]}
            onValueChange={([value]) => seek(value)}
            max={max}
            step={500}
            disabled={!current}
            aria-label="Seek"
          />
          <div className="mt-0.5 flex justify-between font-mono text-[9px] tabular-nums text-muted-foreground">
            <span>{formatDuration(elapsed)}</span>
            <span>{formatDuration(durationMs)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-1 px-1.5 pb-1.5">
          <div className="flex items-center">
            <Button
              size="icon"
              variant="ghost"
              className="size-7 rounded-full text-sidebar-foreground/80"
              onClick={() => void previous()}
              disabled={!current}
              aria-label="Previous track"
            >
              <SkipBackIcon className="size-3 fill-current" />
            </Button>
            <Button
              size="icon"
              className="size-7 rounded-full"
              onClick={() => void toggle()}
              disabled={!current}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? (
                <PauseIcon className="size-3 fill-current" />
              ) : (
                <PlayIcon className="ml-px size-3 fill-current" />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 rounded-full text-sidebar-foreground/80"
              onClick={() => void next()}
              disabled={!current}
              aria-label="Next track"
            >
              <SkipForwardIcon className="size-3 fill-current" />
            </Button>
          </div>

          <div className="flex min-w-0 items-center gap-0.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 max-w-[5.5rem] gap-1 truncate rounded-full px-1.5 text-[9px] text-muted-foreground"
              onClick={() => openSheet('scenes')}
              aria-label="Change scene"
            >
              <SparklesIcon className="size-2.5 shrink-0 text-primary" />
              <span className="truncate">{sceneLabel}</span>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-6 shrink-0 rounded-full text-muted-foreground"
              onClick={() => openSheet('queue')}
              aria-label="Open queue"
            >
              <ListMusicIcon className="size-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className={cn(collapsed && 'flex justify-center pb-1')}>
        {collapsed ? (
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>{collapsedButton}</PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                <p className="max-w-[14rem] truncate font-medium">
                  {current?.title ?? 'Ambience'}
                </p>
                <p className="max-w-[14rem] truncate text-[11px] text-muted-foreground">
                  {subtitle}
                </p>
              </TooltipContent>
            </Tooltip>
            <PopoverContent
              side="right"
              align="end"
              sideOffset={10}
              className="w-80 gap-0 overflow-hidden p-0"
            >
              <div className="border-b border-border/60 bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <AudioLinesIcon className="size-3.5 text-primary" />
                  Now playing
                </div>
              </div>
              <div className="p-3">
                {current ? (
                  <PlayerTransport
                    panel
                    onOpenQueue={() => openSheet('queue')}
                  />
                ) : (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent/40"
                    onClick={() => openSheet('scenes')}
                  >
                    <HeadphonesIcon className="size-4 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-foreground">
                        Ambience playing
                      </span>
                      <span className="text-[11px]">{sceneLabel}</span>
                    </span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1 border-t border-border/60 bg-muted/20 px-2 py-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 flex-1 gap-1 rounded-md text-[11px]"
                  onClick={() => openSheet('scenes')}
                >
                  <SparklesIcon className="size-3 text-primary" />
                  {sceneLabel}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 rounded-md px-2 text-[11px]"
                  asChild
                >
                  <Link to="/music" onClick={() => setPopoverOpen(false)}>
                    Music
                  </Link>
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          expandedCard
        )}
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border/60 px-4 py-3">
            <SheetTitle className="flex items-center gap-2 text-sm">
              <HeadphonesIcon className="size-4 text-primary" />
              Audio
            </SheetTitle>
            <SheetDescription className="text-[11px]">
              Playback keeps running anywhere in Qeda.
            </SheetDescription>
          </SheetHeader>
          <NowPlaying
            key={sheetTab}
            initialTab={sheetTab}
            className="min-h-0 flex-1"
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
