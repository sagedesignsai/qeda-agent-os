/**
 * lib/timeline/dopesheet.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Dope sheet layout transformation for the reusable timeline.
 *
 * Instead of clip-based rows (one row per track, clip blocks with nested
 * keyframes), the dope sheet flattens every animated property channel into its
 * own row. Rows are grouped by node (collapsible), and each row shows a thin
 * horizontal bar from the first to the last keyframe, with diamond keyframes
 * painted on the bar center line.
 *
 * This module takes the standard `TimelineLayoutInput`, reuses `layoutTimeline()`
 * as a base, then transforms the rows, items, and keys arrays into dope sheet
 * geometry.
 */

import {
  chooseMinorTickStep,
  chooseTickStep,
  formatTickLabel,
  timeToX,
  visibleTimeRange,
  xToTime,
} from './time';
import {
  KEY_HIT_RADIUS_X,
  KEY_HIT_RADIUS_Y,
  KEY_RADIUS,
  LOOP_HANDLE_HIT_PX,
  OVERSCAN_PX,
  RULER_HEIGHT,
  type LaidOutItem,
  type LaidOutKey,
  type LaidOutRow,
  type TimelineHit,
  type TimelineLayout,
  type TimelineLayoutInput,
  type TimelineTick,
} from './layout';
import type {
  TimelineLoopRange,
  TimelineModel,
  TimelineSelection,
  TimelineView,
} from './types';

// ── Geometry constants (CSS pixels) ──────────────────────────────────────────

/** Dope sheet rows are compact — 24px vs 64px for standard timeline rows. */
export const DOPE_ROW_HEIGHT = 24;
/** Group header rows are slightly taller for the chevron and node name. */
export const DOPE_GROUP_HEIGHT = 28;
/** Thin bar height painted in each dope sheet row. */
export const DOPE_BAR_HEIGHT = 2;
/** Smaller keyframe diamonds for dope sheet density. */
export const DOPE_KEY_RADIUS = 3.5;

// ── Types ────────────────────────────────────────────────────────────────────

export type DopeSheetRow = LaidOutRow & {
  /** Node ID this row belongs to (for grouping). */
  groupId: string;
  /** Display name of the node group. */
  groupName: string;
  /** Property path (e.g., "position.x") or null for group headers. */
  property: string | null;
  /** True for collapsible group header rows. */
  isGroupHeader: boolean;
};

export type DopeSheetItem = LaidOutItem & {
  /** Thin bar from first to last keyframe time. */
  barStart: number;
  barEnd: number;
};

export type DopeSheetKey = LaidOutKey & {
  /** Y position centered on the bar, not inside a clip block. */
  barY: number;
};

export type DopeSheetLayout = TimelineLayout & {
  dopeSheet: true;
  rows: DopeSheetRow[];
  items: DopeSheetItem[];
  keys: DopeSheetKey[];
};

const isSelected = (selection: TimelineSelection, itemId: string, keyId?: string): boolean => {
  if (!selection) return false;
  if (keyId) return selection.keyId === keyId || Boolean(selection.keyIds?.includes(keyId));
  return selection.keyId === undefined && selection.itemId === itemId;
};

// ── Layout ───────────────────────────────────────────────────────────────────

/**
 * Build a dope sheet layout from the standard timeline model.
 *
 * Each clip channel becomes a separate row, grouped by the node it animates.
 * Group header rows are inserted before property rows. Keys are positioned
 * on the bar center line.
 */
