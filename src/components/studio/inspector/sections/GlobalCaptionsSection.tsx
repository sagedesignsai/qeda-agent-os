/**
 * components/studio/inspector/sections/GlobalCaptionsSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Subtitles and typography styling section:
 *   - Subtitles visibility toggle switch
 *   - Subtitle animation style (Karaoke, Minimal, Badge)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { SubtitlesIcon, TypeIcon } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { StudioStyling } from '@/lib/studio-types';
import {
  InspectorSection,
  InspectorSegmentedGroup,
  InspectorFieldRow,
} from '../components';

interface GlobalCaptionsSectionProps {
  styling: StudioStyling;
  onUpdateStyling: (updates: Partial<StudioStyling>) => void;
  defaultOpen?: boolean;
}

export function GlobalCaptionsSection({
  styling,
  onUpdateStyling,
  defaultOpen = true,
}: GlobalCaptionsSectionProps) {
  return (
    <InspectorSection
      title="Subtitles & Typography"
      icon={<SubtitlesIcon className="w-3.5 h-3.5 text-muted-foreground" />}
      badge={styling.showCaptions ? styling.captionStyle.toUpperCase() : 'OFF'}
      defaultOpen={defaultOpen}
    >
      {/* ── Subtitles Active Switch ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between py-0.5">
        <div className="flex flex-col gap-0.5">
          <Label className="text-xs font-medium text-foreground">
            Display Subtitles
          </Label>
          <span className="text-[10px] text-muted-foreground">
            Render dynamic captions over the canvas
          </span>
        </div>
        <Switch
          checked={styling.showCaptions}
          onCheckedChange={(showCaptions) => onUpdateStyling({ showCaptions })}
        />
      </div>

      {/* ── Subtitle Style ──────────────────────────────────────────────────── */}
      {styling.showCaptions && (
        <InspectorFieldRow
          label="Subtitle Style"
          icon={<TypeIcon className="w-3.5 h-3.5" />}
        >
          <InspectorSegmentedGroup
            value={styling.captionStyle}
            onChange={(captionStyle) =>
              onUpdateStyling({
                captionStyle: captionStyle as 'karaoke' | 'minimal' | 'badge',
              })
            }
            options={[
              {
                value: 'karaoke',
                label: 'Karaoke',
                tooltip: 'Word-by-word active glow',
              },
              {
                value: 'minimal',
                label: 'Minimal',
                tooltip: 'Clean lower third text',
              },
              {
                value: 'badge',
                label: 'Badge',
                tooltip: 'Enclosed pill background',
              },
            ]}
          />
        </InspectorFieldRow>
      )}
    </InspectorSection>
  );
}
