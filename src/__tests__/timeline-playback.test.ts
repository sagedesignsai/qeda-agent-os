/**
 * __tests__/timeline-playback.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Playback modes use the injected clock so boundary behavior is deterministic.
 */

import { PlaybackClock } from '@/lib/timeline/clock';
import { createStarterMotionDocument } from '@/lib/motion/defaults';
import { applyMotionOps } from '@/lib/motion/ops';
import { parseMotionDocument, serializeMotionDocument } from '@/lib/motion/schema';

function clockFor(mode: 'once' | 'loop' | 'ping-pong', start = 0, end = 2) {
  let modeValue = mode;
  return new PlaybackClock({
    duration: () => 4,
    playMode: () => modeValue,
    loopRange: () => ({ start, end }),
    schedule: () => 1,
    cancel: () => undefined,
  });
}

describe('PlaybackClock modes', () => {
  it('once stops at the document end', () => {
    const clock = clockFor('once');
    clock.play();
    clock.tick(0);
    clock.tick(4100);
    expect(clock.getTime()).toBe(4);
    expect(clock.isPlaying()).toBe(false);
    clock.dispose();
  });

  it('loop wraps within an enabled work area and uses the full scene otherwise', () => {
    const clock = clockFor('loop', 1, 3);
    clock.seek(2.5);
    clock.play();
    clock.tick(0);
    clock.tick(1000);
    expect(clock.getTime()).toBeCloseTo(1.5);
    clock.dispose();
  });

  it('ping-pong reverses at both work-area boundaries', () => {
    const clock = clockFor('ping-pong', 1, 3);
    clock.seek(2.5);
    clock.play();
    clock.tick(0);
    clock.tick(1000);
    expect(clock.getTime()).toBeCloseTo(2.5);
    clock.tick(2500);
    expect(clock.getTime()).toBeCloseTo(1);
    clock.tick(3000);
    expect(clock.getTime()).toBeCloseTo(1.5);
    clock.dispose();
  });
});

describe('timeline.setPlayMode', () => {
  it('changes the mode through an op and survives serialization', () => {
    const doc = createStarterMotionDocument('2026-01-01T00:00:00.000Z');
    const changed = applyMotionOps(doc, [{
      op: 'timeline.setPlayMode',
      playMode: 'ping-pong',
    }]);
    expect(changed.timeline.playMode).toBe('ping-pong');
    expect(
      parseMotionDocument(JSON.parse(serializeMotionDocument(changed))).timeline.playMode,
    ).toBe('ping-pong');
  });
});
