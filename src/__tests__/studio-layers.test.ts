/**
 * __tests__/studio-layers.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for the single source of truth for track ordering
 * (`lib/studio/timeline/layers.ts`):
 *   - Canonical row order: lanes grouped top row first, legacy video below
 *     project video lanes
 *   - Paint order: reverse of row order (bottom row first)
 *   - Reorder: within-type moves only, clamped at lane edges
 *   - Store integration: reorderTrack + undo round-trip
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  compareTracksForTimeline,
  moveTrackWithinType,
  sortTracksForTimeline,
  trackPaintOrder,
} from '@/lib/studio/timeline/layers';
import type { TimelineTrack, TrackType } from '@/lib/studio/types';
import { timelineStore } from '@/hooks/use-timeline-store';

let counter = 0;
function track(type: TrackType, id = `track-${type}-${counter++}`): TimelineTrack {
  return { id, name: id, type, locked: false, visible: true, clips: [] };
}

describe('studio layer ordering', () => {
  beforeEach(() => {
    timelineStore.setTracksAndDuration([], 0, true);
    counter = 0;
  });

  describe('sortTracksForTimeline', () => {
    it('groups lanes in canonical order, preserving insertion order within a lane', () => {
      const tracks = [
        track('audio', 'a1'),
        track('effects', 'e1'),
        track('audio', 'a2'),
        track('captions', 'c1'),
      ];

      expect(sortTracksForTimeline(tracks).map((t) => t.type)).toEqual([
        'effects',
        'captions',
        'audio',
        'audio',
      ]);
      expect(sortTracksForTimeline(tracks).map((t) => t.id)).toEqual([
        'e1',
        'c1',
        'a1',
        'a2',
      ]);
    });

    it('places project video lanes above the legacy recording lane', () => {
      const legacy = track('video', 'track-video');
      const project = track('video', 'p1');

      const sorted = sortTracksForTimeline([legacy, project]);
      // Row order is top-first; the project lane sits above the legacy lane.
      expect(sorted.map((t) => t.id)).toEqual(['p1', 'track-video']);
      expect(compareTracksForTimeline(project, legacy)).toBeLessThan(0);
    });
  });

  describe('trackPaintOrder', () => {
    it('returns tracks bottom-to-top (reverse of row order)', () => {
      const tracks = [
        track('audio', 'a1'),
        track('effects', 'e1'),
      ];

      // Row order: [e1, a1] → paint order: audio is the bottom row.
      expect(trackPaintOrder(tracks).map((t) => t.id)).toEqual(['a1', 'e1']);
    });
  });

  describe('moveTrackWithinType', () => {
    it('moves a track one position toward the top row', () => {
      const tracks = [track('audio', 'a1'), track('audio', 'a2'), track('audio', 'a3')];
      const moved = moveTrackWithinType(tracks, 'a3', -1);
      expect(moved?.map((t) => t.id)).toEqual(['a1', 'a3', 'a2']);
    });

    it('walks a track to the top row over multiple moves', () => {
      let tracks = [track('audio', 'a1'), track('audio', 'a2'), track('audio', 'a3')];
      tracks = moveTrackWithinType(tracks, 'a3', -1)!;
      tracks = moveTrackWithinType(tracks, 'a3', -1)!;
      expect(tracks.map((t) => t.id)).toEqual(['a3', 'a1', 'a2']);
    });

    it('returns null at the edges of the lane', () => {
      const tracks = [track('audio', 'a1'), track('audio', 'a2')];
      // 'a1' is the top-most audio track — moving up is a no-op.
      expect(moveTrackWithinType(tracks, 'a1', -1)).toBeNull();
      // 'a2' is the bottom-most — moving down is a no-op.
      expect(moveTrackWithinType(tracks, 'a2', 1)).toBeNull();
      expect(moveTrackWithinType(tracks, 'a1', 0)).toBeNull();
      expect(moveTrackWithinType(tracks, 'nope', -1)).toBeNull();
    });

    it('cannot cross lanes: the audio lane cannot extend into video', () => {
      const tracks = [track('video', 'v1'), track('audio', 'a1')];
      expect(moveTrackWithinType(tracks, 'a1', 1)).toBeNull();
      expect(moveTrackWithinType(tracks, 'v1', -1)).toBeNull();
    });

    it('reorders the legacy video lane within the video lane only', () => {
      const legacy = track('video', 'track-video');
      const project = track('video', 'p1');
      const audio = track('audio', 'a1');
      const sorted = sortTracksForTimeline([legacy, project, audio]);
      // Row order: [p1, track-video, a1]
      expect(sorted.map((t) => t.id)).toEqual(['p1', 'track-video', 'a1']);

      const moved = moveTrackWithinType(sorted, 'track-video', -1);
      expect(moved?.map((t) => t.id)).toEqual(['track-video', 'p1', 'a1']);
    });

    it('never mutates the input array', () => {
      const tracks = [track('audio', 'a1'), track('audio', 'a2')];
      const snapshot = tracks.map((t) => t.id);
      moveTrackWithinType(tracks, 'a2', -1);
      expect(tracks.map((t) => t.id)).toEqual(snapshot);
    });
  });

  describe('timelineStore.reorderTrack', () => {
    it('moves a track within its type lane and is undoable', () => {
      const tracks = [track('audio', 'a1'), track('audio', 'a2')];
      timelineStore.setTracksAndDuration(tracks, 1000);
      const before = timelineStore.getState().tracks.map((t) => t.id);

      expect(timelineStore.reorderTrack('a2', -1)).toBe(true);
      const after = timelineStore.getState().tracks.map((t) => t.id);
      expect(after).toEqual(['a2', 'a1']);

      timelineStore.undo();
      expect(timelineStore.getState().tracks.map((t) => t.id)).toEqual(before);
    });

    it('returns false at lane edges without mutating state', () => {
      const tracks = [track('audio', 'a1')];
      timelineStore.setTracksAndDuration(tracks, 1000);
      const before = timelineStore.getState().tracks.map((t) => t.id);

      expect(timelineStore.reorderTrack('a1', -1)).toBe(false);
      expect(timelineStore.reorderTrack('a1', 1)).toBe(false);
      expect(timelineStore.reorderTrack('nope', -1)).toBe(false);
      expect(timelineStore.getState().tracks.map((t) => t.id)).toEqual(before);
    });
  });
});
