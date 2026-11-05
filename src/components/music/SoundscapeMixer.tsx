/**
 * components/music/SoundscapeMixer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The ambient layer mixer. Shared by the focus panel and the Music page.
 *
 * Every control writes straight to the app-wide soundscape store, so the mix
 * keeps playing when the surface that opened it unmounts. That is the whole
 * reason this is a store and not a hook-local engine.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { HeadphonesIcon, PlayIcon, SquareIcon, WavesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { useSoundscape } from '@/hooks/use-soundscape';
import {
  BRAINWAVE_PRESETS,
  NOISE_META,
  SOUNDSCAPE_LAYER_LIST,
} from '@/lib/soundscape/layers';
import type { NoiseType, SoundscapeLayerId, ToneMode } from '@/lib/music/types';

const NOISE_ORDER: NoiseType[] = ['white', 'pink', 'brown'];
const TONE_ORDER: { value: ToneMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'binaural', label: 'Binaural' },
  { value: 'isochronic', label: 'Pulse' },
];

export interface SoundscapeMixerProps {
  className?: string;
  /** Hide the per-layer hint text when space is tight. */
  compact?: boolean;
}

export function SoundscapeMixer({ className, compact }: SoundscapeMixerProps) {
  const {
    state,
    started,
    setLayer,
    patchState,
    stop,
    toggle,
  } = useSoundscape();

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <WavesIcon className="size-4 text-primary" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Soundscape
            </p>
            <p className="text-[11px] text-muted-foreground/70">
              {started ? 'Playing app-wide' : 'Ready'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={started ? 'secondary' : 'default'}
            className="h-7 gap-1.5 rounded-full px-3 text-xs"
            onClick={() => void toggle()}
          >
            {started ? (
              <>
                <SquareIcon className="size-3 fill-current" /> Stop
              </>
            ) : (
              <>
                <PlayIcon className="size-3 fill-current" /> Play
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="w-14 shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
          Master
        </span>
        <Slider
          value={[Math.round(state.masterVolume * 100)]}
          onValueChange={([value]) => patchState({ masterVolume: value / 100 })}
          max={100}
          step={1}
          aria-label="Soundscape master volume"
        />
      </div>

      <section className="flex flex-col gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Field recordings
        </p>
        <div
          className={cn(
            'grid gap-2',
            compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3',
          )}
        >
          {SOUNDSCAPE_LAYER_LIST.map((layer) => {
            const active = state.layers[layer.id];
            return (
              <div
                key={layer.id}
                className={cn(
                  'flex flex-col gap-2 rounded-lg border px-2.5 py-2 transition-colors',
                  active
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border/50 bg-card/40',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">
                      {layer.label}
                    </p>
                    {!compact && (
                      <p className="truncate text-[10px] text-muted-foreground">
                        {layer.hint}
                      </p>
                    )}
                  </div>
                  <Switch
                    size="sm"
                    checked={Boolean(active)}
                    onCheckedChange={(checked) =>
                      setLayer(
                        layer.id as SoundscapeLayerId,
                        checked ? (active?.volume ?? 0.35) : null,
                      )
                    }
                    aria-label={`Toggle ${layer.label}`}
                  />
                </div>
                {active && (
                  <Slider
                    value={[Math.round(active.volume * 100)]}
                    onValueChange={([value]) =>
                      setLayer(layer.id as SoundscapeLayerId, value / 100)
                    }
                    max={100}
                    step={1}
                    aria-label={`${layer.label} volume`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3 border-t border-border/60 pt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Noise bed
          </p>
          <ToggleGroup
            type="single"
            value={state.noise ?? 'off'}
            onValueChange={(value) =>
              patchState({
                noise:
                  !value || value === 'off' ? null : (value as NoiseType),
              })
            }
            size="sm"
          >
            <ToggleGroupItem value="off" className="h-7 px-2 text-[11px]">
              Off
            </ToggleGroupItem>
            {NOISE_ORDER.map((type) => (
              <ToggleGroupItem
                key={type}
                value={type}
                className="h-7 px-2 text-[11px]"
                title={NOISE_META[type].hint}
              >
                {NOISE_META[type].label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        {state.noise && (
          <div className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-[10px] text-muted-foreground">
              Level
            </span>
            <Slider
              value={[Math.round(state.noiseVolume * 100)]}
              onValueChange={([value]) => patchState({ noiseVolume: value / 100 })}
              max={100}
              step={1}
              aria-label="Noise volume"
            />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-border/60 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <HeadphonesIcon className="size-3.5 text-primary" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Entrainment
            </p>
          </div>
          <ToggleGroup
            type="single"
            value={state.toneMode}
            onValueChange={(value) =>
              patchState({ toneMode: (value || 'off') as ToneMode })
            }
            size="sm"
          >
            {TONE_ORDER.map((tone) => (
              <ToggleGroupItem
                key={tone.value}
                value={tone.value}
                className="h-7 px-2 text-[11px]"
              >
                {tone.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {state.toneMode !== 'off' && (
          <div className="flex flex-col gap-3 rounded-lg border border-border/50 bg-card/40 p-3">
            <div className="flex flex-wrap gap-1.5">
              {BRAINWAVE_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  size="sm"
                  variant={
                    Math.abs(state.beatHz - preset.beatHz) < 0.01
                      ? 'secondary'
                      : 'ghost'
                  }
                  className="h-7 rounded-full px-2.5 text-[11px]"
                  title={`${preset.hint} · ${preset.beatHz} Hz`}
                  onClick={() => patchState({ beatHz: preset.beatHz })}
                >
                  {preset.label}
                  <span className="ml-1 text-muted-foreground">
                    {preset.beatHz}Hz
                  </span>
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="w-14 shrink-0 text-[10px] text-muted-foreground">
                Carrier
              </span>
              <Slider
                value={[Math.round(state.carrierHz)]}
                onValueChange={([value]) => patchState({ carrierHz: value })}
                min={80}
                max={440}
                step={5}
                aria-label="Carrier frequency"
              />
              <span className="w-12 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                {Math.round(state.carrierHz)}Hz
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-14 shrink-0 text-[10px] text-muted-foreground">
                Level
              </span>
              <Slider
                value={[Math.round(state.toneVolume * 100)]}
                onValueChange={([value]) => patchState({ toneVolume: value / 100 })}
                max={100}
                step={1}
                aria-label="Tone volume"
              />
            </div>
          </div>
        )}
      </section>

      {started && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start text-xs text-muted-foreground"
          onClick={() => stop()}
        >
          Stop all ambience
        </Button>
      )}
    </div>
  );
}
