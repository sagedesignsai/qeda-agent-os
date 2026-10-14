/**
 * components/studio/inspector/sections/GlobalDeviceFrameSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Inspector section for SVG Device Frame Mockups:
 *   - Device model selection (None, Browser, MacBook, iPhone, Minimal SVG, Glass)
 *   - Theme selection (Dark, Light, Accent)
 *   - Address bar URL and Window Title input fields
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { MonitorIcon, GlobeIcon, TypeIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { StudioStyling, DeviceFrameType, StudioDeviceFrame } from '@/lib/studio-types';
import {
  InspectorSection,
  InspectorSegmentedGroup,
  InspectorFieldRow,
} from '../components';

interface GlobalDeviceFrameSectionProps {
  styling: StudioStyling;
  onUpdateStyling: (updates: Partial<StudioStyling>) => void;
  defaultOpen?: boolean;
}

export function GlobalDeviceFrameSection({
  styling,
  onUpdateStyling,
  defaultOpen = false,
}: GlobalDeviceFrameSectionProps) {
  const deviceFrame: StudioDeviceFrame = styling.deviceFrame || {
    type: 'none',
    title: 'Showcase Demo',
    url: 'https://qeda.app',
    theme: 'dark',
    showControls: true,
  };

  const handleUpdate = (patch: Partial<StudioDeviceFrame>) => {
    onUpdateStyling({
      deviceFrame: {
        ...deviceFrame,
        ...patch,
      },
    });
  };

  return (
    <InspectorSection
      title="Device Mockup Frame"
      icon={<MonitorIcon className="w-3.5 h-3.5 text-muted-foreground" />}
      badge={deviceFrame.type.toUpperCase()}
      defaultOpen={defaultOpen}
    >
      {/* ── Frame Model Segmented Selector ──────────────────────────────────── */}
      <InspectorFieldRow label="Frame Model" icon={<MonitorIcon className="w-3.5 h-3.5" />}>
        <InspectorSegmentedGroup
          value={deviceFrame.type}
          onChange={(val) => handleUpdate({ type: val as DeviceFrameType })}
          options={[
            { value: 'none', label: 'None', tooltip: 'Standard Window' },
            { value: 'browser', label: 'Browser', tooltip: 'Chrome / Safari' },
            { value: 'macbook', label: 'Laptop', tooltip: 'MacBook Notch' },
            { value: 'iphone', label: 'Mobile', tooltip: 'iPhone Notch' },
            { value: 'glass', label: 'Glass', tooltip: 'Frosted Glass' },
          ]}
        />
      </InspectorFieldRow>

      {/* ── Frame Color Theme ────────────────────────────────────────────────── */}
      {deviceFrame.type !== 'none' && (
        <>
          <InspectorFieldRow label="Frame Theme" icon={<MonitorIcon className="w-3.5 h-3.5" />}>
            <InspectorSegmentedGroup
              value={deviceFrame.theme || 'dark'}
              onChange={(val) => handleUpdate({ theme: val as 'dark' | 'light' | 'accent' })}
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
                { value: 'accent', label: 'Accent' },
              ]}
            />
          </InspectorFieldRow>

          {/* ── Browser Specific URL and Title Inputs ───────────────────────────── */}
          {deviceFrame.type === 'browser' && (
            <div className="flex flex-col gap-2.5 mt-2 pt-2 border-t border-border/30 text-xs">
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <GlobeIcon className="w-3 h-3 text-muted-foreground" />
                  Address Bar URL
                </Label>
                <Input
                  value={deviceFrame.url || ''}
                  placeholder="https://qeda.app"
                  onChange={(e) => handleUpdate({ url: e.target.value })}
                  className="h-7 text-xs font-mono bg-background/50"
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <TypeIcon className="w-3 h-3 text-muted-foreground" />
                  Window Title
                </Label>
                <Input
                  value={deviceFrame.title || ''}
                  placeholder="Showcase Demo"
                  onChange={(e) => handleUpdate({ title: e.target.value })}
                  className="h-7 text-xs font-mono bg-background/50"
                />
              </div>
            </div>
          )}
        </>
      )}
    </InspectorSection>
  );
}
