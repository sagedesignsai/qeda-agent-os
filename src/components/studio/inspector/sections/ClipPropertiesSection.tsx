/**
 * components/studio/inspector/sections/ClipPropertiesSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Coordinates the clip inspector header, shared sections, and clip actions.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useCallback, useState } from 'react';
import {
  CameraIcon,
  SubtitlesIcon,
  VideoIcon,
  Volume2Icon,
  Trash2Icon,
  XIcon,
  SparklesIcon,
  ImageIcon,
  ArrowLeftRightIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TimelineClip, TimelineTrack } from '@/lib/studio-types';
import type { StudioMediaAsset } from '@/lib/studio/types';
import { TimecodeNudgeInput, StudioPanelSection } from '../components';
import { UniversalKeyframesSection } from './UniversalKeyframesSection';
import { ClipEffectsSection } from './ClipEffectsSection';
import { ClipAnimationsSection } from './clip-properties/ClipAnimationsSection';
import { ClipTransformSection } from './clip-properties/ClipTransformSection';
import {
  ClipAudioPropertiesSection,
  ClipTrackPropertiesSection,
} from './clip-properties/ClipTrackPropertiesSection';

interface ClipPropertiesSectionProps {
  track: TimelineTrack;
  clip: TimelineClip;
  onUpdateClip: (clipId: string, patch: Partial<TimelineClip>) => void;
  onDeleteClip: () => void;
  onDeselectClip: () => void;
  maxDurationMs?: number;
  mediaAssets?: StudioMediaAsset[];
}

export function ClipPropertiesSection({
  track,
  clip,
  onUpdateClip,
  onDeleteClip,
  onDeselectClip,
  maxDurationMs = 3600000,
  mediaAssets = [],
}: ClipPropertiesSectionProps) {
  const getTrackIcon = () => {
    switch (track.type) {
      case 'effects':
        return <CameraIcon className="w-3.5 h-3.5 text-purple-400" />;
      case 'captions':
        return <SubtitlesIcon className="w-3.5 h-3.5 text-teal-400" />;
      case 'video':
        return <VideoIcon className="w-3.5 h-3.5 text-blue-400" />;
      case 'audio':
        return <Volume2Icon className="w-3.5 h-3.5 text-amber-400" />;
      case 'overlays':
        return <ImageIcon className="w-3.5 h-3.5 text-amber-400" />;
      case 'transitions':
        return <ArrowLeftRightIcon className="w-3.5 h-3.5 text-pink-400" />;
      default:
        return <SparklesIcon className="w-3.5 h-3.5 text-primary" />;
    }
  };

  const getBadgeText = () => {
    switch (track.type) {
      case 'effects': {
        const effectType = clip.payload?.effectType;
        if (!effectType || effectType === 'zoom') {
          const scale = clip.payload?.scale ?? 1.5;
          return `ZOOM ${scale.toFixed(1)}X`;
        }
        return effectType.toUpperCase();
      }
      case 'captions':
        return 'SUBTITLE';
      case 'video':
        return 'VIDEO';
      case 'audio':
        return 'AUDIO';
      case 'overlays':
        return 'OVERLAY';
      case 'transitions':
        return `${clip.payload?.transitionType ?? 'FADE'} TRANSITION`;
      default:
        return 'CLIP';
    }
  };

  const isVisualTrack = track.type === 'video' || track.type === 'overlays';
  const isTextClip = track.type === 'captions' && clip.itemType === 'text';
  const isTransformableTrack = isVisualTrack || isTextClip;

  // Accordion state: only one section open at a time
  // The first visible section (by render order) is open by default
  const [activeSection, setActiveSection] = useState<string | null>(() => {
    if (track.type === 'effects') return 'Zoom';
    if (track.type === 'transitions') return 'Transition';
    if (track.type === 'overlays') return 'Overlay';
    if (track.type === 'captions') return isTextClip ? 'Transform' : 'Caption';
    if (track.type === 'video') return 'Video';
    if (track.type === 'audio') return 'Audio';
    return isTransformableTrack ? 'Transform' : null;
  });

  const handleSectionToggle = useCallback(
    (section: string) => (open: boolean) => {
      if (open) setActiveSection(section);
      else setActiveSection(null);
    },
    [],
  );

  return (
    <div className="border-b border-border/60">
      {/* ── Clip Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        {getTrackIcon()}
        <span className="flex-1 truncate text-[11px] font-semibold text-foreground">
          {clip.name}
        </span>
        <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
          {getBadgeText()}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onDeselectClip();
          }}
          className="h-5 w-5 text-muted-foreground hover:text-foreground"
          title="Deselect clip"
        >
          <XIcon className="w-3 h-3" />
        </Button>
      </div>

      <ClipTrackPropertiesSection
        track={track}
        clip={clip}
        onUpdateClip={onUpdateClip}
        maxDurationMs={maxDurationMs}
        mediaAssets={mediaAssets}
        activeSection={activeSection}
        onSectionToggle={handleSectionToggle}
      />

      <ClipAnimationsSection
        clip={clip}
        onUpdateClip={onUpdateClip}
        open={activeSection === 'Animations'}
        onOpenChange={handleSectionToggle('Animations')}
      />

      {/* ── Universal Keyframes ───────────────────────────────────────────── */}
      <UniversalKeyframesSection track={track} clip={clip} />

      <ClipTransformSection
        track={track}
        clip={clip}
        onUpdateClip={onUpdateClip}
        open={activeSection === 'Transform'}
        onOpenChange={handleSectionToggle('Transform')}
      />

      <ClipAudioPropertiesSection
        track={track}
        clip={clip}
        onUpdateClip={onUpdateClip}
        activeSection={activeSection}
        onSectionToggle={handleSectionToggle}
      />

      {/* ── Timing ────────────────────────────────────────────────────────── */}
      <StudioPanelSection
        title="Timing"
        open={activeSection === 'Timing'}
        onOpenChange={handleSectionToggle('Timing')}
      >
        <TimecodeNudgeInput
          label="Start Time"
          timeMs={clip.startMs}
          min={0}
          max={maxDurationMs}
          onChange={(startMs) => onUpdateClip(clip.id, { startMs })}
        />
        <TimecodeNudgeInput
          label="Duration"
          timeMs={clip.durationMs}
          min={200}
          max={maxDurationMs}
          onChange={(durationMs) => onUpdateClip(clip.id, { durationMs })}
        />
      </StudioPanelSection>

      {/* ── Effects (Clip-Attached) ───────────────────────────────────────── */}
      {isVisualTrack && (
        <ClipEffectsSection clip={clip} onUpdateClip={onUpdateClip} />
      )}

      {/* ── Delete Clip Action ────────────────────────────────────────────── */}
      <div className="px-3 py-2 flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDeleteClip}
          className="h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5 cursor-pointer"
        >
          <Trash2Icon className="w-3 h-3" />
          <span>Delete Clip</span>
        </Button>
      </div>
    </div>
  );
}
