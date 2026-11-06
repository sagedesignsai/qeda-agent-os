/**
 * components/trace/TraceTimeline.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The Nova Trace timeline: transport, adaptive ruler, layer lanes, keyframe rows
 * and a GPU-composited playhead.
 *
 * Scrubbing and playback move the playhead by mutating `#trace-playhead-needle`
 * and the timecode nodes directly (the runtime driver owns them), so dragging or
 * playing never re-renders the React tree at frame rate.
 */

import { useMemo, useRef, useState } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  CornerDownLeftIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  RotateCcwIcon,
  SkipBackIcon,
  Trash2Icon,
  ZoomInIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Toggle } from '@/components/ui/toggle';
import { TRACK_LABELS } from '@/lib/trace/elements/registry';
import { formatTraceTimecode } from '@/lib/trace/runtime/resolve-element';
import { seekTracePlayback } from '@/lib/trace/runtime/playback-driver';
import type {
  Keyframe,
  PropertyTrack,
  TraceElement,
  TraceProject,
} from '@/lib/trace/types';
import { useTraceStore } from '@/stores/trace-store';

const LABEL_WIDTH = 208;
const ROW_HEIGHT = 30;
const TRACK_ROW_HEIGHT = 22;

type OrderedElement = {
  element: TraceElement;
  depth: number;
  hasChildren: boolean;
};

function orderedElements(
  project: TraceProject,
  collapsed: string[],
): OrderedElement[] {
  const ordered: OrderedElement[] = [];
  const visit = (elementId: string, depth: number) => {
    const element = project.elements[elementId];
    if (!element) return;
    const children = element.childrenIds ?? [];
    ordered.push({ element, depth, hasChildren: children.length > 0 });
    if (collapsed.includes(elementId)) return;
    children.forEach((childId) => visit(childId, depth + 1));
  };
  project.rootElementIds.forEach((elementId) => visit(elementId, 0));
  return ordered;
}

function pickTickStep(zoomRatio: number): number {
  const candidates = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30];
  const minPx = 56;
  return candidates.find((step) => step * zoomRatio >= minPx) ?? 30;
}

function keyframeKey(
  elementId: string,
  track: PropertyTrack,
  keyframe: Keyframe,
): string {
  return `${elementId}:${track.id}:${keyframe.id}`;
}

