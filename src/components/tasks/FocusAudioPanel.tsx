/**
 * components/tasks/FocusAudioPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Soundscape controls for focus mode: a noise bed and an optional binaural
 * beat layer, both synthesized live (see lib/focus-audio.ts).
 *
 * Purely presentational — all playback state comes from `useFocusAudio`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { HeadphonesIcon, PauseIcon, PlayIcon, WavesIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import {
  BRAINWAVE_PRESETS,
  NOISE_META,
  type NoiseType,
} from '@/lib/focus-audio';
import type { UseFocusAudioReturn } from '@/hooks/use-focus-audio';

const NOISE_ORDER: NoiseType[] = ['white', 'pink', 'brown'];

export interface FocusAudioPanelProps {
  audio: UseFocusAudioReturn;
  className?: string;
}

export function FocusAudioPanel({ audio, className }: FocusAudioPanelProps) {
  const { config, playing, toggle, setConfig } = audio;

  return (
    <div
      className={cn(
        'flex w-full flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4',
        className,
      )}
    >
      {/* Header + transport */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <WavesIcon className="size-4 text-sky-400" />
          <span className="text-xs font-medium uppercase tracking-widest text-zinc-400">
            Soundscape
          </span>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className={cn(
            'size-8 rounded-full text-zinc-300 hover:bg-zinc-800',
            playing && 'text-sky-400',
          )}
          onClick={() => void toggle()}
          aria-label={playing ? 'Pause soundscape' : 'Play soundscape'}
        >
          {playing ? (
            <PauseIcon className="size-4" />
          ) : (
            <PlayIcon className="size-4" />
          )}
        </Button>
      </div>

      {/* Noise bed */}
      <div className="flex flex-col gap-2.5">
        <ToggleGroup
          type="single"
          value={config.noise ?? 'off'}
          onValueChange={(value) =>
            setConfig({ noise: (value || 'off') === 'off' ? null : (value as NoiseType) })
          }
          size="sm"
          className="w-full"
        >
          <ToggleGroupItem value="off" className="flex-1 text-[11px]">
            Off
          </ToggleGroupItem>
          {NOISE_ORDER.map((type) => (
            <ToggleGroupItem
              key={type}
              value={type}
              className="flex-1 text-[11px]"
              title={NOISE_META[type].hint}
            >
              {NOISE_META[type].label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {config.noise && (
          <div className="flex items-center gap-3">
            <span className="w-10 shrink-0 text-[10px] text-zinc-500">Vol</span>
            <Slider
              value={[Math.round(config.noiseVolume * 100)]}
              onValueChange={([v]) => setConfig({ noiseVolume: v / 100 })}
              max={100}
              step={1}
              aria-label="Noise volume"
            />
          </div>
        )}
      </div>

      {/* Binaural layer */}
      <div className="flex flex-col gap-2.5 border-t border-zinc-800 pt-3">
        <label className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs text-zinc-400">
            <HeadphonesIcon className="size-3.5 text-violet-400" />
            Binaural beats
          </span>
          <Switch
            size="sm"
            checked={config.binaural}
            onCheckedChange={(checked) => setConfig({ binaural: checked })}
          />
        </label>

        {config.binaural && (
          <div className="flex flex-col gap-3">
            <ToggleGroup
              type="single"
              value={String(config.beatHz)}
              onValueChange={(value) =>
                value && setConfig({ beatHz: Number(value) })
              }
              size="sm"
              className="w-full"
            >
              {BRAINWAVE_PRESETS.map((preset) => (
                <ToggleGroupItem
                  key={preset.label}
                  value={String(preset.beatHz)}
                  className="flex-1 text-[11px]"
                  title={`${preset.hint} · ${preset.beatHz} Hz`}
                >
                  {preset.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <div className="flex items-center gap-3">
              <span className="w-10 shrink-0 text-[10px] text-zinc-500">
                {Math.round(config.carrierHz)}Hz
              </span>
              <Slider
                value={[Math.round(config.carrierHz)]}
                onValueChange={([v]) => setConfig({ carrierHz: v })}
                min={80}
                max={440}
                step={5}
                aria-label="Carrier frequency"
              />
            </div>

            <div className="flex items-center gap-3">
              <span className="w-10 shrink-0 text-[10px] text-zinc-500">Vol</span>
              <Slider
                value={[Math.round(config.binauralVolume * 100)]}
                onValueChange={([v]) => setConfig({ binauralVolume: v / 100 })}
                max={100}
                step={1}
                aria-label="Binaural volume"
              />
            </div>

            <p className="text-[10px] leading-relaxed text-zinc-600">
              Use headphones — the beat is created between your ears.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
