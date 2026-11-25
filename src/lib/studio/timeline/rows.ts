/**
 * lib/studio/timeline/rows.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Collapsible timeline row model.
 *
 * A "row" is one horizontal band in the timeline. Every track contributes:
 *   - one full-height track row (clips live here), and
 *   - when it has animation/effect content, a compact `Animations` group row and
 *     an `Effects` group row.
 *
 * Group rows are always visible. When a track is expanded, the group rows are
 * followed by one detail lane per animated property / attached effect. When it
 * is collapsed, only the group rows remain, carrying aggregate markers.
 *
 * The header panel and the canvas viewport both build their layout from this
 * module, so their vertical geometry can never drift apart.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  ClipEffect,
  StudioEffectType,
  StudioKeyframe,
  TimelineClip,
  TimelineTrack,
} from '../types';
import { getStudioEffectDefinition } from '../effects/catalog';
import {
  isEffectKeyframe,
  keyframeUiInfoFor,
} from './keyframes-ui';

export const TRACK_ROW_HEIGHT = 48;
export const GROUP_ROW_HEIGHT = 20;
export const LANE_ROW_HEIGHT = 22;

export type TimelineGroupKind = 'animations' | 'effects';

interface BaseRow {
  id: string;
  trackId: string;
  track: TimelineTrack;
  height: number;
  /** Offset from the top of the track area (below the ruler). */
  y: number;
}

export interface TimelineTrackRow extends BaseRow {
  kind: 'track';
  expanded: boolean;
  animationLaneCount: number;
  effectLaneCount: number;
  canExpand: boolean;
}

export interface TimelineGroupRow extends BaseRow {
  kind: 'group';
  group: TimelineGroupKind;
  label: string;
  /** Number of detail lanes in this group. */
  count: number;
}

export interface TimelineAnimationRow extends BaseRow {
  kind: 'animation';
  /** Keyframe property, or the `enter-exit` pseudo-property. */
  property: string;
  label: string;
  color: string;
  /** Number of markers in the lane. */
  count: number;
}

export interface TimelineEffectRow extends BaseRow {
  kind: 'effect';
  effectType: string;
  effectIds: string[];
  label: string;
  color: string;
  /** Number of keyframe markers in the lane (0 = static effect). */
  count: number;
}

export type TimelineSubRow =
  | TimelineGroupRow
  | TimelineAnimationRow
  | TimelineEffectRow;

export type TimelineRow = TimelineTrackRow | TimelineSubRow;

export type TimelineDetailRow = TimelineAnimationRow | TimelineEffectRow;

// ── Lane discovery ───────────────────────────────────────────────────────────

interface AnimationLane {
  property: string;
  label: string;
  color: string;
  count: number;
}

interface EffectLane {
  effectType: string;
  effectIds: string[];
  label: string;
  color: string;
  count: number;
}

const ANIMATION_ORDER = [
  'x',
  'y',
  'scale',
  'rotation',
  'opacity',
  'speed',
  'intensity',
];

const ENTER_EXIT_PROPERTY = 'enter-exit';

