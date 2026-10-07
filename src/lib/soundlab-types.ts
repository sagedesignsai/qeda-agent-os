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
export type SoundLabTrackType =
  'instrument' | 'entrainment' | 'noise' | 'drums';
export type EntrainmentMode =
  'binaural' | 'isochronic' | 'monaural' | 'am-embed';
export type SynthWaveform = 'sine' | 'triangle' | 'sawtooth' | 'square';
export type SynthPreset =
  'warm-pad' | 'ambient-pluck' | 'sub-bass' | 'clean-sine';
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
  | 'track.pan';

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
  delta: {
    label: 'Delta',
    hz: 2.5,
    hint: 'Deep sleep & recovery',
    color: '#6366f1',
  },
  theta: {
    label: 'Theta',
    hz: 6,
    hint: 'Creative flow & REM',
    color: '#8b5cf6',
  },
  alpha: { label: 'Alpha', hz: 10, hint: 'Calm focus', color: '#06b6d4' },
  beta: { label: 'Beta', hz: 18, hint: 'Alert & active', color: '#f59e0b' },
  gamma: { label: 'Gamma', hz: 40, hint: 'Peak cognition', color: '#ef4444' },
};

export const BRAINWAVE_BANDS: BrainwaveBand[] = [
  'delta',
  'theta',
  'alpha',
  'beta',
  'gamma',
];

export const ENTRAINMENT_MODE_META: Record<
  EntrainmentMode,
  { label: string; hint: string }
> = {
  binaural: {
    label: 'Binaural',
    hint: 'L/R offset tones — requires headphones',
  },
  isochronic: {
    label: 'Isochronic',
    hint: 'AM pulsed carrier — works on speakers',
  },
  monaural: {
    label: 'Monaural',
    hint: 'Single-channel AM — works on speakers',
  },
  'am-embed': {
    label: 'AM Embed',
    hint: 'Amplitude modulation applied to the melodic bus',
  },
};

export const SYNTH_PRESET_META: Record<
  SynthPreset,
  {
    label: string;
    attack: number;
    decay: number;
    sustain: number;
    release: number;
    waveform: SynthWaveform;
  }
> = {
  'warm-pad': {
    label: 'Warm Pad',
    attack: 0.3,
    decay: 0.2,
    sustain: 0.7,
    release: 0.5,
    waveform: 'triangle',
  },
  'ambient-pluck': {
    label: 'Ambient Pluck',
    attack: 0.01,
    decay: 0.3,
    sustain: 0.0,
    release: 0.4,
    waveform: 'sine',
  },
  'sub-bass': {
    label: 'Sub Bass',
    attack: 0.05,
    decay: 0.1,
    sustain: 0.8,
    release: 0.1,
    waveform: 'sine',
  },
  'clean-sine': {
    label: 'Clean Sine',
    attack: 0.01,
    decay: 0.05,
    sustain: 0.9,
    release: 0.1,
    waveform: 'sine',
  },
};

export const DRUM_VOICES = ['kick', 'snare', 'hihat', 'clap'] as const;
export type DrumVoice = (typeof DRUM_VOICES)[number];

export const DRUM_VOICE_META: Record<
  DrumVoice,
  { label: string; color: string }
> = {
  kick: { label: 'Kick', color: '#ef4444' },
  snare: { label: 'Snare', color: '#f59e0b' },
  hihat: { label: 'Hi-Hat', color: '#22d3ee' },
  clap: { label: 'Clap', color: '#a78bfa' },
};

export const AUTOMATION_PARAM_META: Record<
  AutomationParameterId,
  { label: string; min: number; max: number; unit: string }
