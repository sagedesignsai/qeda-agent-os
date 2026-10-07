/**
 * components/soundlab/NoiseTrackCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Noise track card: white/pink/brown selector.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { TrackCard } from './TrackCard';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { soundLabStore } from '@/hooks/use-soundlab-store';
import { NOISE_META } from '@/lib/focus-audio';
import type { NoiseType } from '@/lib/soundlab-types';
import type { SoundLabTrack } from '@/lib/soundlab-types';

interface Props { track: SoundLabTrack; isSelected: boolean }

export function NoiseTrackCard({ track, isSelected }: Props) {
  const cfg = track.config;
  const current = (cfg.noiseType ?? 'brown') as NoiseType;

  return (
    <TrackCard track={track} isSelected={isSelected}>
      <div className="pl-1.5" onClick={(e) => e.stopPropagation()}>
        <ToggleGroup
          type="single"
          value={current}
          onValueChange={(v) => {
            if (v) soundLabStore.updateTrack(track.id, { config: { ...cfg, noiseType: v as NoiseType } });
          }}
          spacing={0}
          size="sm"
          className="w-full"
        >
          {(['white', 'pink', 'brown'] as NoiseType[]).map((t) => (
            <ToggleGroupItem
              key={t}
              value={t}
              variant="outline"
              className="flex-1 h-5 text-[10px]"
              title={NOISE_META[t].hint}
            >
              {NOISE_META[t].label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </TrackCard>
  );
}
