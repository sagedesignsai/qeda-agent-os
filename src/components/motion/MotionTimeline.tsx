/**
 * components/motion/MotionTimeline.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Motion's adapter binding: document → neutral timeline model, canvas intents →
 * document ops. Everything visual and interactive lives in
 * `components/timeline`; everything cinematic lives in `lib/motion`. This file
 * is only the translation layer between them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon, CopyIcon, ListTodoIcon, MoreHorizontalIcon, PlusIcon, ScissorsIcon, TableIcon, Trash2Icon } from 'lucide-react';

import { CanvasTimeline } from '@/components/timeline/CanvasTimeline';
import { TimelineRowHeaders } from '@/components/timeline/TimelineRowHeaders';
import { TimelineTransport } from '@/components/timeline/TimelineTransport';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
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
import { DOPE_ROW_HEIGHT, DOPE_GROUP_HEIGHT, ROW_HEIGHT, hitTestTimeline, layoutTimeline } from '@/lib/timeline/layout';
import { fitPxPerSecond, zoomAround } from '@/lib/timeline/time';
import { resolveTimelineCanvasShortcut, resolveTimelineShortcut } from '@/lib/timeline/shortcuts';
import type { MotionEasing, MotionSelection } from '@/lib/motion/types';
import type { TimelineEditHandlers, TimelineModel, TimelineSelection } from '@/lib/timeline/types';
import { cn } from '@/lib/utils';

const MIN_PX_PER_SECOND = 4;
const MAX_PX_PER_SECOND = 4000;

/**
 * Compute the total vertical content height for a dopesheet layout.
 * Counts group header rows (DOPE_GROUP_HEIGHT) and property channel rows
 * (DOPE_ROW_HEIGHT), respecting collapsed groups — same logic as
 * `layoutDopeSheet` in `dopesheet.ts`.
 */
function computeDopeSheetContentHeight(model: TimelineModel, collapsedGroups: Set<string>): number {
  // Group items by row (track), then count channels with keys per group
  const groupChannelCounts = new Map<string, number>();
  for (const row of model.rows) {
    const itemsInRow = model.items.filter((item) => item.rowId === row.id);
    let channelCount = 0;
    for (const item of itemsInRow) {
      const channels = item.channels ?? [];
      for (const channel of channels) {
        if (channel.keys.length > 0) {
          channelCount += 1;
        }
      }
    }
    if (channelCount > 0) {
      groupChannelCounts.set(row.id, channelCount);
    }
  }

  let height = 0;
  for (const [groupId, channelCount] of groupChannelCounts) {
    // Group header row
    height += DOPE_GROUP_HEIGHT;
    // Property rows (only if group is not collapsed)
    if (!collapsedGroups.has(groupId)) {
      height += channelCount * DOPE_ROW_HEIGHT;
    }
  }
  return height;
}

