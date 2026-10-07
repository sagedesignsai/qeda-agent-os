/**
 * lib/soundlab-engine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The SoundLab Web Audio engine orchestrator and public facade.
 *
 * Coordinates modular audio subsystems:
 *   - soundlab/soundlab-math: pure conversion, gain & envelope math
 *   - soundlab/soundlab-mixer: bus routing, stereo panning, effects insert chain
 *   - soundlab/soundlab-drums: 808-style analog drum synthesis
 *   - soundlab/soundlab-synth: polyphonic subtractive/additive synthesis
 *   - soundlab/soundlab-entrainment: binaural, isochronic, monaural, am-embed & noise
 *   - soundlab/soundlab-scheduler: lookahead event scheduling & loop wrapping
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  SoundLabSessionWithTracks,
  SoundLabTrack,
  SoundLabTrackConfig,
  DrumVoice,
} from './soundlab-types';
import {
  getAudioCtorSafe,
  secondsToBeat,
} from './soundlab/soundlab-math';
import {
  TrackMixer,
} from './soundlab/soundlab-mixer';
import {
  LookaheadScheduler,
} from './soundlab/soundlab-scheduler';
import {
  startEntrainmentTrack,
  stopEntrainmentTrack,
  updateEntrainmentNodes,
  startNoiseTrack,
  type EntrainmentNodes,
} from './soundlab/soundlab-entrainment';
import {
  scheduleDrumHit,
  playDrumPreview,
} from './soundlab/soundlab-drums';

// ── Re-export all math and modular symbols for full backward compatibility ───
export * from './soundlab';

// ── Public SoundLab Engine Facade ────────────────────────────────────────────

export class SoundLabEngine {
  private ctx: AudioContext | null = null;
  private mixer = new TrackMixer();
  private scheduler = new LookaheadScheduler();
  private entrainmentNodes = new Map<string, EntrainmentNodes>();
  private noiseNodes = new Map<string, AudioBufferSourceNode>();

  private session: SoundLabSessionWithTracks | null = null;
  private bpm = 120;
  private durationBeats = 64;
  private _isPlaying = false;
  private _onBeatUpdate?: (beat: number) => void;
  private _onStop?: () => void;

  /** Access active track buses (exposed for internal wiring and tests). */
  get trackBuses(): Map<string, GainNode> {
    return this.mixer.trackBuses;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AudioCtor = getAudioCtorSafe();
    if (!AudioCtor) return null;
    this.ctx = new AudioCtor();
    this.mixer.ensureMasterGraph(this.ctx);
    return this.ctx;
  }

  buildTrackBus(track: SoundLabTrack): GainNode | null {
    const ctx = this.ensureCtx();
    if (!ctx) return null;
    return this.mixer.buildTrackBus(ctx, track);
  }

  // ── Drum scheduling & preview ─────────────────────────────────────────────

  scheduleDrumHit(voice: DrumVoice, time: number, bus: GainNode): void {
    if (!this.ctx) return;
    scheduleDrumHit(this.ctx, voice, time, bus);
  }

  /** Immediate preview hit (for step sequencer UI feedback). */
  previewDrumHit(voice: DrumVoice): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    this.mixer.ensureMasterGraph(ctx);
    playDrumPreview(ctx, this.mixer.compressor ?? ctx.destination, voice);
  }

  // ── Lookahead scheduling tick ─────────────────────────────────────────────

  tick(): void {
    const ctx = this.ctx;
    if (!ctx || !this._isPlaying || !this.session) return;

    const lookahead = 0.1; // 100 ms lookahead
    const scheduleUntil = ctx.currentTime + lookahead;

    const elapsedSec = ctx.currentTime - this.scheduler.playStartSec;
    const absoluteBeat =
      this.scheduler.playStartBeat + secondsToBeat(elapsedSec, this.bpm);
    const currentBeat = this.scheduler.transportBeat(
      this.session,
      this.durationBeats,
      absoluteBeat,
    );
    this._onBeatUpdate?.(currentBeat);
    this.scheduler.applyAutomation(
      ctx,
      this.session,
      currentBeat,
      this.mixer,
      this.entrainmentNodes,
    );
    if (this.scheduler.scheduledUntilSec >= scheduleUntil) return;

    this.scheduler.scheduleWindow(
      ctx,
      this.session,
      this.bpm,
      this.durationBeats,
      this.scheduler.scheduledUntilSec,
      scheduleUntil,
      this.mixer,
    );

    this.scheduler.scheduledUntilSec = scheduleUntil;

    // Auto-stop at session end
    if (
      !this.scheduler.hasActiveLoop(this.session, this.durationBeats) &&
      currentBeat >= this.durationBeats
    ) {
      this.stop();
      this._onStop?.();
    }
  }

  // ── Public playback controls ──────────────────────────────────────────────

  async start(
    session: SoundLabSessionWithTracks,
    onBeatUpdate?: (beat: number) => void,
    onStop?: () => void,
    fromBeat = 0,
  ): Promise<void> {
    const ctx = this.ensureCtx();
    if (!ctx) return;

    this.stop();
    this.session = session;
    this.bpm = session.bpm;
    this.durationBeats = session.durationBeats;
    this._onBeatUpdate = onBeatUpdate;
    this._onStop = onStop;

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        return;
      }
    }

    // Build track buses & start entrainment/noise
    for (const track of session.tracks) {
      const bus = this.mixer.buildTrackBus(ctx, track);
      if (track.type === 'entrainment') {
        const nodes = startEntrainmentTrack(
          ctx,
          track,
          bus,
          this.mixer.melodicSubBus,
        );
        this.entrainmentNodes.set(track.id, nodes);
      }
      if (track.type === 'noise') {
        const src = startNoiseTrack(ctx, track, bus);
        this.noiseNodes.set(track.id, src);
      }
    }
    this.mixer.applyTrackMix(ctx);

    this.scheduler.playStartSec = ctx.currentTime;
    this.scheduler.playStartBeat = Math.max(
      0,
      Math.min(session.durationBeats, fromBeat),
    );
    if (
      this.scheduler.hasActiveLoop(session, session.durationBeats) &&
      this.scheduler.playStartBeat >=
        this.scheduler.getLoopEndBeat(session, session.durationBeats)
    ) {
      this.scheduler.playStartBeat = session.loopStartBeat;
    }
    this.scheduler.scheduledUntilSec = ctx.currentTime;
    this._isPlaying = true;

    this.scheduler.start(() => this.tick(), 25);
  }

  async resume(fromBeat: number): Promise<void> {
    if (!this.session) return;
    await this.start(this.session, this._onBeatUpdate, this._onStop, fromBeat);
  }

  stop(): void {
    this.scheduler.stop();
    this._isPlaying = false;

    // Stop entrainment nodes
    for (const [, nodes] of this.entrainmentNodes) {
      stopEntrainmentTrack(this.ctx, nodes, this.mixer.melodicSubBus);
    }
    this.entrainmentNodes.clear();

    // Stop noise nodes
    for (const [, src] of this.noiseNodes) {
      try {
        src.stop();
      } catch {
        /* */
      }
      src.disconnect();
    }
    this.noiseNodes.clear();

    // Disconnect mixer buses & effects
    this.mixer.disconnectAll();
  }

  updateBpm(bpm: number): void {
    const nextBpm = Math.max(40, Math.min(220, bpm));
    if (this._isPlaying && this.ctx) {
      const currentBeat =
        this.scheduler.playStartBeat +
        secondsToBeat(
          this.ctx.currentTime - this.scheduler.playStartSec,
          this.bpm,
        );
      this.scheduler.playStartBeat = currentBeat;
      this.scheduler.playStartSec = this.ctx.currentTime;
    }
    this.bpm = nextBpm;
  }

  updateSession(data: SoundLabSessionWithTracks): void {
    const bpmChanged = data.bpm !== this.bpm;
    this.session = data;
    this.durationBeats = data.durationBeats;
    if (bpmChanged) this.updateBpm(data.bpm);
    for (const track of data.tracks) {
      const settings = this.mixer.trackSettings.get(track.id);
      if (!settings) continue;
      settings.volume = track.volume;
      settings.muted = track.muted;
      settings.solo = track.solo;
      this.updateTrackPan(track.id, track.pan);
    }
    this.mixer.applyTrackMix(this.ctx);
  }

  updateTrackVolume(trackId: string, volume: number): void {
    this.mixer.updateTrackVolume(this.ctx, trackId, volume);
  }

  updateTrackMute(trackId: string, muted: boolean): void {
    this.mixer.updateTrackMute(this.ctx, trackId, muted);
  }

  updateTrackSolo(trackId: string, solo: boolean): void {
    this.mixer.updateTrackSolo(this.ctx, trackId, solo);
  }

  updateTrackPan(trackId: string, pan: number): void {
    this.mixer.updateTrackPan(this.ctx, trackId, pan);
  }

  updateEntrainmentTrack(trackId: string, config: SoundLabTrackConfig): void {
    const track = this.session?.tracks.find((item) => item.id === trackId);
    if (!track || track.type !== 'entrainment') return;
    const previousMode = track.config.mode ?? 'binaural';
    const nextMode = config.mode ?? 'binaural';
    track.config = { ...track.config, ...config };
    if (!this._isPlaying) return;
    if (previousMode !== nextMode) {
      const existing = this.entrainmentNodes.get(trackId);
      if (existing) {
        stopEntrainmentTrack(this.ctx, existing, this.mixer.melodicSubBus);
        this.entrainmentNodes.delete(trackId);
      }
      const bus = this.mixer.trackBuses.get(trackId);
      if (bus && this.ctx) {
        const nodes = startEntrainmentTrack(
          this.ctx,
          track,
          bus,
          this.mixer.melodicSubBus,
        );
        this.entrainmentNodes.set(trackId, nodes);
      }
      return;
    }

    const nodes = this.entrainmentNodes.get(trackId);
    if (!nodes || !this.ctx) return;
    updateEntrainmentNodes(
      this.ctx,
      nodes,
      track.config,
      this.mixer.melodicSubBus,
    );
  }

  updateTrackEffects(trackId: string, cfg: SoundLabTrackConfig): void {
    this.mixer.updateTrackEffects(trackId, cfg);
  }

  async dispose(): Promise<void> {
    this.stop();
    this.mixer.dispose();
    if (this.ctx) {
      try {
        await this.ctx.close();
      } catch {
        /* */
      }
      this.ctx = null;
    }
  }
}
