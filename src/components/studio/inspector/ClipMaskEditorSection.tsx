/**
 * components/studio/inspector/ClipMaskEditorSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Inspector controls for GPU shape masks (`clip.payload.mask`) rendered via
 * `gl-masks.ts` (`drawMaskedSource`).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TimelineClip } from '@/lib/studio/types';
import {
  StudioFieldRow,
  StudioPanelSection,
  StudioScrubField,
} from './components';

type ClipMaskConfig = NonNullable<
  NonNullable<TimelineClip['payload']>['mask']
>;

const DEFAULT_MASK: ClipMaskConfig = {
  enabled: false,
  shape: 'circle',
  centerX: 0.5,
  centerY: 0.5,
  radiusX: 0.4,
  radiusY: 0.4,
  feather: 0.05,
  invert: false,
};

interface ClipMaskEditorSectionProps {
  mask?: ClipMaskConfig;
  onChange: (next: ClipMaskConfig) => void;
}

export function ClipMaskEditorSection({
  mask,
  onChange,
}: ClipMaskEditorSectionProps) {
  const current: ClipMaskConfig = { ...DEFAULT_MASK, ...mask };

  const patch = (partial: Partial<ClipMaskConfig>) => {
    onChange({ ...current, ...partial });
  };

  return (
    <StudioPanelSection title="◐ Shape Mask" defaultOpen={false}>
      <div className="space-y-1.5">
        <StudioFieldRow label="Enabled">
          <label className="flex h-7 items-center gap-2 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              aria-label="Enable shape mask"
              checked={Boolean(current.enabled)}
              onChange={(e) => patch({ enabled: e.target.checked })}
              className="size-3.5 accent-primary"
            />
            {current.enabled ? 'On' : 'Off'}
          </label>
        </StudioFieldRow>

        {current.enabled && (
          <>
            <StudioFieldRow label="Shape">
              <Select
                value={current.shape}
                onValueChange={(v) => patch({ shape: v as 'circle' | 'rect' })}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="circle">Circle / Ellipse</SelectItem>
                  <SelectItem value="rect">Rectangle</SelectItem>
                </SelectContent>
              </Select>
            </StudioFieldRow>

            <StudioFieldRow label="Center X">
              <StudioScrubField
                label="Mask Center X"
                value={current.centerX}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => patch({ centerX: v })}
              />
            </StudioFieldRow>

            <StudioFieldRow label="Center Y">
              <StudioScrubField
                label="Mask Center Y"
                value={current.centerY}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => patch({ centerY: v })}
              />
            </StudioFieldRow>

            <StudioFieldRow label="Radius X">
              <StudioScrubField
                label="Mask Radius X"
                value={current.radiusX}
                min={0.05}
                max={1}
                step={0.01}
                onChange={(v) => patch({ radiusX: v })}
              />
            </StudioFieldRow>

            <StudioFieldRow label="Radius Y">
              <StudioScrubField
                label="Mask Radius Y"
                value={current.radiusY}
                min={0.05}
                max={1}
                step={0.01}
                onChange={(v) => patch({ radiusY: v })}
              />
            </StudioFieldRow>

            <StudioFieldRow label="Feather">
              <StudioScrubField
                label="Mask Feather"
                value={current.feather}
                min={0.001}
                max={0.5}
                step={0.005}
                onChange={(v) => patch({ feather: v })}
              />
            </StudioFieldRow>

            <StudioFieldRow label="Invert">
              <label className="flex h-7 items-center gap-2 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  aria-label="Invert shape mask"
                  checked={Boolean(current.invert)}
                  onChange={(e) => patch({ invert: e.target.checked })}
                  className="size-3.5 accent-primary"
                />
                {current.invert ? 'Inverted' : 'Normal'}
              </label>
            </StudioFieldRow>
          </>
        )}
      </div>
    </StudioPanelSection>
  );
}
