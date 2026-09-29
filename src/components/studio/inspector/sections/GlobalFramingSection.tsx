/**
 * components/studio/inspector/sections/GlobalFramingSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Canvas framing and layout styling section:
 *   - Aspect ratio segmented pills (16:9, 9:16, 1:1, 4:3)
 *   - Canvas inset padding slider + input (10% - 65%)
 *   - Corner radius slider + input (0px - 32px)
 *   - Elevation drop shadow segmented pills (None, Soft, Medium, Deep)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import {
  CropIcon,
  CornerUpRightIcon,
  BoxSelectIcon,
  SparkleIcon,
} from 'lucide-react';
import type { StudioStyling } from '@/lib/studio-types';
import {
  InspectorSection,
  InspectorSliderInput,
  InspectorSegmentedGroup,
  InspectorFieldRow,
} from '../components';

interface GlobalFramingSectionProps {
  styling: StudioStyling;
  onUpdateStyling: (updates: Partial<StudioStyling>) => void;
  defaultOpen?: boolean;
}

const SHADOW_PRESETS = [
  { id: 'none', label: 'None', value: 'none' },
  { id: 'sm', label: 'Soft', value: '0 10px 15px -3px rgba(0, 0, 0, 0.4)' },
  { id: 'md', label: 'Med', value: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' },
  { id: '2xl', label: 'Deep', value: '0 25px 50px -12px rgba(0, 0, 0, 0.75)' },
];

export function GlobalFramingSection({
  styling,
  onUpdateStyling,
  defaultOpen = true,
}: GlobalFramingSectionProps) {
  // Determine active shadow key
  const activeShadowPreset =
    SHADOW_PRESETS.find((p) => p.value === styling.shadow)?.id ||
    (styling.shadow === 'none' ? 'none' : '2xl');

  return (
    <InspectorSection
      title="Canvas & Framing"
      icon={<CropIcon className="w-3.5 h-3.5 text-muted-foreground" />}
      badge={styling.aspectRatio}
      defaultOpen={defaultOpen}
    >
      {/* ── Aspect Ratio ────────────────────────────────────────────────────── */}
      <InspectorFieldRow
        label="Aspect Ratio"
        icon={<BoxSelectIcon className="w-3.5 h-3.5" />}
      >
        <InspectorSegmentedGroup
          value={styling.aspectRatio}
          onChange={(aspectRatio) =>
            onUpdateStyling({
              aspectRatio: aspectRatio as '16:9' | '9:16' | '1:1' | '4:3',
            })
          }
          options={[
            {
              value: '16:9',
              label: '16:9',
              tooltip: 'Landscape (YouTube, Web)',
            },
            {
              value: '9:16',
              label: '9:16',
              tooltip: 'Vertical (Reels, TikTok)',
            },
            {
              value: '1:1',
              label: '1:1',
              tooltip: 'Square (Instagram, Twitter)',
            },
            { value: '4:3', label: '4:3', tooltip: 'Classic Screen' },
          ]}
        />
      </InspectorFieldRow>

      {/* ── Canvas Inset Padding ────────────────────────────────────────────── */}
      <InspectorSliderInput
        label="Canvas Padding"
        icon={<CropIcon className="w-3.5 h-3.5" />}
        value={styling.padding}
        min={10}
        max={65}
        step={1}
        unit="%"
        onChange={(padding) => onUpdateStyling({ padding })}
      />

      {/* ── Corner Radius ───────────────────────────────────────────────────── */}
      <InspectorSliderInput
        label="Corner Radius"
        icon={<CornerUpRightIcon className="w-3.5 h-3.5" />}
        value={styling.borderRadius}
        min={0}
        max={32}
        step={1}
        unit="px"
        onChange={(borderRadius) => onUpdateStyling({ borderRadius })}
      />

      {/* ── Drop Shadow ─────────────────────────────────────────────────────── */}
      <InspectorFieldRow
        label="Drop Shadow"
        icon={<SparkleIcon className="w-3.5 h-3.5" />}
      >
        <InspectorSegmentedGroup
          value={activeShadowPreset}
          onChange={(presetId) => {
            const match = SHADOW_PRESETS.find((p) => p.id === presetId);
            if (match) {
              onUpdateStyling({ shadow: match.value });
            }
          }}
          options={SHADOW_PRESETS.map((p) => ({
            value: p.id,
            label: p.label,
          }))}
        />
      </InspectorFieldRow>
    </InspectorSection>
  );
}
