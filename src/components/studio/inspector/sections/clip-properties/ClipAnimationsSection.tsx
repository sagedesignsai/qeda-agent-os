import React, { useMemo } from 'react';
import { KeyRoundIcon, ZapIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  ClipAnimation,
  StudioAnimationEasing,
  TimelineClip,
} from '@/lib/studio-types';
import {
  ANIMATION_PRESETS,
  transitionTypeToPresetId,
} from '@/lib/studio/animation-presets';
import {
  StudioFieldRow,
  StudioPanelSection,
  StudioScrubField,
} from '../../components';

type AnimationKey = 'enterAnimation' | 'exitAnimation';

interface ClipAnimationsSectionProps {
  clip: TimelineClip;
  onUpdateClip: (clipId: string, patch: Partial<TimelineClip>) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EASING_OPTIONS: { value: StudioAnimationEasing; label: string }[] = [
  { value: 'ease-out', label: 'Ease Out' },
  { value: 'ease-in', label: 'Ease In' },
  { value: 'ease-in-out', label: 'Ease In-Out' },
  { value: 'power2.out', label: 'Power 2 Out' },
  { value: 'power2.in', label: 'Power 2 In' },
  { value: 'power3.out', label: 'Power 3 Out' },
  { value: 'back.out', label: 'Back Out' },
  { value: 'elastic.out', label: 'Elastic Out' },
  { value: 'bounce.out', label: 'Bounce Out' },
  { value: 'expo.out', label: 'Expo Out' },
  { value: 'sine.out', label: 'Sine Out' },
  { value: 'linear', label: 'Linear' },
];

export function ClipAnimationsSection({
  clip,
  onUpdateClip,
  open,
  onOpenChange,
}: ClipAnimationsSectionProps) {
  const enterAnim = clip.payload?.enterAnimation ?? null;
  const exitAnim = clip.payload?.exitAnimation ?? null;

  const setAnimation = (key: AnimationKey, patch: Partial<ClipAnimation>) => {
    const existing = key === 'enterAnimation' ? enterAnim : exitAnim;
    const next: ClipAnimation = {
      type: existing?.type ?? 'none',
      durationMs: existing?.durationMs ?? 300,
      ...patch,
    };
    onUpdateClip(clip.id, { payload: { [key]: next } });
  };

  const setAnimationPreset = (key: AnimationKey, presetId: string | null) => {
    if (!presetId) {
      onUpdateClip(clip.id, { payload: { [key]: undefined } });
      return;
    }

    const preset = ANIMATION_PRESETS[presetId];
    if (!preset) return;

    const next: ClipAnimation = {
      type: 'fade',
      durationMs: preset.defaultDurationMs,
      easing: preset.defaultEasing,
      presetId,
    };
    onUpdateClip(clip.id, { payload: { [key]: next } });
  };

  const getPresetId = (
    anim: ClipAnimation | null | undefined,
  ): string | null => {
    if (!anim) return null;
    if (anim.presetId) return anim.presetId;
    return transitionTypeToPresetId(anim.type);
  };

  const keyframeCount = (anim: ClipAnimation | null | undefined): number => {
    if (!anim) return 0;
    if (anim.keyframes) return anim.keyframes.length;
    if (anim.presetId && ANIMATION_PRESETS[anim.presetId]) {
      return ANIMATION_PRESETS[anim.presetId].generateKeyframes(
        'enter',
        anim.durationMs,
      ).length;
    }
    return 0;
  };

  const visiblePhaseMs = useMemo(() => {
    const visible =
      clip.durationMs -
      (enterAnim?.durationMs ?? 0) -
      (exitAnim?.durationMs ?? 0);
    return Math.max(0, visible);
  }, [clip.durationMs, enterAnim?.durationMs, exitAnim?.durationMs]);

  const renderPresetGrid = (key: AnimationKey, anim: ClipAnimation | null) => {
    const currentPreset = getPresetId(anim);
    const presets = Object.values(ANIMATION_PRESETS);

    return (
      <div className="grid grid-cols-3 gap-1">
        <Button
          type="button"
          variant={currentPreset === null ? 'default' : 'outline'}
          size="sm"
          className="h-7 text-[10px]"
          onClick={() => setAnimationPreset(key, null)}
        >
          None
        </Button>
        {presets.map((preset) => (
          <Button
            key={preset.id}
            type="button"
            variant={currentPreset === preset.id ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-[10px]"
            onClick={() => setAnimationPreset(key, preset.id)}
            title={preset.name}
          >
            {preset.name
              .replace(/-/g, ' ')
              .replace(/\b\w/g, (character) => character.toUpperCase())}
          </Button>
        ))}
      </div>
    );
  };

  const renderAnimationControls = (
    key: AnimationKey,
    anim: ClipAnimation | null,
    label: string,
  ) => {
    if (!anim || (!anim.presetId && anim.type === 'none')) return null;

    return (
      <>
        <StudioFieldRow label="Duration">
          <StudioScrubField
            label={`${label} Duration`}
            value={anim.durationMs}
            min={100}
            max={1000}
            step={50}
            suffix="ms"
            onChange={(durationMs) => setAnimation(key, { durationMs })}
          />
        </StudioFieldRow>
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-[11px] text-muted-foreground">
            Easing
          </span>
          <Select
            value={anim.easing ?? 'ease-out'}
            onValueChange={(easing) => setAnimation(key, { easing })}
          >
            <SelectTrigger className="h-7 flex-1 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EASING_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {keyframeCount(anim) > 0 && (
            <span className="ml-auto flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <KeyRoundIcon className="h-3 w-3" />
              {keyframeCount(anim)}
            </span>
          )}
        </div>
      </>
    );
  };

  return (
    <StudioPanelSection
      title="Animations"
      open={open}
      onOpenChange={onOpenChange}
    >
      <div className="space-y-2">
        <div>
          <div className="mb-1 flex items-center gap-1">
            <ZapIcon className="h-3 w-3 text-purple-400" />
            <span className="text-[11px] font-medium text-foreground">
              Enter
            </span>
          </div>
          {renderPresetGrid('enterAnimation', enterAnim)}
        </div>
        {renderAnimationControls('enterAnimation', enterAnim, 'Enter')}

        {(enterAnim || exitAnim) && (
          <div className="flex items-center gap-2 rounded bg-muted/40 px-1 py-1">
            <span className="text-[10px] text-muted-foreground">
              Visible hold
            </span>
            <span className="ml-auto font-mono text-[10px] text-foreground">
              {(visiblePhaseMs / 1000).toFixed(1)}s
            </span>
          </div>
        )}

        <div>
          <div className="mb-1 flex items-center gap-1">
            <ZapIcon className="h-3 w-3 text-orange-400" />
            <span className="text-[11px] font-medium text-foreground">
              Exit
            </span>
          </div>
          {renderPresetGrid('exitAnimation', exitAnim)}
        </div>
        {renderAnimationControls('exitAnimation', exitAnim, 'Exit')}
      </div>
    </StudioPanelSection>
  );
}
