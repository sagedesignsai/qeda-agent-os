/**
 * components/motion/MotionTimeline.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Motion's adapter binding: document → neutral timeline model, canvas intents →
 * document ops. Everything visual and interactive lives in
 * `components/timeline`; everything cinematic lives in `lib/motion`. This file
 * is only the translation layer between them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PlusIcon, ScissorsIcon, Trash2Icon } from 'lucide-react';

import { CanvasTimeline } from '@/components/timeline/CanvasTimeline';
import { TimelineRowHeaders } from '@/components/timeline/TimelineRowHeaders';
import { TimelineTransport } from '@/components/timeline/TimelineTransport';
import { Button } from '@/components/ui/button';
import { motionStore, useMotionSnapshot } from '@/hooks/use-motion-store';
import { createMotionId } from '@/lib/motion/ids';
import { countOffFrameKeyframes } from '@/lib/motion/quantize';
import { sampleChannel } from '@/lib/motion/sample';
import {
  findPlacement,
  motionSelectionToTimeline,
  resolveKeyTarget,
  timelineSelectionToMotion,
  toTimelineModel,
} from '@/lib/motion/timeline-adapter';
import { fitPxPerSecond, zoomAround } from '@/lib/timeline/time';
import { resolveTimelineCanvasShortcut, resolveTimelineShortcut } from '@/lib/timeline/shortcuts';
import type { MotionSelection } from '@/lib/motion/types';
import type { TimelineEditHandlers, TimelineSelection } from '@/lib/timeline/types';
import { cn } from '@/lib/utils';

const MIN_PX_PER_SECOND = 4;
const MAX_PX_PER_SECOND = 4000;

export function MotionTimeline({ className }: { className?: string }) {
  const { doc, selection, view, pendingApproval } = useMotionSnapshot();
  const paneRef = useRef<HTMLDivElement | null>(null);
  const [scrollY, setScrollY] = useState(0);
  const [snapEnabled, setSnapEnabled] = useState(() => {
    try {
      return window.localStorage.getItem('motion.timeline.snap') !== 'off';
    } catch {
      return true;
    }
  });

  const model = useMemo(() => toTimelineModel(doc), [doc]);
  const timelineSelection = useMemo(() => motionSelectionToTimeline(selection), [selection]);

  const handlers = useMemo<TimelineEditHandlers>(
    () => ({
      onScrub: (time) => motionStore.seek(time),
      onSelect: (next: TimelineSelection) => {
        motionStore.setSelection(timelineSelectionToMotion(doc, next));
      },
      onMoveItem: (itemId, start, rowId) => {
        const found = findPlacement(doc, itemId);
        if (!found) return;
        motionStore.commit('Move clip', [
          {
            op: 'placement.move',
            trackId: found.track.id,
            placementId: itemId,
            start,
            toTrackId: rowId,
          },
        ]);
      },
      onMoveKey: (keyId, time) => {
        const target = resolveKeyTarget(doc, keyId);
        if (!target) return;
        const found = findPlacement(doc, target.placementId);
        if (!found) return;
        const trimIn = found.placement.trimIn ?? 0;
        motionStore.commit('Move keyframe', [
          {
            op: 'keyframe.move',
            clipId: target.clipId,
            channelId: target.channelId,
            keyframeId: target.keyframeId,
            time: Math.max(0, trimIn + time - found.placement.start),
          },
        ]);
      },
      onMoveKeys: (keys) => {
        const opsByEntity = new Map<string, {
          op: 'keyframe.move';
          clipId: string;
          channelId: string;
          keyframeId: string;
          time: number;
        }>();
        for (const { keyId, time } of keys) {
          const target = resolveKeyTarget(doc, keyId);
          if (!target) continue;
          const found = findPlacement(doc, target.placementId);
          if (!found) continue;
          const entityKey = `${target.clipId}::${target.channelId}::${target.keyframeId}`;
          if (opsByEntity.has(entityKey)) continue;
          opsByEntity.set(entityKey, {
            op: 'keyframe.move' as const,
            clipId: target.clipId,
            channelId: target.channelId,
            keyframeId: target.keyframeId,
            time: Math.max(0, (found.placement.trimIn ?? 0) + time - found.placement.start),
          });
        }
        const ops = [...opsByEntity.values()];
        if (ops.length) motionStore.commit('Move keyframes', ops);
      },
      onLoopChange: (range) => {
        motionStore.commit('Loop range', [{ op: 'timeline.setLoop', start: range.start, end: range.end }]);
      },
      onTrimItem: (itemId, values) => {
        const found = findPlacement(doc, itemId);
        if (!found) return;
        motionStore.commit('Trim clip', [
          {
            op: 'placement.trim',
            trackId: found.track.id,
            placementId: itemId,
            start: values.start,
            trimIn: values.trimIn,
            duration: values.duration,
          },
        ]);
      },
      onZoomChange: (next) => motionStore.setView(next),
      onScrollChange: (scrollSeconds) => motionStore.setView({ ...view, scrollSeconds }),
      onScrollRows: (deltaPx) => setScrollY((previous) => Math.max(0, previous + deltaPx)),
    }),
    [doc, view],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const next = Math.min(
        MAX_PX_PER_SECOND,
        Math.max(MIN_PX_PER_SECOND, view.pxPerSecond * factor),
      );
      motionStore.setView(zoomAround(view, 0, next, MIN_PX_PER_SECOND, MAX_PX_PER_SECOND));
    },
    [view],
  );

  const zoomToFit = useCallback(() => {
    const width = paneRef.current?.clientWidth ?? 1200;
    motionStore.setView({
      pxPerSecond: fitPxPerSecond(doc.timeline.duration, width),
      scrollSeconds: 0,
    });
  }, [doc.timeline.duration]);

  const addTrack = useCallback(() => {
    motionStore.commit('Add track', [
      { op: 'track.add', trackId: createMotionId('track'), name: `Track ${doc.timeline.tracks.length + 1}` },
    ]);
  }, [doc.timeline.tracks.length]);

  /**
   * Add a keyframe at the playhead on the selected channel — the timeline's only
   * authoring shortcut, and deliberately expressed as an op so an agent can do
   * the same thing through the same registry.
   */
  const addKeyframe = useCallback(() => {
    const time = motionStore.clock.getTime();
    let clipId: string | null = null;
    let channelId: string | null = null;
    let placementId: string | null = null;

    if (selection?.kind === 'keyframe') {
      clipId = selection.clipId;
      channelId = selection.channelId;
      placementId = selection.placementId;
    } else if (selection?.kind === 'placement') {
      const found = findPlacement(doc, selection.placementId);
      const clip = found ? doc.timeline.clips.find((candidate) => candidate.id === found.placement.clipId) : null;
      if (found && clip?.channels[0]) {
        clipId = clip.id;
        channelId = clip.channels[0].id;
        placementId = found.placement.id;
      }
    } else if (selection?.kind === 'track') {
      const track = doc.timeline.tracks.find((candidate) => candidate.id === selection.trackId);
      const placement = track?.placements[0];
      const clip = placement
        ? doc.timeline.clips.find((candidate) => candidate.id === placement.clipId)
        : null;
      if (placement && clip?.channels[0]) {
        clipId = clip.id;
        channelId = clip.channels[0].id;
        placementId = placement.id;
      }
    }

    if (!clipId || !channelId || !placementId) return;
    const found = findPlacement(doc, placementId);
    const clip = doc.timeline.clips.find((candidate) => candidate.id === clipId);
    const channel = clip?.channels.find((candidate) => candidate.id === channelId);
    if (!found || !clip || !channel) return;

    const trimIn = found.placement.trimIn ?? 0;
    const visibleDuration = found.placement.duration ?? clip.duration - trimIn;
    const localTime = Math.min(Math.max(trimIn, trimIn + time - found.placement.start), trimIn + visibleDuration);
    if (channel.keyframes.some((keyframe) => Math.abs(keyframe.time - localTime) < 1e-3)) return;

    motionStore.commit('Add keyframe', [
      {
        op: 'keyframe.add',
        clipId,
        channelId,
        keyframeId: createMotionId('keyframe'),
        time: localTime,
        value: sampleChannel(channel, localTime) ?? 0,
      },
    ]);
  }, [doc, selection]);

  const toggleSnap = useCallback(() => {
    setSnapEnabled((enabled) => {
      const next = !enabled;
      try {
        window.localStorage.setItem('motion.timeline.snap', next ? 'on' : 'off');
      } catch {
        // If browser storage is unavailable, this editor session still toggles.
      }
      return next;
    });
  }, []);

  const onKeyboardModeKeyDown = useCallback((event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const command = resolveTimelineCanvasShortcut(event);
    if (!command) return;
    const time = motionStore.clock.getTime();
    const frame = 1 / doc.meta.output.fps;
    switch (command.type) {
      case 'step-playhead':
        event.preventDefault();
        motionStore.pause();
        motionStore.seek(time + command.direction * frame);
        break;
      case 'set-work-area-edge': {
        const area = doc.timeline.workArea ?? { enabled: false, start: 0, end: doc.timeline.duration };
        if (command.edge === 'start') {
          const start = Math.max(0, Math.min(time, area.end - frame));
          motionStore.commit('Set work area start', [{ op: 'timeline.setWorkArea', enabled: true, start }]);
        } else {
          const end = Math.min(doc.timeline.duration, Math.max(time, area.start + frame));
          motionStore.commit('Set work area end', [{ op: 'timeline.setWorkArea', enabled: true, end }]);
        }
        event.preventDefault();
        break;
      }
      case 'add-keyframe':
        event.preventDefault();
        addKeyframe();
        break;
    }
  }, [addKeyframe, doc.meta.output.fps, doc.timeline.duration, doc.timeline.workArea]);

  const deleteSelection = useCallback(() => {
    if (selection?.kind === 'keyframe') {
      const keyIds = selection.selectedKeyIds ?? [
        `${selection.placementId}::${selection.channelId}::${selection.keyframeId}`,
      ];
      const unique = new Map<string, { op: 'keyframe.remove'; clipId: string; channelId: string; keyframeId: string }>();
      for (const keyId of keyIds) {
        const target = resolveKeyTarget(doc, keyId);
        if (!target) continue;
        unique.set(`${target.clipId}::${target.channelId}::${target.keyframeId}`, {
          op: 'keyframe.remove',
          clipId: target.clipId,
          channelId: target.channelId,
          keyframeId: target.keyframeId,
        });
      }
      motionStore.commit('Delete keyframes', [...unique.values()]);
    } else if (selection?.kind === 'placement') {
      motionStore.commit('Delete clip placement', [
        { op: 'placement.remove', trackId: selection.trackId, placementId: selection.placementId },
      ]);
    } else if (selection?.kind === 'track') {
      motionStore.commit('Delete track', [{ op: 'track.remove', trackId: selection.trackId }]);
    }
  }, [doc, selection]);

  const splitSelection = useCallback(() => {
    if (selection?.kind !== 'placement') return;
    motionStore.commit('Split clip placement', [{
      op: 'placement.split',
      trackId: selection.trackId,
      placementId: selection.placementId,
      newPlacementId: createMotionId('placement'),
      atTime: motionStore.clock.getTime(),
    }]);
  }, [selection]);

  const trimSelection = useCallback((edge: 'in' | 'out') => {
    if (selection?.kind !== 'placement') return;
    const found = findPlacement(doc, selection.placementId);
    const clip = found && doc.timeline.clips.find((item) => item.id === found.placement.clipId);
    if (!found || !clip) return;
    const playhead = motionStore.clock.getTime();
    const trimIn = found.placement.trimIn ?? 0;
    const duration = found.placement.duration ?? clip.duration - trimIn;
    if (edge === 'in') {
      const delta = playhead - found.placement.start;
      if (delta <= 0 || delta >= duration) return;
      motionStore.commit('Trim clip start', [{ op: 'placement.trim', trackId: selection.trackId, placementId: selection.placementId, start: playhead, trimIn: trimIn + delta, duration: duration - delta }]);
    } else {
      const nextDuration = playhead - found.placement.start;
      if (nextDuration <= 0 || nextDuration >= duration) return;
      motionStore.commit('Trim clip end', [{ op: 'placement.trim', trackId: selection.trackId, placementId: selection.placementId, duration: nextDuration }]);
    }
  }, [doc, selection]);

  const loopEnabled = doc.timeline.workArea?.enabled ?? false;
  const offFrame = useMemo(() => countOffFrameKeyframes(doc), [doc]);
  const fps = doc.meta.output.fps;

  const stepFrame = useCallback(
    (direction: -1 | 1) => {
      motionStore.clock.pause();
      motionStore.seek(motionStore.clock.getTime() + direction / fps);
    },
    [fps],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const command = resolveTimelineShortcut(event, {
        editable: Boolean(
          target &&
            (target.isContentEditable ||
              ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)),
        ),
      });
      if (!command) return;
      event.preventDefault();
      switch (command.type) {
        case 'toggle-play':
          motionStore.togglePlay();
          break;
        case 'play-from-start':
          motionStore.seek(0);
          motionStore.play();
          break;
        case 'step':
          stepFrame(command.direction);
          break;
        case 'go-to-start':
          motionStore.seek(0);
          break;
        case 'go-to-end':
          motionStore.seek(doc.timeline.duration);
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [doc.timeline.duration, stepFrame]);

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-background', className)}>
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-2">
        <TimelineTransport
          clock={motionStore.clock}
          duration={doc.timeline.duration}
          fps={fps}
          loopEnabled={loopEnabled}
          snapEnabled={snapEnabled}
          playMode={doc.timeline.playMode ?? 'once'}
          onToggleLoop={() =>
            motionStore.commit('Toggle work area', [
              { op: 'timeline.setWorkArea', enabled: !loopEnabled },
            ])
          }
          onToggleSnap={toggleSnap}
          onPlayModeChange={(playMode) =>
            motionStore.commit('Change playback mode', [
              { op: 'timeline.setPlayMode', playMode },
            ])
          }
          onStep={stepFrame}
          onGoToStart={() => motionStore.seek(0)}
          onGoToEnd={() => motionStore.seek(doc.timeline.duration)}
          onZoomIn={() => zoomBy(1.3)}
          onZoomOut={() => zoomBy(1 / 1.3)}
          onZoomFit={zoomToFit}
        />

        <div className="flex items-center gap-1.5">
          {(() => {
            const area = doc.timeline.workArea ?? { enabled: false, start: 0, end: doc.timeline.duration };
            const playhead = motionStore.clock.getTime();
            return <div className="flex items-center gap-0.5 border-r border-border/60 pr-1.5">
              <Button type="button" size="sm" variant={area.enabled ? 'secondary' : 'ghost'} className="h-7 px-1.5 text-[10px]" aria-pressed={area.enabled} onClick={() => motionStore.commit('Toggle work area', [{ op: 'timeline.setWorkArea', enabled: !area.enabled }])}>Work area</Button>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-1.5 text-[10px]" disabled={playhead >= area.end} title="Set work area start at playhead" onClick={() => motionStore.commit('Set work area start', [{ op: 'timeline.setWorkArea', start: playhead }])}>Set in</Button>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-1.5 text-[10px]" disabled={playhead <= area.start} title="Set work area end at playhead" onClick={() => motionStore.commit('Set work area end', [{ op: 'timeline.setWorkArea', end: playhead }])}>Set out</Button>
              {area.enabled && <span className="hidden text-[9px] tabular-nums text-muted-foreground xl:inline">{area.start.toFixed(2)}–{area.end.toFixed(2)}s</span>}
            </div>;
          })()}
          <span className="hidden text-[10px] text-muted-foreground sm:inline">
            {selection ? selectionLabel(selection) : 'Nothing selected'}
          </span>
          {offFrame > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px] text-amber-500"
              title={`${offFrame} key${offFrame === 1 ? '' : 's'} sit between frames. Snap them to the ${Math.round(doc.meta.output.fps)}fps grid.`}
              onClick={() =>
                motionStore.commit('Snap keys to frames', [{ op: 'timeline.quantizeToFps' }])
              }
            >
              Align {offFrame}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={splitSelection}
            disabled={selection?.kind !== 'placement'}
            title="Split the selected placement at the playhead"
          >
            <ScissorsIcon className="size-3" />
            Split
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 px-1.5 text-[10px]" onClick={() => trimSelection('in')} disabled={selection?.kind !== 'placement'} title="Trim the selected clip start to the playhead">Trim in</Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 px-1.5 text-[10px]" onClick={() => trimSelection('out')} disabled={selection?.kind !== 'placement'} title="Trim the selected clip end to the playhead">Trim out</Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={addKeyframe}
            title="Add a keyframe at the playhead"
          >
            <PlusIcon className="size-3" />
            Key
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Delete selection"
            onClick={deleteSelection}
            disabled={!selection}
          >
            <Trash2Icon className="size-3.5" />
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={addTrack}>
            Track
          </Button>
        </div>
      </div>

      {pendingApproval && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-destructive/40 bg-destructive/10 px-3 py-1.5 text-[11px]">
          <span>
            <strong className="font-medium">{pendingApproval.label}</strong> removes work and needs
            approval before it is applied.
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="h-6 px-2 text-[11px]"
              onClick={() => motionStore.confirmPending()}
            >
              Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              onClick={() => motionStore.cancelPending()}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden" ref={paneRef}>
        <TimelineRowHeaders
          model={model}
          selection={timelineSelection}
          scrollY={scrollY}
          onSelect={(next) => motionStore.setSelection(timelineSelectionToMotion(doc, next))}
          onToggleMute={(rowId) => {
            const track = doc.timeline.tracks.find((candidate) => candidate.id === rowId);
            if (!track) return;
            motionStore.commit('Mute track', [
              { op: 'track.update', trackId: rowId, muted: !track.muted },
            ]);
          }}
          onToggleLock={(rowId) => {
            const track = doc.timeline.tracks.find((candidate) => candidate.id === rowId);
            if (!track) return;
            motionStore.commit('Lock track', [
              { op: 'track.update', trackId: rowId, locked: !track.locked },
            ]);
          }}
          onRemove={(rowId) =>
            motionStore.commit('Delete track', [{ op: 'track.remove', trackId: rowId }])
          }
        />

        <div className="relative min-w-0 flex-1">
          <CanvasTimeline
            model={model}
            view={view}
            selection={timelineSelection}
            clock={motionStore.clock}
            snap={snapEnabled}
            scrollY={scrollY}
            handlers={handlers}
            onKeyboardModeKeyDown={onKeyboardModeKeyDown}
          />
        </div>
      </div>

      <div className="flex h-6 shrink-0 items-center justify-between border-t border-border/60 px-3 text-[10px] text-muted-foreground">
        <span>
          {doc.timeline.tracks.length} tracks · {doc.timeline.clips.length} clips ·{' '}
          {doc.meta.output.width}×{doc.meta.output.height}
        </span>
        <span className="tabular-nums">{Math.round(view.pxPerSecond)} px/s</span>
      </div>
    </div>
  );
}

function selectionLabel(selection: MotionSelection): string {
  if (!selection) return 'Nothing selected';
  if (selection.kind === 'keyframe') return 'Keyframe selected';
  if (selection.kind === 'placement') return 'Clip selected';
  return 'Track selected';
}
