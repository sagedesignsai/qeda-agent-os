/**
 * lib/timeline/layout.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure geometry for the reusable timeline: what to paint, where, and what the
 * pointer hit.
 *
 * This module is the performance contract. The canvas never walks the model; it
 * paints the arrays produced here, and `layoutTimeline` emits only items that
 * intersect the viewport (time range horizontally, row range vertically, plus
 * one screen of overscan). A five-thousand-key project produces roughly the same
 * layout size as a five-key one — asserted in `timeline-layout.test.ts`.
 *
 * Hit testing runs against the *same* layout the painter used, so what is drawn
 * is exactly what can be grabbed.
 */

import {
  chooseMinorTickStep,
  chooseTickStep,
  formatTickLabel,
  timeToX,
  visibleTimeRange,
  xToTime,
} from './time';
import { layoutDopeSheet } from './dopesheet';
import type {
  TimelineLoopRange,
  TimelineModel,
  TimelineSelection,
  TimelineView,
} from './types';

// ── Geometry constants (CSS pixels) ──────────────────────────────────────────

export const RULER_HEIGHT = 26;
export const ROW_HEIGHT = 64;
export { DOPE_ROW_HEIGHT, DOPE_GROUP_HEIGHT, DOPE_KEY_RADIUS } from './dopesheet';
export const ITEM_INSET_Y = 5;
export const KEY_RADIUS = 4.5;
export const KEY_ROW_TOP = 22;
export const KEY_ROW_HEIGHT = 11;
/** Key rows painted per item before additional channels collapse. */
export const KEY_ROWS_MAX = 3;
export const ITEM_EDGE_PX = 6;
export const KEY_HIT_RADIUS_X = 7;
export const KEY_HIT_RADIUS_Y = 6;
export const OVERSCAN_PX = 320;
export const LOOP_HANDLE_HIT_PX = 6;

// ── Types ────────────────────────────────────────────────────────────────────

export type TimelineTick = { x: number; time: number; label: string; major: boolean };

export type LaidOutRow = {
  id: string;
  name: string;
  index: number;
  y: number;
  height: number;
  muted: boolean;
  locked: boolean;
};

export type LaidOutItem = {
  rowId: string;
  rowIndex: number;
  itemId: string;
  label: string;
  trimmedKeyCount: number;
  trimIn: number;
  sourceDuration?: number;
  start: number;
  end: number;
  x: number;
  width: number;
  y: number;
  height: number;
  tone: string;
  selected: boolean;
  muted: boolean;
  locked: boolean;
};

export type LaidOutKey = {
  rowId: string;
  rowIndex: number;
  itemId: string;
  channelId: string | null;
  keyId: string;
  time: number;
  x: number;
  y: number;
  selected: boolean;
};

export type TimelineLayout = {
  width: number;
  height: number;
  rulerHeight: number;
  view: TimelineView;
  fps: number;
  startTime: number;
  endTime: number;
  ticks: TimelineTick[];
  rows: LaidOutRow[];
  items: LaidOutItem[];
  keys: LaidOutKey[];
  itemsById: Map<string, LaidOutItem>;
  keysById: Map<string, LaidOutKey>;
  loop: { x: number; width: number; start: number; end: number } | null;
  /** Vertical extent of all rows, so the pane knows how far it can scroll. */
  contentHeight: number;
  /** True when layout was produced by the dope sheet transformer. */
  dopeSheet?: boolean;
};

export type TimelineLayoutInput = {
  model: TimelineModel;
  view: TimelineView;
  width: number;
  height: number;
  scrollY?: number;
  selection?: TimelineSelection;
  /** Collapsed group IDs for dope sheet mode. */
  collapsedGroups?: Set<string>;
};

export type TimelineHit =
  | { type: 'loop-start'; time: number }
  | { type: 'loop-end'; time: number }
  | { type: 'ruler'; time: number }
  | { type: 'key'; time: number; key: LaidOutKey }
  | { type: 'item'; time: number; item: LaidOutItem; edge: 'start' | 'end' | null }
  | { type: 'row'; time: number; rowId: string }
  | { type: 'empty'; time: number };

const isSelected = (selection: TimelineSelection, itemId: string, keyId?: string): boolean => {
  if (!selection) return false;
  if (keyId) return selection.keyId === keyId || Boolean(selection.keyIds?.includes(keyId));
  return selection.keyId === undefined && selection.itemId === itemId;
};

