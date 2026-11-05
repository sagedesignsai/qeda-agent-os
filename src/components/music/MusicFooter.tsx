/**
 * components/music/MusicFooter.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Mobile bottom transport bar — shows on screens below xl breakpoint.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { HeadphonesIcon, ListMusicIcon, SparklesIcon } from 'lucide-react';
import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { PlayerTransport } from '@/components/music/PlayerTransport';
import type { NowPlayingTab } from '@/components/music/NowPlaying';

export interface MusicFooterProps {
  onOpenTab: (tab: NowPlayingTab) => void;
}

function MusicFooterImpl({ onOpenTab }: MusicFooterProps) {
  return (
    <div className="border-t border-border/60 bg-card/60 xl:hidden">
      <PlayerTransport
        compact
        className="mx-auto w-full max-w-3xl"
        onOpenQueue={() => onOpenTab('queue')}
      />
      <div className="flex items-center justify-center gap-1 pb-2">
        {(
          [
            ['Queue', ListMusicIcon, 'queue'],
            ['Scenes', SparklesIcon, 'scenes'],
            ['Mix', HeadphonesIcon, 'mix'],
          ] as const
        ).map(([label, Icon, tab]) => (
          <Button
            key={label}
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-2 text-[10px] text-muted-foreground"
            onClick={() => onOpenTab(tab)}
          >
            <Icon className="size-3" /> {label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export const MusicFooter = memo(MusicFooterImpl);
