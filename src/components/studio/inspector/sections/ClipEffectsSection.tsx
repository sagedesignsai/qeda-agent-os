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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TimelineClip, ClipEffect } from '@/lib/studio-types';
import { STUDIO_EFFECTS } from '@/lib/studio/effects/catalog';
import { getDefaultParams } from '@/lib/studio/effects/params';
import { StudioPanelSection } from '../components';
import { EffectKeyframeEditorSection } from './EffectKeyframeEditorSection';
import { nanoid } from 'nanoid';

interface ClipEffectsSectionProps {
  clip: TimelineClip;
  onUpdateClip: (clipId: string, patch: Partial<TimelineClip>) => void;
}

export function ClipEffectsSection({
  clip,
  onUpdateClip,
}: ClipEffectsSectionProps) {
  const [isAddingEffect, setIsAddingEffect] = useState(false);
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);

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

    setIsAddingEffect(false);
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

  return (
    <StudioPanelSection
      title="✦ Effects"
      defaultOpen={false}
    >
      <div className="space-y-2">
        {/* Add Effect Button */}
        {!isAddingEffect && effects.length < 5 && (
          <Button
            size="sm"
            variant="outline"
            className="w-full h-7 text-xs"
            onClick={() => setIsAddingEffect(true)}
          >
            <PlusIcon className="w-3 h-3 mr-1" />
            Add Effect
          </Button>
        )}

        {/* Add Effect Dropdown */}
        {isAddingEffect && (
          <div className="space-y-2 p-2 border rounded-md bg-muted/50">
            <Select onValueChange={addEffect}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Select effect type..." />
              </SelectTrigger>
              <SelectContent>
                {STUDIO_EFFECTS.map((effect) => (
                  <SelectItem key={effect.type} value={effect.type}>
                    {effect.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="flex-1 h-6 text-xs"
                onClick={() => setIsAddingEffect(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

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
                  <div className="border-l-2 border-primary/30 pl-2">
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
        {effects.length === 0 && !isAddingEffect && (
          <div className="text-center py-4 text-muted-foreground text-xs">
            No effects yet
          </div>
        )}
      </div>
    </StudioPanelSection>
  );
}