export function MotionTimeline({
  className,
  collapsed,
  onExpand,
}: {
  className?: string;
  collapsed?: boolean;
  onExpand?: () => void;
}) {
  const { doc, selection, view, pendingApproval, autoKeyEnabled } = useMotionSnapshot();
  const paneRef = useRef<HTMLDivElement | null>(null);
  const [scrollY, setScrollY] = useState(0);
  const [snapEnabled, setSnapEnabled] = useState(() => {
    try {
      return window.localStorage.getItem('motion.timeline.snap') !== 'off';
    } catch {
      return true;
    }
  });
  const [dopeSheet, setDopeSheet] = useState(() => {
    try {
      return window.localStorage.getItem('motion.timeline.dopesheet') === 'on';
    } catch {
      return false;
    }
  });
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [keyClipboard, setKeyClipboard] = useState<Array<{
    property: string;
    offset: number;
    value: number;
    easing: MotionEasing;
  }>>([]);

  const [timelineContextMenuTarget, setTimelineContextMenuTarget] = useState<ReturnType<typeof hitTestTimeline> | null>(null);

  const model = useMemo(() => toTimelineModel(doc, { dopeSheet }), [doc, dopeSheet]);
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
      onScrollRows: (deltaPx) => {
        setScrollY((previous) => {
          let contentHeight: number;
          if (dopeSheet) {
            // Dope sheet: count group headers + property channel rows, respecting collapsed groups
            contentHeight = computeDopeSheetContentHeight(model, collapsedGroups);
          } else {
            contentHeight = model.rows.length * ROW_HEIGHT;
          }
          const visibleHeight = paneRef.current?.clientHeight ?? 0;
          const maxScroll = Math.max(0, contentHeight - visibleHeight);
          return Math.min(maxScroll, Math.max(0, previous + deltaPx));
        });
      },
    }),
    [doc, view, model.rows.length, model.items, dopeSheet, collapsedGroups],
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

  const copyKeyframes = useCallback(() => {
    if (selection?.kind !== 'keyframe') return;
    const keyIds = selection.selectedKeyIds ?? [
      `${selection.placementId}::${selection.channelId}::${selection.keyframeId}`,
    ];
    const copied = keyIds.flatMap((keyId) => {
      const target = resolveKeyTarget(doc, keyId);
      if (!target) return [];
      const placement = findPlacement(doc, target.placementId);
      const clip = doc.timeline.clips.find((candidate) => candidate.id === target.clipId);
      const channel = clip?.channels.find((candidate) => candidate.id === target.channelId);
      const key = channel?.keyframes.find((candidate) => candidate.id === target.keyframeId);
      if (!placement || !clip || !channel || !key) return [];
      const sceneTime = placement.placement.start + key.time - (placement.placement.trimIn ?? 0);
      return [{ property: channel.property, sceneTime, value: key.value, easing: { ...key.easing } }];
    });
    if (copied.length === 0) return;
    const origin = Math.min(...copied.map((key) => key.sceneTime));
    setKeyClipboard(copied.map(({ sceneTime, ...key }) => ({ ...key, offset: sceneTime - origin })));
  }, [doc, selection]);

  const pasteKeyframes = useCallback(() => {
    const placementId = selection?.kind === 'keyframe' || selection?.kind === 'placement'
      ? selection.placementId
      : null;
    if (!placementId || keyClipboard.length === 0) return;
    const placementRef = findPlacement(doc, placementId);
    const clip = placementRef
      ? doc.timeline.clips.find((candidate) => candidate.id === placementRef.placement.clipId)
      : null;
    if (!placementRef || !clip) return;
    const playhead = motionStore.clock.getTime();
    const trimIn = placementRef.placement.trimIn ?? 0;
    const visibleEnd = placementRef.placement.start + (placementRef.placement.duration ?? clip.duration - trimIn);
    const ops = keyClipboard.flatMap((copied) => {
      const channel = clip.channels.find((candidate) => candidate.property === copied.property);
      if (!channel) return [];
      const sceneTime = playhead + copied.offset;
      if (sceneTime < placementRef.placement.start || sceneTime > visibleEnd) return [];
      const time = trimIn + sceneTime - placementRef.placement.start;
      return [{
        op: 'keyframe.add' as const,
        clipId: clip.id,
        channelId: channel.id,
        keyframeId: createMotionId('keyframe'),
        time,
        value: copied.value,
        easing: { ...copied.easing },
      }];
    });
    if (ops.length) motionStore.commit('Paste keyframes', ops);
  }, [doc, keyClipboard, selection]);

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

  const toggleDopeSheet = useCallback(() => {
    setDopeSheet((enabled) => {
      const next = !enabled;
      try {
        window.localStorage.setItem('motion.timeline.dopesheet', next ? 'on' : 'off');
      } catch {
        // If browser storage is unavailable, this editor session still toggles.
      }
      return next;
    });
  }, []);

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
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
      const editable = Boolean(
        target &&
          (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)),
      );
      if (!editable && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c' && selection?.kind === 'keyframe') {
        event.preventDefault();
        copyKeyframes();
        return;
      }
      if (!editable && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        pasteKeyframes();
        return;
      }
      const command = resolveTimelineShortcut(event, {
        editable,
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
  }, [copyKeyframes, doc.timeline.duration, pasteKeyframes, selection, stepFrame]);

  // Playhead position as a fraction for the progress bar
  const currentTime = motionStore.clock.getTime();
  const playheadProgress = doc.timeline.duration > 0 ? (currentTime / doc.timeline.duration) * 100 : 0;
  const currentFrame = Math.round(currentTime * fps);
  const totalFrames = Math.round(doc.timeline.duration * fps);

  // When collapsed, render only a slim transport bar so the panel can shrink to ~48px.
  if (collapsed) {
    return (
      <div className={cn('flex min-h-0 flex-col bg-background', className)}>
        <div className="flex h-10 min-h-0 items-center gap-2 px-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label="Expand timeline"
            title="Expand timeline"
            onClick={onExpand}
          >
            <ChevronUpIcon data-icon />
          </Button>
          <TimelineTransport
            clock={motionStore.clock}
            duration={doc.timeline.duration}
            fps={fps}
            loopEnabled={loopEnabled}
            snapEnabled={snapEnabled}
            autoKeyEnabled={autoKeyEnabled}
            playMode={doc.timeline.playMode ?? 'once'}
            onToggleLoop={() =>
              motionStore.commit('Toggle work area', [
                { op: 'timeline.setWorkArea', enabled: !loopEnabled },
              ])
            }
            onToggleSnap={toggleSnap}
            onToggleAutoKey={() => motionStore.setAutoKeyEnabled(!autoKeyEnabled)}
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
        </div>
        <Progress value={playheadProgress} className="h-2 px-2 pb-1" />
      </div>
    );
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-background', className)}>
      <div className="flex h-10 shrink-0 items-center justify-between gap-1 border-b border-border/60 px-2">
        {/* Left: Transport controls */}
        <TimelineTransport
          clock={motionStore.clock}
          duration={doc.timeline.duration}
          fps={fps}
          loopEnabled={loopEnabled}
          snapEnabled={snapEnabled}
          autoKeyEnabled={autoKeyEnabled}
          playMode={doc.timeline.playMode ?? 'once'}
          onToggleLoop={() =>
            motionStore.commit('Toggle work area', [
              { op: 'timeline.setWorkArea', enabled: !loopEnabled },
            ])
          }
          onToggleSnap={toggleSnap}
          onToggleAutoKey={() => motionStore.setAutoKeyEnabled(!autoKeyEnabled)}
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

        {/* Right: Consolidated action menus */}
        <div className="flex items-center gap-1">
          {/* Selection badge */}
          {selection && (
            <Badge variant="secondary" className="h-5 text-[10px] px-1.5">
              {selectionLabel(selection)}
            </Badge>
          )}

          {/* Off-frame align button */}
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

          {/* Clip editing dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]">
                <ScissorsIcon className="size-3" />
                Clip
                <ChevronDownIcon className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel>Clip Editing</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={splitSelection}
                disabled={selection?.kind !== 'placement'}
              >
                <ScissorsIcon className="size-3.5" data-icon />
                Split at Playhead
                <DropdownMenuShortcut>Ctrl+Shift+S</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => trimSelection('in')}
                disabled={selection?.kind !== 'placement'}
              >
                Trim In
                <DropdownMenuShortcut>Ctrl+[</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => trimSelection('out')}
                disabled={selection?.kind !== 'placement'}
              >
                Trim Out
                <DropdownMenuShortcut>Ctrl+]</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={addTrack}>
                <PlusIcon className="size-3.5" data-icon />
                Add Track
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Keyframe editing dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]">
                <PlusIcon className="size-3" />
                Keyframe
                <ChevronDownIcon className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel>Keyframe Editing</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={addKeyframe}>
                <PlusIcon className="size-3.5" data-icon />
                Add Keyframe
                <DropdownMenuShortcut>K</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={copyKeyframes}
                disabled={selection?.kind !== 'keyframe'}
              >
                <CopyIcon className="size-3.5" data-icon />
                Copy Keyframe
                <DropdownMenuShortcut>Ctrl+C</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={pasteKeyframes}
                disabled={keyClipboard.length === 0 || (selection?.kind !== 'keyframe' && selection?.kind !== 'placement')}
              >
                <PlusIcon className="size-3.5" data-icon />
                Paste Keyframe
                <DropdownMenuShortcut>Ctrl+V</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={deleteSelection}
                disabled={!selection}
                className="text-destructive"
              >
                <Trash2Icon className="size-3.5" data-icon />
                Delete Selection
                <DropdownMenuShortcut>Del</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Settings dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]">
                <MoreHorizontalIcon className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Settings</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={snapEnabled}
                onCheckedChange={toggleSnap}
              >
                Snap to Grid
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={autoKeyEnabled}
                onCheckedChange={() => motionStore.setAutoKeyEnabled(!autoKeyEnabled)}
              >
                Auto-key
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              {(() => {
                const area = doc.timeline.workArea ?? { enabled: false, start: 0, end: doc.timeline.duration };
                const playhead = motionStore.clock.getTime();
                return (
                  <>
                    <DropdownMenuCheckboxItem
                      checked={area.enabled}
                      onCheckedChange={() => motionStore.commit('Toggle work area', [{ op: 'timeline.setWorkArea', enabled: !area.enabled }])}
                    >
                      Work Area
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuItem
                      disabled={playhead >= area.end}
                      onClick={() => motionStore.commit('Set work area start', [{ op: 'timeline.setWorkArea', start: playhead }])}
                    >
                      Set work area in
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={playhead <= area.start}
                      onClick={() => motionStore.commit('Set work area end', [{ op: 'timeline.setWorkArea', end: playhead }])}
                    >
                      Set work area out
                    </DropdownMenuItem>
                    {area.enabled && (
                      <div className="px-2 py-1 text-[10px] tabular-nums text-muted-foreground">
                        {area.start.toFixed(2)}–{area.end.toFixed(2)}s
                      </div>
                    )}
                    <DropdownMenuSeparator />
                  </>
                );
              })()}
              <DropdownMenuLabel>View Mode</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <TableIcon className="size-3.5" data-icon />
                  Timeline View
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => setDopeSheet(false)}>
                      <TableIcon className="size-3.5" data-icon />
                      Timeline
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDopeSheet(true)}>
                      <ListTodoIcon className="size-3.5" data-icon />
                      Dope Sheet
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
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
          dopeSheet={dopeSheet}
          collapsedGroups={collapsedGroups}
          onToggleGroup={toggleGroup}
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

        <ContextMenu
          onOpenChange={(open) => {
            if (!open) setTimelineContextMenuTarget(null);
          }}
        >
          <ContextMenuTrigger asChild>
            <div
              onContextMenu={(e: React.MouseEvent) => {
                e.preventDefault();
                const rect = paneRef.current?.querySelector('canvas')?.getBoundingClientRect();
                if (!rect) return;
                const layout = layoutTimeline({ model, view, width: rect.width, height: rect.height, scrollY, selection: timelineSelection, collapsedGroups });
                const hit = hitTestTimeline(layout, e.clientX - rect.left, e.clientY - rect.top);
                setTimelineContextMenuTarget(hit);
              }}
              className="relative min-w-0 flex-1"
            >
              <CanvasTimeline
                model={model}
                view={view}
                selection={timelineSelection}
                clock={motionStore.clock}
                snap={snapEnabled}
                scrollY={scrollY}
                collapsedGroups={collapsedGroups}
                handlers={handlers}
                onKeyboardModeKeyDown={onKeyboardModeKeyDown}
              />
            </div>
          </ContextMenuTrigger>
          {timelineContextMenuTarget && (
            <ContextMenuContent className="w-44">
              {timelineContextMenuTarget.type === 'ruler' && (
                <>
                  <ContextMenuItem onSelect={() => motionStore.seek(0)}>
                    Go to Start
                    <ContextMenuShortcut>Home</ContextMenuShortcut>
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => motionStore.seek(doc.timeline.duration)}>
                    Go to End
                    <ContextMenuShortcut>End</ContextMenuShortcut>
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onSelect={() => zoomBy(1.3)}>
                    Zoom In
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => zoomBy(1 / 1.3)}>
                    Zoom Out
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={zoomToFit}>
                    Zoom to Fit
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onSelect={() => {
                    const time = timelineContextMenuTarget.time;
                    motionStore.commit('Set work area here', [
                      { op: 'timeline.setWorkArea', enabled: true, start: Math.max(0, time - 1), end: Math.min(doc.timeline.duration, time + 1) },
                    ]);
                  }}>
                    Set Work Area Here
                  </ContextMenuItem>
                </>
              )}
              {timelineContextMenuTarget.type === 'item' && (
                <>
                  <ContextMenuItem onSelect={splitSelection}>
                    Split at Playhead
                    <ContextMenuShortcut>Ctrl+B</ContextMenuShortcut>
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => trimSelection('in')}>
                    Trim In
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => trimSelection('out')}>
                    Trim Out
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onSelect={copyKeyframes}>
                    Copy
                    <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
                  </ContextMenuItem>
                  <ContextMenuItem variant="destructive" onSelect={deleteSelection}>
                    Delete
                    <ContextMenuShortcut>Del</ContextMenuShortcut>
                  </ContextMenuItem>
                </>
              )}
              {timelineContextMenuTarget.type === 'key' && (
                <>
                  <ContextMenuItem onSelect={addKeyframe}>
                    Add Keyframe
                    <ContextMenuShortcut>K</ContextMenuShortcut>
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={copyKeyframes}>
                    Copy Keyframe
                    <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={pasteKeyframes} disabled={keyClipboard.length === 0}>
                    Paste Keyframe
                    <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem variant="destructive" onSelect={deleteSelection}>
                    Delete Keyframe
                    <ContextMenuShortcut>Del</ContextMenuShortcut>
                  </ContextMenuItem>
                </>
              )}
              {timelineContextMenuTarget.type === 'row' && (
                <>
                  <ContextMenuItem onSelect={addKeyframe}>
                    Add Keyframe at Playhead
                    <ContextMenuShortcut>K</ContextMenuShortcut>
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  {(() => {
                    const track = doc.timeline.tracks.find((t) => t.id === timelineContextMenuTarget.rowId);
                    if (!track) return null;
                    return (
                      <>
                        <ContextMenuCheckboxItem
                          checked={track.muted ?? false}
                          onSelect={() =>
                            motionStore.commit('Toggle track mute', [
                              { op: 'track.update', trackId: track.id, muted: !(track.muted ?? false) },
                            ])
                          }
                        >
                          Muted
                        </ContextMenuCheckboxItem>
                        <ContextMenuCheckboxItem
                          checked={track.locked ?? false}
                          onSelect={() =>
                            motionStore.commit('Toggle track lock', [
                              { op: 'track.update', trackId: track.id, locked: !(track.locked ?? false) },
                            ])
                          }
                        >
                          Locked
                        </ContextMenuCheckboxItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem variant="destructive" onSelect={() =>
                          motionStore.commit('Delete track', [{ op: 'track.remove', trackId: track.id }])
                        }>
                          Delete Track
                        </ContextMenuItem>
                      </>
                    );
                  })()}
                </>
              )}
              {timelineContextMenuTarget.type === 'empty' && (
                <>
                  <ContextMenuItem onSelect={addKeyframe}>
                    Add Keyframe at Playhead
                    <ContextMenuShortcut>K</ContextMenuShortcut>
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={zoomToFit}>
                    Zoom to Fit
                  </ContextMenuItem>
                </>
              )}
            </ContextMenuContent>
          )}
        </ContextMenu>
      </div>

      <div className="flex h-6 shrink-0 items-center justify-between border-t border-border/60 px-3 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>
            {doc.timeline.tracks.length} tracks · {doc.timeline.clips.length} clips
          </span>
          <Separator orientation="vertical" className="h-3" />
          <span className="tabular-nums">
            Frame {currentFrame} / {totalFrames}
          </span>
          <Separator orientation="vertical" className="h-3" />
          <span>
            {doc.meta.output.width}×{doc.meta.output.height}
          </span>
        </div>
        <div className="flex items-center gap-2 tabular-nums">
          <span>{Math.round(view.pxPerSecond)} px/s</span>
          <Separator orientation="vertical" className="h-3" />
          <span>{Math.round((view.pxPerSecond / fitPxPerSecond(doc.timeline.duration, paneRef.current?.clientWidth ?? 1200)) * 100)}%</span>
        </div>
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
