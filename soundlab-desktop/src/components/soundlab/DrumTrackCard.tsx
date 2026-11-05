/**
 * components/soundlab/DrumTrackCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Drum-track card: per-voice level indicators and preview hit buttons.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { TrackCard } from './TrackCard';
import { Button } from '@/components/ui/button';
import { soundLabStore } from '@/hooks/use-soundlab-store';
import { DRUM_VOICES, DRUM_VOICE_META } from '@/lib/soundlab-types';
import type { SoundLabTrack, DrumVoice } from '@/lib/soundlab-types';
import { getEngine } from '@/hooks/use-soundlab';

interface Props { track: SoundLabTrack; isSelected: boolean }

export function DrumTrackCard({ track, isSelected }: Props) {
  const handlePreview = (voice: DrumVoice) => {
    void getEngine().previewDrumHit(voice);
  };

  return (
    <TrackCard track={track} isSelected={isSelected}>
      <div
        className="grid grid-cols-4 gap-1 pl-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        {DRUM_VOICES.map((voice) => {
          const meta = DRUM_VOICE_META[voice];
          return (
            <Button
              key={voice}
              variant="ghost"
              className="h-7 flex-col gap-0.5 rounded-md border border-border/40 px-0 text-[9px] hover:opacity-80"
              style={{ borderColor: `${meta.color}33`, background: `${meta.color}0d` }}
              onClick={() => handlePreview(voice)}
              title={`Preview ${meta.label}`}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ background: meta.color }}
              />
              <span style={{ color: meta.color }}>{meta.label}</span>
            </Button>
          );
        })}
      </div>
    </TrackCard>
  );
}
