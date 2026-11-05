/**
 * lib/audio/noise.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Procedural noise generators. Pure math over a Float32Array so they can be
 * tested without Web Audio and reused by any buffer-based source.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { NoiseType } from '../music/types';

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
