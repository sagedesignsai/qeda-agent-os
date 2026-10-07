/**
 * lib/soundlab-types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure, UI-free domain types, constants, and templates for SoundLab: the
 * brain-entrainment DAW. Shared across main and renderer processes without
 * importing any node/db/electron deps.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Primitive union types ─────────────────────────────────────────────────────

export type BrainwaveBand = 'delta' | 'theta' | 'alpha' | 'beta' | 'gamma';
export type SoundLabTrackType = 'instrument' | 'entrainment' | 'noise' | 'drums';
export type EntrainmentMode = 'binaural' | 'isochronic' | 'monaural' | 'am-embed';
export type SynthWaveform = 'sine' | 'triangle' | 'sawtooth' | 'square';
export type SynthPreset = 'warm-pad' | 'ambient-pluck' | 'sub-bass' | 'clean-sine';
export type NoiseType = 'white' | 'pink' | 'brown';

// ── Musical note model ────────────────────────────────────────────────────────

/** A single note event inside a pattern, expressed in MIDI pitch and beats. */
export interface SoundLabNote {
  id: string;
  /** MIDI pitch 0–127 (e.g. 60 = C4, 69 = A4 = 440 Hz). */
  pitch: number;
  /** Start position relative to the pattern start, in beats. */
  startBeat: number;
  /** Note length in beats. */
  durationBeats: number;
  /** Amplitude 0–1. */
  velocity: number;
}

// ── Pattern model ─────────────────────────────────────────────────────────────

/**
 * A reusable loop owned by a track. Instrument tracks store notes[]; drum
 * tracks store stepData (16 steps × N voices).
 */
export interface SoundLabPattern {
  id: string;
  trackId: string;
  name: string;
  /** Total length in beats (typically 4, 8, or 16). */
  lengthBeats: number;
  notes: SoundLabNote[];
  /** 16-step trigger grid [voiceIndex][stepIndex] for drums tracks. */
  stepData?: boolean[][];
}

// ── Clip model (arrangement timeline) ────────────────────────────────────────

/** An instance of a pattern placed on the arrangement timeline. */
export interface SoundLabClip {
  id: string;
  trackId: string;
  patternId: string;
  /** Absolute beat position on the arrangement timeline. */
  startBeat: number;
  /** Loop or trimmed duration in beats. */
  durationBeats: number;
}

// ── Automation ────────────────────────────────────────────────────────────────

export interface SoundLabAutomationPoint {
  id: string;
  beat: number;
  /** Normalised value in the parameter's native range. */
  value: number;
}

export type AutomationParameterId =
  | 'entrainment.beatHz'
  | 'entrainment.carrierHz'
  | 'entrainment.depth'
  | 'track.volume'
  | 'track.pan'
  | 'filter.cutoff';

export interface SoundLabAutomationLane {
  id: string;
  parameterId: AutomationParameterId;
  expanded: boolean;
  points: SoundLabAutomationPoint[];
}

// ── Track configuration ───────────────────────────────────────────────────────

/** Per-track configuration — serialized to `config_json` in SQLite. */
export interface SoundLabTrackConfig {
  // ── Instrument ────────────────────────────────────────────────────────────
  waveform?: SynthWaveform;
  preset?: SynthPreset;
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;

  // ── Entrainment ───────────────────────────────────────────────────────────
  mode?: EntrainmentMode;
  targetBand?: BrainwaveBand;
  carrierHz?: number;
  beatHz?: number;
  /** AM modulation depth 0–1; used by isochronic, monaural and am-embed. */
  amDepth?: number;

  // ── Noise ─────────────────────────────────────────────────────────────────
  noiseType?: NoiseType;

  // ── Effects ───────────────────────────────────────────────────────────────
  eq?: { lowGain: number; midGain: number; highGain: number; midFreq: number };
  reverb?: { wet: number; decay: number };
  delay?: { timeMs: number; feedback: number; wet: number };
}

