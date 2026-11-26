/**
 * components/studio/features/EffectPickerDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Grid picker for clip-attached effects. Selecting an effect hands it to the
 * caller, which opens the Effects Studio for parameter fine-tuning.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import { SparklesIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StudioEffectType } from '@/lib/studio/types';
import { STUDIO_EFFECTS } from '@/lib/studio/effects/catalog';
import { FeatureDialog } from './FeatureDialog';

interface EffectPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clipName: string;
  onSelect: (effectType: StudioEffectType) => void;
}

export function EffectPickerDialog({
  open,
  onOpenChange,
  clipName,
  onSelect,
}: EffectPickerDialogProps) {
  const [selected, setSelected] = useState<StudioEffectType | null>(null);

  useEffect(() => {
    if (open) setSelected(null);
  }, [open]);

  return (
    <FeatureDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add Effect"
      description={clipName}
      icon={<SparklesIcon className="size-4 text-sky-400" />}
      helpText="Effects are attached to this clip and travel with it through trims, transforms and transitions. Intensity can be keyframed in the Effects Studio."
      width="lg"
      applyLabel="Add Effect"
      applyDisabled={!selected}
      onApply={() => {
        if (selected) onSelect(selected);
      }}
      testId="effect-picker-dialog"
    >
      <div
        role="radiogroup"
        aria-label="Effect type"
        className="grid grid-cols-1 gap-1.5 sm:grid-cols-2"
      >
        {STUDIO_EFFECTS.map((effect) => {
          const active = selected === effect.type;
          return (
            <button
              key={effect.type}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={effect.label}
              onClick={() => setSelected(effect.type)}
              className={cn(
                'flex items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors',
                active
                  ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                  : 'border-border/50 hover:border-primary/40 hover:bg-muted/50',
              )}
            >
              <span
                className="mt-0.5 size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: effect.accent }}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                  {effect.label}
                  <span className="rounded bg-muted px-1 py-px text-[8px] font-medium uppercase tracking-wide text-muted-foreground">
                    {effect.category}
                  </span>
                </span>
                <span className="mt-0.5 block text-[9px] leading-tight text-muted-foreground">
                  {effect.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </FeatureDialog>
  );
}