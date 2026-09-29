/**
 * components/studio/inspector/sections/GlobalCameraSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Global camera and kinetic motion settings:
 *   - Zoom intensity dial (1.1x - 2.4x)
 *   - Camera easing curve segmented options (smooth, snappy, cinematic)
 *   - Direct "Add Zoom at Playhead" action button
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { CameraIcon, PlusIcon, ActivityIcon, MoveIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StudioStyling } from '@/lib/studio-types';
import {
  InspectorSection,
  InspectorSliderInput,
  InspectorSegmentedGroup,
  InspectorFieldRow,
} from '../components';

interface GlobalCameraSectionProps {
  styling: StudioStyling;
  onUpdateStyling: (updates: Partial<StudioStyling>) => void;
  onAddZoomAtPlayhead?: () => void;
  defaultOpen?: boolean;
}

export function GlobalCameraSection({
  styling,
  onUpdateStyling,
  onAddZoomAtPlayhead,
  defaultOpen = true,
}: GlobalCameraSectionProps) {
  return (
    <InspectorSection
      title="Camera & Kinetic Motion"
      icon={<CameraIcon className="w-3.5 h-3.5 text-muted-foreground" />}
      badge={`${(styling.zoomIntensity ?? 1.5).toFixed(1)}x`}
      defaultOpen={defaultOpen}
    >
      {/* ── Zoom Intensity ──────────────────────────────────────────────────── */}
      <InspectorSliderInput
        label="Zoom Intensity"
        icon={<MoveIcon className="w-3.5 h-3.5" />}
        value={styling.zoomIntensity ?? 1.5}
        min={1.1}
        max={2.4}
        step={0.1}
        unit="x"
        formatValue={(val) => `${val.toFixed(1)}x`}
        onChange={(zoomIntensity) => onUpdateStyling({ zoomIntensity })}
      />

      {/* ── Camera Easing Curve ─────────────────────────────────────────────── */}
      <InspectorFieldRow
        label="Easing Curve"
        icon={<ActivityIcon className="w-3.5 h-3.5" />}
      >
        <InspectorSegmentedGroup
          value={styling.cameraEasing}
          onChange={(cameraEasing) =>
            onUpdateStyling({
              cameraEasing: cameraEasing as 'smooth' | 'snappy' | 'cinematic',
            })
          }
          options={[
            {
              value: 'smooth',
              label: 'Smooth',
              tooltip: 'Gentle cubic bezier curve',
            },
            {
              value: 'snappy',
              label: 'Snappy',
              tooltip: 'Fast dynamic punch-in',
            },
            {
              value: 'cinematic',
              label: 'Cinema',
              tooltip: 'Slow deliberate motion pan',
            },
          ]}
        />
      </InspectorFieldRow>

      {/* ── Add Zoom At Playhead ────────────────────────────────────────────── */}
      {onAddZoomAtPlayhead && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddZoomAtPlayhead}
          className="w-full gap-2 border-dashed h-8 text-xs font-medium cursor-pointer hover:bg-secondary/70 hover:border-primary/40 transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5 text-primary" />
          <span>Add Zoom At Playhead</span>
        </Button>
      )}
    </InspectorSection>
  );
}
