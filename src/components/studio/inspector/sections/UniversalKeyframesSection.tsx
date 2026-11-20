/**
 * components/studio/inspector/sections/UniversalKeyframesSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Inspector UI for universal, property-addressed keyframes
 * (`StudioKeyframe` on `clip.payload.keyframes`).
 *
 * For each keyframe-able property on the clip:
 *   - An [Add] button appends a keyframe at the current playhead time with
 *     the current evaluated value (so adding never jumps the clip).
 *   - The keyframes of the property are listed: editable time (seconds) and
 *     value, with a delete control per keyframe.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  timelineStore,
  useTimelineState,
} from '@/hooks/use-timeline-store';
import { evaluateClipKeyframeValues } from '@/lib/studio/keyframes';
import {
  keyframeUiInfoFor,
  staticValueForProperty,
  type KeyframeUiInfo,
} from '@/lib/studio/timeline/keyframes-ui';
import type { TimelineClip, TimelineTrack } from '@/lib/studio/types';
import { StudioScrubField } from '../components';

type PropertyDef = KeyframeUiInfo & { staticValue: number };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatTimeSeconds(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

export function UniversalKeyframesSection({
  track,
  clip,
}: {
  track: TimelineTrack;
  clip: TimelineClip;
}) {
  const { currentTimeMs } = useTimelineState();
  const live =
    timelineStore
      .getState()
      .tracks.find((t) => t.id === clip.trackId)
      ?.clips.find((c) => c.id === clip.id) ?? clip;

  const durationMs = Math.max(0, live.durationMs);
  const evaluated = evaluateClipKeyframeValues(live, Math.max(0, currentTimeMs - live.startMs));

  // Properties editable per track type, sourced from the shared canvas UI
  // metadata (ranges, labels, colors) so inspector and canvas stay in sync.
  const propertyDefs: PropertyDef[] = [];
  if (track.type === 'video') {
    for (const property of ['x', 'y', 'scale', 'rotation', 'opacity', 'speed']) {
      const info = keyframeUiInfoFor(property);
      if (info) {
        propertyDefs.push({ ...info, staticValue: staticValueForProperty(live, property) });
      }
    }
  } else if (track.type === 'audio') {
    const info = keyframeUiInfoFor('speed');
    if (info) {
      propertyDefs.push({ ...info, staticValue: staticValueForProperty(live, 'speed') });
    }
  } else if (track.type === 'effects') {
    const info = keyframeUiInfoFor('intensity');
    if (info) {
      propertyDefs.push({ ...info, staticValue: staticValueForProperty(live, 'intensity') });
    }
  }

  if (propertyDefs.length === 0) return null;

  const keyframesOf = (property: string) =>
    live.payload?.keyframes?.filter((k) => k.property === property) ?? [];

  const currentValue = (def: PropertyDef) =>
    evaluated[def.property as keyof typeof evaluated] ?? def.staticValue;

  const patchForStaticValue = (def: PropertyDef, next: number) => {
    const payload = live.payload ?? {};
    const transform = live.payload?.transform ?? {};
    switch (def.property) {
      case 'x':
      case 'y':
        return {
          transform: {
            ...transform,
            position: { ...(transform.position ?? {}), [def.property]: next },
          },
        };
      case 'scale':
        return { transform: { ...transform, scale: { ...(transform.scale ?? {}), x: next } } };
      case 'rotation':
        return { transform: { ...transform, rotation: next } };
      case 'opacity':
        return { payload: { ...payload, opacity: next } };
      case 'speed':
        return { payload: { ...payload, speed: next } };
      case 'intensity':
        return { payload: { ...payload, intensity: next } };
      default:
        return { payload: { ...payload, [def.property]: next } };
    }
  };

  const addKeyframe = (def: PropertyDef) => {
    const localTimeMs = clamp(
      currentTimeMs - live.startMs,
      0,
      durationMs,
    );
    timelineStore.addClipKeyframe(
      live.id,
      def.property,
      localTimeMs,
      currentValue(def),
    );
  };

  const removeAllKeyframes = (def: PropertyDef) => {
    for (const kf of keyframesOf(def.property)) {
      timelineStore.removeClipKeyframe(live.id, kf.id);
    }
  };

  return (
    <div className="border-b border-border/60">
      <div className="px-3 py-2.5">
        <h3 className="mb-2 text-[11px] font-semibold tracking-tight text-foreground">
          Keyframes
        </h3>
        <div className="space-y-3">
          {propertyDefs.map((def) => {
            const keyframes = keyframesOf(def.property);
            const value = currentValue(def);
            return (
              <div
                key={def.property}
                className="rounded-md border border-border/40 bg-secondary/20 px-2.5 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-[10px] font-semibold text-foreground/70">
                    {def.label}
                  </span>
                  <StudioScrubField
                    label={`${def.label} value`}
                    value={value}
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    suffix={def.suffix}
                    onChange={(next) => timelineStore.updateClip(live.id, patchForStaticValue(def, next))}
                    className="h-6 flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px]"
                    onClick={() => addKeyframe(def)}
                  >
                    Add
                  </Button>
                  {keyframes.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px]"
                      onClick={() => removeAllKeyframes(def)}
                    >
                      Clear
                    </Button>
                  )}
                </div>

                {keyframes.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {[...keyframes]
                      .sort((a, b) => a.timeMs - b.timeMs)
                      .map((kf) => (
                        <div key={kf.id} className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            min={0}
                            max={durationMs}
                            step={0.001}
                            value={formatTimeSeconds(kf.timeMs / 1000)}
                            aria-label={`${def.label} keyframe time`}
                            className="h-6 w-14 px-1 text-[10px] font-mono"
                            onChange={(e) => {
                              const parsed = Number(e.target.value);
                              if (Number.isFinite(parsed)) {
                                timelineStore.updateClipKeyframeTime(
                                  live.id,
                                  kf.id,
                                  clamp(parsed * 1000, 0, durationMs),
                                );
                              }
                            }}
                          />
                          <span className="text-[9px] text-muted-foreground shrink-0">s</span>
                          <StudioScrubField
                            label={`${def.label} keyframe value`}
                            value={kf.value}
                            min={def.min}
                            max={def.max}
                            step={def.step}
                            suffix={def.suffix}
                            className="flex-1"
                            onChange={(next) =>
                              timelineStore.updateClipKeyframeValue(live.id, kf.id, next)
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-rose-400"
                            aria-label={`Remove ${def.label} keyframe`}
                            onClick={() => timelineStore.removeClipKeyframe(live.id, kf.id)}
                          >
                            <Trash2Icon className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
