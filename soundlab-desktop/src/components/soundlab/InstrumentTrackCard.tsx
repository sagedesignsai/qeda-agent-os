/**
 * components/soundlab/InstrumentTrackCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Instrument-specific controls: preset selector and waveform toggle.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { TrackCard } from './TrackCard';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { soundLabStore } from '@/hooks/use-soundlab-store';
import { SYNTH_PRESET_META } from '@/lib/soundlab-types';
import type { SoundLabTrack, SynthPreset, SynthWaveform } from '@/lib/soundlab-types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const WAVEFORMS: SynthWaveform[] = ['sine', 'triangle', 'sawtooth', 'square'];
const WAVEFORM_SYMBOLS: Record<SynthWaveform, string> = {
  sine: '∿',
  triangle: '∧',
  sawtooth: '⩘',
  square: '⊓',
};

interface Props { track: SoundLabTrack; isSelected: boolean }

export function InstrumentTrackCard({ track, isSelected }: Props) {
  const cfg = track.config;

  const update = (patch: Partial<typeof cfg>) =>
    soundLabStore.updateTrack(track.id, { config: { ...cfg, ...patch } });

  const handlePreset = (preset: SynthPreset) => {
    const meta = SYNTH_PRESET_META[preset];
    update({ preset, waveform: meta.waveform, attack: meta.attack, decay: meta.decay, sustain: meta.sustain, release: meta.release });
  };

  return (
    <TrackCard track={track} isSelected={isSelected}>
      {/* Preset selector */}
      <div className="pl-1.5" onClick={(e) => e.stopPropagation()}>
        <Select
          value={cfg.preset ?? 'clean-sine'}
          onValueChange={(v) => handlePreset(v as SynthPreset)}
        >
          <SelectTrigger className="h-6 w-full text-[10px] border-border/40 bg-background/50 px-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SYNTH_PRESET_META) as SynthPreset[]).map((p) => (
              <SelectItem key={p} value={p} className="text-[10px]">
                {SYNTH_PRESET_META[p].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Waveform pills */}
      <div className="pl-1.5" onClick={(e) => e.stopPropagation()}>
        <ToggleGroup
          type="single"
          value={cfg.waveform ?? 'sine'}
          onValueChange={(v) => v && update({ waveform: v as SynthWaveform })}
          spacing={0}
          size="sm"
          className="w-full"
        >
          {WAVEFORMS.map((w) => (
            <ToggleGroupItem
              key={w}
              value={w}
              variant="outline"
              className="flex-1 h-5 text-[11px] font-mono"
              title={w}
            >
              {WAVEFORM_SYMBOLS[w]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </TrackCard>
  );
}
