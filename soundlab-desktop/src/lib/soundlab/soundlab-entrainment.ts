/**
 * lib/soundlab/soundlab-entrainment.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Brainwave entrainment and ambient noise generators for SoundLab.
 *
 * Implements 4 distinct entrainment delivery paradigms:
 *   1. Binaural: Left/right frequency offset (f ± beatHz/2) merged into stereo.
 *   2. Isochronic: Periodic amplitude pulsing with pulse-width gain envelope.
 *   3. Monaural: Additive dual-frequency interference mixed down to mono.
 *   4. AM-embed: Brain.fm-style unipolar amplitude modulation of the melodic sub-bus.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { binauralFrequencies, generateNoise } from '../focus-audio';
import type { SoundLabTrack, SoundLabTrackConfig, EntrainmentMode } from '../soundlab-types';
import { getAmEnvelope } from './soundlab-math';

export interface EntrainmentNodes {
  oscillators: OscillatorNode[];
  lfo: OscillatorNode | null;
  lfoGain: GainNode | null;
  carrierGain: GainNode | null;
  mode: EntrainmentMode;
}

/** Initialize Web Audio nodes for an active entrainment track. */
export function startEntrainmentTrack(
  ctx: AudioContext,
  track: SoundLabTrack,
  bus: GainNode,
  melodicSubBus: GainNode | null,
): EntrainmentNodes {
  const mode = track.config.mode ?? 'binaural';
  const carrierHz = Math.max(
    40,
    Math.min(880, track.config.carrierHz ?? 220),
  );
  const beatHz = Math.max(0.5, Math.min(40, track.config.beatHz ?? 10));
  const amDepth = Math.max(0, Math.min(1, track.config.amDepth ?? 0.8));

  const nodes: EntrainmentNodes = {
    oscillators: [],
    lfo: null,
    lfoGain: null,
    carrierGain: null,
    mode,
  };

  if (mode === 'binaural') {
    const { left, right } = binauralFrequencies(carrierHz, beatHz);
    const oscL = ctx.createOscillator();
    const oscR = ctx.createOscillator();
    oscL.type = 'sine';
    oscR.type = 'sine';
    oscL.frequency.value = left;
    oscR.frequency.value = right;

    const merger = ctx.createChannelMerger(2);
    oscL.connect(merger, 0, 0);
    oscR.connect(merger, 0, 1);
    merger.connect(bus);

    oscL.start();
    oscR.start();
    nodes.oscillators.push(oscL, oscR);
  } else if (mode === 'isochronic') {
    const carrier = ctx.createOscillator();
    const pulse = ctx.createOscillator();
    const modGain = ctx.createGain();
    carrier.type = 'sine';
    carrier.frequency.value = carrierHz;
    pulse.type = 'square';
    pulse.frequency.value = beatHz;
    modGain.gain.value = 0.5 * amDepth;

    pulse.connect(modGain).connect(bus.gain);
    carrier.connect(bus);
    carrier.start();
    pulse.start();
    nodes.oscillators.push(carrier);
    nodes.lfo = pulse;
    nodes.lfoGain = modGain;
  } else if (mode === 'monaural') {
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
  } else if (mode === 'am-embed' && melodicSubBus) {
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = beatHz;
    const envelope = getAmEnvelope(amDepth);
    lfoGain.gain.value = envelope.amplitude;
    melodicSubBus.gain.value = envelope.offset;
    lfo.connect(lfoGain).connect(melodicSubBus.gain);
    lfo.start();
    nodes.lfo = lfo;
    nodes.lfoGain = lfoGain;
  }

  return nodes;
}

/** Cleanly tear down entrainment nodes and restore melodic sub-bus gain. */
export function stopEntrainmentTrack(
  ctx: AudioContext | null,
  nodes: EntrainmentNodes,
  melodicSubBus: GainNode | null,
): void {
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

  if (nodes.mode === 'am-embed' && ctx && melodicSubBus) {
    melodicSubBus.gain.setTargetAtTime(1, ctx.currentTime, 0.04);
  }
}

/** Update frequency and modulation parameters on running entrainment nodes. */
export function updateEntrainmentNodes(
  ctx: AudioContext,
  nodes: EntrainmentNodes,
  config: SoundLabTrackConfig,
  melodicSubBus: GainNode | null,
): void {
  const now = ctx.currentTime;
  const carrierHz = Math.max(
    40,
    Math.min(880, config.carrierHz ?? 220),
  );
  const beatHz = Math.max(0.5, Math.min(40, config.beatHz ?? 10));

  if (nodes.mode === 'binaural' && nodes.oscillators.length === 2) {
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

  const envelope = getAmEnvelope(config.amDepth ?? 0.8);
  nodes.lfoGain?.gain.setTargetAtTime(envelope.amplitude, now, 0.04);
  if (nodes.mode === 'am-embed' && melodicSubBus) {
    melodicSubBus.gain.setTargetAtTime(envelope.offset, now, 0.04);
  }
}

/** Start a looping white, pink, or brown noise buffer. */
export function startNoiseTrack(
  ctx: AudioContext,
  track: SoundLabTrack,
  bus: GainNode,
): AudioBufferSourceNode {
  const noiseType = track.config.noiseType ?? 'brown';
  const length = Math.floor(ctx.sampleRate * 4);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  buffer.copyToChannel(generateNoise(noiseType, length), 0);

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(bus);
  source.start();
  return source;
}
