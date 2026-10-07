/**
 * lib/focus-audio.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Focus soundscape mixer. Owns one reusable Web Audio graph, with independent
 * ambience, synthesized noise and tone buses feeding a dynamics-compressed
 * master. Ambient clips are local OGG assets so playback works offline.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import forestClip from '@/renderer/focus-audio/forest.ogg?url';
import rainClip from '@/renderer/focus-audio/rain.ogg?url';
import wavesClip from '@/renderer/focus-audio/waves.ogg?url';

export type NoiseType = 'white' | 'pink' | 'brown';
export type SoundscapeClipId = 'forest' | 'rain' | 'waves';
export type ToneMode = 'off' | 'binaural' | 'isochronic';

export interface FocusSoundConfig {
  noise: NoiseType | null;
  noiseVolume: number;
  clip: SoundscapeClipId | null;
  clipVolume: number;
  toneMode: ToneMode;
  carrierHz: number;
  beatHz: number;
  toneVolume: number;
  /** Modulation depth for isochronic pulses, 0–1. */
  pulseDepth: number;
  masterVolume: number;
}

export const DEFAULT_SOUND_CONFIG: FocusSoundConfig = {
  noise: 'brown',
  noiseVolume: 0.28,
  clip: null,
  clipVolume: 0.3,
  toneMode: 'off',
  carrierHz: 220,
  beatHz: 10,
  toneVolume: 0.14,
  pulseDepth: 0.8,
  masterVolume: 0.75,
};

export const NOISE_META: Record<NoiseType, { label: string; hint: string }> = {
  white: { label: 'White', hint: 'Bright, masks speech' },
  pink: { label: 'Pink', hint: 'Balanced, natural' },
  brown: { label: 'Brown', hint: 'Deep, waterfall' },
};

export const SOUNDSCAPE_CLIPS: Record<
  SoundscapeClipId,
  { label: string; hint: string; file: string }
> = {
  forest: { label: 'Forest', hint: 'Birds and woodland ambience', file: forestClip },
  rain: { label: 'Rain', hint: 'Summer rain on a terrace', file: rainClip },
  waves: { label: 'Waves', hint: 'Sea waves and distant seabirds', file: wavesClip },
};

export const BRAINWAVE_PRESETS = [
  { label: 'Delta', beatHz: 2.5, hint: 'Slow pulse' },
  { label: 'Theta', beatHz: 6, hint: 'Gentle pulse' },
  { label: 'Alpha', beatHz: 10, hint: 'Steady pulse' },
  { label: 'Beta', beatHz: 18, hint: 'Brisk pulse' },
] as const;

export const SOUNDSCAPE_PRESETS = [
  {
    id: 'deep-work',
    label: 'Deep work',
    config: { noise: 'brown', clip: null, toneMode: 'off' },
  },
  {
    id: 'rain-room',
    label: 'Rain room',
    config: { noise: null, clip: 'rain', toneMode: 'off' },
  },
  {
    id: 'forest-focus',
    label: 'Forest focus',
    config: { noise: null, clip: 'forest', toneMode: 'off' },
  },
  {
    id: 'soft-pulse',
    label: 'Soft pulse',
    config: { noise: 'brown', clip: null, toneMode: 'isochronic' },
  },
] as const;

export function fillWhite(out: Float32Array): void {
  for (let i = 0; i < out.length; i++) out[i] = Math.random() * 2 - 1;
}

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
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
}

export function fillBrown(out: Float32Array): void {
  let last = 0;
  for (let i = 0; i < out.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    out[i] = last * 3.5;
  }
}

export function generateNoise(type: NoiseType, length: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(length);
  if (type === 'white') fillWhite(out);
  else if (type === 'pink') fillPink(out);
  else fillBrown(out);
  return out;
}

export function binauralFrequencies(
  carrierHz: number,
  beatHz: number,
): { left: number; right: number } {
  const safeBeat = Math.max(0, Math.min(40, beatHz));
  const safeCarrier = Math.max(40, carrierHz, safeBeat / 2 + 1);
  return { left: safeCarrier - safeBeat / 2, right: safeCarrier + safeBeat / 2 };
}

type AudioCtor = typeof AudioContext;
function getAudioContextCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

