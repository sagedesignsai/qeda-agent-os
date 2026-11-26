/**
 * components/studio/inspector/ClipEffectsKeyframeTimeline.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Clip-local keyframe timeline for the Effects & Keyframe Studio dialog.
 *
 * Mirrors the Qeda keyframe workspace:
 *   - Transport bar with Play/Pause, Loop, speed, Auto-K, timecode & zoom
 *   - Left property tree (per-effect Intensity + clip Transform/Appearance)
 *   - Right scrubbable ruler + draggable diamond keyframes per property row
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useMemo, useRef, useState } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RepeatIcon,
  SkipBackIcon,
  SparklesIcon,
  Trash2Icon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { STUDIO_EFFECTS } from '@/lib/studio/effects/catalog';
import { isStudioZoomClip } from '@/lib/studio/effects/zoom-presets';
import { evaluateKeyframesAt } from '@/lib/studio/keyframes';
import {
  keyframeUiInfoFor,
  staticValueForProperty,
} from '@/lib/studio/timeline/keyframes-ui';
import type {
  ClipEffect,
  StudioAnimationEasing,
  StudioKeyframe,
  TimelineClip,
} from '@/lib/studio/types';
import { cn } from '@/lib/utils';

export interface KeyframePropertyRow {
  property: string;
  label: string;
  color: string;
  effectId?: string;
  fallbackValue: number;
}

interface ClipEffectsKeyframeTimelineProps {
  clip: TimelineClip;
  effects: ClipEffect[];
  keyframes: StudioKeyframe[];
  selectedEffectId: string | null;
  onSelectEffect: (effectId: string | null) => void;
  localTimeMs: number;
  onSeek: (timeMs: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  loop: boolean;
  onToggleLoop: () => void;
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
  autoKeyframe: boolean;
  onToggleAutoKeyframe: () => void;
  onUpsertKeyframe: (
    property: string,
    timeMs: number,
    value: number,
    easing?: StudioAnimationEasing,
  ) => void;
  onMoveKeyframe: (keyframeId: string, timeMs: number) => void;
  onDeleteKeyframe: (keyframeId: string) => void;
  onUpdateKeyframeEasing: (
    keyframeId: string,
    easing: StudioAnimationEasing,
  ) => void;
}

const TRANSFORM_PROPERTIES = ['opacity', 'scale', 'x', 'y', 'rotation'] as const;
const EASING_OPTIONS: Array<{ value: StudioAnimationEasing; label: string }> = [
  { value: 'linear', label: 'Linear' },
  { value: 'ease-in', label: 'Ease In' },
  { value: 'ease-out', label: 'Ease Out' },
  { value: 'ease-in-out', label: 'Ease In-Out' },
];

function formatTimecode(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSec = Math.floor(clamped / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const centis = Math.floor((clamped % 1000) / 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

function tickStepMs(durationMs: number, zoom: number): number {
  const pxPerSec = (600 / Math.max(1, durationMs / 1000)) * zoom;
  if (pxPerSec >= 140) return 500;
  if (pxPerSec >= 60) return 1000;
  if (pxPerSec >= 25) return 2000;
  return 5000;
}

export function ClipEffectsKeyframeTimeline({
  clip,
  effects,
  keyframes,
  selectedEffectId,
  onSelectEffect,
  localTimeMs,
  onSeek,
  isPlaying,
  onTogglePlay,
  loop,
  onToggleLoop,
  playbackRate,
  onPlaybackRateChange,
  autoKeyframe,
  onToggleAutoKeyframe,
  onUpsertKeyframe,
  onMoveKeyframe,
  onDeleteKeyframe,
  onUpdateKeyframeEasing,
}: ClipEffectsKeyframeTimelineProps) {
  const durationMs = Math.max(100, clip.durationMs || 5000);
  const isZoomClip = isStudioZoomClip(clip);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [transformExpanded, setTransformExpanded] = useState(true);
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);
  const trackContainerRef = useRef<HTMLDivElement | null>(null);

  const selectedKeyframe = useMemo(
    () => keyframes.find((k) => k.id === selectedKeyframeId) ?? null,
    [keyframes, selectedKeyframeId],
  );
  const keyframesByProperty = useMemo(() => {
    const grouped = new Map<string, StudioKeyframe[]>();
    for (const keyframe of keyframes) {
      const propertyKeyframes = grouped.get(keyframe.property);
      if (propertyKeyframes) {
        propertyKeyframes.push(keyframe);
      } else {
        grouped.set(keyframe.property, [keyframe]);
      }
    }
    return grouped;
  }, [keyframes]);

  const effectRows = useMemo<KeyframePropertyRow[]>(() => {
    if (isZoomClip) {
      return (['zoomScale', 'zoomTargetX', 'zoomTargetY'] as const).map(
        (property) => {
          const info = keyframeUiInfoFor(property);
          return {
            property,
            label: info?.label ?? property,
            color: info?.color ?? '#c084fc',
            fallbackValue: staticValueForProperty(clip, property),
          };
        },
      );
    }
    return [...effects]
      .sort((a, b) => a.stackOrder - b.stackOrder)
      .map((effect) => {
        const def = STUDIO_EFFECTS.find((e) => e.type === effect.type);
        return {
          property: `effect:${effect.id}:intensity`,
          label: `${def?.label ?? effect.type} · Intensity`,
          color: '#38bdf8',
          effectId: effect.id,
          fallbackValue: effect.intensity,
        };
      });
  }, [effects, clip, isZoomClip]);

  const transformRows = useMemo<KeyframePropertyRow[]>(() => {
    if (isZoomClip) return [];
    return TRANSFORM_PROPERTIES.map((prop) => {
      const info = keyframeUiInfoFor(prop);
      return {
        property: prop,
        label: info?.label ?? prop,
        color: info?.color ?? '#38bdf8',
        fallbackValue: staticValueForProperty(clip, prop),
      };
    });
  }, [clip]);

  const ticks = useMemo(() => {
    const step = tickStepMs(durationMs, timelineZoom);
    const result: number[] = [];
    for (let t = 0; t <= durationMs; t += step) {
      result.push(t);
    }
    return result;
  }, [durationMs, timelineZoom]);

  const timeToPercent = (ms: number) =>
    Math.max(0, Math.min(100, (ms / durationMs) * 100));

  const clientXToTimeMs = (clientX: number): number => {
    const el = trackContainerRef.current;
    if (!el) return localTimeMs;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return localTimeMs;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * durationMs);
  };

  const handleRulerPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    onSeek(clientXToTimeMs(event.clientX));
    const onMove = (moveEvent: PointerEvent) => {
      onSeek(clientXToTimeMs(moveEvent.clientX));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleDiamondPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    kf: StudioKeyframe,
  ) => {
    event.stopPropagation();
    event.preventDefault();
    setSelectedKeyframeId(kf.id);
    onSeek(kf.timeMs);

    const onMove = (moveEvent: PointerEvent) => {
      const nextTime = clientXToTimeMs(moveEvent.clientX);
      onMoveKeyframe(kf.id, nextTime);
      onSeek(nextTime);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const insertKeyframeAt = (row: KeyframePropertyRow, timeMs: number) => {
    const evaluated = evaluateKeyframesAt(keyframes, timeMs, row.property);
    const value = evaluated !== undefined ? evaluated : row.fallbackValue;
    onUpsertKeyframe(row.property, timeMs, value, 'linear');
  };

  const renderTrackRow = (row: KeyframePropertyRow) => {
    const rowKeyframes = keyframesByProperty.get(row.property) ?? [];
    return (
      <div
        key={row.property}
        data-testid={`kf-track-${row.property}`}
        onDoubleClick={(e) => insertKeyframeAt(row, clientXToTimeMs(e.clientX))}
        className="relative h-7 border-b border-border/30 hover:bg-muted/20"
      >
        {rowKeyframes.map((kf) => {
          const isSelected = kf.id === selectedKeyframeId;
          return (
            <button
              key={kf.id}
              type="button"
              aria-label={`${row.label} keyframe at ${Math.round(kf.timeMs)}ms`}
              onPointerDown={(e) => handleDiamondPointerDown(e, kf)}
              style={{
                left: `${timeToPercent(kf.timeMs)}%`,
                backgroundColor: isSelected ? '#ffffff' : row.color,
                borderColor: row.color,
              }}
              className={cn(
                'absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border transition-transform',
                isSelected ? 'scale-125 ring-2 ring-sky-400/60' : 'hover:scale-110',
              )}
              title={`${row.label}: ${kf.value.toFixed(2)} @ ${formatTimecode(kf.timeMs)}`}
            />
          );
        })}
      </div>
    );
  };

  const renderLabelRow = (row: KeyframePropertyRow) => {
    const count = keyframesByProperty.get(row.property)?.length ?? 0;
    const isEffectSelected = row.effectId && row.effectId === selectedEffectId;
    return (
      <div
        key={row.property}
        onClick={() => {
          if (row.effectId) onSelectEffect(row.effectId);
        }}
        className={cn(
          'flex h-7 items-center justify-between border-b border-border/30 px-2.5 text-[11px]',
          row.effectId && 'cursor-pointer hover:bg-muted/30',
          isEffectSelected && 'bg-primary/10 text-foreground',
        )}
      >
        <span className="truncate text-muted-foreground">{row.label}</span>
        <div className="flex items-center gap-1">
          {count > 0 && (
            <span className="rounded bg-muted px-1 text-[10px] font-mono text-muted-foreground">
              {count}
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-5"
            aria-label={`Add keyframe for ${row.label}`}
            title="Add keyframe at playhead"
            onClick={(e) => {
              e.stopPropagation();
              insertKeyframeAt(row, localTimeMs);
            }}
          >
            <PlusIcon className="size-3" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-60 flex-col border-t border-border/60 bg-background/95 select-none">
      {/* Transport Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Jump to clip start"
            onClick={() => onSeek(0)}
          >
            <SkipBackIcon className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
            onClick={onTogglePlay}
          >
            {isPlaying ? (
              <PauseIcon className="size-3.5" />
            ) : (
              <PlayIcon className="size-3.5" />
            )}
          </Button>
          <Button
            type="button"
            variant={loop ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 gap-1 px-2 text-[11px]"
            aria-pressed={loop}
            onClick={onToggleLoop}
          >
            <RepeatIcon className="size-3" />
            Loop
          </Button>

          <Select
            value={String(playbackRate)}
            onValueChange={(v) => onPlaybackRateChange(Number(v))}
          >
            <SelectTrigger className="h-7 w-16 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0.5">0.5x</SelectItem>
              <SelectItem value="1">1x</SelectItem>
              <SelectItem value="2">2x</SelectItem>
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant={autoKeyframe ? 'default' : 'outline'}
            size="sm"
            aria-pressed={autoKeyframe}
            onClick={onToggleAutoKeyframe}
            className={cn(
              'h-7 gap-1 px-2 text-[11px]',
              autoKeyframe &&
                'border-amber-500/60 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30',
            )}
          >
            <SparklesIcon className="size-3" />
            Auto-K
          </Button>

          <span className="ml-1 font-mono text-[11px] text-muted-foreground">
            {formatTimecode(localTimeMs)} / {formatTimecode(durationMs)}
          </span>
        </div>

        {/* Selected Keyframe Controls + Timeline Zoom */}
        <div className="flex items-center gap-2">
          {selectedKeyframe && (
            <div className="flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2 py-0.5">
              <Select
                value={selectedKeyframe.easing}
                onValueChange={(val) =>
                  onUpdateKeyframeEasing(
                    selectedKeyframe.id,
                    val as StudioAnimationEasing,
                  )
                }
              >
                <SelectTrigger className="h-6 w-28 border-0 bg-transparent text-[11px]">
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
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 text-destructive hover:text-destructive"
                aria-label="Delete selected keyframe"
                onClick={() => {
                  onDeleteKeyframe(selectedKeyframe.id);
                  setSelectedKeyframeId(null);
                }}
              >
                <Trash2Icon className="size-3" />
              </Button>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>Zoom</span>
            <input
              type="range"
              aria-label="Timeline zoom"
              min={1}
              max={4}
              step={0.25}
              value={timelineZoom}
              onChange={(e) => setTimelineZoom(Number(e.target.value))}
              className="h-1 w-20 accent-sky-400"
            />
          </div>
        </div>
      </div>

      {/* Property Tree + Diamond Tracks */}
      <div className="flex flex-1 overflow-y-auto">
        {/* Left Property Labels */}
        <div className="w-56 shrink-0 border-r border-border/50 bg-muted/10">
          <div className="flex h-6 items-center border-b border-border/50 px-2.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            Properties
          </div>
          {effectRows.length === 0 ? (
            <div className="border-b border-border/30 px-2.5 py-1.5 text-[11px] text-muted-foreground/70">
              No effects added yet
            </div>
          ) : (
            effectRows.map(renderLabelRow)
          )}

          {!isZoomClip && (
            <>
              <button
                type="button"
                onClick={() => setTransformExpanded((prev) => !prev)}
                className="flex h-6 w-full items-center gap-1 border-b border-border/40 bg-muted/20 px-2 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase hover:bg-muted/40"
              >
                {transformExpanded ? (
                  <ChevronDownIcon className="size-3" />
                ) : (
                  <ChevronRightIcon className="size-3" />
                )}
                Transform &amp; Appearance
              </button>
              {transformExpanded && transformRows.map(renderLabelRow)}
            </>
          )}
        </div>

        {/* Right Timeline Ruler & Keyframe Rows */}
        <div className="relative flex-1 overflow-x-auto">
          <div
            ref={trackContainerRef}
            style={{ width: `${timelineZoom * 100}%`, minWidth: '100%' }}
            className="relative min-h-full"
          >
            {/* Time Ruler */}
            <div
              onPointerDown={handleRulerPointerDown}
              className="relative h-6 cursor-ew-resize border-b border-border/50 bg-muted/20"
            >
              {ticks.map((t) => (
                <div
                  key={t}
                  style={{ left: `${timeToPercent(t)}%` }}
                  className="absolute top-0 flex h-full -translate-x-1/2 flex-col items-center justify-end"
                >
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {(t / 1000).toFixed(t % 1000 === 0 ? 0 : 1)}s
                  </span>
                  <div className="h-1.5 w-px bg-border" />
                </div>
              ))}
            </div>

            {/* Effect Keyframe Rows */}
            {effectRows.length === 0 ? (
              <div className="h-7 border-b border-border/30" />
            ) : (
              effectRows.map(renderTrackRow)
            )}

            {/* Transform & Appearance Header Spacer + Rows */}
            {!isZoomClip && (
              <>
                <div className="h-6 border-b border-border/40 bg-muted/10" />
                {transformExpanded && transformRows.map(renderTrackRow)}
              </>
            )}

            {/* Playhead Line */}
            <div
              style={{ left: `${timeToPercent(localTimeMs)}%` }}
              className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-sky-400"
            >
              <div className="size-2 -translate-x-[3.5px] rounded-b-sm bg-sky-400" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
