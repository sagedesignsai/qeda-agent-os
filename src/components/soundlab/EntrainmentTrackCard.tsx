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
import {
  BRAINWAVE_BAND_META,
  BRAINWAVE_BANDS,
  ENTRAINMENT_MODE_META,
  type EntrainmentMode,
  type BrainwaveBand,
  type SoundLabTrack,
} from '@/lib/soundlab-types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const MODES: EntrainmentMode[] = ['binaural', 'isochronic', 'monaural', 'am-embed'];
const MODE_SHORT: Record<EntrainmentMode, string> = {
  binaural:   'BIN',
  isochronic: 'ISO',
  monaural:   'MON',
  'am-embed': 'AME',
};

interface Props { track: SoundLabTrack; isSelected: boolean }

export function EntrainmentTrackCard({ track, isSelected }: Props) {
  const cfg = track.config;

  const update = (patch: Partial<typeof cfg>) =>
    soundLabStore.updateTrack(track.id, { config: { ...cfg, ...patch } });

  const band = cfg.targetBand ?? 'alpha';
  const bandMeta = BRAINWAVE_BAND_META[band];

  return (
    <TrackCard track={track} isSelected={isSelected}>
      {/* Mode pills */}
      <div className="pl-1.5" onClick={(e) => e.stopPropagation()}>
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
                <p className="font-semibold">{ENTRAINMENT_MODE_META[m].label}</p>
                <p className="text-muted-foreground">{ENTRAINMENT_MODE_META[m].hint}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </ToggleGroup>
      </div>

      {/* Band selector */}
      <div className="pl-1.5" onClick={(e) => e.stopPropagation()}>
        <ToggleGroup
          type="single"
          value={band}
          onValueChange={(v) => {
            if (!v) return;
            const b = v as BrainwaveBand;
            update({ targetBand: b, beatHz: BRAINWAVE_BAND_META[b].hz });
          }}
          spacing={0}
          size="sm"
          className="w-full"
        >
          {BRAINWAVE_BANDS.map((b) => {
            const m = BRAINWAVE_BAND_META[b];
            return (
              <Tooltip key={b}>
                <TooltipTrigger asChild>
                  <ToggleGroupItem
                    value={b}
                    variant="outline"
                    className="flex-1 h-5 text-[9px] font-semibold"
                    style={
                      band === b
                        ? { background: `${m.color}22`, color: m.color, borderColor: `${m.color}44` }
                        : undefined
                    }
                  >
                    {m.label[0]}
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {m.label} · {m.hz} Hz · {m.hint}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </ToggleGroup>
      </div>

      {/* Carrier Hz slider */}
      <div className="flex items-center gap-2 pl-1.5" onClick={(e) => e.stopPropagation()}>
        <span className="w-8 shrink-0 text-[9px] text-muted-foreground">Carr.</span>
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
      <div className="flex items-center gap-2 pl-1.5" onClick={(e) => e.stopPropagation()}>
        <span className="w-8 shrink-0 text-[9px] text-muted-foreground">Beat</span>
        <Slider
          value={[cfg.beatHz ?? bandMeta.hz]}
          onValueChange={([v]) => update({ beatHz: v })}
          min={0.5}
          max={40}
          step={0.5}
          className="flex-1"
        />
        <span
          className="w-8 text-right text-[9px] tabular-nums font-bold font-mono"
          style={{ color: bandMeta.color }}
        >
          {(cfg.beatHz ?? bandMeta.hz).toFixed(1)}Hz
        </span>
      </div>
    </TrackCard>
  );
}
