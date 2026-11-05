/**
 * lib/audio/mixer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The shared bus graph:
 *
 *   music ───────────────┐
 *   soundscape ─ duck ───┤
 *   noise ───────────────┼─ master ─ compressor ─ destination
 *   tone ────────────────┘
 *
 * Music and soundscape are separate buses because ducking is a relationship
 * between two sources, not a property of either. The compressor sits on the
 * master so a loud track plus rain cannot clip.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { audioNow, getAudioContext } from './context';

export type BusName = 'music' | 'soundscape' | 'noise' | 'tone';

export interface AudioMixer {
  ctx: AudioContext;
  master: GainNode;
  compressor: DynamicsCompressorNode;
  music: GainNode;
  soundscape: GainNode;
  /** Soundscape-only duck stage, driven by music playback. */
  duck: GainNode;
  noise: GainNode;
  tone: GainNode;
}

let mixer: AudioMixer | null = null;

export function getMixer(): AudioMixer | null {
  if (mixer) return mixer;
  const ctx = getAudioContext();
  if (!ctx) return null;

  const master = ctx.createGain();
  master.gain.value = 0.75;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 12;
  compressor.ratio.value = 8;
  compressor.attack.value = 0.008;
  compressor.release.value = 0.2;

  const duck = ctx.createGain();
  duck.gain.value = 1;

  const music = ctx.createGain();
  const soundscape = ctx.createGain();
  const noise = ctx.createGain();
  const tone = ctx.createGain();

  // Ambience (layers + noise + tone) shares the soundscape bus so ducking and
  // the scene master affect all of it; music is a peer of that bus, not a child.
  noise.connect(soundscape);
  tone.connect(soundscape);
  soundscape.connect(duck).connect(master);
  music.connect(master);
  master.connect(compressor).connect(ctx.destination);

  mixer = { ctx, master, compressor, music, soundscape, duck, noise, tone };
  return mixer;
}

/** Ramp a gain toward `value` without a click. */
export function rampGain(
  node: GainNode | null,
  value: number,
  seconds = 0.05,
  ctx: AudioContext | null = getAudioContext(),
): void {
  if (!node || !ctx) return;
  const safe = Math.max(0, Math.min(1, value));
  try {
    node.gain.setTargetAtTime(safe, audioNow(), Math.max(0.005, seconds));
  } catch {
    node.gain.value = safe;
  }
}

export function setMasterVolume(value: number, seconds = 0.05): void {
  rampGain(getMixer()?.master ?? null, value, seconds);
}

/**
 * Duck the soundscape bus by a negative dB amount. Passing 0 restores it.
 * The ramp is slow on purpose: ducking should feel like the room getting
 * quieter, not a gate closing.
 */
export function duckSoundscape(db: number, seconds = 0.6): void {
  const m = getMixer();
  if (!m) return;
  const linear = db >= 0 ? 1 : Math.pow(10, db / 20);
  const target = Math.max(0, Math.min(1, linear));
  try {
    m.duck.gain.setTargetAtTime(target, audioNow(), Math.max(0.02, seconds / 3));
  } catch {
    m.duck.gain.value = target;
  }
}

/** Test hook: drop the cached graph (the context is owned by context.ts). */
export function resetMixer(): void {
  mixer = null;
}
