/**
 * components/studio/inspector/sections/ClipEffectsSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Per-clip effects editor in the Inspector.
 *
 * Allows adding, editing, and removing effects from a selected clip.
 * Effects inherit keyframable intensity and static parameters.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import {
  Trash2Icon,
  PlusIcon,
  SparklesIcon,
  GripVerticalIcon,
  ChevronDownIcon,
  ZoomInIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { TimelineClip, ClipEffect } from '@/lib/studio-types';
import type { StudioMediaAsset } from '@/lib/studio/types';
import { STUDIO_EFFECTS } from '@/lib/studio/effects/catalog';
import { STUDIO_ZOOM_PRESETS } from '@/lib/studio/effects/zoom-presets';
import { getDefaultParams } from '@/lib/studio/effects/params';
import { timelineStore } from '@/hooks/use-timeline-store';
import { StudioPanelSection } from '../components';
import { ClipEffectsStudioDialog } from '../ClipEffectsStudioDialog';
import { EffectPickerDialog } from '../../features/EffectPickerDialog';
import { EffectKeyframeEditorSection } from './EffectKeyframeEditorSection';
import { EffectParamsEditorSection } from './EffectParamsEditorSection';
import { nanoid } from 'nanoid';

interface ClipEffectsSectionProps {
  clip: TimelineClip;
  onUpdateClip: (clipId: string, patch: Partial<TimelineClip>) => void;
  mediaAssets?: StudioMediaAsset[];
}

export function ClipEffectsSection({
  clip,
  onUpdateClip,
  mediaAssets = [],
}: ClipEffectsSectionProps) {
  const [effectPickerOpen, setEffectPickerOpen] = useState(false);
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);

  const effects = (clip.payload?.effects ?? []) as ClipEffect[];
  const selectedEffect = effects.find((e) => e.id === selectedEffectId);

  const addEffect = (effectType: string) => {
    const newEffect: ClipEffect = {
      id: `effect-${nanoid()}`,
      type: effectType as any,
      intensity: 0.6,
      params: getDefaultParams(effectType as any),
      stackOrder: effects.length,
    };

    onUpdateClip(clip.id, {
      payload: {
        ...clip.payload,
        effects: [...effects, newEffect],
      },
    });
  };

  const updateEffect = (effectId: string, updates: Partial<ClipEffect>) => {
    const updated = effects.map((e) =>
      e.id === effectId ? { ...e, ...updates } : e,
    );
    onUpdateClip(clip.id, {
      payload: { ...clip.payload, effects: updated },
    });
  };

  const removeEffect = (effectId: string) => {
    const filtered = effects.filter((e) => e.id !== effectId);
    onUpdateClip(clip.id, {
      payload: { ...clip.payload, effects: filtered },
    });
  };

  const moveEffect = (effectId: string, direction: 'up' | 'down') => {
    const index = effects.findIndex((e) => e.id === effectId);
    if (direction === 'up' && index > 0) {
      const updated = [...effects];
      [updated[index], updated[index - 1]] = [updated[index - 1], updated[index]];
      updated.forEach((e, i) => {
        e.stackOrder = i;
      });
      onUpdateClip(clip.id, {
        payload: { ...clip.payload, effects: updated },
      });
    } else if (direction === 'down' && index < effects.length - 1) {
      const updated = [...effects];
      [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
      updated.forEach((e, i) => {
        e.stackOrder = i;
      });
      onUpdateClip(clip.id, {
        payload: { ...clip.payload, effects: updated },
      });
    }
  };

  const getEffectLabel = (type: string) => {
    return STUDIO_EFFECTS.find((e) => e.type === type)?.label ?? type;
  };

  const addZoomAtPlayhead = () => {
    const preset = STUDIO_ZOOM_PRESETS[0];
    const startMs = timelineStore.getState().currentTimeMs;
    timelineStore.addClip('effects', {
      name: preset.label,
      durationMs: preset.durationMs,
      startMs,
      color: preset.accent,
      itemType: 'effect',
      payload: {
        effectType: 'zoom',
        scale: preset.scale,
        targetX: preset.targetX,
        targetY: preset.targetY,
      },
    });
    toast.success('Zoom added on the Effects track.');
  };

  return (
    <StudioPanelSection
      title="✦ Effects"
      defaultOpen={false}
    >
      <div className="space-y-2">
        {/* Add Effect & Studio Buttons */}
        <div className="flex gap-1.5">
          {effects.length < 5 && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-7 text-xs"
              onClick={() => setEffectPickerOpen(true)}
            >
              <PlusIcon className="w-3 h-3 mr-1" />
              Add Effect…
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            className="h-7 px-2.5 text-xs"
            onClick={() => setStudioOpen(true)}
          >
            <SparklesIcon className="w-3 h-3 mr-1 text-sky-400" />
            Effects Studio…
          </Button>
        </div>

        <Button
          size="sm"
          variant="outline"
          className="h-7 w-full gap-1 border-dashed text-xs"
          onClick={addZoomAtPlayhead}
        >
          <ZoomInIcon className="w-3 h-3 text-violet-400" />
          Add Zoom at Playhead
        </Button>

        <EffectPickerDialog
          open={effectPickerOpen}
          onOpenChange={setEffectPickerOpen}
          clipName={clip.name}
          onSelect={(effectType) => {
            addEffect(effectType);
            setEffectPickerOpen(false);
          }}
        />

        <ClipEffectsStudioDialog
          open={studioOpen}
          onOpenChange={setStudioOpen}
          clip={clip}
          initialEffectId={selectedEffectId}
          mediaAssets={mediaAssets}
          onUpdateClip={onUpdateClip}
        />

        {/* Effects List */}
        {effects.length > 0 && (
          <div className="space-y-1 border-t pt-2">
            {effects.map((effect, index) => (
              <div key={effect.id} className="space-y-1">
                {/* Effect Item */}
                <div
                  onClick={() =>
                    setSelectedEffectId(
                      selectedEffectId === effect.id ? null : effect.id
                    )
                  }
                  className={`flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors ${
                    selectedEffectId === effect.id
                      ? 'bg-primary/10 border border-primary/30'
                      : 'bg-muted hover:bg-muted/80'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">
                      {getEffectLabel(effect.type)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Intensity: {Math.round(effect.intensity * 100)}%
                    </div>
                  </div>

                  <div className="flex items-center gap-1 ml-2">
                    {/* Expand Toggle */}
                    <ChevronDownIcon
                      className={`w-3 h-3 transition-transform ${
                        selectedEffectId === effect.id ? 'rotate-180' : ''
                      }`}
                    />

                    {/* Move Up */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        moveEffect(effect.id, 'up');
                      }}
                      disabled={index === 0}
                      title="Move effect up in render order"
                    >
                      <GripVerticalIcon className="w-3 h-3" />
                    </Button>

                    {/* Remove */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeEffect(effect.id);
                        if (selectedEffectId === effect.id) {
                          setSelectedEffectId(null);
                        }
                      }}
                      title="Remove this effect"
                    >
                      <Trash2Icon className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {/* Keyframe Editor (shown when selected) */}
                {selectedEffectId === effect.id && (
                  <div className="space-y-2 border-l-2 border-primary/30 pl-2">
                    <EffectParamsEditorSection
                      clip={clip}
                      effect={effect}
                      onUpdateClip={onUpdateClip}
                    />
                    <EffectKeyframeEditorSection
                      clip={clip}
                      effect={effect}
                      onUpdateClip={onUpdateClip}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {effects.length === 0 && (
          <div className="text-center py-4 text-muted-foreground text-xs">
            No effects yet
          </div>
        )}
      </div>
    </StudioPanelSection>
  );
}
