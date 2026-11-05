/**
 * lib/soundlab/soundlab-synth.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Polyphonic subtractive/additive instrument synthesizer for SoundLab.
 * Generates notes with ADSR volume envelopes, selectable waveforms,
 * preset defaults, and velocity sensitivity.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { SoundLabNote, SoundLabTrackConfig } from '../soundlab-types';
import { SYNTH_PRESET_META } from '../soundlab-types';
import { midiToHz, beatToSeconds, clamp } from './soundlab-math';

export function schedulePolyNote(
  ctx: AudioContext,
  note: SoundLabNote,
  absoluteStartSec: number,
  bus: GainNode,
  cfg: SoundLabTrackConfig,
  bpm: number,
): void {
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
  const endSec = startSec + beatToSeconds(note.durationBeats, bpm);

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
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
  osc.start(startSec);
  osc.stop(endSec + 0.05);
}