export function layoutDopeSheet(input: TimelineLayoutInput): DopeSheetLayout {
  const { model, view, width, height } = input;
  const scrollY = input.scrollY ?? 0;
  const selection = input.selection ?? null;
  const fps = model.fps && model.fps > 0 ? model.fps : 30;
  const collapsedGroups = input.collapsedGroups ?? new Set();

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

  // ── Flatten channels into dope sheet rows ──────────────────────────────────
  // Group items by row, then extract channels with their keys
  type ChannelEntry = {
    rowId: string;
    rowName: string;
    groupId: string;
    groupName: string;
    property: string;
    itemId: string;
    itemLabel: string;
    itemTone: string;
    itemMuted: boolean;
    itemLocked: boolean;
    keys: Array<{ id: string; time: number; channelId: string }>;
    barStart: number;
    barEnd: number;
  };

  const channelEntries: ChannelEntry[] = [];

  for (const row of model.rows) {
    const itemsInRow = model.items.filter((item) => item.rowId === row.id);
    for (const item of itemsInRow) {
      const itemEnd = item.start + item.duration;
      if (itemEnd < minTime || item.start > maxTime) continue;

      const channels = item.channels ?? [];
      for (const channel of channels) {
        const visibleKeys = channel.keys.filter((key) => key.time >= minTime && key.time <= maxTime);
        if (visibleKeys.length === 0) continue;

        // Use row's targetId as group, fall back to row.id
        const groupId = row.id;
        const groupName = row.name;
        const barStart = Math.min(...channel.keys.map((k) => k.time));
        const barEnd = Math.max(...channel.keys.map((k) => k.time));

        channelEntries.push({
          rowId: row.id,
          rowName: row.name,
          groupId,
          groupName,
          property: channel.label,
          itemId: item.id,
          itemLabel: item.label,
          itemTone: item.tone ?? 'primary',
          itemMuted: row.muted ?? false,
          itemLocked: (row.locked ?? false) || (item.locked ?? false),
          keys: visibleKeys.map((k) => ({ id: k.id, time: k.time, channelId: channel.id })),
          barStart,
          barEnd,
        });
      }
    }
  }

  // ── Build row index with group headers ─────────────────────────────────────
  // Unique groups in order of appearance
  const groupOrder = new Map<string, number>();
  let groupIndex = 0;
  for (const entry of channelEntries) {
    if (!groupOrder.has(entry.groupId)) {
      groupOrder.set(entry.groupId, groupIndex++);
    }
  }

  // Build the flat row list: group header + property rows per group
  type RowSlot = {
    index: number;
    isGroupHeader: boolean;
    groupId: string;
    groupName: string;
    property: string | null;
    entry?: ChannelEntry;
  };

  const rowSlots: RowSlot[] = [];
  let rowIndex = 0;

  // Sort groups by first appearance order
  const sortedGroups = [...groupOrder.entries()].sort((a, b) => a[1] - b[1]);

  for (const [groupId] of sortedGroups) {
    const groupEntries = channelEntries.filter((e) => e.groupId === groupId);
    const groupName = groupEntries[0]?.groupName ?? groupId;
    const isCollapsed = collapsedGroups.has(groupId);

    // Group header row
    rowSlots.push({
      index: rowIndex,
      isGroupHeader: true,
      groupId,
      groupName,
      property: null,
    });
    rowIndex += 1;

    // Property rows (only if group is not collapsed)
    if (!isCollapsed) {
      for (const entry of groupEntries) {
        rowSlots.push({
          index: rowIndex,
          isGroupHeader: false,
          groupId,
          groupName,
          property: entry.property,
          entry,
        });
        rowIndex += 1;
      }
    }
  }

  // ── Compute geometry ───────────────────────────────────────────────────────
  const rows: DopeSheetRow[] = [];
  const items: DopeSheetItem[] = [];
  const keys: DopeSheetKey[] = [];
  const itemsById = new Map<string, LaidOutItem>();
  const keysById = new Map<string, LaidOutKey>();

  for (const slot of rowSlots) {
    const rowHeight = slot.isGroupHeader ? DOPE_GROUP_HEIGHT : DOPE_ROW_HEIGHT;
    const y = RULER_HEIGHT + slot.index * (slot.isGroupHeader ? DOPE_GROUP_HEIGHT : DOPE_ROW_HEIGHT) - scrollY;

    // Accurate Y calculation: sum actual heights of all preceding rows
    let actualY = RULER_HEIGHT;
    for (let i = 0; i < slot.index; i++) {
      const prevSlot = rowSlots[i];
      actualY += prevSlot.isGroupHeader ? DOPE_GROUP_HEIGHT : DOPE_ROW_HEIGHT;
    }
    const finalY = actualY - scrollY;

    // Vertical virtualization: skip rows entirely outside the pane.
    if (finalY + rowHeight < RULER_HEIGHT || finalY > height) continue;

    const row: DopeSheetRow = {
      id: slot.isGroupHeader ? `${slot.groupId}:group` : `${slot.groupId}:${slot.property}`,
      name: slot.isGroupHeader ? slot.groupName : slot.property ?? '',
      index: slot.index,
      y: finalY,
      height: rowHeight,
      muted: false,
      locked: false,
      groupId: slot.groupId,
      groupName: slot.groupName,
      property: slot.property,
      isGroupHeader: slot.isGroupHeader,
    };
    rows.push(row);

    // For property rows, create items (thin bars) and keys
    if (!slot.isGroupHeader && slot.entry) {
      const entry = slot.entry;
      const barY = finalY + rowHeight / 2;

      // Thin bar item
      const barStartX = timeToX(entry.barStart, view);
      const barEndX = timeToX(entry.barEnd, view);
      const barWidth = Math.max(2, barEndX - barStartX);

      const laidOutItem: DopeSheetItem = {
        rowId: row.id,
        rowIndex: slot.index,
        itemId: entry.itemId,
        label: entry.itemLabel,
        trimmedKeyCount: 0,
        trimIn: 0,
        start: entry.barStart,
        end: entry.barEnd,
        x: barStartX,
        width: barWidth,
        y: barY - DOPE_BAR_HEIGHT / 2,
        height: DOPE_BAR_HEIGHT,
        tone: entry.itemTone,
        selected: isSelected(selection, entry.itemId),
        muted: entry.itemMuted,
        locked: entry.itemLocked,
        barStart: entry.barStart,
        barEnd: entry.barEnd,
      };
      items.push(laidOutItem);
      itemsById.set(entry.itemId, laidOutItem);

      // Keys on the bar center line
      for (const key of entry.keys) {
        const laidOutKey: DopeSheetKey = {
          rowId: row.id,
          rowIndex: slot.index,
          itemId: entry.itemId,
          channelId: key.channelId,
          keyId: key.id,
          time: key.time,
          x: timeToX(key.time, view),
          y: barY,
          selected: isSelected(selection, entry.itemId, key.id),
          barY: barY,
        };
        keys.push(laidOutKey);
        keysById.set(key.id, laidOutKey);
      }
    }
  }

  // ── Loop ───────────────────────────────────────────────────────────────────
  const loop: TimelineLayout['loop'] = model.loop
    ? {
        x: timeToX(model.loop.start, view),
        width: (model.loop.end - model.loop.start) * view.pxPerSecond,
        start: model.loop.start,
        end: model.loop.end,
      }
    : null;

  // Total content height for scrolling
  let contentHeight = 0;
  for (const slot of rowSlots) {
    contentHeight += slot.isGroupHeader ? DOPE_GROUP_HEIGHT : DOPE_ROW_HEIGHT;
  }

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
    contentHeight,
    dopeSheet: true,
  };
}

