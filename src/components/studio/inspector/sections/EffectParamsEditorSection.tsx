/**
 * components/studio/inspector/sections/EffectParamsEditorSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Static parameter editor for a clip-attached effect.
 *
 * The controls are generated from `lib/studio/effects/params.ts`, so every
 * effect — including the WebGL colour-grade/key/motion passes — gets its
 * parameters exposed without hand-listing fields here. Missing values are
 * filled from the schema defaults before editing, which also migrates effects
 * created before their parameters shipped.
 *
 * Intensity (keyframable) is edited by `EffectKeyframeEditorSection`; this
 * section owns only the non-keyframable parameters.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { TimelineClip, ClipEffect } from '@/lib/studio-types';
import {
  getEffectParamSchema,
  normalizeEffectParams,
} from '@/lib/studio/effects/params';
import {
  StudioColorField,
  StudioFieldRow,
  StudioPanelSection,
  StudioScrubField,
} from '../components';

interface EffectParamsEditorSectionProps {
  clip: TimelineClip;
  effect: ClipEffect;
  onUpdateClip: (clipId: string, patch: Partial<TimelineClip>) => void;
}

export function EffectParamsEditorSection({
  clip,
  effect,
  onUpdateClip,
}: EffectParamsEditorSectionProps) {
  const schema = getEffectParamSchema(effect.type);
  const defs = schema ? Object.values(schema.params) : [];
  if (!schema || defs.length === 0) return null;

  // Normalise first so legacy effects gain defaults for parameters they
  // predate, and so editing one value writes the full set.
  const params = normalizeEffectParams(effect.type, effect.params);

  const updateParam = (name: string, value: number | string | boolean) => {
    const nextParams = { ...params, [name]: value };
    const effects = (clip.payload?.effects ?? []).map((candidate) =>
      candidate.id === effect.id
        ? { ...candidate, params: nextParams }
        : candidate,
    );
    onUpdateClip(clip.id, {
      payload: { ...clip.payload, effects },
    });
  };

  return (
    <StudioPanelSection title="⚙ Parameters" defaultOpen={true}>
      <div className="space-y-1.5">
        {defs.map((def) => {
          const raw = params[def.name];
          const title = def.description ?? def.label;

          if (def.type === 'color') {
            const value =
              typeof raw === 'string' ? raw : String(def.default ?? '#ffffff');
            return (
              <StudioFieldRow key={def.name} label={def.label}>
                <StudioColorField
                  label={def.label}
                  value={value}
                  onChange={(next) => updateParam(def.name, next)}
                />
              </StudioFieldRow>
            );
          }

          if (def.type === 'boolean') {
            const checked = Boolean(raw);
            return (
              <StudioFieldRow key={def.name} label={def.label}>
                <label
                  title={title}
                  className="flex h-7 items-center gap-2 text-[11px] text-muted-foreground"
                >
                  <input
                    type="checkbox"
                    aria-label={def.label}
                    checked={checked}
                    onChange={(event) =>
                      updateParam(def.name, event.target.checked)
                    }
                    className="size-3.5 accent-primary"
                  />
                  {checked ? 'On' : 'Off'}
                </label>
              </StudioFieldRow>
            );
          }

          const value =
            typeof raw === 'number' && Number.isFinite(raw)
              ? raw
              : Number(def.default ?? 0);
          return (
            <StudioFieldRow key={def.name} label={def.label}>
              <StudioScrubField
                label={def.label}
                value={value}
                min={def.min}
                max={def.max}
                step={def.step}
                onChange={(next) => updateParam(def.name, next)}
              />
            </StudioFieldRow>
          );
        })}
      </div>
    </StudioPanelSection>
  );
}
