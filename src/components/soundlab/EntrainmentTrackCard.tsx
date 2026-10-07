/**
 * components/soundlab/EntrainmentTrackCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Entrainment-specific controls: mode, band, carrier/beat Hz dials.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { TrackCard } from './TrackCard';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Slider } from '@/components/ui/slider';
import { soundLabStore } from '@/hooks/use-soundlab-store';
import { getEngine } from '@/hooks/use-soundlab';
import {
  ENTRAINMENT_MODE_META,
  type EntrainmentMode,
  type SoundLabTrack,
} from '@/lib/soundlab-types';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const MODES: EntrainmentMode[] = [
  'binaural',
  'isochronic',
  'monaural',
  'am-embed',
];
const MODE_SHORT: Record<EntrainmentMode, string> = {
  binaural: 'BIN',
  isochronic: 'ISO',
  monaural: 'MON',
  'am-embed': 'AME',
};
const RATE_PRESETS = [2.5, 6, 10, 18, 40] as const;

interface Props {
  track: SoundLabTrack;
  isSelected: boolean;
}

export function EntrainmentTrackCard({ track, isSelected }: Props) {
  const cfg = track.config;

  const update = (patch: Partial<typeof cfg>) => {
    const nextConfig = { ...cfg, ...patch };
    soundLabStore.updateTrack(track.id, { config: nextConfig });
    getEngine().updateEntrainmentTrack(track.id, nextConfig);
  };

  return (
    <TrackCard track={track} isSelected={isSelected}>
      {/* Mode pills */}
      <div
        className="pl-1.5"
        role="presentation"
        onClick={(e) => e.stopPropagation()}
      >
        <ToggleGroup
          type="single"
          value={cfg.mode ?? 'binaural'}
          onValueChange={(v) => v && update({ mode: v as EntrainmentMode })}
          spacing={0}
          size="sm"
          className="w-full"
        >
          {MODES.map((m) => (
            <Tooltip key={m}>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  value={m}
                  variant="outline"
                  className="flex-1 h-5 text-[9px] font-mono font-bold"
                >
                  {MODE_SHORT[m]}
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs max-w-40">
                <p className="font-semibold">
                  {ENTRAINMENT_MODE_META[m].label}
                </p>
                <p className="text-muted-foreground">
                  {ENTRAINMENT_MODE_META[m].hint}
                </p>
              </TooltipContent>
            </Tooltip>
          ))}
        </ToggleGroup>
      </div>

      {/* Physical modulation-rate presets; deliberately avoid brain-state labels. */}
      <div
        className="pl-1.5"
        role="presentation"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mb-1 block text-[9px] text-muted-foreground">
          Rate presets · Hz
        </span>
        <ToggleGroup
          type="single"
          value={String(cfg.beatHz ?? 10)}
          onValueChange={(v) => {
            if (!v) return;
            update({ beatHz: Number(v) });
          }}
          spacing={0}
          size="sm"
          className="w-full"
        >
          {RATE_PRESETS.map((rate) => {
            return (
              <Tooltip key={rate}>
                <TooltipTrigger asChild>
                  <ToggleGroupItem
                    value={String(rate)}
                    variant="outline"
                    className="flex-1 h-5 text-[9px] font-semibold"
                  >
                    {rate}
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Set modulation rate to {rate} Hz
                </TooltipContent>
              </Tooltip>
            );
          })}
        </ToggleGroup>
      </div>

      {/* Carrier Hz slider */}
      <div
        className="flex items-center gap-2 pl-1.5"
        role="presentation"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="w-8 shrink-0 text-[9px] text-muted-foreground">
          Carr.
        </span>
        <Slider
          value={[cfg.carrierHz ?? 220]}
          onValueChange={([v]) => update({ carrierHz: v })}
          min={40}
          max={880}
          step={5}
          className="flex-1"
        />
        <span className="w-8 text-right text-[9px] tabular-nums text-muted-foreground font-mono">
          {cfg.carrierHz ?? 220}Hz
        </span>
      </div>

      {/* Beat Hz display */}
      <div
        className="flex items-center gap-2 pl-1.5"
        role="presentation"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="w-8 shrink-0 text-[9px] text-muted-foreground">
          Beat
        </span>
        <Slider
          value={[cfg.beatHz ?? 10]}
          onValueChange={([v]) => update({ beatHz: v })}
          min={0.5}
          max={40}
          step={0.5}
          className="flex-1"
        />
        <span
          className="w-8 text-right text-[9px] tabular-nums font-bold font-mono"
          style={{ color: 'var(--primary)' }}
        >
          {(cfg.beatHz ?? 10).toFixed(1)}Hz
        </span>
      </div>
    </TrackCard>
  );
}
