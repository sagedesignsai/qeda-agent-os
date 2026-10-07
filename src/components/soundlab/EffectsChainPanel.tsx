/**
 * components/soundlab/EffectsChainPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A strip of toggleable effect pills (EQ, Reverb, Delay) with popovers for
 * parameter sliders. All changes apply live via engine.updateTrackEffects().
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { soundLabStore } from '@/hooks/use-soundlab-store';
import { getEngine } from '@/hooks/use-soundlab';
import type { SoundLabTrack, SoundLabTrackConfig } from '@/lib/soundlab-types';

interface Props { track: SoundLabTrack }

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function updateCfg(track: SoundLabTrack, patch: Partial<SoundLabTrackConfig>) {
  const next = { ...track.config, ...patch };
  soundLabStore.updateTrack(track.id, { config: next });
  getEngine().updateTrackEffects(track.id, next);
}

function EffectPill({
  label,
  active,
  children,
}: {
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-5 rounded-full border px-2 text-[9px] font-semibold uppercase tracking-wider transition-all',
            active
              ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15'
              : 'border-border/30 text-muted-foreground/60 hover:border-border/60 hover:text-muted-foreground',
          )}
        >
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-52 p-3">
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function EffectsChainPanel({ track }: Props) {
  const cfg = track.config;

  return (
    <div className="flex items-center gap-1 pl-1.5 pt-0.5">
      {/* EQ */}
      <EffectPill label="EQ" active={!!cfg.eq}>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          EQ
        </p>
        {[
          { key: 'lowGain',  label: 'Low',  val: cfg.eq?.lowGain  ?? 0 },
          { key: 'midGain',  label: 'Mid',  val: cfg.eq?.midGain  ?? 0 },
          { key: 'highGain', label: 'High', val: cfg.eq?.highGain ?? 0 },
        ].map(({ key, label, val }) => (
          <div key={key} className="flex items-center gap-2 mb-2">
            <span className="w-7 text-[10px] text-muted-foreground">{label}</span>
            <Slider
              value={[val]}
              min={-12}
              max={12}
              step={0.5}
              onValueChange={([v]) => {
                updateCfg(track, {
                  eq: { lowGain: 0, midGain: 0, highGain: 0, midFreq: 1000, ...(cfg.eq ?? {}), [key]: v },
                });
              }}
              className="flex-1"
            />
            <span className="w-7 text-right text-[9px] tabular-nums text-muted-foreground">
              {val > 0 ? '+' : ''}{val}
            </span>
          </div>
        ))}
      </EffectPill>

      {/* Reverb */}
      <EffectPill label="Rev" active={!!cfg.reverb}>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Reverb
        </p>
        <div className="flex items-center gap-2 mb-2">
          <span className="w-8 text-[10px] text-muted-foreground">Wet</span>
          <Slider
            value={[Math.round((cfg.reverb?.wet ?? 0.25) * 100)]}
            min={0} max={100} step={1}
            onValueChange={([v]) => updateCfg(track, {
              reverb: { wet: v / 100, decay: cfg.reverb?.decay ?? 1.5 },
            })}
            className="flex-1"
          />
          <span className="w-6 text-right text-[9px] tabular-nums text-muted-foreground">
            {Math.round((cfg.reverb?.wet ?? 0.25) * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-8 text-[10px] text-muted-foreground">Dec</span>
          <Slider
            value={[cfg.reverb?.decay ?? 1.5]}
            min={0.1} max={5} step={0.1}
            onValueChange={([v]) => updateCfg(track, {
              reverb: { wet: cfg.reverb?.wet ?? 0.25, decay: v },
            })}
            className="flex-1"
          />
          <span className="w-6 text-right text-[9px] tabular-nums text-muted-foreground">
            {(cfg.reverb?.decay ?? 1.5).toFixed(1)}s
          </span>
        </div>
      </EffectPill>

      {/* Delay */}
      <EffectPill label="Dly" active={!!cfg.delay}>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Delay
        </p>
        {[
          { key: 'timeMs',   label: 'Time', val: cfg.delay?.timeMs   ?? 250, min: 0,    max: 800,  step: 10, unit: 'ms' },
          { key: 'feedback', label: 'Fdbk', val: cfg.delay?.feedback ?? 0.3, min: 0,    max: 0.95, step: 0.01, unit: '' },
          { key: 'wet',      label: 'Wet',  val: cfg.delay?.wet      ?? 0.3, min: 0,    max: 1,    step: 0.01, unit: '' },
        ].map(({ key, label, val, min, max, step, unit }) => (
          <div key={key} className="flex items-center gap-2 mb-2">
            <span className="w-7 text-[10px] text-muted-foreground">{label}</span>
            <Slider
              value={[val]}
              min={min} max={max} step={step}
              onValueChange={([v]) => updateCfg(track, {
                delay: {
                  timeMs:   cfg.delay?.timeMs   ?? 250,
                  feedback: cfg.delay?.feedback ?? 0.3,
                  wet:      cfg.delay?.wet      ?? 0.3,
                  [key]: v,
                },
              })}
              className="flex-1"
            />
            <span className="w-8 text-right text-[9px] tabular-nums text-muted-foreground">
              {key === 'timeMs' ? `${Math.round(val)}${unit}` : val.toFixed(2)}
            </span>
          </div>
        ))}
      </EffectPill>
    </div>
  );
}