/** Web Audio mixer; all source buses pass through one compressor and master gain. */
export class FocusAudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private noiseGain: GainNode | null = null;
  private clipGain: GainNode | null = null;
  private toneGain: GainNode | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private clipSource: AudioBufferSourceNode | null = null;
  private oscillators: OscillatorNode[] = [];
  private pulseModulation: GainNode | null = null;
  private config = DEFAULT_SOUND_CONFIG;
  private playing = false;
  private generation = 0;
  private decodedClips = new Map<SoundscapeClipId, AudioBuffer>();

  get isPlaying(): boolean {
    return this.playing;
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -16;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 8;
    this.compressor.attack.value = 0.008;
    this.compressor.release.value = 0.2;
    this.master.connect(this.compressor).connect(this.ctx.destination);
    return this.ctx;
  }

  async start(config: FocusSoundConfig = this.config): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    this.stop();
    const generation = this.generation;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        return;
      }
    }
    this.config = config;
    this.master.gain.setTargetAtTime(clamp(config.masterVolume), ctx.currentTime, 0.04);
    if (config.noise) this.buildNoise(ctx, config);
    if (config.clip) {
      try {
        await this.buildClip(ctx, config, generation);
      } catch (error) {
        console.warn('Could not load focus ambience clip:', error);
      }
    }
    if (config.toneMode !== 'off') this.buildTone(ctx, config);
    this.playing = Boolean(config.noise || config.clip || config.toneMode !== 'off');
  }

  private buildNoise(ctx: AudioContext, config: FocusSoundConfig): void {
    if (!this.master || !config.noise) return;
    const length = Math.floor(ctx.sampleRate * 4);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    buffer.copyToChannel(generateNoise(config.noise, length), 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = clamp(config.noiseVolume);
    source.connect(gain).connect(this.master);
    source.start();
    this.noiseSource = source;
    this.noiseGain = gain;
  }

  private async buildClip(ctx: AudioContext, config: FocusSoundConfig, generation: number): Promise<void> {
    if (!this.master || !config.clip) return;
    let buffer = this.decodedClips.get(config.clip);
    if (!buffer) {
      const file = SOUNDSCAPE_CLIPS[config.clip].file;
      const response = await fetch(file);
      if (!response.ok) throw new Error(`Clip request failed (${response.status})`);
      buffer = await ctx.decodeAudioData(await response.arrayBuffer());
      this.decodedClips.set(config.clip, buffer);
    }
    // A newer config may have been applied during fetch/decode.
    if (generation !== this.generation || this.config.clip !== config.clip) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = clamp(config.clipVolume);
    source.connect(gain).connect(this.master!);
    source.start();
    this.clipSource = source;
    this.clipGain = gain;
  }

  private buildTone(ctx: AudioContext, config: FocusSoundConfig): void {
    if (!this.master) return;
    const toneBus = ctx.createGain();
    toneBus.gain.value = clamp(config.toneVolume);
    toneBus.connect(this.master);
    this.toneGain = toneBus;
    const { left, right } = binauralFrequencies(config.carrierHz, config.beatHz);
    if (config.toneMode === 'binaural') {
      for (const [frequency, pan] of [[left, -1], [right, 1]] as const) {
        const osc = ctx.createOscillator();
        const panner = ctx.createStereoPanner();
        osc.type = 'sine';
        osc.frequency.value = frequency;
        panner.pan.value = pan;
        osc.connect(panner).connect(toneBus);
        osc.start();
        this.oscillators.push(osc);
      }
      return;
    }
    // Isochronic: a carrier is amplitude-modulated by a smooth, unipolar LFO.
    // A 0.5 DC offset makes each beat a distinct pulse while avoiding hard gates.
    const carrier = ctx.createOscillator();
    const pulse = ctx.createOscillator();
    const pulseGain = ctx.createGain();
    const modulation = ctx.createGain();
    carrier.type = 'sine';
    carrier.frequency.value = Math.max(40, config.carrierHz);
    pulse.type = 'sine';
    pulse.frequency.value = clamp(config.beatHz, 0.5, 40);
    pulseGain.gain.value = 0.5;
    modulation.gain.value = clamp(config.pulseDepth) * 0.5;
    this.pulseModulation = modulation;
    pulse.connect(modulation).connect(pulseGain.gain);
    carrier.connect(pulseGain).connect(toneBus);
    carrier.start();
    pulse.start();
    this.oscillators.push(carrier, pulse);
  }

  update(config: FocusSoundConfig): void {
    const prev = this.config;
    this.config = config;
    if (!this.playing) return;
    const graphChange = prev.noise !== config.noise || prev.clip !== config.clip || prev.toneMode !== config.toneMode;
    if (graphChange) {
      void this.start(config);
      return;
    }
    const now = this.ctx?.currentTime ?? 0;
    this.master?.gain.setTargetAtTime(clamp(config.masterVolume), now, 0.04);
    this.noiseGain?.gain.setTargetAtTime(clamp(config.noiseVolume), now, 0.04);
    this.clipGain?.gain.setTargetAtTime(clamp(config.clipVolume), now, 0.04);
    this.toneGain?.gain.setTargetAtTime(clamp(config.toneVolume), now, 0.04);
    if (config.toneMode === 'binaural' && this.oscillators.length === 2) {
      const frequencies = binauralFrequencies(config.carrierHz, config.beatHz);
      this.oscillators[0].frequency.setTargetAtTime(frequencies.left, now, 0.04);
      this.oscillators[1].frequency.setTargetAtTime(frequencies.right, now, 0.04);
    } else if (config.toneMode === 'isochronic' && this.oscillators.length === 2) {
      this.oscillators[0].frequency.setTargetAtTime(Math.max(40, config.carrierHz), now, 0.04);
      this.oscillators[1].frequency.setTargetAtTime(clamp(config.beatHz, 0.5, 40), now, 0.04);
      if (this.pulseModulation) this.pulseModulation.gain.setTargetAtTime(clamp(config.pulseDepth) * 0.5, now, 0.04);
    }
  }

  stop(): void {
    this.generation++;
    for (const source of [this.noiseSource, this.clipSource]) {
      try { source?.stop(); } catch { /* source already stopped */ }
      source?.disconnect();
    }
    for (const osc of this.oscillators) {
      try { osc.stop(); } catch { /* oscillator already stopped */ }
      osc.disconnect();
    }
    this.noiseGain?.disconnect();
    this.clipGain?.disconnect();
    this.toneGain?.disconnect();
    this.pulseModulation?.disconnect();
    this.noiseSource = null;
    this.clipSource = null;
    this.noiseGain = null;
    this.clipGain = null;
    this.toneGain = null;
    this.pulseModulation = null;
    this.oscillators = [];
    this.playing = false;
  }

  async dispose(): Promise<void> {
    this.stop();
    if (this.ctx) {
      try { await this.ctx.close(); } catch { /* context already closed */ }
      this.ctx = null;
      this.master = null;
      this.compressor = null;
      this.decodedClips.clear();
    }
  }
}
