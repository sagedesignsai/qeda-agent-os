/**
 * lib/focus-audio.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * A tiny, dependency-free focus soundscape engine built on the Web Audio API.
 *
 *   • White / pink / brown noise, generated into a looping AudioBuffer.
 *   • Binaural beats, as two slightly-detuned oscillators hard-panned L/R.
 *
 * Everything is synthesized at runtime — no audio assets, no network, no
 * licensing. The sample generators are pure and exported on their own so they
 * can be unit-tested without an AudioContext.
 *
 * Noise algorithms follow the canonical recipes:
 *   white – uniform random samples
 *   pink  – Paul Kellet's refined -3 dB/octave approximation
 *   brown – leaky integration of white noise (≈ -6 dB/octave)
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type NoiseType = 'white' | 'pink' | 'brown';

export interface FocusSoundConfig {
  /** Which noise bed to play. `null` disables the bed. */
  noise: NoiseType | null;
  /** Noise bed volume, 0–1. */
  noiseVolume: number;
  /** Whether the binaural beat layer is on. */
  binaural: boolean;
  /** Base carrier frequency in Hz (lower = deeper). */
  carrierHz: number;
  /** Beat frequency between the ears, in Hz (e.g. 10 ≈ alpha). */
  beatHz: number;
  /** Binaural layer volume, 0–1. */
  binauralVolume: number;
}

export const DEFAULT_SOUND_CONFIG: FocusSoundConfig = {
  noise: 'brown',
  noiseVolume: 0.45,
  binaural: false,
  carrierHz: 200,
  beatHz: 10,
  binauralVolume: 0.22,
};

/** Human-facing metadata for the noise toggle group. */
export const NOISE_META: Record<NoiseType, { label: string; hint: string }> = {
  white: { label: 'White', hint: 'Bright, masks speech' },
  pink: { label: 'Pink', hint: 'Balanced, natural' },
  brown: { label: 'Brown', hint: 'Deep, waterfall' },
};

/** Common entrainment bands, shown as presets in the UI. */
export const BRAINWAVE_PRESETS = [
  { label: 'Delta', beatHz: 2.5, hint: 'Deep rest' },
  { label: 'Theta', beatHz: 6, hint: 'Calm focus' },
  { label: 'Alpha', beatHz: 10, hint: 'Flow' },
  { label: 'Beta', beatHz: 18, hint: 'Alert' },
] as const;

// ─── Pure sample generation ───────────────────────────────────────────────────

/** Fill `out` with white noise, uniform in [-1, 1]. */
export function fillWhite(out: Float32Array): void {
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.random() * 2 - 1;
  }
}