// ── Track ─────────────────────────────────────────────────────────────────────

export interface SoundLabTrack {
  id: string;
  sessionId: string;
  type: SoundLabTrackType;
  name: string;
  sortOrder: number;
  muted: boolean;
  solo: boolean;
  /** Linear amplitude 0–1. */
  volume: number;
  /** Stereo pan -1 (left) to +1 (right). */
  pan: number;
  color: string;
  config: SoundLabTrackConfig;
  patterns: SoundLabPattern[];
  clips: SoundLabClip[];
  automation: SoundLabAutomationLane[];
}

// ── Session ───────────────────────────────────────────────────────────────────

export interface SoundLabSession {
  id: string;
  projectId: string | null;
  title: string;
  bpm: number;
  keySignature: string;
  targetBand: BrainwaveBand;
  durationBeats: number;
  loopEnabled: boolean;
  loopStartBeat: number;
  loopEndBeat: number;
  createdAt: number;
  updatedAt: number;
}

/** Full session payload including all tracks — used for save/load. */
export interface SoundLabSessionWithTracks extends SoundLabSession {
  tracks: SoundLabTrack[];
}

// ── Metadata constants ────────────────────────────────────────────────────────

export const BRAINWAVE_BAND_META: Record<
  BrainwaveBand,
  { label: string; hz: number; hint: string; color: string }
> = {
  delta: { label: 'Delta', hz: 2.5,  hint: 'Deep sleep & recovery', color: '#6366f1' },
  theta: { label: 'Theta', hz: 6,    hint: 'Creative flow & REM',   color: '#8b5cf6' },
  alpha: { label: 'Alpha', hz: 10,   hint: 'Calm focus',            color: '#06b6d4' },
  beta:  { label: 'Beta',  hz: 18,   hint: 'Alert & active',        color: '#f59e0b' },
  gamma: { label: 'Gamma', hz: 40,   hint: 'Peak cognition',        color: '#ef4444' },
};

export const BRAINWAVE_BANDS: BrainwaveBand[] = ['delta', 'theta', 'alpha', 'beta', 'gamma'];

export const ENTRAINMENT_MODE_META: Record<
  EntrainmentMode,
  { label: string; hint: string }
> = {
  binaural:  { label: 'Binaural',  hint: 'L/R offset tones — requires headphones' },
  isochronic:{ label: 'Isochronic',hint: 'AM pulsed carrier — works on speakers' },
  monaural:  { label: 'Monaural',  hint: 'Single-channel AM — works on speakers' },
  'am-embed':{ label: 'AM Embed',  hint: 'Brain.fm-style: modulation embedded in music' },
};

export const SYNTH_PRESET_META: Record<
  SynthPreset,
  { label: string; attack: number; decay: number; sustain: number; release: number; waveform: SynthWaveform }
> = {
  'warm-pad':      { label: 'Warm Pad',       attack: 0.3,  decay: 0.2,  sustain: 0.7, release: 0.5, waveform: 'triangle' },
  'ambient-pluck': { label: 'Ambient Pluck',  attack: 0.01, decay: 0.3,  sustain: 0.0, release: 0.4, waveform: 'sine' },
  'sub-bass':      { label: 'Sub Bass',       attack: 0.05, decay: 0.1,  sustain: 0.8, release: 0.1, waveform: 'sine' },
  'clean-sine':    { label: 'Clean Sine',     attack: 0.01, decay: 0.05, sustain: 0.9, release: 0.1, waveform: 'sine' },
};

export const DRUM_VOICES = ['kick', 'snare', 'hihat', 'clap'] as const;
export type DrumVoice = (typeof DRUM_VOICES)[number];

export const DRUM_VOICE_META: Record<DrumVoice, { label: string; color: string }> = {
  kick:  { label: 'Kick',   color: '#ef4444' },
  snare: { label: 'Snare',  color: '#f59e0b' },
  hihat: { label: 'Hi-Hat', color: '#22d3ee' },
  clap:  { label: 'Clap',   color: '#a78bfa' },
};

