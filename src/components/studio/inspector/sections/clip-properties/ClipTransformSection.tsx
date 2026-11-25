import React, { useState } from 'react';
import type {
  ClipTransform,
  TimelineClip,
  TimelineTrack,
} from '@/lib/studio-types';
import {
  InspectorCoordinatePad,
  StudioFieldRow,
  StudioLinkToggle,
  StudioPairRow,
  StudioPanelSection,
  StudioScrubField,
} from '../../components';

interface ClipTransformSectionProps {
  track: TimelineTrack;
  clip: TimelineClip;
  onUpdateClip: (clipId: string, patch: Partial<TimelineClip>) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClipTransformSection({
  track,
  clip,
  onUpdateClip,
  open,
  onOpenChange,
}: ClipTransformSectionProps) {
  const isVisualTrack = track.type === 'video' || track.type === 'overlays';
  const isTextClip = track.type === 'captions' && clip.itemType === 'text';

  const transform = clip.payload?.transform ?? null;
  const position = transform?.position ?? { x: 0, y: 0 };
  const scale = transform?.scale ?? { x: 1, y: 1 };
  const rotation = transform?.rotation ?? 0;
  const anchorPoint = transform?.anchorPoint ?? { x: 0.5, y: 0.5 };
  const scaleLinked = Math.abs(scale.x - scale.y) < 0.01;
  const [scaleLink, setScaleLink] = useState(scaleLinked);
  if (!isVisualTrack && !isTextClip) return null;

  const setTransform = (partial: Partial<ClipTransform>) => {
    const next = { ...(transform ?? {}), ...partial };
    onUpdateClip(clip.id, { payload: { transform: next } });
  };

  const handleScaleLinkToggle = () => {
    const next = !scaleLink;
    setScaleLink(next);
    if (next) {
      const uniform = Math.max(scale.x, scale.y);
      setTransform({ scale: { x: uniform, y: uniform } });
    }
  };
  const handleScaleX = (x: number) => {
    if (scaleLink) {
      setTransform({ scale: { x, y: x } });
    } else {
      setTransform({ scale: { ...scale, x } });
    }
  };
  const handleScaleY = (y: number) => {
    if (scaleLink) {
      setTransform({ scale: { x: y, y } });
    } else {
      setTransform({ scale: { ...scale, y } });
    }
  };

  return (
    <StudioPanelSection
      title="Transform"
      open={open}
      onOpenChange={onOpenChange}
    >
      <StudioFieldRow label="Position">
        <StudioPairRow
          left={
            <StudioScrubField
              label="Position X"
              value={position.x}
              prefix="X"
              tone="x"
              min={-500}
              max={500}
              step={5}
              suffix="px"
              onChange={(x) => setTransform({ position: { ...position, x } })}
            />
          }
          right={
            <StudioScrubField
              label="Position Y"
              value={position.y}
              prefix="Y"
              tone="y"
              min={-500}
              max={500}
              step={5}
              suffix="px"
              onChange={(y) => setTransform({ position: { ...position, y } })}
            />
          }
        />
      </StudioFieldRow>
      <StudioFieldRow label="Scale">
        <StudioPairRow
          left={
            <StudioScrubField
              label="Scale X"
              value={scale.x}
              prefix="X"
              tone="x"
              min={0.1}
              max={3}
              step={0.1}
              suffix="x"
              onChange={handleScaleX}
            />
          }
          right={
            <StudioScrubField
              label="Scale Y"
              value={scale.y}
              prefix="Y"
              tone="y"
              min={0.1}
              max={3}
              step={0.1}
              suffix="x"
              onChange={handleScaleY}
            />
          }
          link={
            <StudioLinkToggle
              linked={scaleLink}
              onToggle={handleScaleLinkToggle}
              label="Scale"
            />
          }
        />
      </StudioFieldRow>
      <StudioFieldRow label="Rotation">
        <StudioScrubField
          label="Rotation"
          value={rotation}
          min={-180}
          max={180}
          step={1}
          suffix="°"
          onChange={(nextRotation) => setTransform({ rotation: nextRotation })}
        />
      </StudioFieldRow>
      <InspectorCoordinatePad
        label="Anchor Point"
        targetX={anchorPoint.x}
        targetY={anchorPoint.y}
        onChange={(x, y) => setTransform({ anchorPoint: { x, y } })}
      />
    </StudioPanelSection>
  );
}
