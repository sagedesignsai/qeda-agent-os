/**
 * components/studio/inspector/sections/ClipPropertiesSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Context-aware clip inspector section with modern scrub-field controls:
 *   - Compact StudioPanelSection shells replace the old InspectorSection
 *   - StudioScrubField + StudioFieldRow/PairRow for all numeric properties
 *   - Axis color coding (X=red, Y=green) for transform position and scale
 *   - Link toggle for uniform scale X/Y
 *   - Dedicated controls for zooms, captions, overlays, audio, and timing
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useCallback, useMemo, useState } from 'react';
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
  ImageIcon,
  MoveIcon,
  Maximize2Icon,
  KeyRoundIcon,
  ZapIcon,
  ArrowLeftRightIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  ClipAnimation,
  ClipTransform,
  StudioAnimationEasing,
  StudioCompositionTransitionType,
  TimelineClip,
  TimelineTrack,
} from '@/lib/studio-types';
import { timelineStore } from '@/hooks/use-timeline-store';
import {
  ANIMATION_PRESETS,
  transitionTypeToPresetId,
} from '@/lib/studio/animation-presets';
import {
  InspectorCoordinatePad,
  TimecodeNudgeInput,
  StudioScrubField,
  StudioFieldRow,
  StudioPairRow,
  StudioLinkToggle,
  StudioPanelSection,
} from '../components';
import { UniversalKeyframesSection } from './UniversalKeyframesSection';
import { ClipEffectsSection } from './ClipEffectsSection';

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

  // Zoom parameters
  const effectType = clip.payload?.effectType;
  const isZoomClip = !effectType || effectType === 'zoom';
  const currentScale = clip.payload?.scale ?? 1.5;
  const targetX = clip.payload?.targetX ?? 0.5;
  const targetY = clip.payload?.targetY ?? 0.5;

  // Per-clip visual transform (multi-track model)
  const transform = clip.payload?.transform ?? null;
  const pos = transform?.position ?? { x: 0, y: 0 };
  const scl = transform?.scale ?? { x: 1, y: 1 };
  const rot = transform?.rotation ?? 0;
  const anchor = transform?.anchorPoint ?? { x: 0.5, y: 0.5 };

  const isVisualTrack = track.type === 'video' || track.type === 'overlays';
  const transitionFrom = clip.payload?.fromClipId
    ? timelineStore.findClip(clip.payload.fromClipId)
    : null;
  const transitionTo = clip.payload?.toClipId
    ? timelineStore.findClip(clip.payload.toClipId)
    : null;
  const legacyTransitionTarget = clip.payload?.targetClipId
    ? timelineStore.findClip(clip.payload.targetClipId)
    : null;
  const transitionCutMs = clip.startMs + clip.durationMs / 2;
  const transitionMaxDurationMs = Math.max(100, Math.floor(Math.min(
    maxDurationMs,
    2000,
    transitionCutMs * 2,
    transitionFrom?.clip.durationMs ?? Infinity,
    transitionTo?.clip.durationMs ?? Infinity,
    legacyTransitionTarget?.clip.durationMs
      ? legacyTransitionTarget.clip.durationMs * 2
      : Infinity,
  )));
  const isSpeedEditable =
    (clip.itemType === 'video' || clip.itemType === 'audio') &&
    !track.id.startsWith('track-') &&
    Boolean(
      clip.payload?.mediaAssetId ||
        clip.payload?.filePath ||
        clip.payload?.mediaUrl,
    );
  const rawPlaybackSpeed =
    clip.payload?.speed ??
    (clip.durationMs > 0 && clip.sourceDurationMs > 0
      ? clip.sourceDurationMs / clip.durationMs
      : 1);
  const playbackSpeed =
    Number.isFinite(rawPlaybackSpeed) && rawPlaybackSpeed > 0
      ? rawPlaybackSpeed
      : 1;

  const setPlaybackSpeed = (speed: number) => {
    const sourceDurationMs =
      clip.sourceDurationMs > 0
        ? clip.sourceDurationMs
        : clip.durationMs * playbackSpeed;
    onUpdateClip(clip.id, {
      durationMs: Math.max(1, sourceDurationMs / speed),
      sourceDurationMs,
      payload: { speed },
    });
  };

  const renderPlaybackSpeed = () => {
    if (!isSpeedEditable) return null;
    const options = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
    const selectedSpeed = options.reduce((nearest, option) =>
      Math.abs(option - playbackSpeed) < Math.abs(nearest - playbackSpeed)
        ? option
        : nearest,
    );

    return (
      <StudioFieldRow label="Speed">
        <Select
          value={String(selectedSpeed)}
          onValueChange={(value) => setPlaybackSpeed(Number(value))}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((speed) => (
              <SelectItem key={speed} value={String(speed)}>
                {speed}×
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </StudioFieldRow>
    );
  };

  // Accordion state: only one section open at a time
  // The first visible section (by render order) is open by default
  const [activeSection, setActiveSection] = useState<string | null>(null);

  // Set the default open section on mount based on track type
  useState(() => {
    if (track.type === 'effects') setActiveSection('Zoom');
    else if (track.type === 'transitions') setActiveSection('Transition');
    else if (track.type === 'overlays') setActiveSection('Overlay');
    else if (track.type === 'captions') setActiveSection('Caption');
    else if (track.type === 'video') setActiveSection('Video');
    else if (track.type === 'audio') setActiveSection('Audio');
    else if (isVisualTrack) setActiveSection('Transform');
  });

  const handleSectionToggle = useCallback(
    (section: string) => (open: boolean) => {
      if (open) setActiveSection(section);
      else setActiveSection(null);
    },
    [],
  );

  /** Merge a partial transform patch into the existing payload.transform */
  const setTransform = (partial: Partial<ClipTransform>) => {
    const next = { ...(transform ?? {}), ...partial };
    onUpdateClip(clip.id, { payload: { transform: next } });
  };

  // Per-clip enter/exit animations
  const enterAnim = clip.payload?.enterAnimation ?? null;
  const exitAnim = clip.payload?.exitAnimation ?? null;

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

  const setAnimation = (
    key: 'enterAnimation' | 'exitAnimation',
    patch: Partial<ClipAnimation>,
  ) => {
    const existing = key === 'enterAnimation' ? enterAnim : exitAnim;
    const next: ClipAnimation = {
      type: existing?.type ?? 'none',
      durationMs: existing?.durationMs ?? 300,
      ...patch,
    };
    onUpdateClip(clip.id, { payload: { [key]: next } });
  };

  /** Set animation from a preset selection */
  const setAnimationPreset = (
    key: 'enterAnimation' | 'exitAnimation',
    presetId: string | null,
  ) => {
    if (!presetId) {
      // Clear animation
      onUpdateClip(clip.id, { payload: { [key]: undefined } });
      return;
    }
    const preset = ANIMATION_PRESETS[presetId];
    if (!preset) return;

    // Map preset back to legacy type for compatibility
    const legacyType: StudioCompositionTransitionType = 'fade';
    const next: ClipAnimation = {
      type: legacyType,
      durationMs: preset.defaultDurationMs,
      easing: preset.defaultEasing,
      presetId,
    };
    onUpdateClip(clip.id, { payload: { [key]: next } });
  };

  /** Get the current preset id for an animation */
  const getPresetId = (anim: ClipAnimation | null | undefined): string | null => {
    if (!anim) return null;
    if (anim.presetId) return anim.presetId;
    return transitionTypeToPresetId(anim.type);
  };

  /** Count keyframes for an animation */
  const keyframeCount = (anim: ClipAnimation | null | undefined): number => {
    if (!anim) return 0;
    if (anim.keyframes) return anim.keyframes.length;
    if (anim.presetId && ANIMATION_PRESETS[anim.presetId]) {
      const kfs = ANIMATION_PRESETS[anim.presetId].generateKeyframes(
        'enter',
        anim.durationMs,
      );
      return kfs.length;
    }
    return 0;
  };

  /** Visible phase duration (hold between enter and exit) */
  const visiblePhaseMs = useMemo(() => {
    const enterDur = enterAnim?.durationMs ?? 0;
    const exitDur = exitAnim?.durationMs ?? 0;
    const visible = clip.durationMs - enterDur - exitDur;
    return Math.max(0, visible);
  }, [clip.durationMs, enterAnim?.durationMs, exitAnim?.durationMs]);

  /** Render a preset selector grid for enter or exit */
  const renderPresetGrid = (
    key: 'enterAnimation' | 'exitAnimation',
    anim: ClipAnimation | null | undefined,
  ) => {
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
        {presets.map((p) => (
          <Button
            key={p.id}
            type="button"
            variant={currentPreset === p.id ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-[10px]"
            onClick={() => setAnimationPreset(key, p.id)}
            title={p.name}
          >
            {p.name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          </Button>
        ))}
      </div>
    );
  };

  /** Render easing + duration controls for an active animation */
  const renderAnimationControls = (
    key: 'enterAnimation' | 'exitAnimation',
    anim: ClipAnimation | null | undefined,
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
          <span className="text-[11px] text-muted-foreground w-14 shrink-0">Easing</span>
          <Select
            value={anim.easing ?? 'ease-out'}
            onValueChange={(easing) => setAnimation(key, { easing })}
          >
            <SelectTrigger className="h-7 flex-1 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EASING_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {keyframeCount(anim) > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground ml-auto">
              <KeyRoundIcon className="w-3 h-3" />
              {keyframeCount(anim)}
            </span>
          )}
        </div>
      </>
    );
  };

  // Scale link state — uniform scaling for X/Y
  const scaleLinked = Math.abs(scl.x - scl.y) < 0.01;
  const [scaleLink, setScaleLink] = useState(scaleLinked);
  const handleScaleLinkToggle = () => {
    const next = !scaleLink;
    setScaleLink(next);
    if (next) {
      // Uniform: set both to the larger value
      const uniform = Math.max(scl.x, scl.y);
      setTransform({ scale: { x: uniform, y: uniform } });
    }
  };
  const handleScaleX = (x: number) => {
    if (scaleLink) {
      setTransform({ scale: { x, y: x } });
    } else {
      setTransform({ scale: { ...scl, x } });
    }
  };
  const handleScaleY = (y: number) => {
    if (scaleLink) {
      setTransform({ scale: { x: y, y } });
    } else {
      setTransform({ scale: { ...scl, y } });
    }
  };

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

      {track.type === 'transitions' && (
        <StudioPanelSection title="Transition" open={activeSection === 'Transition'} onOpenChange={handleSectionToggle('Transition')}>
          {transitionFrom && transitionTo && (
            <p className="mb-2 text-[10px] text-muted-foreground truncate">
              {transitionFrom.clip.name} → {transitionTo.clip.name}
            </p>
          )}
          <StudioFieldRow label="Style">
            <Select
              value={clip.payload?.transitionType ?? 'fade'}
              onValueChange={(value) =>
                onUpdateClip(clip.id, {
                  name: `${value} transition`,
                  payload: { transitionType: value as StudioCompositionTransitionType },
                })
              }
            >
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'scale'] as StudioCompositionTransitionType[]).map((value) => (
                  <SelectItem key={value} value={value}>{value.replaceAll('-', ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </StudioFieldRow>
          <StudioFieldRow label="Duration">
            <StudioScrubField
              label="Transition Duration"
              value={clip.durationMs}
              min={100}
              max={transitionMaxDurationMs}
              step={50}
              suffix="ms"
              onChange={(requestedDurationMs) => {
                const durationMs = Math.max(
                  100,
                  Math.min(requestedDurationMs, transitionMaxDurationMs),
                );
                let startMs = clip.startMs;
                if (transitionFrom && transitionTo) {
                  startMs = transitionCutMs - durationMs / 2;
                } else if (legacyTransitionTarget) {
                  startMs = clip.payload?.transitionSide === 'out'
                    ? legacyTransitionTarget.clip.startMs + legacyTransitionTarget.clip.durationMs - durationMs
                    : legacyTransitionTarget.clip.startMs;
                }
                onUpdateClip(clip.id, {
                  startMs: Math.max(0, startMs),
                  durationMs,
                });
              }}
            />
          </StudioFieldRow>
        </StudioPanelSection>
      )}

      {/* ── Effects: Zoom ─────────────────────────────────────────────────── */}
      {track.type === 'effects' && isZoomClip && (
        <StudioPanelSection title="Zoom" open={activeSection === 'Zoom'} onOpenChange={handleSectionToggle('Zoom')}>
          <StudioFieldRow label="Zoom Scale">
            <StudioScrubField
              label="Zoom Scale"
              value={currentScale}
              min={1.1}
              max={3.0}
              step={0.1}
              suffix="x"
              onChange={(scale) => {
                onUpdateClip(clip.id, {
                  name: `Zoom ${scale.toFixed(1)}x`,
                  payload: { scale },
                });
              }}
            />
          </StudioFieldRow>
          <InspectorCoordinatePad
            targetX={targetX}
            targetY={targetY}
            onChange={(newX, newY) => {
              onUpdateClip(clip.id, {
                payload: { targetX: newX, targetY: newY },
              });
            }}
          />
        </StudioPanelSection>
      )}

      {/* ── Effects: Non-Zoom ─────────────────────────────────────────────── */}
      {track.type === 'effects' && !isZoomClip && (
        <StudioPanelSection title="Effect" open={activeSection === 'Effect'} onOpenChange={handleSectionToggle('Effect')}>
          <StudioFieldRow label="Intensity">
            <StudioScrubField
              label="Effect Intensity"
              value={Math.round((clip.payload?.intensity ?? 0.6) * 100)}
              min={0}
              max={100}
              step={5}
              suffix="%"
              onChange={(percent) =>
                onUpdateClip(clip.id, { payload: { intensity: percent / 100 } })
              }
            />
          </StudioFieldRow>
        </StudioPanelSection>
      )}

      {/* ── Overlays ──────────────────────────────────────────────────────── */}
      {track.type === 'overlays' && (
        <StudioPanelSection title="Overlay" open={activeSection === 'Overlay'} onOpenChange={handleSectionToggle('Overlay')}>
          <StudioFieldRow label="Width">
            <StudioScrubField
              label="Overlay Width"
              value={Math.round((clip.payload?.widthPct ?? 0.42) * 100)}
              min={10}
              max={100}
              step={1}
              suffix="%"
              onChange={(percent) =>
                onUpdateClip(clip.id, { payload: { widthPct: percent / 100 } })
              }
            />
          </StudioFieldRow>
          <StudioFieldRow label="Opacity">
            <StudioScrubField
              label="Opacity"
              value={Math.round((clip.payload?.opacity ?? 1) * 100)}
              min={0}
              max={100}
              step={5}
              suffix="%"
              onChange={(percent) =>
                onUpdateClip(clip.id, { payload: { opacity: percent / 100 } })
              }
            />
          </StudioFieldRow>
          <StudioFieldRow label="Rotation">
            <StudioScrubField
              label="Rotation"
              value={clip.payload?.rotation ?? 0}
              min={-180}
              max={180}
              step={5}
              suffix="°"
              onChange={(rotation) =>
                onUpdateClip(clip.id, { payload: { rotation } })
              }
            />
          </StudioFieldRow>
          <StudioFieldRow label="Corner Radius">
            <StudioScrubField
              label="Corner Radius"
              value={clip.payload?.cornerRadius ?? 12}
              min={0}
              max={48}
              step={2}
              suffix="px"
              onChange={(cornerRadius) =>
                onUpdateClip(clip.id, { payload: { cornerRadius } })
              }
            />
          </StudioFieldRow>
          <InspectorCoordinatePad
            targetX={clip.payload?.x ?? 0.5}
            targetY={clip.payload?.y ?? 0.5}
            onChange={(x, y) =>
              onUpdateClip(clip.id, { payload: { x, y } })
            }
          />
        </StudioPanelSection>
      )}

      {/* ── Captions ──────────────────────────────────────────────────────── */}
      {track.type === 'captions' && (
        <StudioPanelSection title="Caption" open={activeSection === 'Caption'} onOpenChange={handleSectionToggle('Caption')}>
          <div className="space-y-1.5">
            <span className="text-[11px] text-muted-foreground">Subtitle Text</span>
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
          </div>
        </StudioPanelSection>
      )}

      {/* ── Video ─────────────────────────────────────────────────────────── */}
      {track.type === 'video' && (
        <StudioPanelSection title="Video" open={activeSection === 'Video'} onOpenChange={handleSectionToggle('Video')}>
          <StudioFieldRow label="Name" wide>
            <Input
              value={clip.name}
              onChange={(e) => onUpdateClip(clip.id, { name: e.target.value })}
              className="h-7 text-xs bg-background"
            />
          </StudioFieldRow>
          {renderPlaybackSpeed()}
        </StudioPanelSection>
      )}

      {/* ── Animations (all tracks) ───────────────────────────────────────── */}
      <StudioPanelSection title="Animations" open={activeSection === 'Animations'} onOpenChange={handleSectionToggle('Animations')}>
        <div className="space-y-2">
          {/* Enter Animation */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <ZapIcon className="w-3 h-3 text-purple-400" />
              <span className="text-[11px] font-medium text-foreground">Enter</span>
            </div>
            {renderPresetGrid('enterAnimation', enterAnim)}
          </div>
          {renderAnimationControls('enterAnimation', enterAnim, 'Enter')}

          {/* Visible Phase Indicator */}
          {(enterAnim || exitAnim) && (
            <div className="flex items-center gap-2 px-1 py-1 rounded bg-muted/40">
              <span className="text-[10px] text-muted-foreground">Visible hold</span>
              <span className="text-[10px] font-mono text-foreground ml-auto">
                {(visiblePhaseMs / 1000).toFixed(1)}s
              </span>
            </div>
          )}

          {/* Exit Animation */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <ZapIcon className="w-3 h-3 text-orange-400" />
              <span className="text-[11px] font-medium text-foreground">Exit</span>
            </div>
            {renderPresetGrid('exitAnimation', exitAnim)}
          </div>
          {renderAnimationControls('exitAnimation', exitAnim, 'Exit')}
        </div>
      </StudioPanelSection>

      {/* ── Universal Keyframes ───────────────────────────────────────────── */}
      <UniversalKeyframesSection track={track} clip={clip} />

      {/* ── Transform (video & overlays) ──────────────────────────────────── */}
      {isVisualTrack && (
        <StudioPanelSection title="Transform" open={activeSection === 'Transform'} onOpenChange={handleSectionToggle('Transform')}>
          <StudioFieldRow label="Position">
            <StudioPairRow
              left={
                <StudioScrubField
                  label="Position X"
                  value={pos.x}
                  prefix="X"
                  tone="x"
                  min={-500}
                  max={500}
                  step={5}
                  suffix="px"
                  onChange={(x) => setTransform({ position: { ...pos, x } })}
                />
              }
              right={
                <StudioScrubField
                  label="Position Y"
                  value={pos.y}
                  prefix="Y"
                  tone="y"
                  min={-500}
                  max={500}
                  step={5}
                  suffix="px"
                  onChange={(y) => setTransform({ position: { ...pos, y } })}
                />
              }
            />
          </StudioFieldRow>
          <StudioFieldRow label="Scale">
            <StudioPairRow
              left={
                <StudioScrubField
                  label="Scale X"
                  value={scl.x}
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
                  value={scl.y}
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
              value={rot}
              min={-180}
              max={180}
              step={1}
              suffix="°"
              onChange={(r) => setTransform({ rotation: r })}
            />
          </StudioFieldRow>
          <InspectorCoordinatePad
            label="Anchor Point"
            targetX={anchor.x}
            targetY={anchor.y}
            onChange={(x, y) => setTransform({ anchorPoint: { x, y } })}
          />
        </StudioPanelSection>
      )}

      {/* ── Audio ─────────────────────────────────────────────────────────── */}
      {track.type === 'audio' && (
        <StudioPanelSection title="Audio" open={activeSection === 'Audio'} onOpenChange={handleSectionToggle('Audio')}>
          {renderPlaybackSpeed()}
          <StudioFieldRow label="Volume">
            <StudioScrubField
              label="Volume Gain"
              value={
                clip.payload?.volume !== undefined
                  ? Math.round(clip.payload.volume * 100)
                  : 100
              }
              min={0}
              max={200}
              step={5}
              suffix="%"
              onChange={(volPercent) => {
                onUpdateClip(clip.id, {
                  payload: { volume: volPercent / 100 },
                });
              }}
            />
          </StudioFieldRow>
        </StudioPanelSection>
      )}

      {/* ── Timing ────────────────────────────────────────────────────────── */}
      <StudioPanelSection title="Timing" open={activeSection === 'Timing'} onOpenChange={handleSectionToggle('Timing')}>
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
