import { useState } from 'react';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { STUDIO_EFFECTS } from '@/lib/studio/effects/catalog';
import type { StudioEffect, StudioEffectType } from '@/lib/studio/types';

function EffectNumberField({
  label,
  value,
  min,
  max,
  suffix,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  disabled: boolean;
  onCommit: (value: number) => void;
}) {
  return (
    <label className="min-w-0 space-y-1 text-[10px] text-muted-foreground">
      <span className="block">{label}</span>
      <span className="flex items-center rounded border border-border/50 bg-background px-1.5">
        <input
          key={`${label}-${value}`}
          type="number"
          defaultValue={value}
          min={min}
          max={max}
          step={0.1}
          disabled={disabled}
          onBlur={(event) => {
            const next = Number(event.currentTarget.value);
            if (!Number.isFinite(next)) return;
            const clamped = Math.max(min, Math.min(max, next));
            if (Math.abs(clamped - value) > 0.0001) onCommit(clamped);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          className="h-7 min-w-0 flex-1 bg-transparent text-[11px] text-foreground outline-none disabled:opacity-60"
        />
        <span className="pl-1 text-[9px]">{suffix}</span>
      </span>
    </label>
  );
}

export function StudioCompositionEffectsPanel({
  effects,
  durationMs,
  playheadMs,
  disabled,
  onAdd,
  onUpdate,
  onRemove,
}: {
  effects: readonly StudioEffect[];
  durationMs: number;
  playheadMs: number;
  disabled: boolean;
  onAdd: (type: StudioEffectType, startMs: number) => void;
  onUpdate: (
    effectId: string,
    patch: Partial<Pick<StudioEffect, 'startMs' | 'endMs' | 'intensity'>>,
  ) => void;
  onRemove: (effectId: string) => void;
}) {
  const [newEffectType, setNewEffectType] =
    useState<StudioEffectType>('spotlight');

  return (
    <section
      aria-label="Composition effects"
      className="space-y-2 border-t border-border/50 p-3"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-medium">Canvas effects</h3>
          <p className="text-[10px] text-muted-foreground">
            Apply over the full composition.
          </p>
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {effects.length}/24
        </span>
      </div>
      <div className="flex gap-1.5">
        <select
          aria-label="Effect to add"
          value={newEffectType}
          disabled={disabled || effects.length >= 24}
          onChange={(event) => {
            const effect = STUDIO_EFFECTS.find(
              (item) => item.type === event.target.value,
            );
            if (effect) setNewEffectType(effect.type);
          }}
          className="h-8 min-w-0 flex-1 rounded-md border border-border/60 bg-background px-2 text-[11px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {STUDIO_EFFECTS.map((effect) => (
            <option key={effect.type} value={effect.type}>
              {effect.label}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8 shrink-0"
          aria-label="Add canvas effect"
          title="Add effect at the playhead"
          disabled={disabled || effects.length >= 24}
          onClick={() => onAdd(newEffectType, playheadMs)}
        >
          <PlusIcon className="size-4" />
        </Button>
      </div>

      {effects.length === 0 ? (
        <p className="rounded border border-dashed border-border/60 px-2 py-3 text-center text-[10px] text-muted-foreground">
          No effects yet. Add one at the current playhead.
        </p>
      ) : (
        <div className="space-y-2">
          {effects.map((effect) => {
            const definition = STUDIO_EFFECTS.find(
              (item) => item.type === effect.type,
            );
            const startSeconds = Number((effect.startMs / 1000).toFixed(2));
            const endSeconds = Number((effect.endMs / 1000).toFixed(2));
            return (
              <div
                key={effect.id}
                className="rounded-md border border-border/50 bg-background/70 p-2"
                style={{ borderLeftColor: definition?.accent, borderLeftWidth: 3 }}
              >
                <div className="mb-2 flex min-w-0 items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium">
                      {definition?.label ?? effect.type}
                    </p>
                    <p className="text-[9px] text-muted-foreground">
                      {definition?.category}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${definition?.label ?? effect.type}`}
                    disabled={disabled}
                    onClick={() => onRemove(effect.id)}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <EffectNumberField
                    label="Strength"
                    value={Math.round(effect.intensity * 100)}
                    min={0}
                    max={100}
                    suffix="%"
                    disabled={disabled}
                    onCommit={(value) =>
                      onUpdate(effect.id, { intensity: value / 100 })
                    }
                  />
                  <EffectNumberField
                    label="Start"
                    value={startSeconds}
                    min={0}
                    max={Math.max(0, Number(((effect.endMs - 1) / 1000).toFixed(2)))}
                    suffix="sec"
                    disabled={disabled}
                    onCommit={(value) =>
                      onUpdate(effect.id, { startMs: value * 1000 })
                    }
                  />
                  <EffectNumberField
                    label="End"
                    value={endSeconds}
                    min={Number(((effect.startMs + 1) / 1000).toFixed(2))}
                    max={Number((durationMs / 1000).toFixed(2))}
                    suffix="sec"
                    disabled={disabled}
                    onCommit={(value) =>
                      onUpdate(effect.id, { endMs: value * 1000 })
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
