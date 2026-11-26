/**
 * components/studio/inspector/ClipEffectsStudioDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Full-workspace Effects & Keyframe Studio modal for a selected clip.
 *
 * Uses transactional draft state (`draftEffects`, `draftKeyframes`) so users
 * can preview, scrub, and keyframe freely before clicking Apply.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  ZoomInIcon,
} from 'lucide-react';
import { nanoid } from 'nanoid';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { timelineStore } from '@/hooks/use-timeline-store';
import { STUDIO_EFFECTS } from '@/lib/studio/effects/catalog';
import { getDefaultParams } from '@/lib/studio/effects/params';
import {
  isStudioZoomClip,
  STUDIO_ZOOM_PRESETS,
} from '@/lib/studio/effects/zoom-presets';
import { evaluateKeyframesAt } from '@/lib/studio/keyframes';
import type {
  ClipEffect,
  StudioAnimationEasing,
  StudioEffectType,
  StudioKeyframe,
  StudioMediaAsset,
  TimelineClip,
} from '@/lib/studio/types';
import { cn } from '@/lib/utils';
import {
  ClipEffectsKeyframeTimeline,
} from './ClipEffectsKeyframeTimeline';
import {
  ClipEffectsPreviewCanvas,
  type EffectsPreviewMode,
} from './ClipEffectsPreviewCanvas';
import { ClipMaskEditorSection } from './ClipMaskEditorSection';
import { ColorScopesPanel } from './ColorScopesPanel';
import { StudioFieldRow, StudioScrubField } from './components';
import { EffectParamsEditorSection } from './sections/EffectParamsEditorSection';

interface ClipEffectsStudioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clip: TimelineClip;
  initialEffectId?: string | null;
  /** Open with a fresh effect of this type in the draft stack. */
  initialEffectType?: StudioEffectType | null;
  mediaAssets?: StudioMediaAsset[];
  onUpdateClip: (clipId: string, patch: Partial<TimelineClip>) => void;
}

const KEYFRAME_SNAP_TOLERANCE_MS = 20;

