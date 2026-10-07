/**
 * components/soundlab/timeline/SoundLabTimeline.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Wrapper around SoundLabTimelineCanvas. Provides zoom controls, horizontal
 * scrollbar, and track-count-based height calculation.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { ZoomInIcon, ZoomOutIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SoundLabTimelineCanvas } from './SoundLabTimelineCanvas';
import { useSoundLabTracks } from '@/hooks/use-soundlab-store';

const MIN_PX = 4;
const MAX_PX = 80;
const DEFAULT_PX = 16; // 16px per beat ≈ 8 beats visible in 128px

export function SoundLabTimeline() {
  const [pxPerBeat, setPxPerBeat] = useState(DEFAULT_PX);
  const [scrollBeat, setScrollBeat] = useState(0);
  const tracks = useSoundLabTracks();

  const zoom = (factor: number) => {
    setPxPerBeat((p) => Math.max(MIN_PX, Math.min(MAX_PX, p * factor)));
  };

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-border/50 bg-card/40 px-2 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mr-1">
          Arrangement
        </span>
        <div className="flex-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="size-5" onClick={() => zoom(0.75)}>
              <ZoomOutIcon className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Zoom out</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="size-5" onClick={() => zoom(1.33)}>
              <ZoomInIcon className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Zoom in</TooltipContent>
        </Tooltip>
        <span className="ml-1 text-[9px] font-mono text-muted-foreground/50">
          {pxPerBeat}px/b
        </span>
      </div>

      {/* Main canvas area */}
      <ScrollArea className="flex-1">
        <SoundLabTimelineCanvas
          pxPerBeat={pxPerBeat}
          scrollBeat={scrollBeat}
          onScrollBeatChange={setScrollBeat}
        />
      </ScrollArea>
    </div>
  );
}
