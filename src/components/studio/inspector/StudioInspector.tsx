/**
 * components/studio/inspector/StudioInspector.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Master context-aware Studio Inspector:
 *   - Automatically renders dedicated Clip Properties section when a clip is
 *     selected on the timeline (Zoom 2D targets, Caption text, Video/Audio)
 *   - Houses modular Global Showcase Accordion sections:
 *       1. Magic Agent & Export actions
 *       2. Canvas & Framing (Aspect ratios, padding, corner radius, drop shadow)
 *       3. Wallpaper & Background (Mesh gradients, solids, custom hex)
 *       4. Camera & Kinetic Motion (Zoom intensity, easing curves)
 *       5. Subtitles & Typography (Karaoke, minimal, badge)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { SlidersIcon, XIcon, LayersIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { StudioStyling } from '@/lib/studio-types';
import { useSelectedClip, timelineStore } from '@/hooks/use-timeline-store';
import {
  MagicActionsSection,
  GlobalFramingSection,
  GlobalWallpaperSection,
  GlobalCameraSection,
  GlobalCaptionsSection,
  ClipPropertiesSection,
} from './sections';

export interface StudioInspectorProps {
  styling: StudioStyling;
  isProcessingDraft: boolean;
  isGeneratingSocialKit: boolean;
  onUpdateStyling: (updates: Partial<StudioStyling>) => void;
  onRunMagicDraft: () => void;
  onGenerateSocialKit: () => void;
  onExportVideo: (format: 'mp4' | 'gif') => void;
  onAddZoomAtPlayhead?: () => void;
  onToggleCollapse?: () => void;
}

export function StudioInspector({
  styling,
  isProcessingDraft,
  isGeneratingSocialKit,
  onUpdateStyling,
  onRunMagicDraft,
  onGenerateSocialKit,
  onExportVideo,
  onAddZoomAtPlayhead,
  onToggleCollapse,
}: StudioInspectorProps) {
  const selectedClipData = useSelectedClip();

  const handleUpdateClip = (
    clipId: string,
    patch: Parameters<typeof timelineStore.updateClip>[1],
  ) => {
    timelineStore.updateClip(clipId, patch);
  };

  const handleDeleteClip = () => {
    timelineStore.deleteSelectedClip();
  };

  const handleDeselectClip = () => {
    timelineStore.setSelectedClipId(null);
  };

  return (
    <aside
      aria-label="Studio Properties Inspector"
      className="w-full flex flex-col h-full bg-card/40 backdrop-blur-md select-none overflow-y-auto"
    >
      {/* ── Inspector Master Header ─────────────────────────────────────────── */}
      <div className="p-3 px-4 border-b border-border/40 flex items-center justify-between sticky top-0 bg-card/90 backdrop-blur-md z-10">
        <div className="flex items-center gap-2 min-w-0">
          <SlidersIcon className="w-4 h-4 text-primary shrink-0" />
          <h2 className="font-semibold text-xs text-foreground truncate">
            Studio Inspector
          </h2>
          {selectedClipData ? (
            <Badge
              variant="default"
              className="h-4 text-[9px] font-mono px-1.5 font-medium bg-primary/90 text-primary-foreground tracking-tight"
            >
              CLIP ACTIVE
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="h-4 text-[9px] font-mono px-1 font-normal bg-background/50 border-border/60 text-muted-foreground"
            >
              GLOBAL
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          {onToggleCollapse && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onToggleCollapse}
              className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Collapse inspector"
            >
              <XIcon className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Context-Aware Clip Properties Section ────────────────────────────── */}
      {selectedClipData && (
        <ClipPropertiesSection
          track={selectedClipData.track}
          clip={selectedClipData.clip}
          onUpdateClip={handleUpdateClip}
          onDeleteClip={handleDeleteClip}
          onDeselectClip={handleDeselectClip}
        />
      )}

      {/* ── Global Showcase Styling Accordion ─────────────────────────────────── */}
      <div className="flex flex-col">
        {selectedClipData && (
          <div className="px-3.5 py-2 bg-muted/20 border-b border-border/30 flex items-center gap-1.5 text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
            <LayersIcon className="w-3 h-3 text-muted-foreground/70" />
            <span>Global Showcase Styling</span>
          </div>
        )}

        {/* 1. Magic Agent & Export */}
        <MagicActionsSection
          isProcessingDraft={isProcessingDraft}
          isGeneratingSocialKit={isGeneratingSocialKit}
          onRunMagicDraft={onRunMagicDraft}
          onGenerateSocialKit={onGenerateSocialKit}
          onExportVideo={onExportVideo}
          defaultOpen={!selectedClipData}
        />

        {/* 2. Canvas & Framing */}
        <GlobalFramingSection
          styling={styling}
          onUpdateStyling={onUpdateStyling}
          defaultOpen={true}
        />

        {/* 3. Wallpaper & Theme */}
        <GlobalWallpaperSection
          styling={styling}
          onUpdateStyling={onUpdateStyling}
          defaultOpen={true}
        />

        {/* 4. Camera & Kinetic Motion */}
        <GlobalCameraSection
          styling={styling}
          onUpdateStyling={onUpdateStyling}
          onAddZoomAtPlayhead={onAddZoomAtPlayhead}
          defaultOpen={false}
        />

        {/* 5. Subtitles & Typography */}
        <GlobalCaptionsSection
          styling={styling}
          onUpdateStyling={onUpdateStyling}
          defaultOpen={false}
        />
      </div>
    </aside>
  );
}
