/**
 * components/studio/inspector/sections/GlobalSvgLayerSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Studio Inspector section for SVG Vector Layer animation controls:
 *   - Trim Path Write-on progress slider (0% -> 100%)
 *   - Transform matrix controls (Scale, Rotation, Position X/Y, Opacity)
 *   - Vector filter effects (Neon Glow, Drop Shadow, Blur)
 *   - Preset SVG vector picker
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { PenToolIcon, SparklesIcon, PaletteIcon, SlidersIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import type { StudioSvgLayer } from '@/lib/studio/svg-types';
import { PRESET_SVG_VECTORS } from '@/lib/studio/svg-types';
import {
  InspectorSection,
  InspectorSliderInput,
  InspectorSegmentedGroup,
  InspectorFieldRow,
} from '../components';

interface GlobalSvgLayerSectionProps {
  svgLayer: StudioSvgLayer | null;
  onUpdateSvgLayer: (patch: Partial<StudioSvgLayer>) => void;
  onAddPresetSvg: (presetId: string) => void;
  defaultOpen?: boolean;
}

export function GlobalSvgLayerSection({
  svgLayer,
  onUpdateSvgLayer,
  onAddPresetSvg,
  defaultOpen = true,
}: GlobalSvgLayerSectionProps) {
  if (!svgLayer) {
    return (
      <InspectorSection
        title="SVG Vector Motion"
      icon={<PenToolIcon className="w-3.5 h-3.5 text-sky-400" />}
        badge="PRESETS"
        defaultOpen={defaultOpen}
      >
        <div className="flex flex-col gap-2 text-xs">
          <Label className="text-[10px] text-muted-foreground">
            Add Animated Vector Preset to Canvas:
          </Label>
          <div className="grid grid-cols-2 gap-2">
            {PRESET_SVG_VECTORS.map((p) => (
              <Button
                key={p.id}
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-[11px] justify-start cursor-pointer hover:bg-sky-500/10 hover:border-sky-500/40"
                onClick={() => onAddPresetSvg(p.id)}
              >
                <PenToolIcon className="w-3 h-3 mr-1.5 text-sky-400" />
                <span className="truncate">{p.name}</span>
              </Button>
            ))}
          </div>
        </div>
      </InspectorSection>
    );
  }

  const handleUpdateTransform = (patch: Partial<StudioSvgLayer['transform']>) => {
    onUpdateSvgLayer({
      transform: {
        ...svgLayer.transform,
        ...patch,
      },
    });
  };

  const handleUpdateTrim = (patch: Partial<StudioSvgLayer['trimPath']>) => {
    onUpdateSvgLayer({
      trimPath: {
        ...svgLayer.trimPath,
        ...patch,
      },
    });
  };

  const handleUpdateFilter = (patch: Partial<StudioSvgLayer['filter']>) => {
    onUpdateSvgLayer({
      filter: {
        ...svgLayer.filter,
        ...patch,
      },
    });
  };

  return (
    <InspectorSection
      title={`SVG Layer: ${svgLayer.name}`}
      icon={<PenToolIcon className="w-3.5 h-3.5 text-sky-400" />}
      badge="VECTOR"
      defaultOpen={defaultOpen}
    >
      {/* ── Trim Path Progress Slider ───────────────────────────────────────── */}
      <InspectorSliderInput
        label="Trim Path Draw-On"
        icon={<PenToolIcon className="w-3.5 h-3.5" />}
        value={Math.round((svgLayer.trimPath.endProgress ?? 1.0) * 100)}
        min={0}
        max={100}
        step={1}
        unit="%"
        onChange={(val) => handleUpdateTrim({ endProgress: val / 100 })}
      />

      {/* ── Transform Scale ─────────────────────────────────────────────────── */}
      <InspectorSliderInput
        label="Vector Scale"
        icon={<SlidersIcon className="w-3.5 h-3.5" />}
        value={Math.round((svgLayer.transform.scale || 1.0) * 100)}
        min={10}
        max={300}
        step={5}
        unit="%"
        onChange={(val) => handleUpdateTransform({ scale: val / 100 })}
      />

      {/* ── Transform Rotation ──────────────────────────────────────────────── */}
      <InspectorSliderInput
        label="Rotation"
        icon={<SlidersIcon className="w-3.5 h-3.5" />}
        value={svgLayer.transform.rotation || 0}
        min={-180}
        max={180}
        step={5}
        unit="°"
        onChange={(rotation) => handleUpdateTransform({ rotation })}
      />

      {/* ── Filter Effect Segmented Selector ───────────────────────────────── */}
      <InspectorFieldRow label="Vector Filter" icon={<SparklesIcon className="w-3.5 h-3.5" />}>
        <InspectorSegmentedGroup
          value={svgLayer.filter.type}
          onChange={(type) =>
            handleUpdateFilter({
              type: type as StudioSvgLayer['filter']['type'],
            })
          }
          options={[
            { value: 'none', label: 'None' },
            { value: 'glow', label: 'Glow' },
            { value: 'neon', label: 'Neon' },
            { value: 'drop-shadow', label: 'Shadow' },
          ]}
        />
      </InspectorFieldRow>
    </InspectorSection>
  );
}