function humanize(value: string): string {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function clipKeyframes(clip: TimelineClip): StudioKeyframe[] {
  return clip.payload?.keyframes ?? [];
}

function clipEffects(clip: TimelineClip): ClipEffect[] {
  return (clip.payload?.effects ?? []) as ClipEffect[];
}

function hasEnterAnimation(clip: TimelineClip): boolean {
  const enter = clip.payload?.enterAnimation;
  return Boolean(enter && (enter.presetId || enter.type !== 'none'));
}

function hasExitAnimation(clip: TimelineClip): boolean {
  const exit = clip.payload?.exitAnimation;
  return Boolean(exit && (exit.presetId || exit.type !== 'none'));
}

function collectAnimationLanes(track: TimelineTrack): AnimationLane[] {
  const byProperty = new Map<string, number>();
  let enterExitCount = 0;

  for (const clip of track.clips) {
    for (const keyframe of clipKeyframes(clip)) {
      if (isEffectKeyframe(keyframe.property)) continue;
      byProperty.set(
        keyframe.property,
        (byProperty.get(keyframe.property) ?? 0) + 1,
      );
    }
    if (hasEnterAnimation(clip)) enterExitCount += 1;
    if (hasExitAnimation(clip)) enterExitCount += 1;
  }

  const lanes: AnimationLane[] = [...byProperty.entries()].map(
    ([property, count]) => {
      const info = keyframeUiInfoFor(property);
      return {
        property,
        label: info?.label ?? humanize(property),
        color: info?.color ?? '#94a3b8',
        count,
      };
    },
  );

  lanes.sort((a, b) => {
    const ai = ANIMATION_ORDER.indexOf(a.property);
    const bi = ANIMATION_ORDER.indexOf(b.property);
    if (ai === -1 && bi === -1) return a.label.localeCompare(b.label);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  if (enterExitCount > 0) {
    lanes.push({
      property: ENTER_EXIT_PROPERTY,
      label: 'Enter / Exit',
      color: '#a855f7',
      count: enterExitCount,
    });
  }

  return lanes;
}

function collectEffectLanes(track: TimelineTrack): EffectLane[] {
  const byType = new Map<string, { ids: Set<string>; count: number }>();

  for (const clip of track.clips) {
    for (const effect of clipEffects(clip)) {
      const entry = byType.get(effect.type) ?? { ids: new Set<string>(), count: 0 };
      entry.ids.add(effect.id);
      entry.count += 1;
      byType.set(effect.type, entry);
    }
  }

  return [...byType.entries()].map(([effectType, entry]) => {
    const definition = getStudioEffectDefinition(effectType as StudioEffectType);
    return {
      effectType,
      effectIds: [...entry.ids],
      label: definition?.label ?? humanize(effectType),
      color: definition?.accent ?? '#6366f1',
      count: entry.count,
    };
  });
}

// ── Row builder ──────────────────────────────────────────────────────────────

/** True when a track has at least one animation or effect detail lane. */
export function trackHasDetailLanes(track: TimelineTrack): boolean {
  return (
    collectAnimationLanes(track).length > 0 ||
    collectEffectLanes(track).length > 0
  );
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

export function buildTimelineRows(
  tracks: readonly TimelineTrack[],
  expandedTrackIds: ReadonlySet<string>,
): TimelineRow[] {
  const rows: TimelineRow[] = [];
  let cursorY = 0;

  const push = (row: DistributiveOmit<TimelineRow, 'y'>): void => {
    rows.push({ ...row, y: cursorY } as TimelineRow);
    cursorY += row.height;
  };

  for (const track of tracks) {
    const animationLanes = collectAnimationLanes(track);
    const effectLanes = collectEffectLanes(track);
    const expanded = expandedTrackIds.has(track.id);
    const canExpand = animationLanes.length + effectLanes.length > 0;

    push({
      kind: 'track',
      id: `track:${track.id}`,
      trackId: track.id,
      track,
      height: TRACK_ROW_HEIGHT,
      expanded,
      animationLaneCount: animationLanes.length,
      effectLaneCount: effectLanes.length,
      canExpand,
    });

    if (animationLanes.length > 0) {
      push({
        kind: 'group',
        id: `group:${track.id}:animations`,
        trackId: track.id,
        track,
        group: 'animations',
        label: 'Animations',
        count: animationLanes.length,
        height: GROUP_ROW_HEIGHT,
      });

      if (expanded) {
        for (const lane of animationLanes) {
          push({
            kind: 'animation',
            id: `lane:${track.id}:animation:${lane.property}`,
            trackId: track.id,
            track,
            property: lane.property,
            label: lane.label,
            color: lane.color,
            count: lane.count,
            height: LANE_ROW_HEIGHT,
          });
        }
      }
    }

    if (effectLanes.length > 0) {
      push({
        kind: 'group',
        id: `group:${track.id}:effects`,
        trackId: track.id,
        track,
        group: 'effects',
        label: 'Effects',
        count: effectLanes.length,
        height: GROUP_ROW_HEIGHT,
      });

      if (expanded) {
        for (const lane of effectLanes) {
          const keyframeCount = countEffectKeyframes(track, lane);
          push({
            kind: 'effect',
            id: `lane:${track.id}:effect:${lane.effectType}`,
            trackId: track.id,
            track,
            effectType: lane.effectType,
            effectIds: lane.effectIds,
            label: lane.label,
            color: lane.color,
            count: keyframeCount,
            height: LANE_ROW_HEIGHT,
          });
        }
      }
    }
  }

  return rows;
}

function countEffectKeyframes(track: TimelineTrack, lane: EffectLane): number {
  let count = 0;
  const ids = new Set(lane.effectIds);
  for (const clip of track.clips) {
    for (const keyframe of clipKeyframes(clip)) {
      const match = keyframe.property.match(/^effect:([^:]+):intensity$/);
      if (match && ids.has(match[1])) count += 1;
    }
  }
  return count;
}

// ── Markers & bands ──────────────────────────────────────────────────────────

export interface TimelineRowMarker {
  id: string;
  clipId: string;
  keyframeId?: string;
  effectId?: string;
  property?: string;
  /** Composition time (clip start + local keyframe time). */
  timeMs: number;
  color: string;
  shape: 'diamond' | 'circle';
  label: string;
  value?: number;
}

export interface TimelineRowBand {
  id: string;
  clipId: string;
  startMs: number;
  endMs: number;
  color: string;
  label: string;
}

function animationLaneMarkers(
  track: TimelineTrack,
  lane: AnimationLane,
): TimelineRowMarker[] {
  const markers: TimelineRowMarker[] = [];

  for (const clip of track.clips) {
    if (lane.property === ENTER_EXIT_PROPERTY) {
      if (hasEnterAnimation(clip)) {
        markers.push({
          id: `enter:${clip.id}`,
          clipId: clip.id,
          timeMs: clip.startMs,
          color: '#a855f7',
          shape: 'diamond',
          label: 'Enter',
        });
      }
      if (hasExitAnimation(clip)) {
        markers.push({
          id: `exit:${clip.id}`,
          clipId: clip.id,
          timeMs: clip.startMs + clip.durationMs,
          color: '#f97316',
          shape: 'diamond',
          label: 'Exit',
        });
      }
      continue;
    }

    for (const keyframe of clipKeyframes(clip)) {
      if (keyframe.property !== lane.property) continue;
      if (isEffectKeyframe(keyframe.property)) continue;
      markers.push({
        id: `anim:${clip.id}:${keyframe.id}`,
        clipId: clip.id,
        keyframeId: keyframe.id,
        property: lane.property,
        timeMs: clip.startMs + keyframe.timeMs,
        color: lane.color,
        shape: 'diamond',
        label: lane.label,
        value: keyframe.value,
      });
    }
  }

  return markers;
}

function effectLaneMarkers(
  track: TimelineTrack,
  lane: EffectLane,
): TimelineRowMarker[] {
  const markers: TimelineRowMarker[] = [];
  const effectIds = new Set(lane.effectIds);

  for (const clip of track.clips) {
    for (const keyframe of clipKeyframes(clip)) {
      const match = keyframe.property.match(/^effect:([^:]+):intensity$/);
      if (!match || !effectIds.has(match[1])) continue;
      markers.push({
        id: `fx:${clip.id}:${keyframe.id}`,
        clipId: clip.id,
        keyframeId: keyframe.id,
        effectId: match[1],
        property: keyframe.property,
        timeMs: clip.startMs + keyframe.timeMs,
        color: lane.color,
        shape: 'circle',
        label: `${lane.label} intensity`,
        value: keyframe.value,
      });
    }
  }

  return markers;
}

function animationLaneBands(
  track: TimelineTrack,
  lane: AnimationLane,
): TimelineRowBand[] {
  const bands: TimelineRowBand[] = [];

  for (const clip of track.clips) {
    const applies =
      lane.property === ENTER_EXIT_PROPERTY
        ? hasEnterAnimation(clip) || hasExitAnimation(clip)
        : clipKeyframes(clip).some(
            (keyframe) =>
              keyframe.property === lane.property &&
              !isEffectKeyframe(keyframe.property),
          );
    if (!applies) continue;
    bands.push({
      id: `band:anim:${clip.id}:${lane.property}`,
      clipId: clip.id,
      startMs: clip.startMs,
      endMs: clip.startMs + clip.durationMs,
      color: lane.color,
      label: lane.label,
    });
  }

  return bands;
}

function effectLaneBands(
  track: TimelineTrack,
  lane: EffectLane,
): TimelineRowBand[] {
  const bands: TimelineRowBand[] = [];
  const effectIds = new Set(lane.effectIds);

  for (const clip of track.clips) {
    const hasEffect = clipEffects(clip).some((effect) => effectIds.has(effect.id));
    if (!hasEffect) continue;
    bands.push({
      id: `band:fx:${clip.id}:${lane.effectType}`,
      clipId: clip.id,
      startMs: clip.startMs,
      endMs: clip.startMs + clip.durationMs,
      color: lane.color,
      label: lane.label,
    });
  }

  return bands;
}

function laneFromAnimationRow(row: TimelineAnimationRow): AnimationLane {
  return {
    property: row.property,
    label: row.label,
    color: row.color,
    count: row.count,
  };
}

function laneFromEffectRow(row: TimelineEffectRow): EffectLane {
  return {
    effectType: row.effectType,
    effectIds: row.effectIds,
    label: row.label,
    color: row.color,
    count: row.count,
  };
}

export function collectRowMarkers(row: TimelineSubRow): TimelineRowMarker[] {
  switch (row.kind) {
    case 'animation':
      return animationLaneMarkers(row.track, laneFromAnimationRow(row));
    case 'effect':
      return effectLaneMarkers(row.track, laneFromEffectRow(row));
    case 'group': {
      if (row.group === 'animations') {
        return collectAnimationLanes(row.track).flatMap((lane) =>
          animationLaneMarkers(row.track, lane),
        );
      }
      return collectEffectLanes(row.track).flatMap((lane) =>
        effectLaneMarkers(row.track, lane),
      );
    }
  }
}

export function collectRowBands(row: TimelineSubRow): TimelineRowBand[] {
  switch (row.kind) {
    case 'animation':
      return animationLaneBands(row.track, laneFromAnimationRow(row));
    case 'effect':
      return effectLaneBands(row.track, laneFromEffectRow(row));
    case 'group': {
      if (row.group === 'animations') {
        return collectAnimationLanes(row.track).flatMap((lane) =>
          animationLaneBands(row.track, lane),
        );
      }
      return collectEffectLanes(row.track).flatMap((lane) =>
        effectLaneBands(row.track, lane),
      );
    }
  }
}

/** Total pixel height of the track area (everything below the ruler). */
export function timelineRowsHeight(rows: readonly TimelineRow[]): number {
  const last = rows[rows.length - 1];
  return last ? last.y + last.height : 0;
}