// ── Hit testing ──────────────────────────────────────────────────────────────

/** Hit test for dope sheet layout — keys first, then bars, then rows. */
export function hitTestDopeSheet(layout: DopeSheetLayout, x: number, y: number): TimelineHit {
  const time = xToTime(x, layout.view);

  if (layout.loop && y >= 0 && y <= RULER_HEIGHT) {
    if (Math.abs(x - layout.loop.x) <= LOOP_HANDLE_HIT_PX) return { type: 'loop-start', time };
    if (Math.abs(x - (layout.loop.x + layout.loop.width)) <= LOOP_HANDLE_HIT_PX) {
      return { type: 'loop-end', time };
    }
  }

  if (y < RULER_HEIGHT) return { type: 'ruler', time };

  // Keys first — smallest target
  let nearest: DopeSheetKey | null = null;
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

  // Bars (items) — thin hit area
  for (const item of layout.items) {
    // Expand hit area vertically for thin bars
    const hitTop = item.y - 4;
    const hitBottom = item.y + item.height + 4;
    if (y < hitTop || y > hitBottom) continue;
    if (x < item.x - 4 || x > item.x + item.width + 4) continue;
    return { type: 'item', time, item, edge: null };
  }

  // Rows
  const row = layout.rows.find(
    (candidate) => y >= candidate.y && y <= candidate.y + candidate.height,
  );
  if (row) return { type: 'row', time, rowId: row.id };

  return { type: 'empty', time };
}