// ── Layout ───────────────────────────────────────────────────────────────────

export function layoutTimeline(input: TimelineLayoutInput): TimelineLayout {
  // Route to dope sheet layout when the flag is set
  if (input.model.dopeSheet) {
    return layoutDopeSheet(input);
  }
  const { model, view, width, height } = input;
  const scrollY = input.scrollY ?? 0;
  const selection = input.selection ?? null;
  const fps = model.fps && model.fps > 0 ? model.fps : 30;

  const { start: startTime, end: endTime } = visibleTimeRange(view, width);
  const padSeconds = OVERSCAN_PX / Math.max(1e-6, view.pxPerSecond);
  const minTime = startTime - padSeconds;
  const maxTime = endTime + padSeconds;

  // ── Ruler ticks ────────────────────────────────────────────────────────────
  const majorStep = chooseTickStep(view.pxPerSecond);
  const minorStep = chooseMinorTickStep(majorStep, view.pxPerSecond);
  const step = minorStep || majorStep;
  const ticks: TimelineTick[] = [];

  const firstIndex = Math.floor(startTime / step);
  const lastIndex = Math.ceil(endTime / step);
  // A pathological zoom could ask for a million ticks; skip rather than hang.
  if (lastIndex - firstIndex <= 4000) {
    for (let i = firstIndex; i <= lastIndex; i += 1) {
      const time = i * step;
      if (time < 0) continue;
      const major =
        minorStep === 0 || Math.abs(time / majorStep - Math.round(time / majorStep)) < 1e-6;
      ticks.push({
        x: Math.round(timeToX(time, view)) + 0.5,
        time,
        label: major ? formatTickLabel(time, majorStep, fps) : '',
        major,
      });
    }
  }

  // ── Rows, items, keys ──────────────────────────────────────────────────────
  const itemsByRow = new Map<string, TimelineModel['items']>();
  for (const item of model.items) {
    const bucket = itemsByRow.get(item.rowId);
    if (bucket) bucket.push(item);
    else itemsByRow.set(item.rowId, [item]);
  }

  const rows: LaidOutRow[] = [];
  const items: LaidOutItem[] = [];
  const keys: LaidOutKey[] = [];
  const itemsById = new Map<string, LaidOutItem>();
  const keysById = new Map<string, LaidOutKey>();

  for (let index = 0; index < model.rows.length; index += 1) {
    const row = model.rows[index];
    const y = RULER_HEIGHT + index * ROW_HEIGHT - scrollY;

    // Vertical virtualization: skip rows entirely outside the pane.
    if (y + ROW_HEIGHT < RULER_HEIGHT || y > height) continue;

    rows.push({
      id: row.id,
      name: row.name,
      index,
      y,
      height: ROW_HEIGHT,
      muted: row.muted ?? false,
      locked: row.locked ?? false,
    });

    for (const item of itemsByRow.get(row.id) ?? []) {
      const itemEnd = item.start + item.duration;
      if (itemEnd < minTime || item.start > maxTime) continue;

      const laidOutItem: LaidOutItem = {
        rowId: row.id,
        rowIndex: index,
        itemId: item.id,
        label: item.label,
        trimmedKeyCount: item.trimmedKeyCount ?? 0,
        trimIn: item.trimIn ?? 0,
        ...(typeof item.sourceDuration === 'number' ? { sourceDuration: item.sourceDuration } : {}),
        start: item.start,
        end: itemEnd,
        x: timeToX(item.start, view),
        width: item.duration * view.pxPerSecond,
        y: y + ITEM_INSET_Y,
        height: ROW_HEIGHT - ITEM_INSET_Y * 2,
        tone: item.tone ?? 'primary',
        selected: isSelected(selection, item.id),
        muted: row.muted ?? false,
        locked: (row.locked ?? false) || (item.locked ?? false),
      };
      items.push(laidOutItem);
      itemsById.set(item.id, laidOutItem);

      const channels = item.channels ?? [];
      const rowCount = Math.min(channels.length, KEY_ROWS_MAX);
      for (let channelIndex = 0; channelIndex < rowCount; channelIndex += 1) {
        const channel = channels[channelIndex];
        const keyY = laidOutItem.y + KEY_ROW_TOP + channelIndex * KEY_ROW_HEIGHT;
        for (const key of channel.keys) {
          if (key.time < minTime || key.time > maxTime) continue;
          const laidOutKey: LaidOutKey = {
            rowId: row.id,
            rowIndex: index,
            itemId: item.id,
            channelId: channel.id,
            keyId: key.id,
            time: key.time,
            x: timeToX(key.time, view),
            y: keyY,
            selected: isSelected(selection, item.id, key.id),
          };
          keys.push(laidOutKey);
          keysById.set(key.id, laidOutKey);
        }
      }
    }
  }

  const loop: TimelineLayout['loop'] = model.loop
    ? {
        x: timeToX(model.loop.start, view),
        width: (model.loop.end - model.loop.start) * view.pxPerSecond,
        start: model.loop.start,
        end: model.loop.end,
      }
    : null;

  return {
    width,
    height,
    rulerHeight: RULER_HEIGHT,
    view,
    fps,
    startTime,
    endTime,
    ticks,
    rows,
    items,
    keys,
    itemsById,
    keysById,
    loop,
    contentHeight: model.rows.length * ROW_HEIGHT,
  };
}

