/**
 * components/music/NowPlaying.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The now-playing panel: transport, error surface, queue, scenes, layer mixer
 * and playback settings.
 *
 * It is shared by the Music page's right rail and the sidebar player's sheet, so
 * the two surfaces cannot drift. Queue/ambience state lives in the stores; only
 * which tab is open is local.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { Settings2Icon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useMusicPlayer } from '@/hooks/use-music-player';
import { PlaybackSettings } from './PlaybackSettings';
import { PlayerTransport } from './PlayerTransport';
import { QueuePanel } from './QueuePanel';
import { ScenePicker } from './ScenePicker';
import { SoundscapeMixer } from './SoundscapeMixer';

export type NowPlayingTab = 'queue' | 'scenes' | 'mix' | 'settings';

export interface NowPlayingProps {
  className?: string;
  panel?: boolean;
  /** Which tab to open on; the dock uses this to jump straight to Scenes. */
  initialTab?: NowPlayingTab;
}

export function NowPlaying({
  className,
  panel = false,
  initialTab,
}: NowPlayingProps) {
  const player = useMusicPlayer();
  const [tab, setTab] = useState<NowPlayingTab>(initialTab ?? 'queue');

  return (
    <div className={cn('flex min-h-0 min-w-0 flex-col', className)}>
      <div className="border-b border-border/60 p-3">
        <PlayerTransport panel={panel} />
        {player.error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-2">
            <p className="min-w-0 flex-1 text-[11px] text-destructive">
              {player.error}
            </p>
            <Button
              size="icon"
              variant="ghost"
              className="size-5 shrink-0 text-destructive"
              onClick={player.clearError}
              aria-label="Dismiss error"
            >
              <XIcon className="size-3" />
            </Button>
          </div>
        )}
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as NowPlayingTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="px-3 pt-3">
          <TabsList className="w-full">
            <TabsTrigger value="queue" className="flex-1 text-[11px]">
              Queue
            </TabsTrigger>
            <TabsTrigger value="scenes" className="flex-1 text-[11px]">
              Scenes
            </TabsTrigger>
            <TabsTrigger value="mix" className="flex-1 text-[11px]">
              Mix
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className="flex-1 text-[11px]"
              aria-label="Playback settings"
              title="Playback settings"
            >
              <Settings2Icon className="size-3.5" />
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="queue" className="flex min-h-0 flex-1 flex-col">
          <QueuePanel className="flex-1" />
        </TabsContent>
        <TabsContent
          value="scenes"
          className="min-h-0 flex-1 overflow-y-auto p-3"
        >
          <ScenePicker compact />
        </TabsContent>
        <TabsContent value="mix" className="min-h-0 flex-1 overflow-y-auto p-3">
          <SoundscapeMixer compact />
        </TabsContent>
        <TabsContent
          value="settings"
          className="min-h-0 flex-1 overflow-y-auto p-3"
        >
          <PlaybackSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