export function TraceTimeline() {
  const project = useTraceStore((state) => state.project);
  const playback = useTraceStore((state) => state.playback);
  const selection = useTraceStore((state) => state.selection);
  const setPlayhead = useTraceStore((state) => state.setPlayhead);
  const togglePlay = useTraceStore((state) => state.togglePlay);
  const setLooping = useTraceStore((state) => state.setLooping);
  const setPlaybackSpeed = useTraceStore((state) => state.setPlaybackSpeed);
  const setPlaybackDirection = useTraceStore(
    (state) => state.setPlaybackDirection,
  );
  const setAutoKeyframe = useTraceStore((state) => state.setAutoKeyframe);
  const setZoomRatio = useTraceStore((state) => state.setZoomRatio);
  const setTimelineCollapsed = useTraceStore(
    (state) => state.setTimelineCollapsed,
  );
  const selectElement = useTraceStore((state) => state.selectElement);
  const toggleExpandElement = useTraceStore(
    (state) => state.toggleExpandElement,
  );
  const selectKeyframe = useTraceStore((state) => state.selectKeyframe);
  const addKeyframe = useTraceStore((state) => state.addKeyframe);
  const updateKeyframe = useTraceStore((state) => state.updateKeyframe);
  const deleteKeyframe = useTraceStore((state) => state.deleteKeyframe);
  const removePropertyTrack = useTraceStore(
    (state) => state.removePropertyTrack,
  );

  const lanesRef = useRef<HTMLDivElement | null>(null);
  const scrubRef = useRef<{ pointerId: number } | null>(null);
  const [dragKeyframe, setDragKeyframe] = useState<{
    elementId: string;
    track: PropertyTrack;
    keyframe: Keyframe;
    startX: number;
    startTimeMs: number;
    timeMs: number;
  } | null>(null);

  const durationMs = Math.max(1, project?.durationMs ?? 0);
  const durationSec = durationMs / 1000;
  // No minimum-width clamp: the pixel-per-ms scale must match the runtime
  // playhead, which positions the needle from `zoomRatio`.
  const laneWidth = durationSec * playback.zoomRatio;
  const pxPerMs = laneWidth / durationMs;

  const rows = useMemo(
    () =>
      project ? orderedElements(project, selection.collapsedElementIds) : [],
    [project, selection.collapsedElementIds],
  );

  if (!project) return null;

  const timeFromClientX = (clientX: number): number => {
    const lane = lanesRef.current;
    if (!lane) return 0;
    const bounds = lane.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(0, (clientX - bounds.left) / bounds.width),
    );
    return Math.round(ratio * durationMs);
  };

  const beginScrub = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    scrubRef.current = { pointerId: event.pointerId };
    const time = timeFromClientX(event.clientX);
    seekTracePlayback(time, { commit: false });
  };

  const moveScrub = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubRef.current || scrubRef.current.pointerId !== event.pointerId)
      return;
    seekTracePlayback(timeFromClientX(event.clientX), { commit: false });
  };

  const endScrub = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubRef.current || scrubRef.current.pointerId !== event.pointerId)
      return;
    scrubRef.current = null;
    setPlayhead(timeFromClientX(event.clientX));
  };

  const tickStep = pickTickStep(playback.zoomRatio);
  const ticks = Array.from(
    { length: Math.floor(durationSec / tickStep) + 1 },
    (_, index) => index * tickStep,
  );

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-white/10 bg-[#070c16] text-slate-200">
      {/* ── Transport ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-1.5">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 text-slate-200 hover:bg-white/10 hover:text-white"
          onClick={() => {
            setPlayhead(0);
            seekTracePlayback(0, { commit: true });
          }}
          aria-label="Go to start"
        >
          <SkipBackIcon className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 text-slate-100 hover:bg-white/10 hover:text-white"
          onClick={togglePlay}
          aria-label={playback.isPlaying ? 'Pause' : 'Play'}
        >
          {playback.isPlaying ? (
            <PauseIcon className="size-4" />
          ) : (
            <PlayIcon className="size-4" />
          )}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 text-slate-300 hover:bg-white/10 hover:text-white"
          onClick={() => {
            setPlayhead(durationMs);
            seekTracePlayback(durationMs, { commit: true });
          }}
          aria-label="Go to end"
        >
          <RotateCcwIcon className="size-4 rotate-180" />
        </Button>

        <Toggle
          type="button"
          size="sm"
          pressed={playback.isLooping}
          onPressedChange={setLooping}
          aria-label="Loop playback"
          className="h-7 gap-1 px-2 text-[11px] data-[state=on]:bg-sky-500/15 data-[state=on]:text-sky-300"
        >
          <RepeatIcon className="size-3.5" />
          Loop
        </Toggle>

        <Toggle
          type="button"
          size="sm"
          pressed={playback.playbackDirection === 'reverse'}
          onPressedChange={(pressed) =>
            setPlaybackDirection(pressed ? 'reverse' : 'forward')
          }
          aria-label="Reverse playback"
          className="h-7 px-2 text-[11px] data-[state=on]:bg-sky-500/15 data-[state=on]:text-sky-300"
        >
          <CornerDownLeftIcon className="size-3.5" />
        </Toggle>

        <select
          aria-label="Playback speed"
          value={String(playback.playbackSpeed)}
          onChange={(event) => setPlaybackSpeed(Number(event.target.value))}
          className="h-7 rounded-md border border-white/10 bg-white/5 px-1.5 text-[11px] text-slate-200 outline-none"
        >
          {[0.25, 0.5, 1, 1.5, 2].map((speed) => (
            <option key={speed} value={speed} className="bg-slate-900">
              {speed}×
            </option>
          ))}
        </select>

        <Toggle
          type="button"
          size="sm"
          pressed={playback.autoKeyframe}
          onPressedChange={setAutoKeyframe}
          aria-label="Auto keyframe"
          className="h-7 gap-1 px-2 text-[11px] data-[state=on]:bg-amber-500/15 data-[state=on]:text-amber-300"
        >
          <ClockIcon className="size-3.5" />
          Auto-K
        </Toggle>

        <span
          data-trace-timecode
          className="rounded bg-white/5 px-2 py-1 font-mono text-[11px] tabular-nums text-slate-200"
        >
          {formatTraceTimecode(playback.currentTimeMs)}
        </span>
        <span className="font-mono text-[10px] text-slate-500">
          / {formatTraceTimecode(durationMs)}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <ZoomInIcon className="size-3.5 text-slate-500" />
          <Slider
            aria-label="Timeline zoom"
            value={[playback.zoomRatio]}
            min={20}
            max={640}
            step={10}
            onValueChange={([value]) => setZoomRatio(value)}
            className="w-28"
          />
          <Separator orientation="vertical" className="mx-1 h-5 bg-white/10" />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[11px] text-slate-300 hover:bg-white/10 hover:text-white"
            onClick={() => setTimelineCollapsed(true)}
          >
            <ChevronDownIcon className="size-3.5" />
            Collapse
          </Button>
        </div>
      </div>

      <div className="h-0.5 w-full bg-white/5">
        <div
          id="trace-mini-progress"
          className="h-full bg-sky-400/80"
          style={{ width: '0%' }}
        />
      </div>

      {/* ── Lanes ─────────────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div
          className="relative min-w-full"
          style={{ width: LABEL_WIDTH + laneWidth }}
        >
          {/* Ruler */}
          <div className="sticky top-0 z-30 flex border-b border-white/10 bg-[#070c16]/95 backdrop-blur">
            <div
              className="sticky left-0 z-40 flex shrink-0 items-end border-r border-white/10 bg-[#070c16]/95 px-2 pb-1 text-[9px] font-medium uppercase tracking-[0.18em] text-slate-500"
              style={{ width: LABEL_WIDTH }}
            >
              Layers
            </div>
            <div
              ref={lanesRef}
              className="relative h-7 cursor-ew-resize select-none"
              style={{ width: laneWidth }}
              onPointerDown={beginScrub}
              onPointerMove={moveScrub}
              onPointerUp={endScrub}
              onPointerCancel={endScrub}
            >
              {ticks.map((second) => (
                <div
                  key={second}
                  className="absolute top-0 h-full border-l border-white/10 pl-1 font-mono text-[9px] text-slate-500"
                  style={{ left: second * playback.zoomRatio }}
                >
                  {second}s
                </div>
              ))}
            </div>
          </div>

          {/* Scenes */}
          {project.storyboard?.scenes?.length ? (
            <div className="flex border-b border-white/5">
              <div
                className="sticky left-0 z-20 flex shrink-0 items-center gap-1 border-r border-white/10 bg-[#070c16] px-2 text-[9px] uppercase tracking-[0.16em] text-slate-500"
                style={{ width: LABEL_WIDTH, height: ROW_HEIGHT }}
              >
                Scenes
              </div>
              <div
                className="relative"
                style={{ width: laneWidth, height: ROW_HEIGHT }}
              >
                {project.storyboard.scenes.map((scene) => {
                  const active = selection.activeSceneId === scene.id;
                  return (
                    <button
                      key={scene.id}
                      type="button"
                      onClick={() =>
                        useTraceStore.getState().focusScene(scene.id)
                      }
                      className={
                        'absolute top-1 h-5 overflow-hidden rounded border px-1.5 text-left text-[9px] font-medium ' +
                        (active
                          ? 'border-sky-400/70 bg-sky-500/15 text-sky-200'
                          : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-slate-200')
                      }
                      style={{
                        left: scene.startMs * pxPerMs,
                        width: Math.max(28, scene.durationMs * pxPerMs - 2),
                      }}
                      title={scene.intent || scene.name}
                    >
                      {scene.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Rows */}
          {rows.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-6 text-xs text-slate-500">
              No layers yet. Add text or a shape from the toolbar, or start from
              a template.
            </div>
          ) : (
            rows.map(({ element, depth, hasChildren }) => {
              const expanded = selection.expandedElementIds.includes(
                element.id,
              );
              const selected = selection.selectedElementId === element.id;
              return (
                <div key={element.id} className="border-b border-white/[0.04]">
                  <div className="flex">
                    <div
                      className={
                        'sticky left-0 z-20 flex shrink-0 items-center gap-1 border-r border-white/10 px-1 ' +
                        (selected ? 'bg-sky-500/10' : 'bg-[#070c16]')
                      }
                      style={{
                        width: LABEL_WIDTH,
                        height: ROW_HEIGHT,
                        paddingLeft: 4 + depth * 10,
                      }}
                    >
                      <button
                        type="button"
                        className="flex size-4 shrink-0 items-center justify-center text-slate-500 disabled:opacity-0"
                        onClick={() => toggleExpandElement(element.id)}
                        disabled={!hasChildren && element.tracks.length === 0}
                        aria-label={
                          expanded ? 'Collapse element' : 'Expand element'
                        }
                      >
                        {expanded ? (
                          <ChevronDownIcon className="size-3" />
                        ) : (
                          <ChevronRightIcon className="size-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => selectElement(element.id)}
                        className={
                          'min-w-0 flex-1 truncate text-left text-[11px] ' +
                          (selected
                            ? 'text-slate-100'
                            : 'text-slate-400 hover:text-slate-200')
                        }
                        title={`${element.name} · ${element.type}`}
                      >
                        {element.name}
                      </button>
                      {element.tracks.length > 0 ? (
                        <span className="rounded bg-white/5 px-1 font-mono text-[9px] text-slate-500">
                          {element.tracks.length}
                        </span>
                      ) : null}
                    </div>
                    <div
                      className={
                        'relative ' + (selected ? 'bg-sky-500/[0.04]' : '')
                      }
                      style={{ width: laneWidth, height: ROW_HEIGHT }}
                    >
                      {element.tracks.flatMap((track) =>
                        track.keyframes.map((keyframe) => {
                          const key = keyframeKey(element.id, track, keyframe);
                          const active =
                            selection.selectedKeyframeIds.includes(key);
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={(event) => {
                                selectElement(element.id);
                                selectKeyframe(
                                  key,
                                  event.shiftKey ||
                                    event.metaKey ||
                                    event.ctrlKey,
                                );
                              }}
                              title={`${TRACK_LABELS[track.property] ?? track.label} · ${Math.round(
                                keyframe.timeMs,
                              )}ms`}
                              className={
                                'absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] ' +
                                (active
                                  ? 'bg-sky-300 ring-1 ring-sky-200'
                                  : 'bg-sky-500/80 hover:bg-sky-300')
                              }
                              style={{ left: keyframe.timeMs * pxPerMs }}
                            />
                          );
                        }),
                      )}
                    </div>
                  </div>

                  {expanded
                    ? element.tracks.map((track) => (
                        <div key={track.id} className="flex">
                          <div
                            className="sticky left-0 z-20 flex shrink-0 items-center justify-between gap-1 border-r border-white/10 bg-[#070c16] pr-1 text-[10px] text-slate-500"
                            style={{
                              width: LABEL_WIDTH,
                              height: TRACK_ROW_HEIGHT,
                              paddingLeft: 26 + depth * 10,
                            }}
                          >
                            <span className="truncate">
                              {TRACK_LABELS[track.property] ?? track.label}
                            </span>
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                className="rounded p-0.5 text-slate-600 hover:bg-white/10 hover:text-slate-200"
                                onClick={() =>
                                  addKeyframe(element.id, track.property)
                                }
                                aria-label="Add keyframe at playhead"
                                title="Add keyframe at playhead"
                              >
                                <span className="block size-1.5 rotate-45 bg-current" />
                              </button>
                              <button
                                type="button"
                                className="rounded p-0.5 text-slate-600 hover:bg-rose-500/20 hover:text-rose-300"
                                onClick={() =>
                                  removePropertyTrack(
                                    element.id,
                                    track.property,
                                  )
                                }
                                aria-label="Remove track"
                                title="Remove track"
                              >
                                <Trash2Icon className="size-3" />
                              </button>
                            </div>
                          </div>
                          <div
                            className="relative border-l border-dashed border-white/5"
                            style={{
                              width: laneWidth,
                              height: TRACK_ROW_HEIGHT,
                            }}
                            onDoubleClick={(event) =>
                              addKeyframe(
                                element.id,
                                track.property,
                                timeFromClientX(event.clientX),
                              )
                            }
                          >
                            <div className="absolute top-1/2 h-px w-full bg-white/40" />
                            {track.keyframes.map((keyframe) => {
                              const key = keyframeKey(
                                element.id,
                                track,
                                keyframe,
                              );
                              const active =
                                selection.selectedKeyframeIds.includes(key);
                              const dragging =
                                dragKeyframe?.keyframe.id === keyframe.id &&
                                dragKeyframe.track.id === track.id;
                              const positionMs = dragging
                                ? dragKeyframe.timeMs
                                : keyframe.timeMs;
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  onPointerDown={(event) => {
                                    event.stopPropagation();
                                    event.currentTarget.setPointerCapture(
                                      event.pointerId,
                                    );
                                    selectElement(element.id);
                                    selectKeyframe(key, event.shiftKey);
                                    setDragKeyframe({
                                      elementId: element.id,
                                      track,
                                      keyframe,
                                      startX: event.clientX,
                                      startTimeMs: keyframe.timeMs,
                                      timeMs: keyframe.timeMs,
                                    });
                                  }}
                                  onPointerMove={(event) => {
                                    if (
                                      !dragKeyframe ||
                                      dragKeyframe.keyframe.id !== keyframe.id
                                    )
                                      return;
                                    const delta =
                                      (event.clientX - dragKeyframe.startX) /
                                      pxPerMs;
                                    const next = Math.max(
                                      0,
                                      Math.min(
                                        durationMs,
                                        Math.round(
                                          dragKeyframe.startTimeMs + delta,
                                        ),
                                      ),
                                    );
                                    setDragKeyframe({
                                      ...dragKeyframe,
                                      timeMs: next,
                                    });
                                  }}
                                  onPointerUp={(event) => {
                                    if (
                                      !dragKeyframe ||
                                      dragKeyframe.keyframe.id !== keyframe.id
                                    )
                                      return;
                                    if (
                                      dragKeyframe.timeMs !== keyframe.timeMs
                                    ) {
                                      updateKeyframe(
                                        element.id,
                                        track.property,
                                        keyframe.id,
                                        {
                                          timeMs: dragKeyframe.timeMs,
                                        },
                                      );
                                    }
                                    setDragKeyframe(null);
                                    event.stopPropagation();
                                  }}
                                  onDoubleClick={() =>
                                    deleteKeyframe(
                                      element.id,
                                      track.property,
                                      keyframe.id,
                                    )
                                  }
                                  title={`${Math.round(positionMs)}ms · ${keyframe.easing} (double-click to delete)`}
                                  className={
                                    'absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] ' +
                                    (active
                                      ? 'bg-sky-300 ring-1 ring-sky-200'
                                      : 'bg-slate-500 hover:bg-sky-300')
                                  }
                                  style={{
                                    left: positionMs * pxPerMs,
                                    touchAction: 'none',
                                  }}
                                />
                              );
                            })}
                          </div>
                        </div>
                      ))
                    : null}
                </div>
              );
            })
          )}

          {/* Playhead — positioned and moved by the runtime driver */}
          <div
            id="trace-playhead-needle"
            className="pointer-events-none absolute top-0 z-40 h-full w-px bg-sky-400"
            style={{
              left: LABEL_WIDTH,
              willChange: 'transform',
              transform: `translate3d(${playback.currentTimeMs * pxPerMs}px, 0, 0)`,
            }}
          >
            <span className="absolute -left-[5px] top-0 size-2.5 rounded-b-sm bg-sky-400" />
          </div>
        </div>
      </div>
    </div>
  );
}
