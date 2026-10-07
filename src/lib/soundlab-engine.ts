/**
 * lib/soundlab-engine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The SoundLab Web Audio engine. Owns one AudioContext, a compressor/master
 * bus, per-track sub-buses, a polyphonic MIDI synth, an 808-style drum
 * synthesizer, a noise generator, and an entrainment generator (binaural,
 * isochronic, monaural, am-embed).
 *
 * Lookahead scheduling: a 25 ms tick schedules all events within the next
 * 100 ms window using ctx.currentTime, which is immune to JS timer jitter.
 *
 * Dependencies on focus-audio.ts: binauralFrequencies() and generateNoise()
 * are imported directly — no duplication of existing logic.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { binauralFrequencies, generateNoise } from './focus-audio';
import { createEQ, createReverb, createDelay } from './soundlab-effects';
import type {
  SoundLabSessionWithTracks,
  SoundLabTrack,
  SoundLabPattern,
  SoundLabNote,
  SoundLabTrackConfig,
  DrumVoice,
  EntrainmentMode,
  BrainwaveBand,
} from './soundlab-types';
import { BRAINWAVE_BAND_META, SYNTH_PRESET_META } from './soundlab-types';

// ── Pure math utilities (exported for tests) ──────────────────────────────────

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function beatToSeconds(beat: number, bpm: number): number {
  return beat * (60 / bpm);
}

export function secondsToBeat(sec: number, bpm: number): number {
  return sec / (60 / bpm);
}

/** Linear interpolation between two automation points. */
export function interpolateAutomation(
  points: Array<{ beat: number; value: number }>,
  beat: number,
): number | null {
  if (!points.length) return null;
  if (beat <= points[0].beat) return points[0].value;
  if (beat >= points[points.length - 1].beat) return points[points.length - 1].value;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (beat >= a.beat && beat <= b.beat) {
      const t = (beat - a.beat) / (b.beat - a.beat);
      return a.value + (b.value - a.value) * t;
    }
  }
  return null;
}

// ── AudioContext factory ───────────────────────────────────────────────────────

type AudioCtor = typeof AudioContext;
function getAudioCtorSafe(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));

// ── Per-track effects bundle ──────────────────────────────────────────────────

interface TrackEffects {
  eq: ReturnType<typeof createEQ> | null;
  reverb: ReturnType<typeof createReverb> | null;
  delay: ReturnType<typeof createDelay> | null;
  input: GainNode;
  output: GainNode;
}

// ── Entrainment nodes bundle ──────────────────────────────────────────────────

interface EntrainmentNodes {
  oscillators: OscillatorNode[];
  lfo: OscillatorNode | null;
  lfoGain: GainNode | null;
  carrierGain: GainNode | null;
}

// ── Main engine ───────────────────────────────────────────────────────────────

