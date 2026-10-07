/**
 * lib/soundlab-effects.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Factory functions for per-track insert effects: 3-band EQ, convolution
 * reverb (programmatic impulse — no audio files), and feedback delay.
 *
 * Each factory returns an { input, output } pair so callers can chain them
 * without knowing the internal topology. All parameter mutations go through
 * setTargetAtTime for glitch-free live updates.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface EQChain {
  input: GainNode;
  output: GainNode;
  lowShelf: BiquadFilterNode;
  mid: BiquadFilterNode;
  highShelf: BiquadFilterNode;
  setGains(low: number, mid: number, high: number, midFreq?: number): void;
  dispose(): void;
}

export interface ReverbChain {
  input: GainNode;
  output: GainNode;
  setWet(wet: number): void;
  setDecay(decaySec: number): void;
  dispose(): void;
}

export interface DelayChain {
  input: GainNode;
  output: GainNode;
  setTime(ms: number): void;
  setFeedback(fb: number): void;
  setWet(wet: number): void;
  dispose(): void;
}

// ── EQ ────────────────────────────────────────────────────────────────────────

export function createEQ(ctx: AudioContext): EQChain {
  const input = ctx.createGain();
  const output = ctx.createGain();

  const low = ctx.createBiquadFilter();
  low.type = 'lowshelf';
  low.frequency.value = 320;
  low.gain.value = 0;

  const mid = ctx.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = 1000;
  mid.Q.value = 1.0;
  mid.gain.value = 0;

  const high = ctx.createBiquadFilter();
  high.type = 'highshelf';
  high.frequency.value = 3200;
  high.gain.value = 0;

  input.connect(low).connect(mid).connect(high).connect(output);

  return {
    input,
    output,
    lowShelf: low,
    mid,
    highShelf: high,
    setGains(lowGain, midGain, highGain, midFreq) {
      const t = ctx.currentTime;
      low.gain.setTargetAtTime(Math.max(-12, Math.min(12, lowGain)), t, 0.02);
      mid.gain.setTargetAtTime(Math.max(-12, Math.min(12, midGain)), t, 0.02);
      high.gain.setTargetAtTime(Math.max(-12, Math.min(12, highGain)), t, 0.02);
      if (midFreq !== undefined) {
        mid.frequency.setTargetAtTime(
          Math.max(200, Math.min(8000, midFreq)),
          t,
          0.02,
        );
      }
    },
    dispose() {
      input.disconnect();
      low.disconnect();
      mid.disconnect();
      high.disconnect();
      output.disconnect();
    },
  };
}

// ── Reverb ────────────────────────────────────────────────────────────────────

function buildImpulse(ctx: AudioContext, decaySec: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * decaySec);
  const buf = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      // Exponential decay noise — no audio file needed
      data[i] =
        (Math.random() * 2 - 1) *
        Math.exp(-i / (ctx.sampleRate * decaySec * 0.3));
    }
  }
  return buf;
}

export function createReverb(ctx: AudioContext, initDecaySec = 1.5): ReverbChain {
  const input = ctx.createGain();
  const output = ctx.createGain();

  const convolver = ctx.createConvolver();
  convolver.buffer = buildImpulse(ctx, initDecaySec);

  const dryGain = ctx.createGain();
  const wetGain = ctx.createGain();
  dryGain.gain.value = 1.0;
  wetGain.gain.value = 0.25;

  input.connect(dryGain).connect(output);
  input.connect(convolver).connect(wetGain).connect(output);

  let currentDecay = initDecaySec;

  return {
    input,
    output,
    setWet(wet) {
      const clamped = Math.max(0, Math.min(1, wet));
      const t = ctx.currentTime;
      wetGain.gain.setTargetAtTime(clamped, t, 0.02);
      dryGain.gain.setTargetAtTime(1 - clamped * 0.5, t, 0.02);
    },
    setDecay(decaySec) {
      const clamped = Math.max(0.1, Math.min(5, decaySec));
      if (Math.abs(clamped - currentDecay) < 0.05) return;
      currentDecay = clamped;
      convolver.buffer = buildImpulse(ctx, clamped);
    },
    dispose() {
      input.disconnect();
      convolver.disconnect();
      dryGain.disconnect();
      wetGain.disconnect();
      output.disconnect();
    },
  };
}

// ── Delay ─────────────────────────────────────────────────────────────────────

export function createDelay(ctx: AudioContext): DelayChain {
  const input = ctx.createGain();
  const output = ctx.createGain();

  const delay = ctx.createDelay(2.0);
  delay.delayTime.value = 0.25;

  const feedback = ctx.createGain();
  feedback.gain.value = 0.3;

  const dryGain = ctx.createGain();
  const wetGain = ctx.createGain();
  dryGain.gain.value = 1.0;
  wetGain.gain.value = 0.3;

  // dry path
  input.connect(dryGain).connect(output);
  // wet path with feedback loop
  input.connect(delay);
  delay.connect(feedback).connect(delay); // feedback loop
  delay.connect(wetGain).connect(output);

  return {
    input,
    output,
    setTime(ms) {
      delay.delayTime.setTargetAtTime(
        Math.max(0, Math.min(2000, ms)) / 1000,
        ctx.currentTime,
        0.02,
      );
    },
    setFeedback(fb) {
      feedback.gain.setTargetAtTime(
        Math.max(0, Math.min(0.95, fb)),
        ctx.currentTime,
        0.02,
      );
    },
    setWet(wet) {
      const clamped = Math.max(0, Math.min(1, wet));
      wetGain.gain.setTargetAtTime(clamped, ctx.currentTime, 0.02);
    },
    dispose() {
      input.disconnect();
      delay.disconnect();
      feedback.disconnect();
      dryGain.disconnect();
      wetGain.disconnect();
      output.disconnect();
    },
  };
}
