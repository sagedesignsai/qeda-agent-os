/**
 * lib/soundscape/engine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Layered ambience playback on the shared mixer.
 *
 * Layers are decoded lazily and capped by an LRU (default 4 decoded buffers).
 * That cap is load-bearing: the long field recordings decode to tens of
 * megabytes each, so eagerly decoding all thirteen would cost ~200 MB of PCM
 * before the user has enabled a single layer.
 *
 * `update()` is incremental. Changing one volume must not rebuild the graph —
 * the old single-clip engine did rebuild on any graph change, which was
 * acceptable for one clip and is not for a mixer.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getAudioContext, resumeAudioContext } from '../audio/context';
import { getMixer, rampGain, type AudioMixer } from '../audio/mixer';
import { generateNoise } from '../audio/noise';
import type { SoundscapeLayerId, SoundscapeState } from '../music/types';
import {
  binauralFrequencies,
  SOUNDSCAPE_LAYERS,
} from './layers';

interface LayerNode {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

interface ToneGraph {
  oscillators: OscillatorNode[];
  gain: GainNode;
  pulseModulation: GainNode | null;
}

const MAX_DECODED_BUFFERS = 4;

function hasSources(state: SoundscapeState): boolean {
  return (
    Object.keys(state.layers).length > 0 ||
    state.noise !== null ||
    state.toneMode !== 'off'
  );
}

export class SoundscapeEngine {
  private mixer: AudioMixer | null = null;
  private state: SoundscapeState | null = null;
  private started = false;
  private layers = new Map<SoundscapeLayerId, LayerNode>();
  private buffers = new Map<SoundscapeLayerId, AudioBuffer>();
  private bufferOrder: SoundscapeLayerId[] = [];
  private noiseSource: AudioBufferSourceNode | null = null;
  private noiseType: string | null = null;
  private tone: ToneGraph | null = null;
  private syncing = false;
  private syncPending = false;

  get isPlaying(): boolean {
    return this.started && this.state !== null && hasSources(this.state);
  }

  get currentState(): SoundscapeState | null {
    return this.state;
  }

  async start(state: SoundscapeState): Promise<void> {
    const ctx = getAudioContext();
    if (!ctx) return;
    await resumeAudioContext();
    this.mixer = getMixer();
    if (!this.mixer) return;
    this.state = state;
    this.started = true;
    rampGain(this.mixer.soundscape, state.masterVolume, 0.08, ctx);
    this.applyNoise(state);
    this.applyTone(state);
    this.requestSync();
  }

  update(state: SoundscapeState): void {
    const previous = this.state;
    this.state = state;
    if (!this.started || !this.mixer) return;
    const ctx = getAudioContext();
    rampGain(this.mixer.soundscape, state.masterVolume, 0.05, ctx);
    if (!previous || previous.noise !== state.noise) this.applyNoise(state);
    if (
      !previous ||
      previous.toneMode !== state.toneMode ||
      previous.carrierHz !== state.carrierHz ||
      previous.beatHz !== state.beatHz ||
      previous.pulseDepth !== state.pulseDepth ||
      previous.toneVolume !== state.toneVolume
    ) {
      this.applyTone(state, previous ?? undefined);
    }
    this.requestSync();
  }

  stop(): void {
    this.started = false;
    for (const node of this.layers.values()) this.teardownLayer(node);
    this.layers.clear();
    this.stopNoise();
    this.stopTone();
    if (this.mixer) {
      rampGain(this.mixer.soundscape, 0, 0.08);
    }
  }

  /** Stop playback and release decoded PCM. The shared context stays alive. */
  dispose(): void {
    this.stop();
    this.buffers.clear();
    this.bufferOrder = [];
    this.state = null;
    this.mixer = null;
  }

  // ── Layers ──────────────────────────────────────────────────────────────

  private requestSync(): void {
    if (this.syncing) {
      this.syncPending = true;
      return;
    }
    void this.syncLayers();
  }

  private async syncLayers(): Promise<void> {
    if (!this.mixer || !this.state) return;
    this.syncing = true;
    try {
      const desired = this.state.layers;
      // Remove first so the buffer eviction pass can see what is still active.
      for (const [id, node] of this.layers) {
        if (!desired[id]) {
          this.teardownLayer(node);
          this.layers.delete(id);
        }
      }
      for (const id of Object.keys(desired) as SoundscapeLayerId[]) {
        if (!this.started) return;
        const cfg = desired[id];
        if (!cfg) continue;
        const existing = this.layers.get(id);
        if (existing) {
          const trim = SOUNDSCAPE_LAYERS[id]?.trim ?? 1;
          rampGain(existing.gain, cfg.volume * trim, 0.08);
          continue;
        }
        const buffer = await this.ensureBuffer(id);
        if (!buffer) continue;
        // State may have changed (or playback stopped) while decoding.
        if (!this.started || !this.state?.layers[id] || this.layers.has(id)) {
          continue;
        }
        const ctx = getAudioContext();
        if (!ctx) continue;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const layerMeta = SOUNDSCAPE_LAYERS[id];
        if (layerMeta?.loopStart !== undefined) source.loopStart = layerMeta.loopStart;
        if (layerMeta?.loopEnd !== undefined) source.loopEnd = layerMeta.loopEnd;
        const gain = ctx.createGain();
        const trim = SOUNDSCAPE_LAYERS[id]?.trim ?? 1;
        gain.gain.value = (this.state.layers[id]?.volume ?? 0) * trim;
        source.connect(gain).connect(this.mixer.soundscape);
        source.start();
        this.layers.set(id, { source, gain });
      }
    } finally {
      this.syncing = false;
      this.evictBuffers();
      if (this.syncPending) {
        this.syncPending = false;
        this.requestSync();
      }
    }
  }

  private async ensureBuffer(id: SoundscapeLayerId): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(id);
    if (cached) {
      this.touch(id);
      return cached;
    }
    const ctx = getAudioContext();
    if (!ctx) return null;
    const meta = SOUNDSCAPE_LAYERS[id];
    if (!meta) return null;
    try {
      const response = await fetch(meta.file);
      if (!response.ok) throw new Error(`clip request failed (${response.status})`);
      const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
      this.buffers.set(id, buffer);
      this.touch(id);
      return buffer;
    } catch (error) {
      console.warn('[soundscape] could not load', id, error);
      return null;
    }
  }

  private touch(id: SoundscapeLayerId): void {
    this.bufferOrder = this.bufferOrder.filter((entry) => entry !== id);
    this.bufferOrder.push(id);
  }

  private evictBuffers(): void {
    while (this.bufferOrder.length > MAX_DECODED_BUFFERS) {
      const candidate = this.bufferOrder.find((id) => !this.layers.has(id));
      if (!candidate) return;
      this.buffers.delete(candidate);
      this.bufferOrder = this.bufferOrder.filter((id) => id !== candidate);
    }
  }

  private teardownLayer(node: LayerNode): void {
    try {
      node.source.stop();
    } catch {
      /* already stopped */
    }
    node.source.disconnect();
    node.gain.disconnect();
  }

  // ── Noise ───────────────────────────────────────────────────────────────

  private applyNoise(state: SoundscapeState): void {
    const ctx = getAudioContext();
    const mixer = this.mixer;
    if (!ctx || !mixer) return;
    rampGain(mixer.noise, state.noise ? state.noiseVolume : 0, 0.08, ctx);
    if (!state.noise) {
      this.stopNoise();
      return;
    }
    if (this.noiseSource && this.noiseType === state.noise) return;
    this.stopNoise();
    const length = Math.floor(ctx.sampleRate * 4);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    buffer.copyToChannel(generateNoise(state.noise, length), 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(mixer.noise);
    source.start();
    this.noiseSource = source;
    this.noiseType = state.noise;
  }

  private stopNoise(): void {
    if (!this.noiseSource) return;
    try {
      this.noiseSource.stop();
    } catch {
      /* already stopped */
    }
    this.noiseSource.disconnect();
    this.noiseSource = null;
    this.noiseType = null;
  }

  // ── Tone ────────────────────────────────────────────────────────────────

  private applyTone(state: SoundscapeState, previous?: SoundscapeState): void {
    const ctx = getAudioContext();
    const mixer = this.mixer;
    if (!ctx || !mixer) return;
    if (state.toneMode === 'off') {
      this.stopTone();
      return;
    }
    rampGain(mixer.tone, state.toneVolume, 0.08, ctx);
    // Same mode: only frequencies/depth need updating, and rebuilding an
    // oscillator restarts its phase, which is audible as a click.
    if (previous && this.tone && previous.toneMode === state.toneMode) {
      this.updateToneParameters(state);
      return;
    }
    this.stopTone();
    const gain = ctx.createGain();
    gain.gain.value = 1;
    gain.connect(mixer.tone);
    const oscillators: OscillatorNode[] = [];
    let pulseModulation: GainNode | null = null;

    if (state.toneMode === 'binaural') {
      const { left, right } = binauralFrequencies(state.carrierHz, state.beatHz);
      for (const [frequency, pan] of [
        [left, -1],
        [right, 1],
      ] as const) {
        const osc = ctx.createOscillator();
        const panner = ctx.createStereoPanner();
        osc.type = 'sine';
        osc.frequency.value = frequency;
        panner.pan.value = pan;
        osc.connect(panner).connect(gain);
        osc.start();
        oscillators.push(osc);
      }
    } else {
      const carrier = ctx.createOscillator();
      const pulse = ctx.createOscillator();
      const pulseGain = ctx.createGain();
      const modulation = ctx.createGain();
      carrier.type = 'sine';
      carrier.frequency.value = Math.max(40, state.carrierHz);
      pulse.type = 'sine';
      pulse.frequency.value = Math.max(0.5, Math.min(40, state.beatHz));
      pulseGain.gain.value = 0.5;
      modulation.gain.value = state.pulseDepth * 0.5;
      pulseModulation = modulation;
      pulse.connect(modulation).connect(pulseGain.gain);
      carrier.connect(pulseGain).connect(gain);
      carrier.start();
      pulse.start();
      oscillators.push(carrier, pulse);
    }
    this.tone = { oscillators, gain, pulseModulation };
  }

  private updateToneParameters(state: SoundscapeState): void {
    if (!this.tone) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (state.toneMode === 'binaural' && this.tone.oscillators.length === 2) {
      const frequencies = binauralFrequencies(state.carrierHz, state.beatHz);
      this.tone.oscillators[0].frequency.setTargetAtTime(frequencies.left, now, 0.04);
      this.tone.oscillators[1].frequency.setTargetAtTime(frequencies.right, now, 0.04);
    } else if (state.toneMode === 'isochronic' && this.tone.oscillators.length === 2) {
      this.tone.oscillators[0].frequency.setTargetAtTime(
        Math.max(40, state.carrierHz),
        now,
        0.04,
      );
      this.tone.oscillators[1].frequency.setTargetAtTime(
        Math.max(0.5, Math.min(40, state.beatHz)),
        now,
        0.04,
      );
      if (this.tone.pulseModulation) {
        this.tone.pulseModulation.gain.setTargetAtTime(
          state.pulseDepth * 0.5,
          now,
          0.04,
        );
      }
    }
  }

  private stopTone(): void {
    if (!this.tone) return;
    for (const osc of this.tone.oscillators) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
      osc.disconnect();
    }
    this.tone.gain.disconnect();
    this.tone.pulseModulation?.disconnect();
    this.tone = null;
  }
}

let singleton: SoundscapeEngine | null = null;

export function getSoundscapeEngine(): SoundscapeEngine {
  if (!singleton) singleton = new SoundscapeEngine();
  return singleton;
}

/** Test hook. */
export function resetSoundscapeEngine(): void {
  singleton?.dispose();
  singleton = null;
}
