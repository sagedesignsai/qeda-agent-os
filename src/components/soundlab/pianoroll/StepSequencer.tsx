/**
 * components/soundlab/pianoroll/StepSequencer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * 16-step drum sequencer grid for drum tracks. Supports 4 voices (Kick,
 * Snare, Hi-Hat, Clap) with individual step toggles. Step state is stored
 * in pattern.stepData[voiceIndex][stepIndex] and synced via soundLabStore.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Fragment, useCallback } from 'react';
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
        vi === voiceIdx ? (Array(STEPS).fill(false) as boolean[]) : [...row],
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
        <span className="text-[10px] font-mono text-muted-foreground/80">
          {pattern.name}
        </span>
        <span className="ml-2 text-[10px] text-muted-foreground/50">
          16 steps · 4 beats
        </span>
      </div>

      {/* Grid */}
      <div
        className="grid min-h-0 flex-1 gap-x-1 gap-y-2 overflow-auto px-4 py-3"
        style={{
          gridTemplateColumns: '4.5rem repeat(16, minmax(0, 1fr))',
          gridTemplateRows: '1.25rem repeat(4, minmax(2.5rem, 1fr))',
        }}
      >
        {/* Step number header */}
        <div />
        {Array.from({ length: STEPS }, (_, i) => (
          <div
            key={i}
            className={cn(
              'flex items-center justify-center border-b text-[9px] font-mono',
              i % 4 === 0
                ? 'border-primary/30 text-foreground'
                : 'border-border/30 text-muted-foreground/40',
              i % 8 >= 4 && 'bg-muted/5',
            )}
          >
            {i % 4 === 0 ? i / 4 + 1 : '·'}
          </div>
        ))}

        {/* Voice rows */}
        {DRUM_VOICES.map((voice, vi) => {
          const meta = DRUM_VOICE_META[voice];
          return (
            <Fragment key={voice}>
              <button
                className="flex min-w-0 items-center justify-end gap-1.5 pr-2 text-right text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => clearVoice(vi)}
                title={`Clear ${meta.label}`}
              >
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: meta.color }}
                />
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
                      'h-full min-h-10 min-w-0 rounded-md border transition-[background-color,border-color,box-shadow,transform] duration-100',
                      'hover:brightness-125 active:scale-[0.98]',
                      groupStart && 'border-l-2',
                      active
                        ? 'border-transparent shadow-sm ring-1 ring-white/10'
                        : cn(
                            'border-border/40 hover:border-border/80',
                            si % 8 >= 4 ? 'bg-muted/20' : 'bg-card/50',
                          ),
                    )}
                    style={
                      active
                        ? {
                            backgroundColor: meta.color,
                            borderColor: meta.color,
                          }
                        : groupStart
                          ? { borderLeftColor: `${meta.color}55` }
                          : undefined
                    }
                    onClick={() => toggleStep(vi, si)}
                    aria-label={`${meta.label} step ${si + 1} ${active ? 'on' : 'off'}`}
                    aria-pressed={active}
                  />
                );
              })}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