export function ClipEffectsStudioDialog({
  open,
  onOpenChange,
  clip,
  initialEffectId = null,
  initialEffectType = null,
  mediaAssets = [],
  onUpdateClip,
}: ClipEffectsStudioDialogProps) {
  const clipRef = useRef(clip);
  clipRef.current = clip;
  const durationMs = Math.max(100, clip.durationMs || 5000);
  const isZoomClip = isStudioZoomClip(clip);

  const [draftEffects, setDraftEffects] = useState<ClipEffect[]>([]);
  const [draftKeyframes, setDraftKeyframes] = useState<StudioKeyframe[]>([]);
  const [draftZoom, setDraftZoom] = useState({
    scale: 1.5,
    targetX: 0.5,
    targetY: 0.5,
  });
  const [draftMask, setDraftMask] = useState<
    NonNullable<TimelineClip['payload']>['mask']
  >(undefined);
  const [sampleRgba, setSampleRgba] = useState<Uint8ClampedArray | null>(null);
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);
  const [isAddingEffect, setIsAddingEffect] = useState(false);

  const [localTimeMs, setLocalTimeMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [autoKeyframe, setAutoKeyframe] = useState(true);
  const [previewMode, setPreviewMode] = useState<EffectsPreviewMode>('composite');
  const [eyedropperActive, setEyedropperActive] = useState(false);

  // Sync draft state whenever the dialog opens.
  useEffect(() => {
    if (!open) {
      setIsPlaying(false);
      setEyedropperActive(false);
      return;
    }
    const activeClip = clipRef.current;
    const activeDurationMs = Math.max(100, activeClip.durationMs || 5000);
    const effects = ((activeClip.payload?.effects ?? []) as ClipEffect[]).map((e) => ({
      ...e,
      params: { ...e.params },
    }));
    const keyframes = ((activeClip.payload?.keyframes ?? []) as StudioKeyframe[]).map(
      (k) => ({ ...k }),
    );
    // Command-bar entry points such as "Effects → Add Spotlight" open the
    // studio with an uncommitted draft so the user can preview before Apply.
    const seededEffect =
      initialEffectType && !effects.some((e) => e.type === initialEffectType)
        ? ({
            id: `effect-${nanoid(8)}`,
            type: initialEffectType,
            intensity: 0.6,
            params: getDefaultParams(initialEffectType),
            stackOrder: effects.length,
          } satisfies ClipEffect)
        : null;
    const nextEffects = seededEffect ? [...effects, seededEffect] : effects;
    setDraftEffects(nextEffects);
    setDraftKeyframes(keyframes);
    setDraftZoom({
      scale:
        typeof activeClip.payload?.scale === 'number'
          ? activeClip.payload.scale
          : 1.5,
      targetX:
        typeof activeClip.payload?.targetX === 'number'
          ? activeClip.payload.targetX
          : 0.5,
      targetY:
        typeof activeClip.payload?.targetY === 'number'
          ? activeClip.payload.targetY
          : 0.5,
    });
    setDraftMask(activeClip.payload?.mask ? { ...activeClip.payload.mask } : undefined);
    setSelectedEffectId(
      initialEffectId && nextEffects.some((e) => e.id === initialEffectId)
        ? initialEffectId
        : (seededEffect?.id ?? nextEffects[0]?.id ?? null),
    );
    setIsAddingEffect(false);
    const currentTimeMs = timelineStore.getState().currentTimeMs;
    setLocalTimeMs(
      Math.max(0, Math.min(activeDurationMs, currentTimeMs - activeClip.startMs)),
    );
  }, [open, clip.id, initialEffectId, initialEffectType]);

  // Playback loop for clip-local preview.
  useEffect(() => {
    if (!open || !isPlaying) return;
    let last = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const dt = (now - last) * playbackRate;
      last = now;
      setLocalTimeMs((prev) => {
        const next = prev + dt;
        if (next >= durationMs) {
          if (loop) return next % durationMs;
          setIsPlaying(false);
          return durationMs;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, isPlaying, loop, playbackRate, durationMs]);

  const draftClip = useMemo<TimelineClip>(
    () => ({
      ...clip,
      payload: {
        ...clip.payload,
        ...(isZoomClip
          ? {
              effectType: clip.payload?.effectType ?? 'zoom',
              scale: draftZoom.scale,
              targetX: draftZoom.targetX,
              targetY: draftZoom.targetY,
            }
          : {}),
        effects: draftEffects,
        keyframes: draftKeyframes,
        mask: draftMask,
      },
    }),
    [clip, draftEffects, draftKeyframes, draftMask, draftZoom, isZoomClip],
  );

  const selectedEffect = useMemo(
    () => draftEffects.find((e) => e.id === selectedEffectId) ?? null,
    [draftEffects, selectedEffectId],
  );

  const upsertKeyframe = (
    property: string,
    timeMs: number,
    value: number,
    easing: StudioAnimationEasing = 'linear',
  ) => {
    const clampedTime = Math.max(0, Math.min(durationMs, Math.round(timeMs)));
    setDraftKeyframes((prev) => {
      const existingIdx = prev.findIndex(
        (k) =>
          k.property === property &&
          Math.abs(k.timeMs - clampedTime) <= KEYFRAME_SNAP_TOLERANCE_MS,
      );
      if (existingIdx >= 0) {
        return prev.map((k, idx) =>
          idx === existingIdx ? { ...k, timeMs: clampedTime, value } : k,
        );
      }
      const next: StudioKeyframe = {
        id: `kf-${nanoid(8)}`,
        property,
        timeMs: clampedTime,
        value,
        easing,
      };
      return [...prev, next].sort((a, b) => a.timeMs - b.timeMs);
    });
  };

  const addEffect = (effectType: StudioEffectType) => {
    const newEffect: ClipEffect = {
      id: `effect-${nanoid(8)}`,
      type: effectType,
      intensity: 0.6,
      params: getDefaultParams(effectType),
      stackOrder: draftEffects.length,
    };
    setDraftEffects((prev) => [...prev, newEffect]);
    setSelectedEffectId(newEffect.id);
    setIsAddingEffect(false);
  };

  const removeEffect = (effectId: string) => {
    const property = `effect:${effectId}:intensity`;
    setDraftEffects((prev) =>
      prev
        .filter((e) => e.id !== effectId)
        .map((e, index) => ({ ...e, stackOrder: index })),
    );
    setDraftKeyframes((prev) => prev.filter((k) => k.property !== property));
    if (selectedEffectId === effectId) {
      const remaining = draftEffects.filter((e) => e.id !== effectId);
      setSelectedEffectId(remaining[0]?.id ?? null);
    }
  };

  const moveEffect = (effectId: string, direction: 'up' | 'down') => {
    setDraftEffects((prev) => {
      const sorted = [...prev].sort((a, b) => a.stackOrder - b.stackOrder);
      const index = sorted.findIndex((e) => e.id === effectId);
      const target = direction === 'up' ? index - 1 : index + 1;
      if (index < 0 || target < 0 || target >= sorted.length) return prev;
      [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
      return sorted.map((e, idx) => ({ ...e, stackOrder: idx }));
    });
  };

  const handleDraftPatch = (_clipId: string, patch: Partial<TimelineClip>) => {
    if (patch.payload?.effects) {
      setDraftEffects(patch.payload.effects as ClipEffect[]);
    }
    if (patch.payload?.keyframes) {
      setDraftKeyframes(patch.payload.keyframes as StudioKeyframe[]);
    }
  };

  const selectedIntensityProperty = selectedEffect
    ? `effect:${selectedEffect.id}:intensity`
    : null;
  const evaluatedIntensity = selectedIntensityProperty
    ? evaluateKeyframesAt(draftKeyframes, localTimeMs, selectedIntensityProperty)
    : undefined;
  const currentIntensity =
    evaluatedIntensity !== undefined
      ? evaluatedIntensity
      : (selectedEffect?.intensity ?? 0);

  const handleIntensityChange = (nextValue: number) => {
    if (!selectedEffect || !selectedIntensityProperty) return;
    const clamped = Math.max(0, Math.min(1, nextValue));
    const hasKeyframes = draftKeyframes.some(
      (k) => k.property === selectedIntensityProperty,
    );
    if (autoKeyframe || hasKeyframes) {
      upsertKeyframe(selectedIntensityProperty, localTimeMs, clamped);
    } else {
      setDraftEffects((prev) =>
        prev.map((e) =>
          e.id === selectedEffect.id ? { ...e, intensity: clamped } : e,
        ),
      );
    }
  };

  const zoomValueAt = (
    property: 'zoomScale' | 'zoomTargetX' | 'zoomTargetY',
    fallback: number,
  ) => evaluateKeyframesAt(draftKeyframes, localTimeMs, property) ?? fallback;

  const zoomScaleValue = zoomValueAt('zoomScale', draftZoom.scale);
  const zoomTargetXValue = zoomValueAt('zoomTargetX', draftZoom.targetX);
  const zoomTargetYValue = zoomValueAt('zoomTargetY', draftZoom.targetY);

  const handleZoomChange = (
    key: 'scale' | 'targetX' | 'targetY',
    value: number,
  ) => {
    const property =
      key === 'scale'
        ? 'zoomScale'
        : key === 'targetX'
          ? 'zoomTargetX'
          : 'zoomTargetY';
    setDraftZoom((prev) => ({ ...prev, [key]: value }));
    const hasKeyframes = draftKeyframes.some((k) => k.property === property);
    if (autoKeyframe || hasKeyframes) {
      upsertKeyframe(property, localTimeMs, value);
    }
  };

  const handlePickKeyColor = (hex: string) => {
    if (!selectedEffect || selectedEffect.type !== 'chroma-key') return;
    setDraftEffects((prev) =>
      prev.map((e) =>
        e.id === selectedEffect.id
          ? { ...e, params: { ...e.params, keyColor: hex } }
          : e,
      ),
    );
    setEyedropperActive(false);
  };

  const handleApply = () => {
    onUpdateClip(clip.id, {
      payload: {
        ...clip.payload,
        ...(isZoomClip
          ? {
              effectType: clip.payload?.effectType ?? 'zoom',
              scale: draftZoom.scale,
              targetX: draftZoom.targetX,
              targetY: draftZoom.targetY,
            }
          : {}),
        effects: draftEffects,
        keyframes: draftKeyframes,
        mask: draftMask,
      },
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] max-w-[92vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[92vw]">
        <DialogHeader className="flex flex-row items-center justify-between border-b border-border/60 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            {isZoomClip ? (
              <ZoomInIcon className="size-4 text-violet-400" />
            ) : (
              <SparklesIcon className="size-4 text-sky-400" />
            )}
            <DialogTitle className="text-sm font-semibold">
              {isZoomClip ? 'Zoom' : 'Effects'} &amp; Keyframes — {clip.name}
            </DialogTitle>
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {(durationMs / 1000).toFixed(2)}s
            </span>
          </div>
        </DialogHeader>

        {/* Main Workspace: Preview (center) + Inspector (right) */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <ClipEffectsPreviewCanvas
            draftClip={draftClip}
            localTimeMs={localTimeMs}
            previewMode={previewMode}
            onPreviewModeChange={setPreviewMode}
            mediaAssets={mediaAssets}
            eyedropperAvailable={selectedEffect?.type === 'chroma-key'}
            eyedropperActive={eyedropperActive}
            onToggleEyedropper={() => setEyedropperActive((p) => !p)}
            onPickColor={handlePickKeyColor}
            onFrameSample={setSampleRgba}
          />

          {/* Right Effect Stack & Params Inspector */}
          <aside className="flex w-80 shrink-0 flex-col border-l border-border/60 bg-background">
            {isZoomClip ? (
              <>
                <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <ZoomInIcon className="size-3.5 text-violet-400" />
                    Canvas Zoom
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {zoomScaleValue.toFixed(2)}×
                  </span>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto p-2.5">
                  <div className="space-y-2 rounded-md border border-border/50 bg-muted/10 p-2.5">
                    <StudioFieldRow label="Scale">
                      <StudioScrubField
                        label="Zoom Scale"
                        value={zoomScaleValue}
                        min={1.1}
                        max={5}
                        step={0.05}
                        suffix="x"
                        onChange={(value) => handleZoomChange('scale', value)}
                      />
                    </StudioFieldRow>
                    <StudioFieldRow label="Position X">
                      <StudioScrubField
                        label="Zoom Position X"
                        value={zoomTargetXValue}
                        min={0}
                        max={1}
                        step={0.01}
                        onChange={(value) =>
                          handleZoomChange('targetX', value)
                        }
                      />
                    </StudioFieldRow>
                    <StudioFieldRow label="Position Y">
                      <StudioScrubField
                        label="Zoom Position Y"
                        value={zoomTargetYValue}
                        min={0}
                        max={1}
                        step={0.01}
                        onChange={(value) =>
                          handleZoomChange('targetY', value)
                        }
                      />
                    </StudioFieldRow>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                      Zoom Presets
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {STUDIO_ZOOM_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            handleZoomChange('scale', preset.scale);
                            handleZoomChange('targetX', preset.targetX);
                            handleZoomChange('targetY', preset.targetY);
                          }}
                          className="rounded-md border border-border/50 px-2 py-1.5 text-left text-[10px] font-medium transition-colors hover:border-violet-400/50 hover:bg-violet-500/10"
                        >
                          <span className="block truncate text-foreground">
                            {preset.label}
                          </span>
                          <span className="mt-0.5 block text-[9px] text-muted-foreground">
                            {preset.scale.toFixed(1)}× ·{' '}
                            {Math.round(preset.targetX * 100)}%,
                            {Math.round(preset.targetY * 100)}%
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <p className="rounded-md border border-dashed border-border/60 p-2.5 text-[10px] leading-relaxed text-muted-foreground">
                    Auto-K records <strong>Scale</strong>, <strong>X</strong> and{' '}
                    <strong>Y</strong> keyframes at the playhead. Add or drag
                    keyframes in the timeline below to animate the camera push.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
                  <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Effects ({draftEffects.length}/5)
                  </span>
                  {!isAddingEffect && draftEffects.length < 5 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 gap-1 px-2 text-[11px]"
                      onClick={() => setIsAddingEffect(true)}
                    >
                      <PlusIcon className="size-3" />
                      Add Effect
                    </Button>
                  )}
                </div>

                {isAddingEffect && (
                  <div className="space-y-1.5 border-b border-border/50 bg-muted/20 p-2.5">
                    <Select
                      onValueChange={(v) => addEffect(v as StudioEffectType)}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder="Choose an effect…" />
                      </SelectTrigger>
                      <SelectContent>
                        {STUDIO_EFFECTS.map((def) => (
                          <SelectItem key={def.type} value={def.type}>
                            {def.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-full text-[11px]"
                      onClick={() => setIsAddingEffect(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto p-2.5 space-y-3">
                  {/* Effect Stack List */}
                  {draftEffects.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border/60 p-3 text-center text-[11px] text-muted-foreground">
                      No effects applied. Click <strong>Add Effect</strong> to start.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {[...draftEffects]
                        .sort((a, b) => a.stackOrder - b.stackOrder)
                        .map((effect, idx, arr) => {
                          const def = STUDIO_EFFECTS.find(
                            (e) => e.type === effect.type,
                          );
                          const isSelected = effect.id === selectedEffectId;
                          return (
                            <div
                              key={effect.id}
                              onClick={() => setSelectedEffectId(effect.id)}
                              className={cn(
                                'flex cursor-pointer items-center justify-between rounded-md border px-2 py-1.5 text-xs transition-colors',
                                isSelected
                                  ? 'border-sky-500/60 bg-sky-500/10'
                                  : 'border-border/50 hover:bg-muted/40',
                              )}
                            >
                              <span className="truncate font-medium">
                                {def?.label ?? effect.type}
                              </span>
                              <div className="flex items-center gap-0.5">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-5"
                                  aria-label="Move effect up"
                                  disabled={idx === 0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveEffect(effect.id, 'up');
                                  }}
                                >
                                  <ArrowUpIcon className="size-3" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-5"
                                  aria-label="Move effect down"
                                  disabled={idx === arr.length - 1}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveEffect(effect.id, 'down');
                                  }}
                                >
                                  <ArrowDownIcon className="size-3" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-5 text-destructive hover:text-destructive"
                                  aria-label={`Remove ${def?.label ?? effect.type}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeEffect(effect.id);
                                  }}
                                >
                                  <Trash2Icon className="size-3" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}

                  {/* Selected Effect Intensity + Schema Params */}
                  {selectedEffect && (
                    <div className="space-y-2 border-t border-border/50 pt-2">
                      <StudioFieldRow label="Intensity">
                        <StudioScrubField
                          label="Intensity"
                          value={currentIntensity}
                          min={0}
                          max={1}
                          step={0.02}
                          onChange={handleIntensityChange}
                        />
                      </StudioFieldRow>
                      <EffectParamsEditorSection
                        clip={draftClip}
                        effect={selectedEffect}
                        onUpdateClip={handleDraftPatch}
                      />
                    </div>
                  )}

                  {/* Film LUTs & Live Color Scopes */}
                  <ColorScopesPanel
                    sampleRgba={sampleRgba}
                    onApplyLut={
                      selectedEffect?.type === 'color-grade'
                        ? (lutParams) => {
                            setDraftEffects((prev) =>
                              prev.map((e) =>
                                e.id === selectedEffect.id
                                  ? { ...e, params: { ...e.params, ...lutParams } }
                                  : e,
                              ),
                            );
                          }
                        : undefined
                    }
                  />

                  {/* GPU Shape Mask */}
                  <ClipMaskEditorSection
                    mask={draftMask}
                    onChange={setDraftMask}
                  />
                </div>
              </>
            )}
          </aside>
        </div>

        {/* Bottom Keyframe Timeline */}
        <ClipEffectsKeyframeTimeline
          clip={draftClip}
          effects={draftEffects}
          keyframes={draftKeyframes}
          selectedEffectId={selectedEffectId}
          onSelectEffect={setSelectedEffectId}
          localTimeMs={localTimeMs}
          onSeek={setLocalTimeMs}
          isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying((p) => !p)}
          loop={loop}
          onToggleLoop={() => setLoop((p) => !p)}
          playbackRate={playbackRate}
          onPlaybackRateChange={setPlaybackRate}
          autoKeyframe={autoKeyframe}
          onToggleAutoKeyframe={() => setAutoKeyframe((p) => !p)}
          onUpsertKeyframe={upsertKeyframe}
          onMoveKeyframe={(kfId, nextTime) =>
            setDraftKeyframes((prev) =>
              prev.map((k) =>
                k.id === kfId
                  ? { ...k, timeMs: Math.max(0, Math.min(durationMs, nextTime)) }
                  : k,
              ),
            )
          }
          onDeleteKeyframe={(kfId) =>
            setDraftKeyframes((prev) => prev.filter((k) => k.id !== kfId))
          }
          onUpdateKeyframeEasing={(kfId, easing) =>
            setDraftKeyframes((prev) =>
              prev.map((k) => (k.id === kfId ? { ...k, easing } : k)),
            )
          }
        />

        <DialogFooter className="border-t border-border/60 bg-muted/10 px-4 py-2.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleApply}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
