/**
 * __tests__/studio-audio-schedule.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for `lib/studio/audio/schedule.ts` — the pure preview-audio
 * scheduling planner used by the Studio preview mixer.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { planAudioSchedule } from '@/lib/studio/audio/schedule';
import type { EvaluatedTimelineClip } from '@/lib/studio/timeline/evaluate';
import type { TimelineClip, TimelineTrack } from '@/lib/studio/types';

function trackFor(trackId: string, overrides: Partial<TimelineTrack> = {}): TimelineTrack {
  return {
    id: trackId,
    type: 'audio',
    name: trackId,
    locked: false,
    visible: true,
    clips: [],
    ...overrides,
  };
}

function clip(
  id: string,
  overrides: Partial<TimelineClip> & Pick<TimelineClip, 'startMs' | 'durationMs'>,
): TimelineClip {
  return {
    id,
    trackId: overrides.trackId ?? 'audio-1',
    name: id,
    sourceStartMs: overrides.sourceStartMs ?? 0,
    sourceDurationMs: overrides.sourceDurationMs ?? overrides.durationMs,
    itemType: 'audio',
    ...overrides,
  };
}

function evaluated(
  id: string,
  overrides: Partial<TimelineClip> & Pick<TimelineClip, 'startMs' | 'durationMs'>,
  extra: Partial<EvaluatedTimelineClip> = {},
): EvaluatedTimelineClip {
  const base = clip(id, overrides);
  return {
    track: trackFor(base.trackId),
    clip: base,
    itemType: 'audio',
    localTimeMs: 0,
    sourceTimeMs: base.sourceStartMs,
    ...extra,
  };
}

describe('planAudioSchedule', () => {
  it('plans a start for each audible active clip', () => {
    const clips = [evaluated('a1', { startMs: 0, durationMs: 5000 })];
    const tracks = [trackFor('audio-1')];

    const plan = planAudioSchedule({ clips, tracks, rate: 1, nowSec: 0.1 });

    expect(plan.starts).toHaveLength(1);
    expect(plan.starts[0]).toMatchObject({
      clipId: 'a1',
      whenSec: 0.1,
      offsetSec: 0,
      durationSec: 5,
      playbackRate: 1,
      gain: 1,
    });
    expect(plan.activeIds.has('a1')).toBe(true);
  });

  it('starts at the playhead when the clip is already active', () => {
    const clips = [
      evaluated('a1', { startMs: 0, durationMs: 5000 }, { localTimeMs: 1000 }),
    ];
    const plan = planAudioSchedule({ clips, tracks: [trackFor('audio-1')], rate: 1, nowSec: 1 });
    expect(plan.starts[0].whenSec).toBe(1);
    expect(plan.starts[0].durationSec).toBe(4);
  });

  it('uses sourceTimeMs as the offset (trim-aware)', () => {
    // Clip starts at 0, but playback began at sourceMs 1.5s — the buffer must
    // start from there, not from the clip start.
    const clips = [
      evaluated('a1', { startMs: 0, durationMs: 5000, sourceStartMs: 1500 }),
    ];
    const plan = planAudioSchedule({ clips, tracks: [trackFor('audio-1')], rate: 1, nowSec: 0 });
    expect(plan.starts[0].offsetSec).toBe(1.5);
  });

  it('computes duration from remaining clip time', () => {
    const clips = [
      evaluated('a1', { startMs: 0, durationMs: 5000 }, { localTimeMs: 2000 }),
    ];
    const plan = planAudioSchedule({ clips, tracks: [trackFor('audio-1')], rate: 1, nowSec: 0 });
    expect(plan.starts[0].durationSec).toBe(3);
  });

  it('multiplies clip rate by the global rate (speed)', () => {
    // 2× sped clip: sourceDurationMs (4000) over durationMs (2000).
    const clips = [
      evaluated('a1', { startMs: 0, durationMs: 2000, sourceDurationMs: 4000 }),
    ];
    const plan = planAudioSchedule({ clips, tracks: [trackFor('audio-1')], rate: 1, nowSec: 0 });
    expect(plan.starts[0].playbackRate).toBe(2);
    expect(plan.starts[0].durationSec).toBe(4);
  });

  it('applies global rate to both rate and duration', () => {
    const clips = [evaluated('a1', { startMs: 0, durationMs: 2000 })];
    const plan = planAudioSchedule({ clips, tracks: [trackFor('audio-1')], rate: 2, nowSec: 0 });
    expect(plan.starts[0].playbackRate).toBe(2);
  });

  it('applies clip volume × track volume to the gain', () => {
    const clips = [
      evaluated('a1', { startMs: 0, durationMs: 1000, payload: { volume: 0.5 } }),
    ];
    const plan = planAudioSchedule({
      clips,
      tracks: [trackFor('audio-1', { volume: 0.75 })],
      rate: 1,
      nowSec: 0,
    });
    expect(plan.starts[0].gain).toBeCloseTo(0.375);
  });

  it('excludes muted tracks', () => {
    const clips = [evaluated('a1', { startMs: 0, durationMs: 5000 })];
    const plan = planAudioSchedule({
      clips,
      tracks: [trackFor('audio-1', { muted: true })],
      rate: 1,
      nowSec: 0,
    });
    expect(plan.starts).toHaveLength(0);
    expect(plan.activeIds.size).toBe(0);
  });

  it('excludes zero-volume clips', () => {
    const clips = [
      evaluated('a1', { startMs: 0, durationMs: 5000, payload: { volume: 0 } }),
    ];
    const plan = planAudioSchedule({ clips, tracks: [trackFor('audio-1')], rate: 1, nowSec: 0 });
    expect(plan.starts).toHaveLength(0);
    expect(plan.activeIds.size).toBe(0);
  });

  it('excludes clips whose timeline time has run out', () => {
    const clips = [
      evaluated('a1', { startMs: 0, durationMs: 1000 }, { localTimeMs: 1200 }),
    ];
    const plan = planAudioSchedule({ clips, tracks: [trackFor('audio-1')], rate: 1, nowSec: 0 });
    expect(plan.starts).toHaveLength(0);
    expect(plan.activeIds.size).toBe(0);
  });

  it('plans all audible clips across tracks', () => {
    const clips = [
      evaluated('a1', { startMs: 0, durationMs: 1000, trackId: 'audio-1' }),
      evaluated('a2', { startMs: 0, durationMs: 2000, trackId: 'audio-2' }),
    ];
    const plan = planAudioSchedule({
      clips,
      tracks: [trackFor('audio-1'), trackFor('audio-2')],
      rate: 1,
      nowSec: 0,
    });
    expect(plan.starts.map((s) => s.clipId).sort()).toEqual(['a1', 'a2']);
    expect(plan.activeIds.size).toBe(2);
  });
});
