/**
 * __tests__/timeline-trim.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Trim-handle bounds and transport shortcuts are pure decisions; a mistake here
 * either hides keyframes or makes the clip fight the drag.
 */

import { resolveTimelineTrim } from '@/lib/timeline/trim';
import { resolveTimelineShortcut } from '@/lib/timeline/shortcuts';

const origin = { start: 2, duration: 3, trimIn: 1, sourceDuration: 5 };

describe('resolveTimelineTrim', () => {
  it('anchors content when trimming the left edge', () => {
    expect(resolveTimelineTrim({ edge: 'start', delta: 0.5, origin })).toEqual({
      start: 2.5,
      duration: 2.5,
      trimIn: 1.5,
    });
  });

  it('cannot trim before the source start or the timeline origin', () => {
    expect(resolveTimelineTrim({ edge: 'start', delta: -10, origin })).toEqual({
      start: 1,
      duration: 4,
      trimIn: 0,
    });
  });

  it('keeps at least one frame visible when trimming in', () => {
    const trimmed = resolveTimelineTrim({ edge: 'start', delta: 10, origin, fps: 30 });
    expect(trimmed.start).toBeCloseTo(2 + (3 - 1 / 30), 9);
    expect(trimmed.duration).toBeCloseTo(1 / 30, 9);
    expect(trimmed.trimIn).toBeCloseTo(1 + (3 - 1 / 30), 9);
  });

  it('slips a left edge without changing what is trimmed', () => {
    expect(resolveTimelineTrim({ edge: 'start', delta: -1, origin, slip: true })).toEqual({
      start: 1,
      duration: 3,
      trimIn: 1,
    });
  });

  it('stops the right edge at the end of the source clip', () => {
    expect(resolveTimelineTrim({ edge: 'end', delta: 10, origin })).toEqual({
      start: 2,
      duration: 4,
      trimIn: 1,
    });
  });

  it('does not let the right edge collapse the clip', () => {
    expect(resolveTimelineTrim({ edge: 'end', delta: -10, origin, minDuration: 0.1 })).toEqual({
      start: 2,
      duration: 0.1,
      trimIn: 1,
    });
  });
});

describe('resolveTimelineShortcut', () => {
  it('maps transport keys', () => {
    expect(resolveTimelineShortcut({ key: ' ' })).toEqual({ type: 'toggle-play' });
    expect(resolveTimelineShortcut({ key: ' ', shiftKey: true })).toEqual({
      type: 'play-from-start',
    });
    expect(resolveTimelineShortcut({ key: ',' })).toEqual({ type: 'step', direction: -1 });
    expect(resolveTimelineShortcut({ key: '.' })).toEqual({ type: 'step', direction: 1 });
    expect(resolveTimelineShortcut({ key: 'Home' })).toEqual({ type: 'go-to-start' });
    expect(resolveTimelineShortcut({ key: 'End' })).toEqual({ type: 'go-to-end' });
  });

  it('ignores typing, modified keys, and unknown keys', () => {
    expect(resolveTimelineShortcut({ key: ' ' }, { editable: true })).toBeNull();
    expect(resolveTimelineShortcut({ key: ' ', metaKey: true })).toBeNull();
    expect(resolveTimelineShortcut({ key: ' ', ctrlKey: true })).toBeNull();
    expect(resolveTimelineShortcut({ key: ' ', altKey: true })).toBeNull();
    expect(resolveTimelineShortcut({ key: 'k' })).toBeNull();
  });
});