export const AUTOMATION_PARAM_META: Record<
  AutomationParameterId,
  { label: string; min: number; max: number; unit: string }
> = {
  'entrainment.beatHz':    { label: 'Beat Hz',      min: 0.5,  max: 40,    unit: 'Hz'  },
  'entrainment.carrierHz': { label: 'Carrier Hz',   min: 40,   max: 1000,  unit: 'Hz'  },
  'entrainment.depth':     { label: 'AM Depth',     min: 0,    max: 1,     unit: ''    },
  'track.volume':          { label: 'Volume',       min: 0,    max: 1,     unit: ''    },
  'track.pan':             { label: 'Pan',          min: -1,   max: 1,     unit: ''    },
  'filter.cutoff':         { label: 'Filter Cutoff',min: 20,   max: 20000, unit: 'Hz'  },
};

// ── Session templates ─────────────────────────────────────────────────────────

export const SESSION_TEMPLATES: Array<{
  id: string;
  label: string;
  description: string;
  band: BrainwaveBand;
  bpm: number;
}> = [
  {
    id: 'deep-focus',
    label: 'Deep Focus',
    description: 'Calm alpha state for sustained attention',
    band: 'alpha',
    bpm: 90,
  },
  {
    id: 'creative-flow',
    label: 'Creative Flow',
    description: 'Theta waves for imaginative thinking',
    band: 'theta',
    bpm: 75,
  },
  {
    id: 'sleep-induction',
    label: 'Sleep Induction',
    description: 'Delta pulses for sleep onset',
    band: 'delta',
    bpm: 60,
  },
  {
    id: 'high-cognition',
    label: 'High Cognition',
    description: 'Beta activation for sharp focus',
    band: 'beta',
    bpm: 110,
  },
  {
    id: 'blank',
    label: 'Blank Canvas',
    description: 'Start from scratch',
    band: 'alpha',
    bpm: 120,
  },
];

// ── Default track factories ───────────────────────────────────────────────────

/** Build the default set of tracks for a new session template. */
export function buildDefaultTracks(
  sessionId: string,
  band: BrainwaveBand,
): SoundLabTrack[] {
  const { hz } = BRAINWAVE_BAND_META[band];
  return [
    {
      id: `${sessionId}-t1`,
      sessionId,
      type: 'instrument',
      name: 'Ambient Pad',
      sortOrder: 0,
      muted: false,
      solo: false,
      volume: 0.7,
      pan: 0.0,
      color: '#6366f1',
      config: { preset: 'warm-pad', waveform: 'triangle', attack: 0.3, decay: 0.2, sustain: 0.7, release: 0.5 },
      patterns: [
        {
          id: `${sessionId}-p1`,
          trackId: `${sessionId}-t1`,
          name: 'Pattern 1',
          lengthBeats: 8,
          notes: [],
        },
      ],
      clips: [],
      automation: [],
    },
    {
      id: `${sessionId}-t2`,
      sessionId,
      type: 'entrainment',
      name: `${BRAINWAVE_BAND_META[band].label} Entrainment`,
      sortOrder: 1,
      muted: false,
      solo: false,
      volume: 0.5,
      pan: 0.0,
      color: BRAINWAVE_BAND_META[band].color,
      config: {
        mode: 'binaural',
        targetBand: band,
        carrierHz: 220,
        beatHz: hz,
        amDepth: 0.8,
      },
      patterns: [],
      clips: [],
      automation: [],
    },
    {
      id: `${sessionId}-t3`,
      sessionId,
      type: 'noise',
      name: 'Brown Noise',
      sortOrder: 2,
      muted: false,
      solo: false,
      volume: 0.25,
      pan: 0.0,
      color: '#78716c',
      config: { noiseType: 'brown' },
      patterns: [],
      clips: [],
      automation: [],
    },
  ];
}