export class SoundLabEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private melodicSubBus: GainNode | null = null;
  private amLfo: OscillatorNode | null = null;
  private amLfoGain: GainNode | null = null;

  private trackBuses = new Map<string, GainNode>();
  private trackEffects = new Map<string, TrackEffects>();
  private entrainmentNodes = new Map<string, EntrainmentNodes>();
  private noiseNodes = new Map<string, AudioBufferSourceNode>();

  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private scheduledUntilSec = 0;
  private playStartSec = 0;
  private playStartBeat = 0;
  private bpm = 120;
  private durationBeats = 64;
  private session: SoundLabSessionWithTracks | null = null;

  private _isPlaying = false;
  private _onBeatUpdate?: (beat: number) => void;
  private _onStop?: () => void;

  get isPlaying(): boolean { return this._isPlaying; }

  // ── Context ───────────────────────────────────────────────────────────────

  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = getAudioCtorSafe();
    if (!Ctor) return null;

    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -16;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 8;
    this.compressor.attack.value = 0.008;
    this.compressor.release.value = 0.2;

    // Melodic sub-bus feeds through the AM LFO node before master
    this.melodicSubBus = this.ctx.createGain();
    this.melodicSubBus.connect(this.compressor);
    this.master.connect(this.compressor).connect(this.ctx.destination);

    return this.ctx;
  }

  // ── Track bus + effects chain ─────────────────────────────────────────────

  private buildTrackBus(track: SoundLabTrack): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = clamp(track.volume);

    const isInstrument = track.type === 'instrument';
    const cfg = track.config;

    const effects: TrackEffects = { eq: null, reverb: null, delay: null, input: bus, output: bus };
    let last: AudioNode = bus;

    if (cfg.eq) {
      const eq = createEQ(ctx);
      last.connect(eq.input);
      eq.setGains(cfg.eq.lowGain, cfg.eq.midGain, cfg.eq.highGain, cfg.eq.midFreq);
      effects.eq = eq;
      last = eq.output;
    }
    if (cfg.reverb) {
      const rev = createReverb(ctx, cfg.reverb.decay);
      last.connect(rev.input);
      rev.setWet(cfg.reverb.wet);
      effects.reverb = rev;
      last = rev.output;
    }
    if (cfg.delay) {
      const del = createDelay(ctx);
      last.connect(del.input);
      del.setTime(cfg.delay.timeMs);
      del.setFeedback(cfg.delay.feedback);
      del.setWet(cfg.delay.wet);
      effects.delay = del;
      last = del.output;
    }

    effects.output = last as GainNode;

    // Instrument tracks feed the melodic sub-bus (for am-embed modulation)
    if (isInstrument) {
      last.connect(this.melodicSubBus!);
    } else {
      last.connect(this.master!);
    }

    this.trackBuses.set(track.id, bus);
    this.trackEffects.set(track.id, effects);
    return bus;
  }

  // ── Entrainment generator ─────────────────────────────────────────────────

  private startEntrainmentTrack(track: SoundLabTrack): void {
    const ctx = this.ctx!;
    const cfg = track.config;
    const mode: EntrainmentMode = cfg.mode ?? 'binaural';
    const carrierHz = cfg.carrierHz ?? 220;
    const beatHz = clamp(cfg.beatHz ?? 10, 0.5, 40);
    const amDepth = clamp(cfg.amDepth ?? 0.8);
    const bus = this.trackBuses.get(track.id);
    if (!bus) return;

    const nodes: EntrainmentNodes = { oscillators: [], lfo: null, lfoGain: null, carrierGain: null };

    if (mode === 'binaural') {
      const { left, right } = binauralFrequencies(carrierHz, beatHz);
      for (const [freq, pan] of [[left, -1], [right, 1]] as const) {
        const osc = ctx.createOscillator();
        const panner = ctx.createStereoPanner();
        osc.type = 'sine';
        osc.frequency.value = freq;
        panner.pan.value = pan;
        osc.connect(panner).connect(bus);
        osc.start();
        nodes.oscillators.push(osc);
      }
    } else if (mode === 'isochronic') {
      const carrier = ctx.createOscillator();
      const pulse = ctx.createOscillator();
      const pulseGain = ctx.createGain();
      const modGain = ctx.createGain();
      carrier.type = 'sine';
      carrier.frequency.value = carrierHz;
      pulse.type = 'sine';
      pulse.frequency.value = beatHz;
      pulseGain.gain.value = 0.5;
      modGain.gain.value = amDepth * 0.5;
      pulse.connect(modGain).connect(pulseGain.gain);
      carrier.connect(pulseGain).connect(bus);
      carrier.start();
      pulse.start();
      nodes.oscillators.push(carrier, pulse);
      nodes.lfo = pulse;
      nodes.lfoGain = modGain;
    } else if (mode === 'monaural') {
      // Single-channel AM — works on speakers
      const carrier = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const carrierBus = ctx.createGain();
      const modGain = ctx.createGain();
      carrier.type = 'sine';
      carrier.frequency.value = carrierHz;
      lfo.type = 'sine';
      lfo.frequency.value = beatHz;
      carrierBus.gain.value = 0.5;
      modGain.gain.value = amDepth * 0.5;
      lfo.connect(modGain).connect(carrierBus.gain);
      carrier.connect(carrierBus).connect(bus);
      carrier.start();
      lfo.start();
      nodes.oscillators.push(carrier, lfo);
      nodes.lfo = lfo;
      nodes.lfoGain = modGain;
      nodes.carrierGain = carrierBus;
    } else if (mode === 'am-embed') {
      // Brain.fm-style: LFO modulates the entire melodic sub-bus gain
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = beatHz;
      lfoGain.gain.value = amDepth * 0.5;
      lfo.connect(lfoGain).connect(this.melodicSubBus!.gain);
      lfo.start();
      nodes.lfo = lfo;
      nodes.lfoGain = lfoGain;
      this.amLfo = lfo;
      this.amLfoGain = lfoGain;
    }

    this.entrainmentNodes.set(track.id, nodes);
  }

  private stopEntrainmentTrack(trackId: string): void {
    const nodes = this.entrainmentNodes.get(trackId);
    if (!nodes) return;
    for (const osc of nodes.oscillators) {
      try { osc.stop(); } catch { /* already stopped */ }
      osc.disconnect();
    }
    nodes.lfo?.disconnect();
    nodes.lfoGain?.disconnect();
    nodes.carrierGain?.disconnect();
    this.entrainmentNodes.delete(trackId);
  }

  // ── Noise generator ───────────────────────────────────────────────────────

  private startNoiseTrack(track: SoundLabTrack): void {
    const ctx = this.ctx!;
    const noiseType = track.config.noiseType ?? 'brown';
    const bus = this.trackBuses.get(track.id);
    if (!bus) return;

    const length = Math.floor(ctx.sampleRate * 4);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    buffer.copyToChannel(generateNoise(noiseType, length), 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(bus);
    source.start();
    this.noiseNodes.set(track.id, source);
  }

  // ── Drum synthesizer ──────────────────────────────────────────────────────

  private scheduleKick(time: number, bus: GainNode): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
    gain.gain.setValueAtTime(1.0, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.5);
    osc.connect(gain).connect(bus);
    osc.start(time);
    osc.stop(time + 0.55);
  }

  private scheduleSnare(time: number, bus: GainNode): void {
    const ctx = this.ctx!;
    // Noise burst
    const length = Math.floor(ctx.sampleRate * 0.2);
    const buf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.7, time);
    ng.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
    noise.connect(ng).connect(bus);
    noise.start(time);
    noise.stop(time + 0.2);
    // Tone
    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.frequency.value = 180;
    og.gain.setValueAtTime(0.5, time);
    og.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
    osc.connect(og).connect(bus);
    osc.start(time);
    osc.stop(time + 0.15);
  }

  private scheduleHihat(time: number, bus: GainNode, open = false): void {
    const ctx = this.ctx!;
    const dur = open ? 0.3 : 0.05;
    const length = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 8000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    noise.connect(filter).connect(gain).connect(bus);
    noise.start(time);
    noise.stop(time + dur + 0.01);
  }

  private scheduleClap(time: number, bus: GainNode): void {
    const ctx = this.ctx!;
    for (let i = 0; i < 3; i++) {
      const t = time + i * 0.008;
      const length = Math.floor(ctx.sampleRate * 0.05);
      const buf = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let j = 0; j < length; j++) data[j] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.6 - i * 0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      noise.connect(gain).connect(bus);
      noise.start(t);
      noise.stop(t + 0.1);
    }
  }

  // Schedule a single drum voice at a specific time
  scheduleDrumHit(voice: DrumVoice, time: number, bus: GainNode): void {
    switch (voice) {
      case 'kick':  this.scheduleKick(time, bus); break;
      case 'snare': this.scheduleSnare(time, bus); break;
      case 'hihat': this.scheduleHihat(time, bus); break;
      case 'clap':  this.scheduleClap(time, bus); break;
    }
  }

  /** Immediate preview hit (for step sequencer UI feedback). */
  previewDrumHit(voice: DrumVoice): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const bus = ctx.createGain();
    bus.gain.value = 0.7;
    bus.connect(this.compressor ?? ctx.destination);
    this.scheduleDrumHit(voice, ctx.currentTime + 0.01, bus);
  }

  // ── Polyphonic instrument synth ───────────────────────────────────────────

  private scheduleNote(
    note: SoundLabNote,
    absoluteStartSec: number,
    bus: GainNode,
    cfg: SoundLabTrackConfig,
  ): void {
    const ctx = this.ctx!;

    const preset = cfg.preset ? SYNTH_PRESET_META[cfg.preset] : null;
    const waveform = cfg.waveform ?? preset?.waveform ?? 'sine';
    const attack  = cfg.attack  ?? preset?.attack  ?? 0.01;
    const decay   = cfg.decay   ?? preset?.decay   ?? 0.1;
    const sustain = cfg.sustain ?? preset?.sustain ?? 0.7;
    const release = cfg.release ?? preset?.release ?? 0.2;
    const velocity = clamp(note.velocity);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = waveform;
    osc.frequency.value = midiToHz(note.pitch);

    const startSec = absoluteStartSec;
    const endSec = startSec + beatToSeconds(note.durationBeats, this.bpm);

    gain.gain.setValueAtTime(0, startSec);
    gain.gain.linearRampToValueAtTime(velocity, startSec + attack);
    gain.gain.linearRampToValueAtTime(sustain * velocity, startSec + attack + decay);
    if (endSec - release > startSec + attack + decay) {
      gain.gain.setValueAtTime(sustain * velocity, endSec - release);
    }
    gain.gain.linearRampToValueAtTime(0, endSec);

    osc.connect(gain).connect(bus);
    osc.start(startSec);
    osc.stop(endSec + 0.05);
  }

  // ── Lookahead scheduler ───────────────────────────────────────────────────

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || !this._isPlaying || !this.session) return;

    const lookahead = 0.1; // 100 ms lookahead
    const scheduleUntil = ctx.currentTime + lookahead;

    if (this.scheduledUntilSec >= scheduleUntil) return;

    const fromSec = this.scheduledUntilSec;
    const toSec = scheduleUntil;

    for (const track of this.session.tracks) {
      if (track.muted || track.type === 'entrainment' || track.type === 'noise') continue;
      const bus = this.trackBuses.get(track.id);
      if (!bus) continue;

      for (const clip of track.clips) {
        const clipStartSec = this.playStartSec + beatToSeconds(clip.startBeat - this.playStartBeat, this.bpm);
        const clipEndSec   = clipStartSec + beatToSeconds(clip.durationBeats, this.bpm);

        if (clipEndSec <= fromSec || clipStartSec >= toSec) continue;

        const pattern = track.patterns.find((p) => p.id === clip.patternId);
        if (!pattern) continue;

        if (track.type === 'drums') {
          this.scheduleDrumSteps(pattern, clip, clipStartSec, fromSec, toSec, bus);
        } else {
          this.schedulePatternNotes(pattern, clip, clipStartSec, fromSec, toSec, bus, track.config);
        }
      }
    }

    this.scheduledUntilSec = scheduleUntil;

    // Advance playhead beat
    const elapsedSec = ctx.currentTime - this.playStartSec;
    const currentBeat = this.playStartBeat + secondsToBeat(elapsedSec, this.bpm);
    this._onBeatUpdate?.(currentBeat);

    // Auto-stop at session end
    if (currentBeat >= this.durationBeats) {
      this.stop();
      this._onStop?.();
    }
  }

  private schedulePatternNotes(
    pattern: SoundLabPattern,
    clip: { startBeat: number; durationBeats: number },
    clipStartSec: number,
    fromSec: number,
    toSec: number,
    bus: GainNode,
    cfg: SoundLabTrackConfig,
  ): void {
    const patternDurSec = beatToSeconds(pattern.lengthBeats, this.bpm);
    if (patternDurSec <= 0) return;

    for (const note of pattern.notes) {
      // Notes may repeat if clip is longer than pattern
      let loopOffset = 0;
      while (loopOffset < clip.durationBeats) {
        const noteAbsStartSec = clipStartSec + beatToSeconds(note.startBeat + loopOffset, this.bpm);
        const noteAbsEndSec = noteAbsStartSec + beatToSeconds(note.durationBeats, this.bpm);
        if (noteAbsStartSec >= toSec) break;
        if (noteAbsEndSec > fromSec && noteAbsStartSec >= fromSec) {
          this.scheduleNote(note, noteAbsStartSec, bus, cfg);
        }
        loopOffset += pattern.lengthBeats;
      }
    }
  }

  private scheduleDrumSteps(
    pattern: SoundLabPattern,
    clip: { startBeat: number; durationBeats: number },
    clipStartSec: number,
    fromSec: number,
    toSec: number,
    bus: GainNode,
  ): void {
    if (!pattern.stepData?.length) return;
    const voices: DrumVoice[] = ['kick', 'snare', 'hihat', 'clap'];
    const stepsPerBeat = 4; // 16 steps over 4 beats
    const stepDurSec = beatToSeconds(1 / stepsPerBeat, this.bpm);

    for (let voiceIdx = 0; voiceIdx < Math.min(voices.length, pattern.stepData.length); voiceIdx++) {
      const steps = pattern.stepData[voiceIdx];
      if (!steps) continue;
      for (let step = 0; step < 16; step++) {
        if (!steps[step]) continue;
        const stepBeat = (step / stepsPerBeat);
        // Loop steps over clip duration
        let loopOffset = 0;
        while (loopOffset < clip.durationBeats) {
          const t = clipStartSec + beatToSeconds(stepBeat + loopOffset, this.bpm);
          if (t >= toSec) break;
          if (t >= fromSec) {
            this.scheduleDrumHit(voices[voiceIdx], t, bus);
          }
          loopOffset += pattern.lengthBeats;
        }
      }
    }
    void stepDurSec; // suppress unused warning
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async start(
    session: SoundLabSessionWithTracks,
    onBeatUpdate?: (beat: number) => void,
    onStop?: () => void,
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
      try { await ctx.resume(); } catch { return; }
    }

    // Build track buses
    for (const track of session.tracks) {
      this.buildTrackBus(track);
      if (track.type === 'entrainment') this.startEntrainmentTrack(track);
      if (track.type === 'noise') this.startNoiseTrack(track);
    }

    this.playStartSec = ctx.currentTime;
    this.playStartBeat = 0;
    this.scheduledUntilSec = ctx.currentTime;
    this._isPlaying = true;

    this.schedulerTimer = setInterval(() => this.tick(), 25);
  }

  async resume(fromBeat: number): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || !this.session) return;
    if (ctx.state === 'suspended') await ctx.resume();
    this.playStartSec = ctx.currentTime;
    this.playStartBeat = fromBeat;
    this.scheduledUntilSec = ctx.currentTime;
    this._isPlaying = true;
    this.schedulerTimer = setInterval(() => this.tick(), 25);
  }

  stop(): void {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    this._isPlaying = false;

    // Stop entrainment and noise
    for (const trackId of this.entrainmentNodes.keys()) {
      this.stopEntrainmentTrack(trackId);
    }
    for (const [, src] of this.noiseNodes) {
      try { src.stop(); } catch { /* already stopped */ }
      src.disconnect();
    }
    this.noiseNodes.clear();

    // Dispose effects
    for (const [, fx] of this.trackEffects) {
      fx.eq?.dispose();
      fx.reverb?.dispose();
      fx.delay?.dispose();
    }
    this.trackEffects.clear();

    // Disconnect track buses
    for (const [, bus] of this.trackBuses) bus.disconnect();
    this.trackBuses.clear();

    // Clear AM LFO
    if (this.amLfo) {
      try { this.amLfo.stop(); } catch { /* */ }
      this.amLfo.disconnect();
      this.amLfo = null;
    }
    this.amLfoGain?.disconnect();
    this.amLfoGain = null;
  }

  updateBpm(bpm: number): void {
    this.bpm = Math.max(40, Math.min(220, bpm));
  }

  updateTrackVolume(trackId: string, volume: number): void {
    const bus = this.trackBuses.get(trackId);
    if (!bus || !this.ctx) return;
    bus.gain.setTargetAtTime(clamp(volume), this.ctx.currentTime, 0.02);
  }

  updateTrackMute(trackId: string, muted: boolean): void {
    const bus = this.trackBuses.get(trackId);
    if (!bus || !this.ctx) return;
    bus.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.02);
  }

  updateTrackEffects(trackId: string, cfg: SoundLabTrackConfig): void {
    const fx = this.trackEffects.get(trackId);
    if (!fx) return;
    if (fx.eq && cfg.eq) {
      fx.eq.setGains(cfg.eq.lowGain, cfg.eq.midGain, cfg.eq.highGain, cfg.eq.midFreq);
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

  async dispose(): Promise<void> {
    this.stop();
    if (this.ctx) {
      try { await this.ctx.close(); } catch { /* */ }
      this.ctx = null;
      this.master = null;
      this.compressor = null;
      this.melodicSubBus = null;
    }
  }
}
