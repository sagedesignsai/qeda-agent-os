/**
 * components/soundlab/TrackCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Base track card: color swatch, editable name, volume slider, mute/solo,
 * delete. Specialized card types compose on top of this.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { Trash2Icon, VolumeXIcon, Volume2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { soundLabStore } from '@/hooks/use-soundlab-store';
import type { SoundLabTrack } from '@/lib/soundlab-types';
import { getEngine } from '@/hooks/use-soundlab';

interface TrackCardProps {
  track: SoundLabTrack;
  isSelected: boolean;
  children?: React.ReactNode;
  className?: string;
}

export function TrackCard({ track, isSelected, children, className }: TrackCardProps) {
  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState(track.name);

  const commitName = () => {
    setEditing(false);
    const trimmed = nameVal.trim();
    if (trimmed && trimmed !== track.name) {
      soundLabStore.updateTrack(track.id, { name: trimmed });
    } else {
      setNameVal(track.name);
    }
  };

  const toggleMute = () => {
    const next = !track.muted;
    soundLabStore.updateTrack(track.id, { muted: next });
    getEngine().updateTrackMute(track.id, next);
  };

  const toggleSolo = () => {
    soundLabStore.updateTrack(track.id, { solo: !track.solo });
  };

  const handleVolume = (val: number[]) => {
    const v = (val[0] ?? 80) / 100;
    soundLabStore.updateTrack(track.id, { volume: v });
    getEngine().updateTrackVolume(track.id, v);
  };

  return (
    <div
      className={cn(
        'group relative flex flex-col gap-2 rounded-lg border bg-card/60 p-2.5 cursor-pointer transition-all',
        isSelected
          ? 'border-primary/60 bg-card shadow-sm'
          : 'border-border/40 hover:border-border/70',
        track.muted && 'opacity-50',
        className,
      )}
      onClick={() => soundLabStore.setSelectedTrack(track.id)}
    >
      {/* Color strip */}
      <div
        className="absolute left-0 inset-y-0 w-0.5 rounded-l-lg"
        style={{ background: track.color }}
      />

      {/* Header row */}
      <div className="flex items-center gap-2 pl-1.5">
        {/* Color dot */}
        <div
          className="size-2.5 shrink-0 rounded-full ring-1 ring-white/10"
          style={{ background: track.color }}
        />

        {/* Editable name */}
        {editing ? (
          <input
            autoFocus
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') { setEditing(false); setNameVal(track.name); }
            }}
            className="min-w-0 flex-1 rounded border border-ring/50 bg-background px-1.5 py-0 text-xs text-foreground focus:outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="flex-1 truncate text-xs font-medium text-foreground"
            onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
            title={track.name}
          >
            {track.name}
          </span>
        )}

        {/* Mute / Solo */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className={cn(
                'size-5 shrink-0 text-[10px] font-bold rounded',
                track.muted
                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={(e) => { e.stopPropagation(); toggleMute(); }}
            >
              {track.muted ? <VolumeXIcon className="size-3" /> : <Volume2Icon className="size-3" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            {track.muted ? 'Unmute' : 'Mute'}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className={cn(
                'size-5 shrink-0 font-bold text-[9px] rounded',
                track.solo
                  ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={(e) => { e.stopPropagation(); toggleSolo(); }}
            >
              S
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Solo</TooltipContent>
        </Tooltip>

        {/* Delete */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-5 shrink-0 text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                soundLabStore.removeTrack(track.id);
              }}
            >
              <Trash2Icon className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Remove track</TooltipContent>
        </Tooltip>
      </div>

      {/* Volume slider */}
      <div className="flex items-center gap-2 pl-1.5">
        <span className="w-5 shrink-0 text-[9px] text-muted-foreground">Vol</span>
        <Slider
          value={[Math.round(track.volume * 100)]}
          onValueChange={handleVolume}
          max={100}
          step={1}
          className="flex-1"
          onClick={(e) => e.stopPropagation()}
        />
        <span className="w-6 text-right text-[9px] tabular-nums text-muted-foreground">
          {Math.round(track.volume * 100)}
        </span>
      </div>

      {/* Slot for specialized controls */}
      {children}
    </div>
  );
}
