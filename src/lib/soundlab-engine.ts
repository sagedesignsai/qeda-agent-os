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
} from './soundlab-types';
import { SYNTH_PRESET_META } from './soundlab-types';

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
  if (beat >= points[points.length - 1].beat)
    return points[points.length - 1].value;
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
  const w = window as unknown as {
    AudioContext?: AudioCtor;
    webkitAudioContext?: AudioCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));

export function getTrackOutputGain(
  volume: number,
  muted: boolean,
  solo: boolean,
  hasAudibleSolo: boolean,
): number {
  return muted || (hasAudibleSolo && !solo) ? 0 : clamp(volume);
}

/** Unipolar AM envelope coefficients; resulting gain stays in [1-depth, 1]. */
export function getAmEnvelope(depth: number): {
  offset: number;
  amplitude: number;
} {
  const safeDepth = clamp(depth);
  return { offset: 1 - safeDepth / 2, amplitude: safeDepth / 2 };
}

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
  private trackPanners = new Map<string, StereoPannerNode>();
  private trackSettings = new Map<
    string,
    Pick<SoundLabTrack, 'volume' | 'muted' | 'solo' | 'pan'>
  >();
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

  get isPlaying(): boolean {
    return this._isPlaying;
  }

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
    this.melodicSubBus.connect(this.master);
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

    const effects: TrackEffects = {
      eq: null,
      reverb: null,
      delay: null,
      input: bus,
      output: bus,
    };
    let last: AudioNode = bus;

    if (cfg.eq) {
      const eq = createEQ(ctx);
      last.connect(eq.input);
      eq.setGains(
        cfg.eq.lowGain,
        cfg.eq.midGain,
        cfg.eq.highGain,
        cfg.eq.midFreq,
      );
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

    const nodes: EntrainmentNodes = {
      oscillators: [],
      lfo: null,
      lfoGain: null,
      carrierGain: null,
    };

    if (mode === 'binaural') {
      const { left, right } = binauralFrequencies(carrierHz, beatHz);
      for (const [freq, pan] of [
        [left, -1],
        [right, 1],
      ] as const) {
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
      // Apply unipolar AM to the melodic bus: depth 1 spans 0..1, never negative.
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = beatHz;
      const envelope = getAmEnvelope(amDepth);
      lfoGain.gain.value = envelope.amplitude;
      this.melodicSubBus!.gain.value = envelope.offset;
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
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
      osc.disconnect();
    }
    nodes.lfo?.disconnect();
    nodes.lfoGain?.disconnect();
    nodes.carrierGain?.disconnect();
    if (this.amLfo === nodes.lfo) {
      if (this.ctx && this.melodicSubBus) {
        this.melodicSubBus.gain.setTargetAtTime(1, this.ctx.currentTime, 0.04);
      }
      this.amLfo = null;
      this.amLfoGain = null;
    }
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
      case 'kick':
        this.scheduleKick(time, bus);
        break;
      case 'snare':
        this.scheduleSnare(time, bus);
        break;
      case 'hihat':
        this.scheduleHihat(time, bus);
        break;
      case 'clap':
        this.scheduleClap(time, bus);
        break;
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
    setTimeout(() => bus.disconnect(), voice === 'kick' ? 700 : 450);
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
    const attack = cfg.attack ?? preset?.attack ?? 0.01;
    const decay = cfg.decay ?? preset?.decay ?? 0.1;
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
    gain.gain.linearRampToValueAtTime(
      sustain * velocity,
      startSec + attack + decay,
    );
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

    const elapsedSec = ctx.currentTime - this.playStartSec;
    const absoluteBeat =
      this.playStartBeat + secondsToBeat(elapsedSec, this.bpm);
    const currentBeat = this.transportBeat(absoluteBeat);
    this._onBeatUpdate?.(currentBeat);
    this.applyAutomation(currentBeat);
    if (this.scheduledUntilSec >= scheduleUntil) return;

    this.scheduleWindow(this.scheduledUntilSec, scheduleUntil);

    this.scheduledUntilSec = scheduleUntil;

    // Auto-stop at session end
    if (!this.hasActiveLoop() && currentBeat >= this.durationBeats) {
      this.stop();
      this._onStop?.();
    }
  }

  private hasActiveLoop(): boolean {
    const session = this.session;
    return Boolean(
      session?.loopEnabled &&
      Number.isFinite(session.loopStartBeat) &&
      Number.isFinite(session.loopEndBeat) &&
      session.loopStartBeat >= 0 &&
      session.loopEndBeat > session.loopStartBeat &&
      session.loopStartBeat < this.durationBeats,
    );
  }

  private getLoopEndBeat(): number {
    return Math.min(
      this.session?.loopEndBeat ?? this.durationBeats,
      this.durationBeats,
    );
  }

  private transportBeat(absoluteBeat: number): number {
    if (!this.hasActiveLoop()) return absoluteBeat;
    const start = this.session!.loopStartBeat;
    const end = this.getLoopEndBeat();
    const length = end - start;
    if (absoluteBeat < end) return absoluteBeat;
    return start + ((absoluteBeat - start) % length);
  }

  /** Schedule each side of a loop seam against its corresponding timeline beats. */
  private scheduleWindow(fromSec: number, toSec: number): void {
    let segmentStartSec = fromSec;
    // Each pass either reaches the end of this scheduling window or advances
    // to a loop boundary, so this loop is bounded by the lookahead duration.
    while (segmentStartSec < toSec) {
      const absoluteBeat =
        this.playStartBeat +
        secondsToBeat(segmentStartSec - this.playStartSec, this.bpm);
      const segmentBeat = this.transportBeat(absoluteBeat);
      const loops = this.hasActiveLoop();
      const boundaryBeat = loops ? this.getLoopEndBeat() : this.durationBeats;
      const remainingBeats = Math.max(0, boundaryBeat - segmentBeat);
      const boundarySec =
        segmentStartSec + beatToSeconds(remainingBeats, this.bpm);
      const segmentEndSec = Math.min(toSec, boundarySec);
      if (segmentEndSec <= segmentStartSec) {
        // Guard against a floating-point boundary that would otherwise stall.
        if (!loops) return;
        segmentStartSec += 0.000001;
        continue;
      }
      const segmentEndBeat =
        segmentBeat + secondsToBeat(segmentEndSec - segmentStartSec, this.bpm);

      for (const track of this.session!.tracks) {
        if (track.type === 'entrainment' || track.type === 'noise') continue;
        const bus = this.trackBuses.get(track.id);
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
            segmentStartSec +
            beatToSeconds(clip.startBeat - segmentBeat, this.bpm);
          if (track.type === 'drums') {
            this.scheduleDrumSteps(
              pattern,
              clip,
              clipStartSec,
              segmentStartSec,
              segmentEndSec,
              bus,
            );
          } else {
            this.schedulePatternNotes(
              pattern,
              clip,
              clipStartSec,
              segmentStartSec,
              segmentEndSec,
              bus,
              track.config,
            );
          }
        }
      }

      segmentStartSec = segmentEndSec;
    }
  }

  private applyAutomation(beat: number): void {
    if (!this.ctx || !this.session) return;
    const now = this.ctx.currentTime;

    for (const track of this.session.tracks) {
      for (const lane of track.automation) {
        const value = interpolateAutomation(lane.points, beat);
        if (value === null) continue;

        if (lane.parameterId === 'track.volume') {
          const settings = this.trackSettings.get(track.id);
          const bus = this.trackBuses.get(track.id);
          if (!settings || !bus) continue;
          settings.volume = clamp(value);
          const anySolo = [...this.trackSettings.values()].some(
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
          this.trackPanners
            .get(track.id)
            ?.pan.setTargetAtTime(Math.max(-1, Math.min(1, value)), now, 0.04);
        } else if (
          lane.parameterId === 'entrainment.beatHz' ||
          lane.parameterId === 'entrainment.carrierHz' ||
          lane.parameterId === 'entrainment.depth'
        ) {
          const nodes = this.entrainmentNodes.get(track.id);
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
            if (mode === 'am-embed' && this.melodicSubBus) {
              this.melodicSubBus.gain.setTargetAtTime(
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
        const noteAbsStartSec =
          clipStartSec + beatToSeconds(note.startBeat + loopOffset, this.bpm);
        const noteAbsEndSec =
          noteAbsStartSec + beatToSeconds(note.durationBeats, this.bpm);
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
        // Loop steps over clip duration
        let loopOffset = 0;
        while (loopOffset < clip.durationBeats) {
          const t =
            clipStartSec + beatToSeconds(stepBeat + loopOffset, this.bpm);
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

    // Build track buses
    for (const track of session.tracks) {
      this.buildTrackBus(track);
      if (track.type === 'entrainment') this.startEntrainmentTrack(track);
      if (track.type === 'noise') this.startNoiseTrack(track);
    }
    this.applyTrackMix();

    this.playStartSec = ctx.currentTime;
    this.playStartBeat = Math.max(0, Math.min(session.durationBeats, fromBeat));
    if (this.hasActiveLoop() && this.playStartBeat >= this.getLoopEndBeat()) {
      this.playStartBeat = session.loopStartBeat;
    }
    this.scheduledUntilSec = ctx.currentTime;
    this._isPlaying = true;

    this.schedulerTimer = setInterval(() => this.tick(), 25);
  }

  async resume(fromBeat: number): Promise<void> {
    if (!this.session) return;
    await this.start(this.session, this._onBeatUpdate, this._onStop, fromBeat);
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
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
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
    this.trackPanners.clear();
    this.trackSettings.clear();

    // Clear AM LFO
    if (this.amLfo) {
      try {
        this.amLfo.stop();
      } catch {
        /* */
      }
      this.amLfo.disconnect();
      this.amLfo = null;
    }
    this.amLfoGain?.disconnect();
    this.amLfoGain = null;
    if (this.melodicSubBus && this.ctx) {
      this.melodicSubBus.gain.cancelScheduledValues(this.ctx.currentTime);
      this.melodicSubBus.gain.setValueAtTime(1, this.ctx.currentTime);
    }
  }

  updateBpm(bpm: number): void {
    const nextBpm = Math.max(40, Math.min(220, bpm));
    if (this._isPlaying && this.ctx) {
      const currentBeat =
        this.playStartBeat +
        secondsToBeat(this.ctx.currentTime - this.playStartSec, this.bpm);
      this.playStartBeat = currentBeat;
      this.playStartSec = this.ctx.currentTime;
    }
    this.bpm = nextBpm;
  }

  updateSession(data: SoundLabSessionWithTracks): void {
    const bpmChanged = data.bpm !== this.bpm;
    this.session = data;
    this.durationBeats = data.durationBeats;
    if (bpmChanged) this.updateBpm(data.bpm);
    for (const track of data.tracks) {
      const settings = this.trackSettings.get(track.id);
      if (!settings) continue;
      settings.volume = track.volume;
      settings.muted = track.muted;
      settings.solo = track.solo;
      this.updateTrackPan(track.id, track.pan);
    }
    this.applyTrackMix();
  }

  updateTrackVolume(trackId: string, volume: number): void {
    const bus = this.trackBuses.get(trackId);
    if (!bus || !this.ctx) return;
    const settings = this.trackSettings.get(trackId);
    if (settings) settings.volume = clamp(volume);
    this.applyTrackMix();
  }

  updateTrackMute(trackId: string, muted: boolean): void {
    const settings = this.trackSettings.get(trackId);
    if (!settings) return;
    settings.muted = muted;
    this.applyTrackMix();
  }

  updateTrackSolo(trackId: string, solo: boolean): void {
    const settings = this.trackSettings.get(trackId);
    if (!settings) return;
    settings.solo = solo;
    this.applyTrackMix();
  }

  updateTrackPan(trackId: string, pan: number): void {
    const panner = this.trackPanners.get(trackId);
    if (!panner || !this.ctx) return;
    const value = Math.max(-1, Math.min(1, pan));
    const settings = this.trackSettings.get(trackId);
    if (settings) settings.pan = value;
    panner.pan.setTargetAtTime(value, this.ctx.currentTime, 0.02);
  }

  updateEntrainmentTrack(trackId: string, config: SoundLabTrackConfig): void {
    const track = this.session?.tracks.find((item) => item.id === trackId);
    if (!track || track.type !== 'entrainment') return;
    const previousMode = track.config.mode ?? 'binaural';
    const nextMode = config.mode ?? 'binaural';
    track.config = { ...track.config, ...config };
    if (!this._isPlaying) return;
    if (previousMode !== nextMode) {
      this.stopEntrainmentTrack(trackId);
      this.startEntrainmentTrack(track);
      return;
    }

    const nodes = this.entrainmentNodes.get(trackId);
    if (!nodes || !this.ctx) return;
    const now = this.ctx.currentTime;
    const carrierHz = Math.max(
      40,
      Math.min(880, track.config.carrierHz ?? 220),
    );
    const beatHz = Math.max(0.5, Math.min(40, track.config.beatHz ?? 10));
    if (nextMode === 'binaural' && nodes.oscillators.length === 2) {
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
      nodes.oscillators[0].frequency.setTargetAtTime(carrierHz, now, 0.04);
      nodes.oscillators[1].frequency.setTargetAtTime(beatHz, now, 0.04);
    } else {
      nodes.lfo?.frequency.setTargetAtTime(beatHz, now, 0.04);
    }

    const envelope = getAmEnvelope(track.config.amDepth ?? 0.8);
    nodes.lfoGain?.gain.setTargetAtTime(envelope.amplitude, now, 0.04);
    if (nextMode === 'am-embed' && this.melodicSubBus) {
      this.melodicSubBus.gain.setTargetAtTime(envelope.offset, now, 0.04);
    }
  }

  private applyTrackMix(): void {
    if (!this.ctx) return;
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
      bus.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.02);
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

  async dispose(): Promise<void> {
    this.stop();
    if (this.ctx) {
      try {
        await this.ctx.close();
      } catch {
        /* */
      }
      this.ctx = null;
      this.master = null;
      this.compressor = null;
      this.melodicSubBus = null;
    }
  }
}
