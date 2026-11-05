/**
 * lib/soundlab/soundlab-scheduler.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lookahead event scheduling, timeline loop wrapping, and automation
 * evaluation for SoundLab.
 *
 * Implements a high-precision lookahead model (25 ms interval, 100 ms lookahead
 * window) using AudioContext.currentTime, rendering notes and drum events
 * completely immune to JavaScript main-thread timer jitter.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  SoundLabSessionWithTracks,
  SoundLabPattern,
  SoundLabTrackConfig,
  DrumVoice,
} from '../soundlab-types';
import {
  beatToSeconds,
  secondsToBeat,
  interpolateAutomation,
  clamp,
  getTrackOutputGain,
  getAmEnvelope,
} from './soundlab-math';
import { schedulePolyNote } from './soundlab-synth';
import { scheduleDrumHit } from './soundlab-drums';
import type { TrackMixer } from './soundlab-mixer';
import type { EntrainmentNodes } from './soundlab-entrainment';
import { binauralFrequencies } from '../focus-audio';

export interface SchedulerCallbacks {
  onBeatUpdate?: (beat: number) => void;
  onStop?: () => void;
}

export class LookaheadScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastAutomationValues = new Map<string, number>();

  scheduledUntilSec = 0;
  playStartSec = 0;
  playStartBeat = 0;

  hasActiveLoop(
    session: SoundLabSessionWithTracks | null,
    durationBeats: number,
  ): boolean {
    return Boolean(
      session?.loopEnabled &&
      Number.isFinite(session.loopStartBeat) &&
      Number.isFinite(session.loopEndBeat) &&
      session.loopStartBeat >= 0 &&
      session.loopEndBeat > session.loopStartBeat &&
      session.loopStartBeat < durationBeats,
    );
  }

  getLoopEndBeat(
    session: SoundLabSessionWithTracks | null,
    durationBeats: number,
  ): number {
    return Math.min(session?.loopEndBeat ?? durationBeats, durationBeats);
  }

  transportBeat(
    session: SoundLabSessionWithTracks | null,
    durationBeats: number,
    absoluteBeat: number,
  ): number {
    if (!this.hasActiveLoop(session, durationBeats) || !session)
      return absoluteBeat;
    const start = session.loopStartBeat;
    const end = this.getLoopEndBeat(session, durationBeats);
    const length = end - start;
    const beatEpsilon = 1e-9;
    if (absoluteBeat < end - beatEpsilon) return absoluteBeat;
    return start + ((absoluteBeat - start) % length);
  }

  start(onTick: () => void, intervalMs = 25): void {
    this.stop();
    this.timer = setInterval(onTick, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  resetAutomationCache(): void {
    this.lastAutomationValues.clear();
  }

  scheduleWindow(
    ctx: AudioContext,
    session: SoundLabSessionWithTracks,
    bpm: number,
    durationBeats: number,
    fromSec: number,
    toSec: number,
    mixer: TrackMixer,
  ): void {
    let segmentStartSec = fromSec;
    let boundaryRetryCount = 0;
    while (segmentStartSec < toSec) {
      const absoluteBeat =
        this.playStartBeat +
        secondsToBeat(segmentStartSec - this.playStartSec, bpm);
      const segmentBeat = this.transportBeat(
        session,
        durationBeats,
        absoluteBeat,
      );
      const loops = this.hasActiveLoop(session, durationBeats);
      const boundaryBeat = loops
        ? this.getLoopEndBeat(session, durationBeats)
        : durationBeats;
      const remainingBeats = Math.max(0, boundaryBeat - segmentBeat);
      const boundarySec = segmentStartSec + beatToSeconds(remainingBeats, bpm);
      const segmentEndSec = Math.min(toSec, boundarySec);
      if (segmentEndSec <= segmentStartSec) {
        if (!loops) return;
        if (++boundaryRetryCount > 16) return;
        segmentStartSec += 0.000001;
        continue;
      }
      boundaryRetryCount = 0;
      const segmentEndBeat =
        segmentBeat + secondsToBeat(segmentEndSec - segmentStartSec, bpm);

      for (const track of session.tracks) {
        if (track.type === 'entrainment' || track.type === 'noise') continue;
        const bus = mixer.trackBuses.get(track.id);
        if (!bus) continue;

        for (const clip of track.clips) {
          const clipEndBeat = clip.startBeat + clip.durationBeats;
          if (clipEndBeat <= segmentBeat || clip.startBeat >= segmentEndBeat) {
            continue;
          }
          const pattern = track.patterns.find(
            (item) => item.id === clip.patternId,
          );
          if (!pattern) continue;
          const clipStartSec =
            segmentStartSec + beatToSeconds(clip.startBeat - segmentBeat, bpm);
          if (track.type === 'drums') {
            this.scheduleDrumSteps(
              ctx,
              pattern,
              clip,
              clipStartSec,
              segmentStartSec,
              segmentEndSec,
              bus,
              bpm,
            );
          } else {
            this.schedulePatternNotes(
              ctx,
              pattern,
              clip,
              clipStartSec,
              segmentStartSec,
              segmentEndSec,
              bus,
              track.config,
              bpm,
            );
          }
        }
      }

      segmentStartSec = segmentEndSec;
    }
  }

  schedulePatternNotes(
    ctx: AudioContext,
    pattern: SoundLabPattern,
    clip: { startBeat: number; durationBeats: number },
    clipStartSec: number,
    fromSec: number,
    toSec: number,
    bus: GainNode,
    cfg: SoundLabTrackConfig,
    bpm: number,
  ): void {
    const patternDurSec = beatToSeconds(pattern.lengthBeats, bpm);
    if (patternDurSec <= 0) return;

    for (const note of pattern.notes) {
      let loopOffset =
        Math.max(
          0,
          Math.floor(
            (fromSec - clipStartSec - beatToSeconds(note.startBeat, bpm)) /
              patternDurSec,
          ),
        ) * pattern.lengthBeats;
      while (note.startBeat + loopOffset < clip.durationBeats) {
        const noteAbsStartSec =
          clipStartSec + beatToSeconds(note.startBeat + loopOffset, bpm);
        const noteAbsEndSec =
          noteAbsStartSec + beatToSeconds(note.durationBeats, bpm);
        if (noteAbsStartSec >= toSec) break;
        if (noteAbsEndSec > fromSec && noteAbsStartSec >= fromSec) {
          schedulePolyNote(ctx, note, noteAbsStartSec, bus, cfg, bpm);
        }
        loopOffset += pattern.lengthBeats;
      }
    }
  }

  scheduleDrumSteps(
    ctx: AudioContext,
    pattern: SoundLabPattern,
    clip: { startBeat: number; durationBeats: number },
    clipStartSec: number,
    fromSec: number,
    toSec: number,
    bus: GainNode,
    bpm: number,
  ): void {
    if (
      !pattern.stepData?.length ||
      !Number.isFinite(pattern.lengthBeats) ||
      pattern.lengthBeats <= 0
    ) {
      return;
    }
    const voices: DrumVoice[] = ['kick', 'snare', 'hihat', 'clap'];
    const stepsPerBeat = 4; // 16 steps over 4 beats

    for (
      let voiceIdx = 0;
      voiceIdx < Math.min(voices.length, pattern.stepData.length);
      voiceIdx++
    ) {
      const steps = pattern.stepData[voiceIdx];
      if (!steps) continue;
      for (let step = 0; step < 16; step++) {
        if (!steps[step]) continue;
        const stepBeat = step / stepsPerBeat;
        let loopOffset =
          Math.max(
            0,
            Math.floor(
              (fromSec - clipStartSec - beatToSeconds(stepBeat, bpm)) /
                beatToSeconds(pattern.lengthBeats, bpm),
            ),
          ) * pattern.lengthBeats;
        while (stepBeat + loopOffset < clip.durationBeats) {
          const t = clipStartSec + beatToSeconds(stepBeat + loopOffset, bpm);
          if (t >= toSec) break;
          if (t >= fromSec) {
            scheduleDrumHit(ctx, voices[voiceIdx], t, bus);
          }
          loopOffset += pattern.lengthBeats;
        }
      }
    }
  }

  applyAutomation(
    ctx: AudioContext,
    session: SoundLabSessionWithTracks,
    beat: number,
    mixer: TrackMixer,
    entrainmentNodes: Map<string, EntrainmentNodes>,
  ): void {
    const now = ctx.currentTime;

    for (const track of session.tracks) {
      for (const lane of track.automation) {
        const value = interpolateAutomation(lane.points, beat);
        if (value === null) continue;
        const cacheKey = `${track.id}:${lane.id}:${lane.parameterId}`;
        const lastValue = this.lastAutomationValues.get(cacheKey);
        const threshold = lane.parameterId.includes('Hz') ? 0.05 : 0.002;
        if (
          lastValue !== undefined &&
          Math.abs(value - lastValue) < threshold
        ) {
          continue;
        }
        this.lastAutomationValues.set(cacheKey, value);

        if (lane.parameterId === 'track.volume') {
          const settings = mixer.trackSettings.get(track.id);
          const bus = mixer.trackBuses.get(track.id);
          if (!settings || !bus) continue;
          settings.volume = clamp(value);
          const anySolo = [...mixer.trackSettings.values()].some(
            (item) => item.solo && !item.muted,
          );
          bus.gain.setTargetAtTime(
            getTrackOutputGain(
              settings.volume,
              settings.muted,
              settings.solo,
              anySolo,
            ),
            now,
            0.04,
          );
        } else if (lane.parameterId === 'track.pan') {
          mixer.trackPanners
            .get(track.id)
            ?.pan.setTargetAtTime(Math.max(-1, Math.min(1, value)), now, 0.04);
        } else if (
          lane.parameterId === 'entrainment.beatHz' ||
          lane.parameterId === 'entrainment.carrierHz' ||
          lane.parameterId === 'entrainment.depth'
        ) {
          const nodes = entrainmentNodes.get(track.id);
          if (!nodes) continue;
          const mode = track.config.mode ?? 'binaural';
          const beatHz =
            lane.parameterId === 'entrainment.beatHz'
              ? Math.max(0.5, Math.min(40, value))
              : Math.max(0.5, Math.min(40, track.config.beatHz ?? 10));
          const carrierHz =
            lane.parameterId === 'entrainment.carrierHz'
              ? Math.max(40, Math.min(880, value))
              : Math.max(40, Math.min(880, track.config.carrierHz ?? 220));

          if (lane.parameterId === 'entrainment.depth') {
            const envelope = getAmEnvelope(value);
            nodes.lfoGain?.gain.setTargetAtTime(envelope.amplitude, now, 0.04);
            if (mode === 'am-embed' && mixer.melodicSubBus) {
              mixer.melodicSubBus.gain.setTargetAtTime(
                envelope.offset,
                now,
                0.04,
              );
            }
          } else if (mode === 'binaural' && nodes.oscillators.length === 2) {
            const frequencies = binauralFrequencies(carrierHz, beatHz);
            nodes.oscillators[0].frequency.setTargetAtTime(
              frequencies.left,
              now,
              0.04,
            );
            nodes.oscillators[1].frequency.setTargetAtTime(
              frequencies.right,
              now,
              0.04,
            );
          } else if (nodes.oscillators.length >= 2) {
            nodes.oscillators[0].frequency.setTargetAtTime(
              carrierHz,
              now,
              0.04,
            );
            nodes.oscillators[1].frequency.setTargetAtTime(beatHz, now, 0.04);
          } else {
            nodes.lfo?.frequency.setTargetAtTime(beatHz, now, 0.04);
          }
        }
      }
    }
  }
}
