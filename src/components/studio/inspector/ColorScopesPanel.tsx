/**
 * components/studio/inspector/ColorScopesPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Live RGB & luminance histogram readout + 1-click film LUT presets for
 * `color-grade` effects in the Effects Studio dialog.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  COLOR_LUT_PRESETS,
  computeColorScopes,
  resolveColorLutParams,
} from '@/lib/studio/render/gl-scopes';
import { StudioPanelSection } from './components';

interface ColorScopesPanelProps {
  /** RGBA pixel buffer sampled from the preview canvas (optional in headless tests). */
  sampleRgba?: Uint8ClampedArray | null;
  /** Called when the user applies a LUT preset to the active color-grade effect. */
  onApplyLut?: (params: {
    exposure: number;
    contrast: number;
    saturation: number;
    temperature: number;
    tint: number;
  }) => void;
}

export function ColorScopesPanel({
  sampleRgba,
  onApplyLut,
}: ColorScopesPanelProps) {
  const scopes = useMemo(
    () => (sampleRgba ? computeColorScopes(sampleRgba, 32, 4) : null),
    [sampleRgba],
  );

  return (
    <div className="space-y-2">
      {onApplyLut && (
        <StudioPanelSection title="🎞 Film Looks (LUTs)" defaultOpen={true}>
          <div className="grid grid-cols-2 gap-1.5">
            {COLOR_LUT_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 justify-start px-2 text-[11px]"
                onClick={() => {
                  const resolved = resolveColorLutParams(preset.id);
                  if (resolved) onApplyLut(resolved);
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </StudioPanelSection>
      )}

      <StudioPanelSection title="📊 Color Scopes" defaultOpen={true}>
        {scopes && scopes.maxCount > 0 ? (
          <div
            aria-label="RGB and luminance histogram"
            className="flex h-16 items-end gap-px rounded border border-border/50 bg-zinc-950 p-1.5"
          >
            {Array.from({ length: scopes.bins }).map((_, i) => {
              const lumaH = Math.round((scopes.luma[i] / scopes.maxCount) * 100);
              const rH = Math.round((scopes.r[i] / scopes.maxCount) * 100);
              const gH = Math.round((scopes.g[i] / scopes.maxCount) * 100);
              const bH = Math.round((scopes.b[i] / scopes.maxCount) * 100);
              return (
                <div
                  key={i}
                  className="relative flex h-full flex-1 items-end overflow-hidden"
                >
                  <div
                    style={{ height: `${lumaH}%` }}
                    className="w-full bg-white/25"
                  />
                  <div
                    style={{ height: `${rH}%` }}
                    className="absolute bottom-0 left-0 right-0 bg-red-500/35"
                  />
                  <div
                    style={{ height: `${gH}%` }}
                    className="absolute bottom-0 left-0 right-0 bg-emerald-500/35"
                  />
                  <div
                    style={{ height: `${bH}%` }}
                    className="absolute bottom-0 left-0 right-0 bg-sky-500/35"
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded border border-dashed border-border/50 p-2 text-center text-[11px] text-muted-foreground">
            Histogram updates from live preview frames
          </div>
        )}
      </StudioPanelSection>
    </div>
  );
}
