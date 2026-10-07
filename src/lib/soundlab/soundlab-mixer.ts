/**
 * lib/soundlab/soundlab-mixer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Audio busing, stereo panning, effect inserts, and track routing for SoundLab.
 *
 * Signal Flow:
 *   Track Bus -> EQ -> Reverb -> Delay -> Stereo Panner
 *       |-> (Instrument tracks) -> Melodic Sub-Bus -> Master Bus -> Compressor -> Destination
 *       |-> (Drums/Noise/Entrainment) -------------> Master Bus -> Compressor -> Destination
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createEQ, createReverb, createDelay } from '../soundlab-effects';
import type { SoundLabTrack, SoundLabTrackConfig } from '../soundlab-types';
import { clamp, getTrackOutputGain } from './soundlab-math';

export interface TrackEffects {
  eq: ReturnType<typeof createEQ> | null;
  reverb: ReturnType<typeof createReverb> | null;
  delay: ReturnType<typeof createDelay> | null;
  input: GainNode;
  output: GainNode;
}

export class TrackMixer {
  master: GainNode | null = null;
  compressor: DynamicsCompressorNode | null = null;
  melodicSubBus: GainNode | null = null;

  trackBuses = new Map<string, GainNode>();
  trackPanners = new Map<string, StereoPannerNode>();
  trackSettings = new Map<
    string,
    Pick<SoundLabTrack, 'volume' | 'muted' | 'solo' | 'pan'>
  >();
  trackEffects = new Map<string, TrackEffects>();

  ensureMasterGraph(ctx: AudioContext): void {
    if (this.master && this.compressor && this.melodicSubBus) return;

    this.master = ctx.createGain();
    this.master.gain.value = 1.0;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -12;
    this.compressor.knee.value = 8;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.005;
    this.compressor.release.value = 0.1;

    // Melodic sub-bus feeds through the master bus
    this.melodicSubBus = ctx.createGain();
    this.melodicSubBus.connect(this.master);
    this.master.connect(this.compressor).connect(ctx.destination);
  }

  buildTrackBus(ctx: AudioContext, track: SoundLabTrack): GainNode {
    this.ensureMasterGraph(ctx);

    const cfg = track.config;
    const isInstrument = track.type === 'instrument';

    const bus = ctx.createGain();
    const effects: TrackEffects = {
      eq: null,
      reverb: null,
      delay: null,
      input: bus,
      output: bus,
    };

    let last: AudioNode = bus;

    // EQ insert
    if (cfg.eq) {
      const eq = createEQ(ctx);
      eq.setGains(
        cfg.eq.lowGain,
        cfg.eq.midGain,
        cfg.eq.highGain,
        cfg.eq.midFreq,
      );
      last.connect(eq.input);
      last = eq.output;
      effects.eq = eq;
    }

    // Reverb insert
    if (cfg.reverb) {
      const rev = createReverb(ctx);
      rev.setWet(cfg.reverb.wet);
      rev.setDecay(cfg.reverb.decay);
      last.connect(rev.input);
      last = rev.output;
      effects.reverb = rev;
    }

    // Delay insert
    if (cfg.delay) {
      const del = createDelay(ctx);
      del.setTime(cfg.delay.timeMs);
      del.setFeedback(cfg.delay.feedback);
      del.setWet(cfg.delay.wet);
      last.connect(del.input);
      last = del.output;
      effects.delay = del;
    }

    effects.output = last as GainNode;

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, track.pan));
    last.connect(panner);

    // Instrument tracks feed the melodic sub-bus (for am-embed modulation)
    if (isInstrument) {
      panner.connect(this.melodicSubBus!);
    } else {
      panner.connect(this.master!);
    }

    this.trackBuses.set(track.id, bus);
    this.trackPanners.set(track.id, panner);
    this.trackSettings.set(track.id, {
      volume: track.volume,
      muted: track.muted,
      solo: track.solo,
      pan: track.pan,
    });
    this.trackEffects.set(track.id, effects);
    return bus;
  }

  updateTrackVolume(ctx: AudioContext | null, trackId: string, volume: number): void {
    const settings = this.trackSettings.get(trackId);
    if (settings) settings.volume = clamp(volume);
    this.applyTrackMix(ctx);
  }

  updateTrackMute(ctx: AudioContext | null, trackId: string, muted: boolean): void {
    const settings = this.trackSettings.get(trackId);
    if (!settings) return;
    settings.muted = muted;
    this.applyTrackMix(ctx);
  }

  updateTrackSolo(ctx: AudioContext | null, trackId: string, solo: boolean): void {
    const settings = this.trackSettings.get(trackId);
    if (!settings) return;
    settings.solo = solo;
    this.applyTrackMix(ctx);
  }

  updateTrackPan(ctx: AudioContext | null, trackId: string, pan: number): void {
    const panner = this.trackPanners.get(trackId);
    if (!panner || !ctx) return;
    const value = Math.max(-1, Math.min(1, pan));
    const settings = this.trackSettings.get(trackId);
    if (settings) settings.pan = value;
    panner.pan.setTargetAtTime(value, ctx.currentTime, 0.02);
  }

  applyTrackMix(ctx: AudioContext | null): void {
    if (!ctx) return;
    const anySolo = [...this.trackSettings.values()].some(
      (settings) => settings.solo && !settings.muted,
    );
    for (const [id, settings] of this.trackSettings) {
      const bus = this.trackBuses.get(id);
      if (!bus) continue;
      const gain = getTrackOutputGain(
        settings.volume,
        settings.muted,
        settings.solo,
        anySolo,
      );
      bus.gain.setTargetAtTime(gain, ctx.currentTime, 0.02);
    }
  }

  updateTrackEffects(trackId: string, cfg: SoundLabTrackConfig): void {
    const fx = this.trackEffects.get(trackId);
    if (!fx) return;
    if (fx.eq && cfg.eq) {
      fx.eq.setGains(
        cfg.eq.lowGain,
        cfg.eq.midGain,
        cfg.eq.highGain,
        cfg.eq.midFreq,
      );
    }
    if (fx.reverb && cfg.reverb) {
      fx.reverb.setWet(cfg.reverb.wet);
      fx.reverb.setDecay(cfg.reverb.decay);
    }
    if (fx.delay && cfg.delay) {
      fx.delay.setTime(cfg.delay.timeMs);
      fx.delay.setFeedback(cfg.delay.feedback);
      fx.delay.setWet(cfg.delay.wet);
    }
  }

  disconnectAll(): void {
    for (const [, fx] of this.trackEffects) {
      fx.eq?.dispose();
      fx.reverb?.dispose();
      fx.delay?.dispose();
    }
    this.trackEffects.clear();

    for (const [, bus] of this.trackBuses) {
      try {
        bus.disconnect();
      } catch {
        /* */
      }
    }
    this.trackBuses.clear();
    this.trackPanners.clear();
    this.trackSettings.clear();
  }

  dispose(): void {
    this.disconnectAll();
    if (this.melodicSubBus) {
      try {
        this.melodicSubBus.disconnect();
      } catch {
        /* */
      }
      this.melodicSubBus = null;
    }
    if (this.master) {
      try {
        this.master.disconnect();
      } catch {
        /* */
      }
      this.master = null;
    }
    if (this.compressor) {
      try {
        this.compressor.disconnect();
      } catch {
        /* */
      }
      this.compressor = null;
    }
  }
}
