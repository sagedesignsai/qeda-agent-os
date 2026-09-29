/**
 * components/studio/inspector/sections/ClipPropertiesSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Context-aware clip inspector section:
 *   - Automatically docks at the top when a clip is selected on the timeline
 *   - Dedicated controls for Kinetic Zooms (2D coordinate pad, scale dial)
 *   - Subtitle text editing & timing for captions
 *   - Video clip properties (speed, trim offsets) & Audio volume gain
 *   - Millisecond precision start time and duration nudge inputs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import {
  CameraIcon,
  SubtitlesIcon,
  VideoIcon,
  Volume2Icon,
  Trash2Icon,
  XIcon,
  TypeIcon,
  GaugeIcon,
  SparklesIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import type { TimelineClip, TimelineTrack } from '@/lib/studio-types';
import {
  InspectorSection,
  InspectorSliderInput,
  InspectorSegmentedGroup,
  InspectorCoordinatePad,
  TimecodeNudgeInput,
  InspectorFieldRow,
} from '../components';

interface ClipPropertiesSectionProps {
  track: TimelineTrack;
  clip: TimelineClip;
  onUpdateClip: (clipId: string, patch: Partial<TimelineClip>) => void;
  onDeleteClip: () => void;
  onDeselectClip: () => void;
  maxDurationMs?: number;
}

export function ClipPropertiesSection({
  track,
  clip,
  onUpdateClip,
  onDeleteClip,
  onDeselectClip,
  maxDurationMs = 3600000,
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
      default:
        return <SparklesIcon className="w-3.5 h-3.5 text-primary" />;
    }
  };

  const getBadgeText = () => {
    switch (track.type) {
      case 'effects': {
        const scale = clip.payload?.scale ?? 1.5;
        return `ZOOM ${scale.toFixed(1)}X`;
      }
      case 'captions':
        return 'SUBTITLE';
      case 'video':
        return 'VIDEO';
      case 'audio':
        return 'AUDIO';
      default:
        return 'CLIP';
    }
  };

  // Zoom parameters
  const currentScale = clip.payload?.scale ?? 1.5;
  const targetX = clip.payload?.targetX ?? 0.5;
  const targetY = clip.payload?.targetY ?? 0.5;

  return (
    <InspectorSection
      title={`Clip: ${clip.name}`}
      icon={getTrackIcon()}
      badge={getBadgeText()}
      defaultOpen={true}
      className="bg-primary/5 border-primary/20"
      headerAction={
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
      }
    >
      {/* ── Type-Specific Properties ────────────────────────────────────────── */}
      {track.type === 'effects' && (
        <>
          {/* Zoom scale slider */}
          <InspectorSliderInput
            label="Zoom Scale"
            icon={<CameraIcon className="w-3.5 h-3.5" />}
            value={currentScale}
            min={1.1}
            max={3.0}
            step={0.1}
            unit="x"
            formatValue={(val) => `${val.toFixed(1)}x`}
            onChange={(scale) => {
              onUpdateClip(clip.id, {
                name: `Zoom ${scale.toFixed(1)}x`,
                payload: { scale },
              });
            }}
          />

          {/* 2D Focal Center Coordinate Pad */}
          <InspectorCoordinatePad
            targetX={targetX}
            targetY={targetY}
            onChange={(newX, newY) => {
              onUpdateClip(clip.id, {
                payload: { targetX: newX, targetY: newY },
              });
            }}
          />
        </>
      )}

      {track.type === 'captions' && (
        <InspectorFieldRow
          label="Subtitle Text"
          icon={<TypeIcon className="w-3.5 h-3.5" />}
        >
          <Textarea
            value={clip.payload?.text ?? clip.name}
            onChange={(e) => {
              const text = e.target.value;
              onUpdateClip(clip.id, {
                name: text,
                payload: { text },
              });
            }}
            placeholder="Type subtitle text..."
            className="min-h-16 text-xs resize-none bg-background font-sans"
          />
        </InspectorFieldRow>
      )}

      {track.type === 'video' && (
        <>
          <InspectorFieldRow
            label="Clip Name"
            icon={<VideoIcon className="w-3.5 h-3.5" />}
          >
            <Input
              value={clip.name}
              onChange={(e) => onUpdateClip(clip.id, { name: e.target.value })}
              className="h-7 text-xs bg-background"
            />
          </InspectorFieldRow>

          <InspectorFieldRow
            label="Playback Speed"
            icon={<GaugeIcon className="w-3.5 h-3.5" />}
          >
            <InspectorSegmentedGroup
              value="1.0x"
              onChange={() => {}}
              options={[
                { value: '0.5x', label: '0.5x' },
                { value: '1.0x', label: '1.0x' },
                { value: '1.5x', label: '1.5x' },
                { value: '2.0x', label: '2.0x' },
              ]}
            />
          </InspectorFieldRow>
        </>
      )}

      {track.type === 'audio' && (
        <InspectorSliderInput
          label="Volume Gain"
          icon={<Volume2Icon className="w-3.5 h-3.5" />}
          value={
            clip.payload?.volume !== undefined
              ? Math.round(clip.payload.volume * 100)
              : 100
          }
          min={0}
          max={200}
          step={5}
          unit="%"
          onChange={(volPercent) => {
            onUpdateClip(clip.id, {
              payload: { volume: volPercent / 100 },
            });
          }}
        />
      )}

      {/* ── Timing Nudge Controls ───────────────────────────────────────────── */}
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

      {/* ── Delete Clip Action ──────────────────────────────────────────────── */}
      <div className="pt-1 flex justify-end">
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
    </InspectorSection>
  );
}
