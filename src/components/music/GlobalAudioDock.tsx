/**
 * components/music/GlobalAudioDock.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The single app-wide audio surface: focus session, transport, scene.
 *
 * It replaces the old split between a bottom-centre focus bar and a bottom-right
 * player pill. Both were rendered by the app shell, so keeping them as two
 * floating elements meant two shadows, two z-indexes and two places to look for
 * "what is playing". The focus bar is still its own component (it owns the
 * completion flow), but it renders *inside* this container.
 *
 * The dock hides on `/music` only for the transport — the page already has the
 * full player — while an active focus session stays visible everywhere except
 * behind the Tasks focus modal.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ChevronUpIcon, HeadphonesIcon, SparklesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useMusicPlayer } from '@/hooks/use-music-player';
import { useSoundscape } from '@/hooks/use-soundscape';
import { useFocusSession } from '@/hooks/use-focus-session';
import { useFocusStore } from '@/stores/focus-store';
import { FloatingFocusBar } from '@/components/focus/FloatingFocusBar';
import { NowPlaying, type NowPlayingTab } from './NowPlaying';
import { PlayerTransport } from './PlayerTransport';

export function GlobalAudioDock() {
  const [open, setOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<NowPlayingTab>('queue');
  const location = useLocation();
  const navigate = useNavigate();
  const { current } = useMusicPlayer();
  const { started, sceneId } = useSoundscape();
  const focus = useFocusSession();

  const onTasks = location.pathname.startsWith('/tasks');
  const onMusic = location.pathname.startsWith('/music');
  const showFocus =
    Boolean(focus.focusedTask) &&
    focus.displayMode !== 'closed' &&
    (focus.displayMode === 'floating' || !onTasks);
  const showTransport = Boolean(current) && !onMusic;

  if (!showFocus && !showTransport && !started) return null;

  const openTab = (tab: NowPlayingTab) => {
    setSheetTab(tab);
    setOpen(true);
  };

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex flex-col items-center gap-2 px-4">
        {showFocus && (
          <div className="pointer-events-auto w-full max-w-3xl">
            <FloatingFocusBar
              inline
              onExpand={() => {
                navigate('/tasks');
                useFocusStore.getState().setDisplayMode('modal');
              }}
            />
          </div>
        )}

        {(showTransport || started) && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/70 bg-card/95 py-1 pr-1 pl-1 shadow-xl backdrop-blur-xl">
            {showTransport ? (
              <PlayerTransport
                compact
                className="w-[min(26rem,calc(100vw-15rem))]"
                onOpenQueue={() => openTab('queue')}
              />
            ) : (
              <button
                type="button"
                className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground"
                onClick={() => openTab('scenes')}
              >
                <HeadphonesIcon className="size-3.5 text-primary" />
                Ambience playing
              </button>
            )}

            <Button
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 gap-1 rounded-full px-2 text-[10px] text-muted-foreground"
              onClick={() => openTab('scenes')}
              aria-label="Change scene"
            >
              <SparklesIcon className="size-3 text-primary" />
              {sceneId.replace(/-/g, ' ')}
            </Button>

            <Button
              size="icon"
              variant="ghost"
              className="size-7 shrink-0 rounded-full text-muted-foreground"
              onClick={() => openTab('queue')}
              aria-label="Open audio controls"
            >
              <ChevronUpIcon className="size-3.5" />
            </Button>
          </div>
        )}
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
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

          {/* Remount when the entry point changes so the requested tab wins. */}
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
