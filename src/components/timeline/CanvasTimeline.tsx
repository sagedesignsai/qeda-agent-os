/**
 * components/timeline/CanvasTimeline.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The reusable canvas timeline. Domain-agnostic: it paints a `TimelineModel` and
 * emits edit intents. Any surface that needs a time canvas can mount it.
 *
 * Why two canvases:
 *   - The **base** layer holds the ruler, lanes, items and keys. It repaints only
 *     when the model, selection, zoom, scroll or size changes.
 *   - The **overlay** layer holds the playhead, snap guide and drag ghosts. It
 *     repaints on each clock tick — a clear plus a handful of strokes — and is
 *     the only thing running at 60fps during playback.
 *
 * Drags update local state and repaint the overlay only; a single commit is
 * emitted on pointer-up. That means one undo entry per drag, no document clone
 * per pointer event, and no React render per frame.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  hitTestTimeline,
  layoutTimeline,
  normalizeLoopRange,
  snapCandidatesFor,
  ITEM_INSET_Y,
  KEY_RADIUS,
  ROW_HEIGHT,
  RULER_HEIGHT,
  type LaidOutItem,
  type LaidOutKey,
  type TimelineLayout,
} from '@/lib/timeline/layout';
import {
  clampScroll,
  quantizeToFrame,
  snapToCandidates,
  timeToX,
  xToTime,
  zoomAround,
} from '@/lib/timeline/time';
import {
  resolveTimelineTrim,
  type TimelineTrimOrigin,
  type TimelineTrimResult,
} from '@/lib/timeline/trim';
import type {
  TimelineClock,
  TimelineEditHandlers,
  TimelineModel,
  TimelineSelection,
  TimelineView,
} from '@/lib/timeline/types';

// ── Palette ──────────────────────────────────────────────────────────────────

type Palette = {
  background: string;
  lane: string;
  laneAlt: string;
  border: string;
  text: string;
  muted: string;
  ruler: string;
  playhead: string;
  snap: string;
  key: string;
  tones: Record<string, string>;
};

const FALLBACK_TONES = ['#7dd3fc', '#c4b5fd', '#fcd34d', '#86efac'];
const TONE_TOKENS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4'];

function readPalette(element: HTMLElement): Palette {
  const style = getComputedStyle(element);
  const token = (name: string, fallback: string): string => {
    const value = style.getPropertyValue(name).trim();
    return value || fallback;
  };
  const tones: Record<string, string> = {
    primary: token('--chart-1', FALLBACK_TONES[0]),
    accent: token('--chart-2', FALLBACK_TONES[1]),
    info: token('--chart-3', FALLBACK_TONES[2]),
    warn: token('--chart-4', FALLBACK_TONES[3]),
    muted: token('--muted-foreground', '#8a8a93'),
  };
  return {
    background: token('--background', '#0b0b0c'),
    lane: token('--card', '#141416'),
    laneAlt: token('--muted', '#101012'),
    border: token('--border', '#2a2a2e'),
    text: token('--foreground', '#e6e6e9'),
    muted: token('--muted-foreground', '#8a8a93'),
    ruler: token('--sidebar', '#0f0f11'),
    playhead: token('--primary', '#e6e6e9'),
    snap: token('--chart-3', '#67e8f9'),
    key: token('--muted-foreground', '#9aa0aa'),
    tones,
  };
}

// ── Painting ─────────────────────────────────────────────────────────────────

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function paintBase(ctx: CanvasRenderingContext2D, layout: TimelineLayout, palette: Palette): void {
  const { width, height } = layout;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, RULER_HEIGHT, width, height - RULER_HEIGHT);
  ctx.clip();

  for (const row of layout.rows) {
    ctx.fillStyle = row.index % 2 === 0 ? palette.lane : palette.laneAlt;
    ctx.fillRect(0, row.y, width, row.height);
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(row.y + row.height) + 0.5);
    ctx.lineTo(width, Math.round(row.y + row.height) + 0.5);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (layout.loop) {
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = palette.playhead;
    ctx.fillRect(layout.loop.x, RULER_HEIGHT, layout.loop.width, height - RULER_HEIGHT);
    ctx.globalAlpha = 1;
  }

  for (const item of layout.items) {
    const tone = palette.tones[item.tone] ?? palette.tones.primary;
    const itemWidth = Math.max(2, item.width);
    ctx.globalAlpha = item.muted ? 0.35 : 1;

    roundRect(ctx, item.x, item.y, itemWidth, item.height, 6);
    ctx.fillStyle = palette.laneAlt;
    ctx.fill();

    ctx.globalAlpha = item.muted ? 0.1 : 0.18;
    ctx.fillStyle = tone;
    roundRect(ctx, item.x, item.y, itemWidth, item.height, 6);
    ctx.fill();

    ctx.globalAlpha = item.muted ? 0.35 : 0.85;
    ctx.strokeStyle = item.selected ? palette.text : tone;
    ctx.lineWidth = item.selected ? 1.5 : 1;
    roundRect(ctx, item.x + 0.5, item.y + 0.5, itemWidth - 1, item.height - 1, 6);
    ctx.stroke();

    if (itemWidth > 30) {
      ctx.save();
      roundRect(ctx, item.x, item.y, itemWidth, item.height, 6);
      ctx.clip();
      ctx.globalAlpha = item.muted ? 0.5 : 0.92;
      ctx.fillStyle = palette.text;
      ctx.font = '500 11px ui-sans-serif, system-ui, sans-serif';
      ctx.textBaseline = 'top';
      const label = item.trimmedKeyCount > 0 ? `${item.label} · ${item.trimmedKeyCount} trimmed` : item.label;
      ctx.fillText(label, item.x + 8, item.y + 6);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  for (const key of layout.keys) {
    ctx.save();
    ctx.translate(Math.round(key.x), Math.round(key.y));
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = key.selected ? palette.playhead : palette.key;
    ctx.strokeStyle = key.selected ? palette.playhead : palette.border;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.95;
    ctx.fillRect(-KEY_RADIUS, -KEY_RADIUS, KEY_RADIUS * 2, KEY_RADIUS * 2);
    ctx.globalAlpha = key.selected ? 1 : 0.7;
    ctx.strokeRect(-KEY_RADIUS, -KEY_RADIUS, KEY_RADIUS * 2, KEY_RADIUS * 2);
    ctx.restore();
  }

  ctx.restore();

  // Ruler last: lanes scroll underneath it.
  ctx.fillStyle = palette.ruler;
  ctx.fillRect(0, 0, width, RULER_HEIGHT);

  if (layout.loop) {
    const loopY = RULER_HEIGHT - 7;
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = palette.playhead;
    ctx.fillRect(layout.loop.x, loopY, layout.loop.width, 4);
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.playhead;
    for (const handleX of [layout.loop.x, layout.loop.x + layout.loop.width]) {
      ctx.fillRect(Math.round(handleX) - 1, loopY - 2, 2, 8);
    }
  }

  for (const tick of layout.ticks) {
    ctx.globalAlpha = tick.major ? 0.5 : 0.22;
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tick.x, RULER_HEIGHT - (tick.major ? 8 : 4));
    ctx.lineTo(tick.x, RULER_HEIGHT);
    ctx.stroke();
    if (tick.label) {
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = palette.muted;
      ctx.font = '500 10px ui-sans-serif, system-ui, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(tick.label, tick.x + 4, 4);
    }
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, RULER_HEIGHT + 0.5);
  ctx.lineTo(width, RULER_HEIGHT + 0.5);
  ctx.stroke();
}

type DragState =
  | { kind: 'scrub' }
  | { kind: 'loop'; edge: 'start' | 'end'; range: { start: number; end: number } }
  | { kind: 'key'; key: LaidOutKey; time: number; guide: number | null; originalTime: number }
  | {
      kind: 'item';
      item: LaidOutItem;
      start: number;
      rowId: string;
      guide: number | null;
      originalStart: number;
      originalRowId: string;
      grabSeconds: number;
    }
  | {
      kind: 'trim';
      item: LaidOutItem;
      edge: 'start' | 'end';
      origin: TimelineTrimOrigin;
      preview: TimelineTrimResult;
      guide: number | null;
    };

function paintOverlay(
  ctx: CanvasRenderingContext2D,
  layout: TimelineLayout,
  palette: Palette,
  time: number,
  drag: DragState | null,
): void {
  const { width, height } = layout;
  ctx.clearRect(0, 0, width, height);

  if (drag?.kind === 'loop') {
    const x = timeToX(drag.range.start, layout.view);
    const w = (drag.range.end - drag.range.start) * layout.view.pxPerSecond;
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = palette.playhead;
    ctx.fillRect(x, RULER_HEIGHT, w, height - RULER_HEIGHT);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = palette.playhead;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, RULER_HEIGHT + 0.5, Math.max(1, w - 1), height - RULER_HEIGHT - 1);
    ctx.globalAlpha = 1;
  }

  if (drag?.kind === 'item') {
    const row = layout.rows.find((candidate) => candidate.id === drag.rowId);
    const y = (row ? row.y : drag.item.y) + ITEM_INSET_Y;
    const x = timeToX(drag.start, layout.view);
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = palette.playhead;
    ctx.setLineDash([4, 3]);
    roundRect(ctx, x, y, Math.max(2, drag.item.width), drag.item.height, 6);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  if (drag?.kind === 'trim') {
    const x = timeToX(drag.preview.start, layout.view);
    const y = drag.item.y;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = palette.playhead;
    ctx.fillRect(x, y, Math.max(1, drag.preview.duration * layout.view.pxPerSecond), drag.item.height);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = palette.playhead;
    ctx.setLineDash([4, 3]);
    roundRect(ctx, x, y, Math.max(2, drag.preview.duration * layout.view.pxPerSecond), drag.item.height, 6);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (drag?.kind === 'key') {
    const x = timeToX(drag.time, layout.view);
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.playhead;
    ctx.save();
    ctx.translate(x, drag.key.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-KEY_RADIUS, -KEY_RADIUS, KEY_RADIUS * 2, KEY_RADIUS * 2);
    ctx.restore();
    ctx.font = '500 10px ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = palette.playhead;
    ctx.fillText(`${drag.time.toFixed(2)}s`, x + 8, drag.key.y - 6);
  }

  if (drag && 'guide' in drag && drag.guide !== null) {
    const guideX = Math.round(timeToX(drag.guide, layout.view)) + 0.5;
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = palette.snap;
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(guideX, 0);
    ctx.lineTo(guideX, height);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  const playheadX = Math.round(timeToX(time, layout.view)) + 0.5;
  if (playheadX >= -8 && playheadX <= width + 8) {
    ctx.strokeStyle = palette.playhead;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(playheadX, RULER_HEIGHT - 6);
    ctx.lineTo(playheadX, height);
    ctx.stroke();

    ctx.fillStyle = palette.playhead;
    ctx.beginPath();
    ctx.moveTo(playheadX - 5, 0);
    ctx.lineTo(playheadX + 5, 0);
    ctx.lineTo(playheadX + 5, RULER_HEIGHT - 12);
    ctx.lineTo(playheadX, RULER_HEIGHT - 6);
    ctx.lineTo(playheadX - 5, RULER_HEIGHT - 12);
    ctx.closePath();
    ctx.fill();
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export type CanvasTimelineProps = {
  model: TimelineModel;
  view: TimelineView;
  selection: TimelineSelection;
  clock: TimelineClock;
  scrollY?: number;
  snap?: boolean;
  className?: string;
  handlers?: TimelineEditHandlers;
};

export function CanvasTimeline({
  model,
  view,
  selection,
  clock,
  scrollY = 0,
  snap = true,
  className,
  handlers,
}: CanvasTimelineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const paletteRef = useRef<Palette | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const layout = useMemo(
    () =>
      layoutTimeline({
        model,
        view,
        width: size.width,
        height: size.height,
        scrollY,
        selection,
      }),
    [model, view, size.width, size.height, scrollY, selection],
  );

  // Keep the latest layout reachable from handlers without re-binding them.
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const viewRef = useRef(view);
  viewRef.current = view;

  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const palette = paletteRef.current ?? readPalette(canvas);
    paletteRef.current = palette;
    paintOverlay(ctx, layoutRef.current, palette, clock.getTime(), dragRef.current);
  }, [clock]);

  // Size both layers and repaint the base whenever structure changes.
  useEffect(() => {
    const container = containerRef.current;
    const base = baseRef.current;
    const overlay = overlayRef.current;
    if (!base || !overlay) return;
    const dpr = window.devicePixelRatio || 1;
    for (const canvas of [base, overlay]) {
      canvas.width = Math.max(1, Math.round(size.width * dpr));
      canvas.height = Math.max(1, Math.round(size.height * dpr));
    }
    const ctx = base.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const palette = readPalette(container ?? base);
    paletteRef.current = palette;
    paintBase(ctx, layout, palette);
    drawOverlay();
  }, [layout, size.width, size.height, drawOverlay]);

  // Playback repaints the overlay only — no React render, no document walk.
  useEffect(() => clock.subscribe(() => drawOverlay()), [clock, drawOverlay]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setSize({ width: Math.max(1, Math.floor(rect.width)), height: Math.max(1, Math.floor(rect.height)) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Wheel must be non-passive to preventDefault, so it is attached natively.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const current = viewRef.current;
      if (event.shiftKey) {
        handlers?.onScrollRows?.(event.deltaY);
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        const anchorX = event.clientX - rect.left;
        const next = zoomAround(current, anchorX, current.pxPerSecond * Math.exp(-event.deltaY * 0.002));
        handlers?.onZoomChange?.(clampScroll(next, rect.width, model.duration));
      } else {
        const delta = (event.deltaX || event.deltaY) / current.pxPerSecond;
        handlers?.onScrollChange?.(
          clampScroll({ ...current, scrollSeconds: current.scrollSeconds + delta }, rect.width, model.duration)
            .scrollSeconds,
        );
      }
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [handlers, model.duration]);

  const pointOf = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointOf(event);
    const hit = hitTestTimeline(layoutRef.current, point.x, point.y);
    event.currentTarget.setPointerCapture(event.pointerId);

    switch (hit.type) {
      case 'loop-start':
      case 'loop-end': {
        const current = layoutRef.current.loop;
        dragRef.current = {
          kind: 'loop',
          edge: hit.type === 'loop-start' ? 'start' : 'end',
          range: current ? { start: current.start, end: current.end } : { start: 0, end: model.duration },
        };
        break;
      }
      case 'ruler':
        handlers?.onScrub?.(Math.min(Math.max(0, hit.time), model.duration));
        dragRef.current = { kind: 'scrub' };
        break;
      case 'key':
        handlers?.onSelect?.({ rowId: hit.key.rowId, itemId: hit.key.itemId, keyId: hit.key.keyId });
        dragRef.current = {
          kind: 'key',
          key: hit.key,
          time: hit.key.time,
          guide: null,
          originalTime: hit.key.time,
        };
        break;
      case 'item':
        handlers?.onSelect?.({ rowId: hit.item.rowId, itemId: hit.item.itemId });
        if (!hit.item.locked) {
          if (hit.edge) {
            dragRef.current = {
              kind: 'trim',
              item: hit.item,
              edge: hit.edge,
              origin: {
                start: hit.item.start,
                duration: hit.item.end - hit.item.start,
                trimIn: hit.item.trimIn,
                ...(typeof hit.item.sourceDuration === 'number'
                  ? { sourceDuration: hit.item.sourceDuration }
                  : {}),
              },
              preview: {
                start: hit.item.start,
                duration: hit.item.end - hit.item.start,
                trimIn: hit.item.trimIn,
              },
              guide: null,
            };
            break;
          }
          dragRef.current = {
            kind: 'item',
            item: hit.item,
            start: hit.item.start,
            rowId: hit.item.rowId,
            guide: null,
            originalStart: hit.item.start,
            originalRowId: hit.item.rowId,
            grabSeconds: xToTime(point.x, viewRef.current) - hit.item.start,
          };
        }
        break;
      default:
        handlers?.onSelect?.(null);
        break;
    }
    drawOverlay();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointOf(event);
    const drag = dragRef.current;

    if (!drag) {
      const hit = hitTestTimeline(layoutRef.current, point.x, point.y);
      event.currentTarget.style.cursor =
        hit.type === 'ruler'
          ? 'col-resize'
          : hit.type === 'key'
            ? 'grab'
            : hit.type === 'item'
              ? hit.edge
                ? 'ew-resize'
                : 'grab'
              : hit.type === 'loop-start' || hit.type === 'loop-end'
                ? 'ew-resize'
                : 'default';
      return;
    }

    const time = xToTime(point.x, viewRef.current);
    const bypassSnap = event.altKey || !snap;

    switch (drag.kind) {
      case 'scrub':
        handlers?.onScrub?.(Math.min(Math.max(0, time), model.duration));
        break;
      case 'loop': {
        const next = normalizeLoopRange(
          drag.edge === 'start'
            ? { start: time, end: drag.range.end }
            : { start: drag.range.start, end: time },
          model.duration,
        );
        dragRef.current = { ...drag, range: next };
        break;
      }
      case 'key': {
        const item = layoutRef.current.itemsById.get(drag.key.itemId);
        const lo = item?.start ?? 0;
        const hi = item?.end ?? model.duration;
        let next = Math.min(Math.max(time, lo), hi);
        let guide: number | null = null;
        if (!bypassSnap) {
          const snapped = snapToCandidates(
            next,
            snapCandidatesFor(layoutRef.current, {
              playhead: clock.getTime(),
              excludeKeyId: drag.key.keyId,
            }),
            viewRef.current,
          );
          // Rive-style: land on a neighbour when close, otherwise land on a frame.
          next =
            snapped.target === null
              ? quantizeToFrame(next, layoutRef.current.fps)
              : snapped.time;
          next = Math.min(Math.max(next, lo), hi);
          guide = snapped.target;
        }
        dragRef.current = { ...drag, time: next, guide };
        break;
      }
      case 'item': {
        const row = layoutRef.current.rows.find(
          (candidate) => point.y >= candidate.y && point.y <= candidate.y + candidate.height,
        );
        let next = Math.max(0, time - drag.grabSeconds);
        let guide: number | null = null;
        if (!bypassSnap) {
          const snapped = snapToCandidates(
            next,
            snapCandidatesFor(layoutRef.current, { excludeItemId: drag.item.itemId }),
            viewRef.current,
          );
          next =
            snapped.target === null
              ? quantizeToFrame(next, layoutRef.current.fps)
              : snapped.time;
          guide = snapped.target;
        }
        dragRef.current = {
          ...drag,
          start: Math.max(0, next),
          guide,
          rowId: row && !row.locked ? row.id : drag.rowId,
        };
        break;
      }
      case 'trim': {
        // Trimming bypasses snapping with Shift so Alt stays free for slip.
        let edgeTime = time;
        let guide: number | null = null;
        if (!(event.shiftKey || !snap)) {
          const snapped = snapToCandidates(
            time,
            snapCandidatesFor(layoutRef.current, {
              playhead: clock.getTime(),
              excludeItemId: drag.item.itemId,
            }),
            viewRef.current,
          );
          edgeTime =
            snapped.target === null ? quantizeToFrame(time, layoutRef.current.fps) : snapped.time;
          guide = snapped.target;
        }
        const edgeEnd = drag.origin.start + drag.origin.duration;
        const delta = drag.edge === 'start' ? edgeTime - drag.origin.start : edgeTime - edgeEnd;
        dragRef.current = {
          ...drag,
          preview: resolveTimelineTrim({
            edge: drag.edge,
            delta,
            origin: drag.origin,
            slip: drag.edge === 'start' && event.altKey,
            fps: layoutRef.current.fps,
          }),
          guide,
        };
        break;
      }
    }
    drawOverlay();
  };

  const endDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag?.kind === 'key') {
      if (Math.abs(drag.time - drag.originalTime) > 1e-6) {
        handlers?.onMoveKey?.(drag.key.keyId, drag.time);
      }
    } else if (drag?.kind === 'item') {
      if (
        Math.abs(drag.start - drag.originalStart) > 1e-6 ||
        drag.rowId !== drag.originalRowId
      ) {
        handlers?.onMoveItem?.(drag.item.itemId, drag.start, drag.rowId);
      }
    } else if (drag?.kind === 'trim') {
      const { preview, origin } = drag;
      if (
        Math.abs(preview.start - origin.start) > 1e-6 ||
        Math.abs(preview.duration - origin.duration) > 1e-6 ||
        Math.abs(preview.trimIn - origin.trimIn) > 1e-6
      ) {
        handlers?.onTrimItem?.(drag.item.itemId, { edge: drag.edge, ...preview });
      }
    } else if (drag?.kind === 'loop') {
      handlers?.onLoopChange?.(drag.range);
    }
    drawOverlay();
  };

  return (
    <div ref={containerRef} className={`relative h-full w-full overflow-hidden ${className ?? ''}`}>
      <canvas ref={baseRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      <canvas
        ref={overlayRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
    </div>
  );
}

export const TIMELINE_ROW_HEIGHT = ROW_HEIGHT;
export const TIMELINE_RULER_HEIGHT = RULER_HEIGHT;