// ── Hit testing ──────────────────────────────────────────────────────────────

export function hitTestTimeline(layout: TimelineLayout, x: number, y: number): TimelineHit {
  const time = xToTime(x, layout.view);

  if (layout.loop && y >= 0 && y <= RULER_HEIGHT) {
    if (Math.abs(x - layout.loop.x) <= LOOP_HANDLE_HIT_PX) return { type: 'loop-start', time };
    if (Math.abs(x - (layout.loop.x + layout.loop.width)) <= LOOP_HANDLE_HIT_PX) {
      return { type: 'loop-end', time };
    }
  }

  if (y < RULER_HEIGHT) return { type: 'ruler', time };

  // Keys first: they are the smallest target and must win over the item body
  // they sit on, otherwise they become ungrabbable at low zoom.
  let nearest: LaidOutKey | null = null;
  let nearestDistance = Infinity;
  for (const key of layout.keys) {
    const dx = Math.abs(key.x - x);
    const dy = Math.abs(key.y - y);
    if (dx > KEY_HIT_RADIUS_X || dy > KEY_HIT_RADIUS_Y) continue;
    const distance = dx * dx + dy * dy;
    if (distance < nearestDistance) {
      nearest = key;
      nearestDistance = distance;
    }
  }
  if (nearest) return { type: 'key', time: nearest.time, key: nearest };

  for (const item of layout.items) {
    if (y < item.y || y > item.y + item.height) continue;
    if (x < item.x - ITEM_EDGE_PX || x > item.x + item.width + ITEM_EDGE_PX) continue;
    let edge: 'start' | 'end' | null = null;
    if (Math.abs(x - item.x) <= ITEM_EDGE_PX) edge = 'start';
    else if (Math.abs(x - (item.x + item.width)) <= ITEM_EDGE_PX) edge = 'end';
    return { type: 'item', time, item, edge };
  }

  const row = layout.rows.find((candidate) => y >= candidate.y && y <= candidate.y + candidate.height);
  if (row) return { type: 'row', time, rowId: row.id };

  return { type: 'empty', time };
}

/**
 * Snap candidates for a drag, excluding the dragged entity so it cannot snap to
 * its own previous position.
 */
export function snapCandidatesFor(
  layout: TimelineLayout,
  options: { playhead?: number; excludeItemId?: string; excludeKeyId?: string } = {},
): number[] {
  const candidates: number[] = [0];
  if (options.playhead !== undefined) candidates.push(options.playhead);
  if (layout.loop) candidates.push(layout.loop.start, layout.loop.end);
  for (const item of layout.items) {
    if (item.itemId === options.excludeItemId) continue;
    candidates.push(item.start, item.end);
  }
  for (const key of layout.keys) {
    if (key.keyId === options.excludeKeyId) continue;
    candidates.push(key.time);
  }
  return candidates;
}

/** Clamp a loop range to a sane, ordered span inside the duration. */
export function normalizeLoopRange(
  range: TimelineLoopRange,
  duration: number,
  minSpan = 0.05,
): TimelineLoopRange {
  const max = Math.max(minSpan, duration);
  const a = Math.min(Math.max(0, range.start), max);
  const b = Math.min(Math.max(0, range.end), max);
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  if (end - start >= minSpan) return { start, end };
  return { start: Math.min(start, max - minSpan), end: Math.min(max, start + minSpan) };
}
