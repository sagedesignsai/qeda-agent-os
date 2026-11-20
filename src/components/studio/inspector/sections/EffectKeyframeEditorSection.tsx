/**
 * components/studio/inspector/sections/EffectKeyframeEditorSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Editor for effect intensity keyframes within clip effects.
 *
 * Allows adding, editing, and removing keyframes for effect intensity,
 * with live playhead evaluation showing current values.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { Trash2Icon, PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TimelineClip, ClipEffect, StudioKeyframe } from '@/lib/studio-types';
import { timelineStore, useTimelineState } from '@/hooks/use-timeline-store';
import { evaluateKeyframesAt } from '@/lib/studio/keyframes';
import { StudioScrubField, StudioFieldRow } from '../components';
import { StudioPanelSection } from '../components';
import { STUDIO_EFFECTS } from '@/lib/studio/effects/catalog';

interface EffectKeyframeEditorSectionProps {
  clip: TimelineClip;
  effect: ClipEffect;
  onUpdateClip: (clipId: string, patch: Partial<TimelineClip>) => void;
}

export function EffectKeyframeEditorSection({
  clip,
  effect,
  onUpdateClip,
}: EffectKeyframeEditorSectionProps) {
  const { currentTimeMs } = useTimelineState();
  
  // Get effect label
  const effectLabel = STUDIO_EFFECTS.find(e => e.type === effect.type)?.label ?? effect.type;
  
  // Get current keyframes for this effect's intensity
  const keyframeProperty = `effect:${effect.id}:intensity`;
  const effectKeyframes = (clip.payload?.keyframes ?? []).filter(
    (k) => k.property === keyframeProperty
  ) as StudioKeyframe[];
  
  // Evaluate current intensity at playhead
  const localTimeMs = Math.max(0, currentTimeMs - clip.startMs);
  const keyframedIntensity = evaluateKeyframesAt(
    clip.payload?.keyframes ?? [],
    localTimeMs,
    keyframeProperty
  );
  const currentIntensity = keyframedIntensity !== undefined ? keyframedIntensity : effect.intensity;

  // Add keyframe at current playhead time
  const addKeyframe = () => {
    const newKeyframe: StudioKeyframe = {
      id: `kf-${Date.now()}`,
      property: keyframeProperty,
      timeMs: localTimeMs,
      value: currentIntensity,
      easing: 'linear',
    };

    const updatedKeyframes = [...(clip.payload?.keyframes ?? []), newKeyframe];
    onUpdateClip(clip.id, {
      payload: { ...clip.payload, keyframes: updatedKeyframes },
    });
  };

  // Update keyframe time
  const updateKeyframeTime = (keyframeId: string, timeMs: number) => {
    const updated = (clip.payload?.keyframes ?? []).map((kf) =>
      kf.id === keyframeId ? { ...kf, timeMs: Math.max(0, Math.min(timeMs, clip.durationMs)) } : kf
    );
    onUpdateClip(clip.id, {
      payload: { ...clip.payload, keyframes: updated },
    });
  };

  // Update keyframe value
  const updateKeyframeValue = (keyframeId: string, value: number) => {
    const updated = (clip.payload?.keyframes ?? []).map((kf) =>
      kf.id === keyframeId ? { ...kf, value: Math.max(0, Math.min(1, value)) } : kf
    );
    onUpdateClip(clip.id, {
      payload: { ...clip.payload, keyframes: updated },
    });
  };

  // Delete keyframe
  const deleteKeyframe = (keyframeId: string) => {
    const updated = (clip.payload?.keyframes ?? []).filter((kf) => kf.id !== keyframeId);
    onUpdateClip(clip.id, {
      payload: { ...clip.payload, keyframes: updated },
    });
  };

  // Delete all keyframes for this effect
  const deleteAllKeyframes = () => {
    const updated = (clip.payload?.keyframes ?? []).filter(
      (kf) => kf.property !== keyframeProperty
    );
    onUpdateClip(clip.id, {
      payload: { ...clip.payload, keyframes: updated },
    });
  };

  return (
    <StudioPanelSection
      title={`⏱ ${effectLabel} Keyframes`}
      defaultOpen={true}
    >
      <div className="space-y-3">
        {/* Current Value Display */}
        <StudioFieldRow label="Current Value">
          <div className="text-xs font-medium text-muted-foreground">
            {Math.round(currentIntensity * 100)}%
          </div>
        </StudioFieldRow>

        {/* Base Intensity (when no keyframes active) */}
        <StudioFieldRow label="Base Intensity">
          <StudioScrubField
            label="Base Intensity"
            value={effect.intensity}
            min={0}
            max={1}
            step={0.05}
            suffix="%"
            onChange={(intensity) => {
              const effects = clip.payload?.effects as any[];
              const updated = effects.map((e) =>
                e.id === effect.id ? { ...e, intensity } : e
              );
              onUpdateClip(clip.id, {
                payload: { ...clip.payload, effects: updated },
              });
            }}
          />
        </StudioFieldRow>

        {/* Add Keyframe Button */}
        <Button
          size="sm"
          variant="outline"
          className="w-full h-7 text-xs"
          onClick={addKeyframe}
        >
          <PlusIcon className="w-3 h-3 mr-1" />
          Add Keyframe at {(localTimeMs / 1000).toFixed(2)}s
        </Button>

        {/* Keyframes List */}
        {effectKeyframes.length > 0 && (
          <div className="space-y-2 border-t pt-2">
            <div className="text-xs font-medium text-muted-foreground">
              {effectKeyframes.length} keyframe{effectKeyframes.length !== 1 ? 's' : ''}
            </div>
            {effectKeyframes.map((kf) => (
              <div key={kf.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                {/* Time */}
                <div className="flex-1 min-w-0">
                  <input
                    type="number"
                    value={(kf.timeMs / 1000).toFixed(3)}
                    onChange={(e) => updateKeyframeTime(kf.id, parseFloat(e.target.value) * 1000)}
                    className="w-full h-6 px-2 text-xs bg-background border rounded text-right"
                    min={0}
                    max={clip.durationMs / 1000}
                    step={0.01}
                  />
                </div>

                {/* Value */}
                <div className="flex-1 min-w-0">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={kf.value * 100}
                    onChange={(e) => updateKeyframeValue(kf.id, parseFloat(e.target.value) / 100)}
                    className="w-full h-5"
                  />
                </div>

                {/* Value Display */}
                <div className="w-10 text-xs font-medium text-right">
                  {Math.round(kf.value * 100)}%
                </div>

                {/* Delete */}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                  onClick={() => deleteKeyframe(kf.id)}
                  title="Delete this keyframe"
                >
                  <Trash2Icon className="w-3 h-3" />
                </Button>
              </div>
            ))}

            {/* Delete All */}
            {effectKeyframes.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="w-full h-6 text-xs text-destructive hover:text-destructive"
                onClick={deleteAllKeyframes}
              >
                Clear All Keyframes
              </Button>
            )}
          </div>
        )}

        {/* Empty State */}
        {effectKeyframes.length === 0 && (
          <div className="text-center py-2 text-muted-foreground text-xs">
            No keyframes yet. Click "Add Keyframe" to start animating.
          </div>
        )}
      </div>
    </StudioPanelSection>
  );
}
