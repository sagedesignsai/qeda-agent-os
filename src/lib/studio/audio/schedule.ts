/**
 * lib/studio/audio/schedule.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure planning layer for preview audio playback.
 *
 * Given the evaluated audio clips at a playhead and an evaluation time, this
 * produces the set of `AudioBufferSourceNode` starts plus the ids that must
 * stay audible. It is deliberately free of `AudioContext` and DOM types so it
 * can be unit-tested with plain data.
 *
 * Semantics:
 *   - A clip starts when composition time reaches `clip.startMs`. Because the
 *     playhead usually sits a frame or two past that already, we start the
 *     source immediately (`whenSec = nowSec`) — a small positive delay is not
 *     needed since `evaluateEditorTimeline` only reports clips whose time is
 *     active.
 *   - `offsetSec` is `sourceTimeMs`: preview starts the buffer where the video
 *     would be (respects trims and speed).
 *   - `durationSec` is the source span left to play: `remainingCompMs ×
 *     clipRate` (clipRate = sourceDurationMs/durationMs or `speed`).
 *   - `playbackRate` is `clipRate × globalRate`, so sped-up clips are
 *     time-stretched (with pitch shift; see mixer.ts for the limitation).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { sourceRateForClip } from '../timeline/evaluate';
import type { EvaluatedTimelineClip } from '../timeline/evaluate';
import type { TimelineTrack } from '../types';

export interface ScheduledClipStart {
  clipId: string;
  /** AudioContext-seconds when the source should start. */
  whenSec: number;
  /** Buffer-seconds to start from (offset into the clip). */
  offsetSec: number;
  /** Source-seconds to play. */
  durationSec: number;
  /** Effective source playback rate (includes global speed). */
  playbackRate: number;
  /** Effective gain (0 ⇒ silent). */
  gain: number;
}

export interface AudioSchedulePlan {
  /** Sources to start (or re-gain if already playing). */
  starts: ScheduledClipStart[];
  /** Ids that must remain audible right now. */
  activeIds: Set<string>;
}

export function planAudioSchedule({
  clips,
  tracks,
  rate,
  nowSec = 0,
}: {
  clips: readonly EvaluatedTimelineClip[];
  tracks: readonly TimelineTrack[];
  /** Global playback rate multiplier (≥ 0.1). */
  rate: number;
  /** `AudioContext` seconds the plan is computed at (defaults to 0). */
  nowSec?: number;
}): AudioSchedulePlan {
  const starts: ScheduledClipStart[] = [];
  const activeIds = new Set<string>();

  for (const clip of clips) {
    const track = tracks.find((t) => t.id === clip.track.id);
    if (track?.muted) continue;

    const remainingMs = clip.clip.durationMs - clip.localTimeMs;
    if (remainingMs <= 0) continue;

    const gain = (clip.clip.payload?.volume ?? 1) * (track?.volume ?? 1);
    if (gain <= 0) continue;

    activeIds.add(clip.clip.id);

    const clipRate = sourceRateForClip(clip.clip);
    const start: ScheduledClipStart = {
      clipId: clip.clip.id,
      whenSec: nowSec,
      offsetSec: clip.sourceTimeMs / 1000,
      durationSec: (remainingMs * clipRate) / 1000,
      playbackRate: clipRate * rate,
      gain,
    };
    starts.push(start);
  }

  return { starts, activeIds };
}