> = {
  'entrainment.beatHz': { label: 'Beat Hz', min: 0.5, max: 40, unit: 'Hz' },
  'entrainment.carrierHz': {
    label: 'Carrier Hz',
    min: 40,
    max: 1000,
    unit: 'Hz',
  },
  'entrainment.depth': { label: 'AM Depth', min: 0, max: 1, unit: '' },
  'track.volume': { label: 'Volume', min: 0, max: 1, unit: '' },
  'track.pan': { label: 'Pan', min: -1, max: 1, unit: '' },
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
    label: 'Soft Focus',
    description:
      'A restrained instrumental starting point with a 10 Hz modulation rate.',
    band: 'alpha',
    bpm: 90,
  },
  {
    id: 'creative-flow',
    label: 'Textural Exploration',
    description: 'A slower tempo and a 6 Hz modulation-rate starting point.',
    band: 'theta',
    bpm: 75,
  },
  {
    id: 'sleep-induction',
    label: 'Slow Ambient',
    description:
      'A minimal, slow-tempo starting point with a 2.5 Hz modulation rate.',
    band: 'delta',
    bpm: 60,
  },
  {
    id: 'high-cognition',
    label: 'Bright Rhythms',
    description:
      'A more active tempo and an 18 Hz modulation-rate starting point.',
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
  templateId?: string,
): SoundLabTrack[] {
  const { hz } = BRAINWAVE_BAND_META[band];

  // Helper to make a timeline clip
  const makeClip = (
    trackId: string,
    patternId: string,
    startBeat: number,
    durationBeats = 8,
  ): SoundLabClip => ({
    id: `${patternId}-c${startBeat}`,
    trackId,
    patternId,
    startBeat,
    durationBeats,
  });

  // ── 1. Soft Focus Demo (10Hz modulation, 90 BPM) ─────────────────────────
  if (templateId === 'deep-focus') {
    const padTrkId = `${sessionId}-t1`;
    const padPatId = `${sessionId}-p1`;
    const padNotes: SoundLabNote[] = [
      // Am chord (beats 0–4)
      {
        id: `${sessionId}-n1`,
        pitch: 57,
        startBeat: 0,
        durationBeats: 4,
        velocity: 0.65,
      }, // A3
      {
        id: `${sessionId}-n2`,
        pitch: 60,
        startBeat: 0,
        durationBeats: 4,
        velocity: 0.7,
      }, // C4
      {
        id: `${sessionId}-n3`,
        pitch: 64,
        startBeat: 0,
        durationBeats: 4,
        velocity: 0.65,
      }, // E4
      // F chord (beats 4–8)
      {
        id: `${sessionId}-n4`,
        pitch: 53,
        startBeat: 4,
        durationBeats: 4,
        velocity: 0.65,
      }, // F3
      {
        id: `${sessionId}-n5`,
        pitch: 57,
        startBeat: 4,
        durationBeats: 4,
        velocity: 0.7,
      }, // A3
      {
        id: `${sessionId}-n6`,
        pitch: 60,
        startBeat: 4,
        durationBeats: 4,
        velocity: 0.65,
      }, // C4
    ];

    const drumTrkId = `${sessionId}-t4`;
    const drumPatId = `${sessionId}-p4`;
    // 4 voices x 16 steps: [kick, snare, hihat, clap]
    const drumSteps = [
      [
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ], // kick
      [
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
      ], // snare
      [
        false,
        false,
        true,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        true,
        false,
      ], // hihat
      [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ],
    ];

    return [
      {
        id: padTrkId,
        sessionId,
        type: 'instrument',
        name: 'Ambient Pad',
        sortOrder: 0,
        muted: false,
        solo: false,
        volume: 0.7,
        pan: 0.0,
        color: '#6366f1',
        config: {
          preset: 'warm-pad',
          waveform: 'triangle',
          attack: 0.4,
          decay: 0.3,
          sustain: 0.8,
          release: 0.6,
          reverb: { wet: 0.45, decay: 3.5 },
          delay: { timeMs: 350, feedback: 0.25, wet: 0.2 },
        },
        patterns: [
          {
            id: padPatId,
            trackId: padTrkId,
            name: 'Am-F Chords',
            lengthBeats: 8,
            notes: padNotes,
          },
        ],
        clips: [
          makeClip(padTrkId, padPatId, 0),
          makeClip(padTrkId, padPatId, 8),
          makeClip(padTrkId, padPatId, 16),
          makeClip(padTrkId, padPatId, 24),
        ],
        automation: [],
      },
      {
        id: `${sessionId}-t2`,
        sessionId,
        type: 'entrainment',
        name: '10 Hz Binaural',
        sortOrder: 1,
        muted: false,
        solo: false,
        volume: 0.55,
        pan: 0.0,
        color: '#06b6d4',
        config: {
          mode: 'binaural',
          targetBand: 'alpha',
          carrierHz: 432,
          beatHz: 10,
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
        name: 'Brown Noise Bed',
        sortOrder: 2,
        muted: false,
        solo: false,
        volume: 0.2,
        pan: 0.0,
        color: '#78716c',
        config: { noiseType: 'brown' },
        patterns: [],
        clips: [],
        automation: [],
      },
      {
        id: drumTrkId,
        sessionId,
        type: 'drums',
        name: 'Lo-Fi 808 Drums',
        sortOrder: 3,
        muted: false,
        solo: false,
        volume: 0.6,
        pan: 0.0,
        color: '#f59e0b',
        config: {},
        patterns: [
          {
            id: drumPatId,
            trackId: drumTrkId,
            name: 'Lo-Fi Groove',
            lengthBeats: 8,
            notes: [],
            stepData: drumSteps,
          },
        ],
        clips: [
          makeClip(drumTrkId, drumPatId, 8),
          makeClip(drumTrkId, drumPatId, 16),
          makeClip(drumTrkId, drumPatId, 24),
        ],
        automation: [],
      },
    ];
  }

  // ── 2. Textural Exploration Demo (6Hz modulation, 75 BPM) ────────────────
  if (templateId === 'creative-flow') {
    const pluckTrkId = `${sessionId}-t1`;
    const pluckPatId = `${sessionId}-p1`;
    const pluckNotes: SoundLabNote[] = [
      {
        id: `${sessionId}-n1`,
        pitch: 53,
        startBeat: 0,
        durationBeats: 1,
        velocity: 0.75,
      }, // F3
      {
        id: `${sessionId}-n2`,
        pitch: 57,
        startBeat: 1,
        durationBeats: 1,
        velocity: 0.7,
      }, // A3
      {
        id: `${sessionId}-n3`,
        pitch: 60,
        startBeat: 2,
        durationBeats: 1,
        velocity: 0.75,
      }, // C4
      {
        id: `${sessionId}-n4`,
        pitch: 64,
        startBeat: 3,
        durationBeats: 1,
        velocity: 0.7,
      }, // E4
      {
        id: `${sessionId}-n5`,
        pitch: 62,
        startBeat: 4,
        durationBeats: 1,
        velocity: 0.75,
      }, // D4
      {
        id: `${sessionId}-n6`,
        pitch: 60,
        startBeat: 5,
        durationBeats: 1,
        velocity: 0.7,
      }, // C4
      {
        id: `${sessionId}-n7`,
        pitch: 57,
        startBeat: 6,
        durationBeats: 1,
        velocity: 0.7,
      }, // A3
      {
        id: `${sessionId}-n8`,
        pitch: 53,
        startBeat: 7,
        durationBeats: 1,
        velocity: 0.65,
      }, // F3
    ];

    return [
      {
        id: pluckTrkId,
        sessionId,
        type: 'instrument',
        name: 'Dream Pluck',
        sortOrder: 0,
        muted: false,
        solo: false,
        volume: 0.7,
        pan: 0.0,
        color: '#a855f7',
        config: {
          preset: 'ambient-pluck',
          waveform: 'sine',
          attack: 0.05,
          decay: 0.4,
          sustain: 0.3,
          release: 0.8,
          reverb: { wet: 0.5, decay: 4.0 },
          delay: { timeMs: 400, feedback: 0.35, wet: 0.25 },
        },
        patterns: [
          {
            id: pluckPatId,
            trackId: pluckTrkId,
            name: 'Fmaj Arpeggio',
            lengthBeats: 8,
            notes: pluckNotes,
          },
        ],
        clips: [
          makeClip(pluckTrkId, pluckPatId, 0),
          makeClip(pluckTrkId, pluckPatId, 8),
          makeClip(pluckTrkId, pluckPatId, 16),
          makeClip(pluckTrkId, pluckPatId, 24),
        ],
        automation: [],
      },
      {
        id: `${sessionId}-t2`,
        sessionId,
        type: 'entrainment',
        name: '6 Hz Isochronic',
        sortOrder: 1,
        muted: false,
        solo: false,
        volume: 0.55,
        pan: 0.0,
        color: '#8b5cf6',
        config: {
          mode: 'isochronic',
          targetBand: 'theta',
          carrierHz: 136.1,
          beatHz: 6,
          amDepth: 0.85,
        },
        patterns: [],
        clips: [],
        automation: [],
      },
      {
        id: `${sessionId}-t3`,
        sessionId,
        type: 'noise',
        name: 'Pink Noise Stream',
        sortOrder: 2,
        muted: false,
        solo: false,
        volume: 0.15,
        pan: 0.0,
        color: '#ec4899',
        config: { noiseType: 'pink' },
        patterns: [],
        clips: [],
        automation: [],
      },
    ];
  }

  // ── 3. Slow Ambient Demo (2.5Hz modulation, 60 BPM) ─────────────────────
  if (templateId === 'sleep-induction') {
    const bassTrkId = `${sessionId}-t1`;
    const bassPatId = `${sessionId}-p1`;
    const bassNotes: SoundLabNote[] = [
      {
        id: `${sessionId}-n1`,
        pitch: 33,
        startBeat: 0,
        durationBeats: 8,
        velocity: 0.6,
      }, // A1
      {
        id: `${sessionId}-n2`,
        pitch: 40,
        startBeat: 0,
        durationBeats: 8,
        velocity: 0.5,
      }, // E2
    ];

    return [
      {
        id: bassTrkId,
        sessionId,
        type: 'instrument',
        name: 'Sub Bass Drone',
        sortOrder: 0,
        muted: false,
        solo: false,
        volume: 0.65,
        pan: 0.0,
        color: '#3b82f6',
        config: {
          preset: 'sub-bass',
          waveform: 'sine',
          attack: 0.5,
          decay: 0.3,
          sustain: 0.9,
          release: 1.0,
          eq: { lowGain: 4, midGain: -2, highGain: -6, midFreq: 400 },
        },
        patterns: [
          {
            id: bassPatId,
            trackId: bassTrkId,
            name: 'Deep Drone',
            lengthBeats: 8,
            notes: bassNotes,
          },
        ],
        clips: [
          makeClip(bassTrkId, bassPatId, 0),
          makeClip(bassTrkId, bassPatId, 8),
          makeClip(bassTrkId, bassPatId, 16),
          makeClip(bassTrkId, bassPatId, 24),
        ],
        automation: [],
      },
      {
        id: `${sessionId}-t2`,
        sessionId,
        type: 'entrainment',
        name: '2.5 Hz Monaural',
        sortOrder: 1,
        muted: false,
        solo: false,
        volume: 0.5,
        pan: 0.0,
        color: '#3b82f6',
        config: {
          mode: 'monaural',
          targetBand: 'delta',
          carrierHz: 111,
          beatHz: 2.5,
          amDepth: 0.75,
        },
        patterns: [],
        clips: [],
        automation: [],
      },
      {
        id: `${sessionId}-t3`,
        sessionId,
        type: 'noise',
        name: 'Brown Rain Texture',
        sortOrder: 2,
        muted: false,
        solo: false,
        volume: 0.3,
        pan: 0.0,
        color: '#78716c',
        config: { noiseType: 'brown' },
        patterns: [],
        clips: [],
        automation: [],
      },
    ];
  }

  // ── 4. Bright Rhythms Demo (18Hz modulation, 110 BPM) ────────────────────
  if (templateId === 'high-cognition') {
    const leadTrkId = `${sessionId}-t1`;
    const leadPatId = `${sessionId}-p1`;
    const leadNotes: SoundLabNote[] = [
      {
        id: `${sessionId}-n1`,
        pitch: 67,
        startBeat: 0,
        durationBeats: 2,
        velocity: 0.75,
      }, // G4
      {
        id: `${sessionId}-n2`,
        pitch: 71,
        startBeat: 2,
        durationBeats: 2,
        velocity: 0.75,
      }, // B4
      {
        id: `${sessionId}-n3`,
        pitch: 74,
        startBeat: 4,
        durationBeats: 2,
        velocity: 0.8,
      }, // D5
      {
        id: `${sessionId}-n4`,
        pitch: 71,
        startBeat: 6,
        durationBeats: 2,
        velocity: 0.75,
      }, // B4
    ];

    const drumTrkId = `${sessionId}-t3`;
    const drumPatId = `${sessionId}-p3`;
    const drumSteps = [
      [
        true,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
      ], // 4-on-floor kick
      [
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
      ], // snare
      [
        true,
        false,
        true,
        false,
        true,
        false,
        true,
        false,
        true,
        false,
        true,
        false,
        true,
        false,
        true,
        false,
      ], // hi-hat
      [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
      ], // clap
    ];

    return [
      {
        id: leadTrkId,
        sessionId,
        type: 'instrument',
        name: 'Cyber Arp',
        sortOrder: 0,
        muted: false,
        solo: false,
        volume: 0.75,
        pan: 0.0,
        color: '#f43f5e',
        config: {
          preset: 'clean-sine',
          waveform: 'sawtooth',
          attack: 0.02,
          decay: 0.15,
          sustain: 0.5,
          release: 0.25,
          delay: { timeMs: 272, feedback: 0.3, wet: 0.3 },
        },
        patterns: [
          {
            id: leadPatId,
            trackId: leadTrkId,
            name: 'G Major Motif',
            lengthBeats: 8,
            notes: leadNotes,
          },
        ],
        clips: [
          makeClip(leadTrkId, leadPatId, 0),
          makeClip(leadTrkId, leadPatId, 8),
          makeClip(leadTrkId, leadPatId, 16),
          makeClip(leadTrkId, leadPatId, 24),
        ],
        automation: [],
      },
      {
        id: `${sessionId}-t2`,
        sessionId,
        type: 'entrainment',
        name: '18 Hz AM Embed',
        sortOrder: 1,
        muted: false,
        solo: false,
        volume: 0.6,
        pan: 0.0,
        color: '#f97316',
        config: {
          mode: 'am-embed',
          targetBand: 'beta',
          carrierHz: 216,
          beatHz: 18,
          amDepth: 0.9,
        },
        patterns: [],
        clips: [],
        automation: [],
      },
      {
        id: drumTrkId,
        sessionId,
        type: 'drums',
        name: 'Driving 808 Drums',
        sortOrder: 2,
        muted: false,
        solo: false,
        volume: 0.65,
        pan: 0.0,
        color: '#eab308',
        config: {},
        patterns: [
          {
            id: drumPatId,
            trackId: drumTrkId,
            name: 'Four-on-the-Floor',
            lengthBeats: 8,
            notes: [],
            stepData: drumSteps,
          },
        ],
        clips: [
          makeClip(drumTrkId, drumPatId, 0),
          makeClip(drumTrkId, drumPatId, 8),
          makeClip(drumTrkId, drumPatId, 16),
          makeClip(drumTrkId, drumPatId, 24),
        ],
        automation: [],
      },
    ];
  }

  // ── Default / Blank Canvas ────────────────────────────────────────────────
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
      config: {
        preset: 'warm-pad',
        waveform: 'triangle',
        attack: 0.3,
        decay: 0.2,
        sustain: 0.7,
        release: 0.5,
      },
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
      name: `${hz} Hz Entrainment`,
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
