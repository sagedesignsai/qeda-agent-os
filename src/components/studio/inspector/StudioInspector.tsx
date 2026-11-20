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
import { SlidersIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { StudioStyling } from '@/lib/studio-types';
import type { StudioEffectType } from '@/lib/studio/types';
import { useSelectedClip, timelineStore } from '@/hooks/use-timeline-store';
import {
  MagicActionsSection,
  GlobalFramingSection,
  GlobalDeviceFrameSection,
  GlobalMotionCardsSection,
  GlobalWallpaperSection,
  GlobalCameraSection,
  GlobalCaptionsSection,
  ClipPropertiesSection,
  EffectsPalette,
} from './sections';
import { InspectorAccordionContext } from './components/InspectorSection';

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
  // Agent actions (draft, social kit, export) are the primary commands, so they
  // own the single open slot by default; everything else is one click away.
  const [openSection, setOpenSection] = React.useState<string | null>(
    'Magic Agent & Export',
  );

  // Track drag-over state for visual feedback
  const [draggedEffect, setDraggedEffect] = React.useState<StudioEffectType | null>(null);

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

  const handleEffectDragStart = (_effectType: StudioEffectType) => {
    setDraggedEffect(_effectType);
  };

  return (
    <aside
      aria-label="Studio Properties Inspector"
      className="w-full flex flex-col h-full bg-card/40 border-l border-border/30 select-none overflow-y-auto"
    >
      {/* ── Dense Inspector Header with Mode Indicator ─────────────────────── */}
      <div className="h-9 px-2.5 border-b border-border/40 flex items-center justify-between sticky top-0 bg-background/50 backdrop-blur-sm z-10 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <SlidersIcon className="w-3.5 h-3.5 text-primary shrink-0" />
          {selectedClipData ? (
            <>
              <h2 className="font-bold text-xs text-foreground truncate">
                Clip Properties
              </h2>
              <Badge
                variant="default"
                className="h-5 text-[8px] font-mono px-1.5 font-bold bg-primary text-primary-foreground tracking-tight"
              >
                SELECTED
              </Badge>
            </>
          ) : (
            <>
              <h2 className="font-bold text-xs text-foreground">
                Global Settings
              </h2>
              <Badge
                variant="outline"
                className="h-5 text-[8px] font-mono px-1.5 font-bold bg-secondary/40 border-secondary/60 text-foreground/70 tracking-tight"
              >
                GLOBAL
              </Badge>
            </>
          )}
        </div>

        {onToggleCollapse && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            title="Collapse inspector"
          >
            <XIcon className="w-3 h-3" />
          </Button>
        )}
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
      {!selectedClipData && (
        <InspectorAccordionContext.Provider
          value={{ openTitle: openSection, setOpenTitle: setOpenSection }}
        >
          <div className="flex flex-col">
            {/* 1. Magic Agent & Export */}
            <MagicActionsSection
              isProcessingDraft={isProcessingDraft}
              isGeneratingSocialKit={isGeneratingSocialKit}
              onRunMagicDraft={onRunMagicDraft}
              onGenerateSocialKit={onGenerateSocialKit}
              onExportVideo={onExportVideo}
              defaultOpen={false}
            />

            {/* 2. Canvas & Framing */}
            <GlobalFramingSection
              styling={styling}
              onUpdateStyling={onUpdateStyling}
              defaultOpen={false}
            />

            {/* 3. Device Mockup Frame */}
            <GlobalDeviceFrameSection
              styling={styling}
              onUpdateStyling={onUpdateStyling}
              defaultOpen={false}
            />

            {/* 4. Motion Cards (Intro / Outro) */}
            <GlobalMotionCardsSection
              styling={styling}
              onUpdateStyling={onUpdateStyling}
              defaultOpen={false}
            />

            {/* 5. Wallpaper & Theme */}
            <GlobalWallpaperSection
              styling={styling}
              onUpdateStyling={onUpdateStyling}
              defaultOpen={false}
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

            {/* Effects Palette */}
            <EffectsPalette
              isOpen={false}
              onEffectDragStart={handleEffectDragStart}
            />
          </div>
        </InspectorAccordionContext.Provider>
      )}
    </aside>
  );
}
