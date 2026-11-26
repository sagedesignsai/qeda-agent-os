/**
 * components/studio/features/TextAnimatorDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Text reveal animator picker with a character-by-character live preview.
 *
 * Apply writes `clip.payload.textAnimator` ({ mode, charDurationMs, easing }).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useState } from 'react';
import { PlayIcon, RotateCcwIcon, TypeIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TextAnimator, TextAnimatorMode } from '@/lib/studio/types';
import { studioTextAnimatorUnitState } from '@/lib/studio/render/text-style';
import { FeatureDialog } from './FeatureDialog';

interface TextAnimatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clipName: string;
  text: string;
  value: TextAnimator | undefined;
  onApply: (animator: TextAnimator) => void;
}

const MODE_OPTIONS: Array<{
  value: TextAnimatorMode;
  label: string;
  description: string;
}> = [
  {
    value: 'typewriter',
    label: 'Typewriter',
    description: 'Characters appear one at a time, left to right.',
  },
  {
    value: 'fade-words',
    label: 'Fade Words',
    description: 'Words fade in sequentially, ideal for captions.',
  },
  {
    value: 'slide-up',
    label: 'Slide Up',
    description: 'Characters slide up into place with a soft fade.',
  },
];

const EASING_OPTIONS = [
  { value: 'linear', label: 'Linear' },
  { value: 'ease-out', label: 'Ease Out' },
  { value: 'ease-in-out', label: 'Ease In Out' },
  { value: 'cubic-bezier(0.22, 1, 0.36, 1)', label: 'Custom Bezier' },
];

function easeProgress(value: number, easing: string): number {
  const t = Math.max(0, Math.min(1, value));
  if (easing === 'ease-out') return 1 - (1 - t) ** 2;
  if (easing === 'ease-in-out') {
    return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  }
  if (easing.startsWith('cubic-bezier')) {
    return 1 - (1 - t) ** 3;
  }
  return t;
}

function AnimatedPreview({
  text,
  mode,
  charDurationMs,
  easing,
  playing,
  onReplay,
}: {
  text: string;
  mode: TextAnimatorMode;
  charDurationMs: number;
  easing: string;
  playing: boolean;
  onReplay: () => void;
}) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const sample = text.trim() || 'Design once, publish everywhere.';
  const characters = useMemo(() => Array.from(sample), [sample]);
  const words = useMemo(
    () => sample.split(/(\s+)/).filter((token) => token.length > 0),
    [sample],
  );
  const wordUnits = useMemo(
    () => words.filter((token) => token.trim().length > 0).length,
    [words],
  );
  const unitCount =
    mode === 'fade-words'
      ? Math.max(1, wordUnits)
      : Math.max(1, characters.length);
  const totalMs = Math.max(700, charDurationMs * unitCount);

  useEffect(() => {
    setElapsedMs(0);
  }, [sample, mode, charDurationMs, easing]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    let base = 0;
    const tick = (now: number) => {
      base += now - last;
      last = now;
      setElapsedMs(base % totalMs);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, totalMs, sample, mode, charDurationMs]);

  const rawProgress = Math.min(1, elapsedMs / totalMs);
  const progress = easeProgress(rawProgress, easing);

  return (
    <div className="relative overflow-hidden rounded-lg border border-border/60 bg-[#080b16] px-4 py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(56,189,248,0.16),transparent_55%),radial-gradient(circle_at_75%_80%,rgba(168,85,247,0.14),transparent_55%)]" />
      <p
        aria-hidden="true"
        className="relative min-h-14 text-center text-xl font-semibold tracking-tight text-white"
      >
        {mode === 'fade-words' ? (
          (() => {
            let unitIndex = -1;
            return words.map((word, index) => {
              const inert = word.trim().length === 0;
              if (!inert) unitIndex += 1;
              const state = inert
                ? { alpha: 1, rise: 0 }
                : studioTextAnimatorUnitState(
                    mode,
                    progress,
                    unitIndex,
                    unitCount,
                  );
              return (
                <span
                  key={`${word}-${index}`}
                  className="whitespace-pre"
                  style={{ opacity: state.alpha }}
                >
                  {word}
                </span>
              );
            });
          })()
        ) : (
          characters.map((character, index) => {
            const state = studioTextAnimatorUnitState(
              mode,
              progress,
              index,
              unitCount,
            );
            return (
              <span
                key={`${character}-${index}`}
                className="inline-block whitespace-pre"
                style={{
                  opacity: state.alpha,
                  transform:
                    mode === 'slide-up'
                      ? `translateY(${state.rise * 10}px)`
                      : undefined,
                }}
              >
                {character}
              </span>
            );
          })
        )}
      </p>
      <div className="relative mt-4 flex items-center justify-between gap-2">
        <div
          className="h-1 flex-1 overflow-hidden rounded-full bg-white/10"
          aria-hidden="true"
        >
          <div
            className="h-full rounded-full bg-sky-400"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-6 gap-1 border-white/15 bg-white/5 px-2 text-[10px] text-white hover:bg-white/10 hover:text-white"
          onClick={onReplay}
        >
          {playing ? (
            <RotateCcwIcon className="size-3" />
          ) : (
            <PlayIcon className="size-3" />
          )}
          Replay
        </Button>
      </div>
      <p className="relative mt-2 text-center text-[9px] text-white/45">
        {unitCount} {mode === 'fade-words' ? 'words' : 'characters'} ·{' '}
        {(totalMs / 1000).toFixed(1)}s preview
      </p>
    </div>
  );
}

export function TextAnimatorDialog({
  open,
  onOpenChange,
  clipName,
  text,
  value,
  onApply,
}: TextAnimatorDialogProps) {
  const [mode, setMode] = useState<TextAnimatorMode>(
    value?.mode ?? 'typewriter',
  );
  const [charDurationMs, setCharDurationMs] = useState(
    value?.charDurationMs ?? 120,
  );
  const [easing, setEasing] = useState(value?.easing ?? 'ease-out');
  const [previewText, setPreviewText] = useState(text);
  const [playing, setPlaying] = useState(true);
  const [replayKey, setReplayKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    setMode(value?.mode ?? 'typewriter');
    setCharDurationMs(value?.charDurationMs ?? 120);
    setEasing(value?.easing ?? 'ease-out');
    setPreviewText(text);
    setPlaying(true);
    // Reset only on open / clip change; the parent may recreate `value`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value?.mode, value?.charDurationMs, value?.easing, text]);

  return (
    <FeatureDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Text Animation"
      description={clipName}
      icon={<TypeIcon className="size-4 text-teal-400" />}
      helpText="Reveal text character-by-character or word-by-word. The animation is calculated from each clip's own start time, so it stays in sync on the timeline."
      width="lg"
      onApply={() =>
        onApply({
          mode,
          charDurationMs: Math.max(50, Math.min(500, charDurationMs)),
          easing,
        })
      }
      testId="text-animator-dialog"
      preview={
        <AnimatedPreview
          key={replayKey}
          text={previewText}
          mode={mode}
          charDurationMs={charDurationMs}
          easing={easing}
          playing={playing}
          onReplay={() => {
            setPlaying(true);
            setReplayKey((key) => key + 1);
          }}
        />
      }
    >
      <div
        role="radiogroup"
        aria-label="Text animation mode"
        className="grid grid-cols-3 gap-1.5"
      >
        {MODE_OPTIONS.map((option) => {
          const active = option.value === mode;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={option.label}
              onClick={() => setMode(option.value)}
              className={cn(
                'rounded-md border px-2 py-2 text-left transition-colors',
                active
                  ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                  : 'border-border/50 hover:border-primary/40 hover:bg-muted/50',
              )}
            >
              <span className="block text-[11px] font-semibold text-foreground">
                {option.label}
              </span>
              <span className="mt-0.5 block text-[9px] leading-tight text-muted-foreground">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[10px] font-medium text-muted-foreground">
          Character duration · {charDurationMs}ms
          <input
            type="range"
            min={50}
            max={500}
            step={10}
            value={charDurationMs}
            aria-label="Character duration in milliseconds"
            onChange={(event) => setCharDurationMs(Number(event.target.value))}
            className="h-7 w-full accent-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-medium text-muted-foreground">
          Easing
          <select
            value={easing}
            aria-label="Text animation easing"
            onChange={(event) => setEasing(event.target.value)}
            className="h-7 rounded-md border border-input bg-background px-2 text-[11px] text-foreground"
          >
            {EASING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-[10px] font-medium text-muted-foreground">
        Preview text
        <Input
          value={previewText}
          onChange={(event) => setPreviewText(event.target.value)}
          aria-label="Text animation preview text"
          className="h-7 bg-background text-xs"
        />
      </label>
    </FeatureDialog>
  );
}