/** Fill `out` with pink noise (Paul Kellet's refined method). */
export function fillPink(out: Float32Array): void {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;

  for (let i = 0; i < out.length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    out[i] =
      (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
}

/** Fill `out` with brown/red noise (leaky integrator). */
export function fillBrown(out: Float32Array): void {
  let last = 0;
  for (let i = 0; i < out.length; i++) {
    const white = Math.random() * 2 - 1;
    const next = (last + 0.02 * white) / 1.02;
    last = next;
    out[i] = next * 3.5;
  }
}

/** Generate `length` samples of the given noise type. */
/**
 * Generate a noise buffer of `length` samples.
 *
 * The return type is pinned to `Float32Array<ArrayBuffer>` (not the default
 * `Float32Array<ArrayBufferLike>`) because `AudioBuffer.copyToChannel` only
 * accepts a view over a plain `ArrayBuffer`. `new Float32Array(length)` always
 * allocates one, so the narrower type is accurate.
 */
export function generateNoise(
  type: NoiseType,
  length: number,
): Float32Array<ArrayBuffer> {
  const out = new Float32Array(length);
  if (type === 'white') fillWhite(out);
  else if (type === 'pink') fillPink(out);
  else fillBrown(out);
  return out;
}

/**
 * Resolve the two oscillator frequencies for a binaural pair. The beat is the
 * difference between the ears, so it is split symmetrically around the carrier.
 */
export function binauralFrequencies(
  carrierHz: number,
  beatHz: number,
): { left: number; right: number } {
  return {
    left: carrierHz - beatHz / 2,
    right: carrierHz + beatHz / 2,
  };
}

// ─── Engine ───────────────────────────────────────────────────────────────────

type AudioCtor = typeof AudioContext;

function getAudioContextCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioCtor;
    webkitAudioContext?: AudioCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Imperative wrapper around a small Web Audio graph. One instance owns one
 * AudioContext for the lifetime of the app.
 *
 *   master ── destination
 *     ├── noiseGain ── looping AudioBufferSourceNode
 *     └── binauralGain ── pannerL ── oscL
 *                       └─ pannerR ── oscR
 */
export class FocusAudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseGain: GainNode | null = null;
  private binauralGain: GainNode | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private oscillators: OscillatorNode[] = [];
  private config: FocusSoundConfig = DEFAULT_SOUND_CONFIG;
  private playing = false;

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Lazily create the context + master bus. Returns null when unsupported. */
  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;

    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  /** Start (or restart) playback for the given config. */
  async start(config: FocusSoundConfig = this.config): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;

    this.stop();

    // Autoplay policies require the context to be resumed after a gesture.
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        /* resume can reject if there was no gesture; degrade silently */
      }
    }

    this.config = config;
    this.buildNoise(ctx, config);
    if (config.binaural) this.buildBinaural(ctx, config);
    this.playing = true;
  }

  private buildNoise(ctx: AudioContext, config: FocusSoundConfig): void {
    if (!config.noise || !this.master) return;

    // Two seconds is long enough that the loop point is inaudible.
    const length = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    buffer.copyToChannel(generateNoise(config.noise, length), 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gain = ctx.createGain();
    gain.gain.value = config.noiseVolume;

    source.connect(gain).connect(this.master);
    source.start();
    this.noiseSource = source;
    this.noiseGain = gain;
  }

  private buildBinaural(ctx: AudioContext, config: FocusSoundConfig): void {
    if (!this.master) return;
    const { left, right } = binauralFrequencies(config.carrierHz, config.beatHz);

    const gain = ctx.createGain();
    gain.gain.value = config.binauralVolume;
    gain.connect(this.master);

    const make = (freq: number, pan: number) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      osc.connect(panner).connect(gain);
      osc.start();
      this.oscillators.push(osc);
    };

    make(left, -1);
    make(right, 1);
    this.binauralGain = gain;
  }

  /**
   * Apply a new config. Structural changes (noise type on/off, binaural
   * on/off) force a rebuild; volume-only changes ramp in place to avoid clicks.
   */
  update(config: FocusSoundConfig): void {
    const prev = this.config;
    this.config = config;
    if (!this.playing) return;

    const structural =
      prev.noise !== config.noise || prev.binaural !== config.binaural;
    if (structural) {
      void this.start(config);
      return;
    }

    const now = this.ctx?.currentTime ?? 0;
    if (this.noiseGain) {
      this.noiseGain.gain.setTargetAtTime(config.noiseVolume, now, 0.05);
    }
    if (this.binauralGain) {
      this.binauralGain.gain.setTargetAtTime(
        config.binauralVolume,
        now,
        0.05,
      );
    }
  }

  /** Tear down all source nodes, leaving the context alive for reuse. */
  stop(): void {
    try {
      this.noiseSource?.stop();
    } catch {
      /* already stopped */
    }
    for (const osc of this.oscillators) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
    }
    this.noiseSource?.disconnect();
    this.noiseGain?.disconnect();
    for (const osc of this.oscillators) osc.disconnect();
    this.binauralGain?.disconnect();

    this.noiseSource = null;
    this.noiseGain = null;
    this.oscillators = [];
    this.binauralGain = null;
    this.playing = false;
  }

  /** Stop and release the AudioContext entirely. */
  async dispose(): Promise<void> {
    this.stop();
    if (this.ctx) {
      try {
        await this.ctx.close();
      } catch {
        /* already closed */
      }
      this.ctx = null;
      this.master = null;
    }
  }
}
