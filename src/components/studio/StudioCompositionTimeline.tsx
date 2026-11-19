import {
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import type {
  StudioComposition,
  StudioCompositionLayer,
  StudioEffect,
} from '@/lib/studio/types';
import { getStudioEffectDefinition } from '@/lib/studio/effects/catalog';

function timeLabel(timeMs: number): string {
  const seconds = Math.floor(timeMs / 1000);
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

interface LayerTiming {
  layerId: string;
  startMs: number;
  endMs: number;
}

export function StudioCompositionTimeline({
  composition,
  effects,
  selectedLayerId,
  playheadMs,
  disabled,
  onSelectLayer,
  onCommitTiming,
}: {
  composition: StudioComposition;
  effects: readonly StudioEffect[];
  selectedLayerId: string | null;
  playheadMs: number;
  disabled: boolean;
  onSelectLayer: (layerId: string) => void;
  onCommitTiming: (
    layerId: string,
    startMs: number,
    endMs: number,
  ) => Promise<boolean>;
}) {
  const [, setDraftTiming] = useState<LayerTiming | null>(null);
  const draftTimingRef = useRef<LayerTiming | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    layerId: string;
    mode: 'move' | 'start' | 'end';
    startX: number;
    width: number;
    startMs: number;
    endMs: number;
  } | null>(null);
  const durationMs = composition.document.durationMs;
  const layers = [...composition.document.layers].sort(
    (a, b) => b.zIndex - a.zIndex,
  );
  const rulerMarks = [0, 0.25, 0.5, 0.75, 1];

  const updateDraftTiming = (timing: LayerTiming | null) => {
    draftTimingRef.current = timing;
    setDraftTiming(timing);
  };

  const getTiming = (layer: StudioCompositionLayer): LayerTiming => {
    const draft = draftTimingRef.current;
    return draft?.layerId === layer.id
      ? draft
      : {
          layerId: layer.id,
          startMs: layer.startMs,
          endMs: layer.endMs,
        };
  };

  const handlePointerDown = (
    event: PointerEvent<HTMLButtonElement>,
    layer: StudioCompositionLayer,
  ) => {
    if (disabled || event.button !== 0) return;
    const track = event.currentTarget.parentElement;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const timing = getTiming(layer);
    const target =
      event.target instanceof HTMLElement ? event.target : null;
    const edge = target?.dataset.edge;
    const mode = edge === 'start' || edge === 'end' ? edge : 'move';
    dragRef.current = {
      pointerId: event.pointerId,
      layerId: layer.id,
      mode,
      startX: event.clientX,
      width: rect.width,
      startMs: timing.startMs,
      endMs: timing.endMs,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelectLayer(layer.id);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !drag.width) return;
    const deltaMs =
      ((event.clientX - drag.startX) / drag.width) * durationMs;
    const minSpanMs = Math.min(
      100,
      drag.mode === 'end' ? durationMs - drag.startMs : durationMs,
    );
    const startMs =
      drag.mode === 'move'
        ? Math.max(
            0,
            Math.min(
              durationMs - (drag.endMs - drag.startMs),
              drag.startMs + deltaMs,
            ),
          )
        : drag.mode === 'start'
          ? Math.max(0, Math.min(drag.endMs - minSpanMs, drag.startMs + deltaMs))
          : drag.startMs;
    const endMs =
      drag.mode === 'move'
        ? startMs + (drag.endMs - drag.startMs)
        : drag.mode === 'end'
          ? Math.min(durationMs, Math.max(drag.startMs + minSpanMs, drag.endMs + deltaMs))
          : drag.endMs;
    updateDraftTiming({ layerId: drag.layerId, startMs, endMs });
  };

  const handlePointerUp = async (
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    const timing = draftTimingRef.current;
    if (!timing || timing.layerId !== drag.layerId) {
      updateDraftTiming(null);
      return;
    }
    await onCommitTiming(
      timing.layerId,
      timing.startMs,
      timing.endMs,
    );
    updateDraftTiming(null);
  };

  const adjustWithKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    layer: StudioCompositionLayer,
  ) => {
    if (disabled || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' ? -100 : 100;
    const timing = getTiming(layer);
    const spanMs = timing.endMs - timing.startMs;
    const startMs = event.shiftKey
      ? timing.startMs
      : Math.max(0, Math.min(durationMs - spanMs, timing.startMs + delta));
    const endMs = event.shiftKey
      ? Math.max(
          timing.startMs +
            Math.min(100, durationMs - timing.startMs),
          Math.min(durationMs, timing.endMs + delta),
        )
      : startMs + spanMs;
    void onCommitTiming(layer.id, startMs, endMs);
  };

  return (
    <section
      aria-label="Composition timeline"
      className="h-52 shrink-0 border-t border-border/60 bg-card/30"
    >
      <div className="flex h-11 items-center justify-between border-b border-border/50 px-4">
        <div>
          <h2 className="text-xs font-medium">Layer timeline</h2>
          <p className="text-[10px] text-muted-foreground">
            Drag layer edges to adjust timing; shaded ends mark transitions.
          </p>
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {timeLabel(durationMs)}
        </span>
      </div>
      <div className="h-[calc(100%-2.75rem)] overflow-auto px-3 py-2">
        <div className="min-w-[620px]">
          <div className="grid grid-cols-[150px_minmax(0,1fr)] items-end gap-2 pb-1">
            <span className="text-[10px] text-muted-foreground">Layer</span>
            <div className="relative h-4">
              {rulerMarks.map((mark) => (
                <span
                  key={mark}
                  className="absolute top-0 -translate-x-1/2 text-[9px] tabular-nums text-muted-foreground"
                  style={{ left: `${mark * 100}%` }}
                >
                  {timeLabel(durationMs * mark)}
                </span>
              ))}
              <span
                aria-hidden="true"
                className="absolute inset-y-0 z-10 w-px bg-primary"
                style={{
                  left: `${(Math.max(0, Math.min(durationMs, playheadMs)) / durationMs) * 100}%`,
                }}
              />
            </div>
          </div>
          <div className="space-y-1">
            {layers.map((layer) => {
              const timing = getTiming(layer);
              const selected = layer.id === selectedLayerId;
              const left = (timing.startMs / durationMs) * 100;
              const width = ((timing.endMs - timing.startMs) / durationMs) * 100;
              return (
                <div
                  key={layer.id}
                  className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-2"
                >
                  <button
                    type="button"
                    onClick={() => onSelectLayer(layer.id)}
                    className={`truncate rounded px-2 py-1 text-left text-[10px] outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      selected
                        ? 'bg-primary/15 text-foreground'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                    }`}
                  >
                    {layer.name}
                  </button>
                  <div className="relative h-8 rounded-sm border border-border/30 bg-muted/20">
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 z-20 w-px bg-primary"
                      style={{
                        left: `${(Math.max(0, Math.min(durationMs, playheadMs)) / durationMs) * 100}%`,
                      }}
                    />
                    <button
                      type="button"
                      aria-label={`${layer.name}, ${timeLabel(timing.startMs)} to ${timeLabel(timing.endMs)}. Use left and right arrows to move; Shift plus arrow to change its end.`}
                      aria-pressed={selected}
                      disabled={disabled}
                      onPointerDown={(event) => handlePointerDown(event, layer)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={(event) => void handlePointerUp(event)}
                      onPointerCancel={(event) => {
                        if (dragRef.current?.pointerId !== event.pointerId) return;
                        dragRef.current = null;
                        updateDraftTiming(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape' && dragRef.current) {
                          const pointerId = dragRef.current.pointerId;
                          if (event.currentTarget.hasPointerCapture(pointerId)) {
                            event.currentTarget.releasePointerCapture(pointerId);
                          }
                          dragRef.current = null;
                          updateDraftTiming(null);
                          return;
                        }
                        adjustWithKeyboard(event, layer);
                      }}
                      className={`absolute top-0 h-full touch-none overflow-hidden rounded border text-left text-[10px] outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        selected
                          ? 'border-primary bg-primary/25 text-foreground'
                          : 'border-border/60 bg-secondary/60 text-secondary-foreground'
                      }`}
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                      }}
                    >
                      {layer.transitionIn.type !== 'none' &&
                        layer.transitionIn.durationMs > 0 && (
                          <span
                            aria-hidden="true"
                            title={`${layer.transitionIn.type} entrance`}
                            className="pointer-events-none absolute inset-y-0 left-0 z-10 bg-sky-300/35"
                            style={{
                              width: `${Math.min(
                                100,
                                (layer.transitionIn.durationMs /
                                  (timing.endMs - timing.startMs)) *
                                  100,
                              )}%`,
                            }}
                          />
                        )}
                      <span
                        data-edge="start"
                        aria-hidden="true"
                        className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize"
                      />
                      <span className="block truncate px-2">{layer.name}</span>
                      <span
                        data-edge="end"
                        aria-hidden="true"
                        className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize"
                      />
                      {layer.transitionOut.type !== 'none' &&
                        layer.transitionOut.durationMs > 0 && (
                          <span
                            aria-hidden="true"
                            title={`${layer.transitionOut.type} exit`}
                            className="pointer-events-none absolute inset-y-0 right-0 z-10 bg-violet-300/35"
                            style={{
                              width: `${Math.min(
                                100,
                                (layer.transitionOut.durationMs /
                                  (timing.endMs - timing.startMs)) *
                                  100,
                              )}%`,
                            }}
                          />
                        )}
                    </button>
                  </div>
                </div>
              );
            })}
            {layers.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Add a media layer to place it on the timeline.
              </p>
            )}
            {effects.map((effect) => {
              const definition = getStudioEffectDefinition(effect.type);
              const left = (effect.startMs / durationMs) * 100;
              const width = ((effect.endMs - effect.startMs) / durationMs) * 100;
              return (
                <div
                  key={effect.id}
                  className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-2"
                >
                  <span className="truncate px-2 text-[10px] text-muted-foreground">
                    {definition?.label ?? effect.type}
                  </span>
                  <div className="relative h-6 rounded-sm border border-border/30 bg-muted/20">
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 z-10 w-px bg-primary"
                      style={{
                        left: `${(Math.max(0, Math.min(durationMs, playheadMs)) / durationMs) * 100}%`,
                      }}
                    />
                    <div
                      title={`${definition?.label ?? effect.type}: ${timeLabel(effect.startMs)} to ${timeLabel(effect.endMs)}`}
                      className="absolute inset-y-0.5 min-w-1 rounded-sm border"
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        borderColor: definition?.accent,
                        backgroundColor: `${definition?.accent}30`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
