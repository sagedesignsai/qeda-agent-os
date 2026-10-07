/**
 * lib/soundlab/soundlab-drums.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * 808-style analog drum synthesizer for SoundLab.
 * Synthesizes all percussion voices purely in Web Audio without sample assets:
 *   - Kick: Pitch drop envelope (150 Hz -> 0.01 Hz) + exponential gain decay
 *   - Snare: Dual-layer white noise burst + 180 Hz resonant body oscillator
 *   - Hi-Hat: High-pass filtered noise burst (closed 50 ms / open 300 ms)
 *   - Clap: Multi-tap micro-bursts (3 x 8 ms delay) + diffuse reverb tail
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { DrumVoice } from '../soundlab-types';

export function scheduleKick(ctx: AudioContext, time: number, bus: GainNode): void {
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

export function scheduleSnare(ctx: AudioContext, time: number, bus: GainNode): void {
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

  // Body tone
  const osc = ctx.createOscillator();
  const og = ctx.createGain();
  osc.frequency.value = 180;
  og.gain.setValueAtTime(0.5, time);
  og.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
  osc.connect(og).connect(bus);
  osc.start(time);
  osc.stop(time + 0.15);
}

export function scheduleHihat(
  ctx: AudioContext,
  time: number,
  bus: GainNode,
  open = false,
): void {
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

export function scheduleClap(ctx: AudioContext, time: number, bus: GainNode): void {
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

/** Schedule a single drum voice at a specific timestamp on a bus. */
export function scheduleDrumHit(
  ctx: AudioContext,
  voice: DrumVoice,
  time: number,
  bus: GainNode,
): void {
  switch (voice) {
    case 'kick':
      scheduleKick(ctx, time, bus);
      break;
    case 'snare':
      scheduleSnare(ctx, time, bus);
      break;
    case 'hihat':
      scheduleHihat(ctx, time, bus);
      break;
    case 'clap':
      scheduleClap(ctx, time, bus);
      break;
  }
}

/** Trigger an immediate preview hit through the master compressor. */
export function playDrumPreview(
  ctx: AudioContext,
  destination: AudioNode,
  voice: DrumVoice,
): void {
  const bus = ctx.createGain();
  bus.gain.value = 0.7;
  bus.connect(destination);
  scheduleDrumHit(ctx, voice, ctx.currentTime + 0.01, bus);
  setTimeout(() => bus.disconnect(), voice === 'kick' ? 700 : 450);
}
