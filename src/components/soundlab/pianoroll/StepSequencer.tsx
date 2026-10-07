/**
 * components/soundlab/pianoroll/StepSequencer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * 16-step drum sequencer grid for drum tracks. Supports 4 voices (Kick,
 * Snare, Hi-Hat, Clap) with individual step toggles. Step state is stored
 * in pattern.stepData[voiceIndex][stepIndex] and synced via soundLabStore.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback } from 'react';
import { soundLabStore } from '@/hooks/use-soundlab-store';
import type { SoundLabTrack, SoundLabPattern } from '@/lib/soundlab-types';
import { DRUM_VOICES, DRUM_VOICE_META } from '@/lib/soundlab-types';
import { cn } from '@/lib/utils';

const STEPS = 16;

interface StepSequencerProps {
  track: SoundLabTrack | null;
  pattern: SoundLabPattern | null;
}

export function StepSequencer({ track, pattern }: StepSequencerProps) {
  // Normalise stepData – ensure we always have DRUM_VOICES.length × STEPS booleans
  const stepData: boolean[][] = DRUM_VOICES.map((_, vi) => {
    const row = pattern?.stepData?.[vi] ?? [];
    return Array.from({ length: STEPS }, (_, si) => row[si] ?? false);
  });

  const toggleStep = useCallback(
    (voiceIdx: number, stepIdx: number) => {
      if (!track || !pattern) return;
      const newData = stepData.map((row, vi) =>
        vi === voiceIdx
          ? row.map((val, si) => (si === stepIdx ? !val : val))
          : [...row],
      );
      soundLabStore.updatePattern(track.id, pattern.id, { stepData: newData });
    },
    [track, pattern, stepData],
  );

  const clearVoice = useCallback(
    (voiceIdx: number) => {
      if (!track || !pattern) return;
      const newData = stepData.map((row, vi) =>
        vi === voiceIdx ? Array(STEPS).fill(false) as boolean[] : [...row],
      );
      soundLabStore.updatePattern(track.id, pattern.id, { stepData: newData });
    },
    [track, pattern, stepData],
  );

  // ── Empty state ───────────────────────────────────────────────────────────

  if (!track || !pattern) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Select a drum track and pattern to open the Step Sequencer.
        </p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border/50 bg-card/40 px-3 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Step Sequencer
        </span>
        <span className="text-[10px] text-muted-foreground/60">—</span>
        <span className="text-[10px] font-mono text-muted-foreground/80">{pattern.name}</span>
        <span className="ml-2 text-[10px] text-muted-foreground/50">16 steps</span>
      </div>

      {/* Grid */}
      <div className="flex flex-1 flex-col justify-center gap-1.5 overflow-auto px-4 py-3">
        {/* Step number header */}
        <div className="flex items-center gap-0.5">
          <div className="w-16 shrink-0" />
          {Array.from({ length: STEPS }, (_, i) => (
            <div
              key={i}
              className={cn(
                'flex-1 text-center text-[9px] font-mono',
                i % 4 === 0 ? 'text-muted-foreground' : 'text-muted-foreground/30',
              )}
            >
              {i % 4 === 0 ? i / 4 + 1 : '·'}
            </div>
          ))}
        </div>

        {/* Voice rows */}
        {DRUM_VOICES.map((voice, vi) => {
          const meta = DRUM_VOICE_META[voice];
          return (
            <div key={voice} className="flex items-center gap-0.5">
              {/* Voice label */}
              <button
                className="w-16 shrink-0 pr-1 text-right text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => clearVoice(vi)}
                title={`Clear ${meta.label}`}
              >
                {meta.label}
              </button>

              {/* Step buttons */}
              {Array.from({ length: STEPS }, (_, si) => {
                const active = stepData[vi][si];
                const groupStart = si % 4 === 0;
                return (
                  <button
                    key={si}
                    className={cn(
                      'flex-1 h-8 rounded-sm border transition-all duration-75',
                      'hover:opacity-90 active:scale-95',
                      groupStart && 'ml-0.5',
                      active
                        ? 'border-transparent shadow-sm'
                        : 'border-border/30 bg-card/40 hover:bg-card/70',
                    )}
                    style={active ? { background: meta.color, borderColor: meta.color } : undefined}
                    onClick={() => toggleStep(vi, si)}
                    aria-label={`${meta.label} step ${si + 1} ${active ? 'on' : 'off'}`}
                    aria-pressed={active}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
