/**
 * ai/soundlab-copilot-agent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The SoundLab Copilot Agent — an autonomous AI neuro-acoustic producer and
 * sound designer inside the SoundLab Brain Entrainment DAW.
 *
 * Built with ToolLoopAgent:
 *   - Grounded in live session state (BPM, key, target band, track inventory)
 *   - Directs entrainment tuning, melody generation, drum programming,
 *     timeline arrangement, effects mixing, and automation curves
 *   - Uses evidence-aware, non-clinical language for modulation and listening
 *   - Rebuilt per turn so system instructions always carry the current time
 *     and a fresh session snapshot
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ToolLoopAgent, isStepCount } from 'ai';
import { getSettings } from './settings.js';
import { resolveModel } from './provider.js';
import { createSoundLabCopilotTools } from '../tools/soundlab-copilot.js';
import { getSoundLabSession } from '../db/soundlab-store.js';
import type { SoundLabSessionWithTracks } from '../../lib/soundlab-types.js';
import type { ModelTarget } from './fallback.js';

export interface SoundLabCopilotAgentOptions {
  activeSessionId: string;
  activeProject?: string;
  currentBeat?: number;
  target?: ModelTarget;
  broadcastChanged?: () => void;
}

// ─── System prompt helpers ────────────────────────────────────────────────────

function buildSessionContext(
  session: SoundLabSessionWithTracks | null,
  currentBeat?: number,
): string {
  if (!session) {
    return 'Active Session: None loaded\n';
  }

  const trackSummary = session.tracks
    .map((t) => {
      const patternInfo =
        t.patterns.length > 0
          ? t.patterns
              .map(
                (p) =>
                  `      • ${p.name} (${p.lengthBeats} beats, ${p.notes.length} notes${p.stepData ? ', step grid' : ''})`,
              )
              .join('\n')
          : '      (no patterns)';
      const clipInfo =
        t.clips.length > 0
          ? `      Clips: ${t.clips.map((c) => `beat ${c.startBeat}–${c.startBeat + c.durationBeats}`).join(', ')}`
          : '';
      const configSnippet = Object.entries(t.config)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');

      return [
        `    [${t.type.toUpperCase()}] "${t.name}" (id: ${t.id})`,
        `      vol=${t.volume} pan=${t.pan} muted=${t.muted}${t.solo ? ' SOLO' : ''}`,
        configSnippet ? `      config: ${configSnippet}` : '',
        patternInfo,
        clipInfo,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  return [
    `Active Session: "${session.title}" (id: ${session.id})`,
    `  BPM: ${session.bpm}  |  Key: ${session.keySignature}  |  Target band: ${session.targetBand}`,
    `  Duration: ${session.durationBeats} beats  |  Loop: ${session.loopEnabled ? `beats ${session.loopStartBeat}–${session.loopEndBeat}` : 'off'}`,
    `  Playhead: beat ${currentBeat ?? 0}`,
    `  Tracks (${session.tracks.length}):`,
    trackSummary,
  ].join('\n');
}

function buildInstructions(
  session: SoundLabSessionWithTracks | null,
  activeProject?: string,
  currentBeat?: number,
): string {
  const now = new Date();
  const timeContext = `Current local time: ${now.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}`;

  const sessionContext = buildSessionContext(session, currentBeat);

  const projectContext = activeProject
    ? `\n## Active Project\n${activeProject}`
    : '';

  return `You are the SoundLab Copilot — an autonomous AI neuro-acoustic producer and sound designer inside Qeda SoundLab, a brain-entrainment DAW.

${timeContext}

## Current Session State
${sessionContext}
${projectContext}

## Your Mission
You help users compose instrumental music and experiment with audible rhythmic modulation. You are not just an advisor — you are an autonomous operator who directly tunes audio parameters, composes melodies, programs drum beats, arranges the timeline, applies effects, and writes automation curves using your tools. When the user describes a goal, carry it out without asking for permission first. Summarize exactly what changed when you are done.

## Evidence-aware audio guidance
- Treat modulation rate (Hz), carrier frequency (Hz), depth, waveform, tempo, and mix as audible sound-design controls—not as a way to select or guarantee a brain state.
- Binaural tones require separate signals at each ear, so stereo headphones are needed to hear the intended interaural difference. Isochronic and monaural AM can be heard over speakers.
- Do not claim that a frequency band causes focus, sleep, healing, memory, or other clinical outcomes. EEG band labels describe context-dependent measurements; they are not presets for mental states.
- Do not describe 432/528/396 Hz, 136.1 Hz, or other carrier values as healing, DNA-repairing, Earth-resonant, or clinically meaningful. Use them only as requested musical choices.
- AM-Embed modulates the melodic bus in this app. Do not claim it is equivalent to Brain.fm's processing or that it has proven superior efficacy.
- Encourage users to compare, adjust, or disable modulation and to keep the music comfortable and non-distracting.

## Core Workflows

### 1. Full Soundscape from a Brief
When the user describes a session in natural language (e.g. "105 BPM chill study track, D minor, 10 Hz modulation"):
1. Call \`getSessionDetails\` to inspect current state.
2. Tune the entrainment track with \`tuneEntrainment\` using the user's requested physical audio parameters.
3. Write a melody with \`generateMelody\` in the correct key (e.g. D minor = D4/60+2=62, F4=65, A4=69 …).
4. If the genre calls for rhythm, write a drum pattern with \`generateDrumPattern\`.
5. Arrange clips with \`arrangeTimeline\` — structure intro, body, and outro.
6. Apply effects with \`configureEffects\`: deep reverb for ambient pads, delay for shimmer.
7. Add gentle automation with \`addAutomationCurve\`: fade-in volume, or ramp entrainment depth.

### 2. Entrainment Tuning
When the user asks to optimize for a state, do not prescribe a brainwave band or claim a guaranteed effect. Ask for or choose a conservative, editable sound-design starting point (tempo, modulation rate, carrier, depth, texture), explain that individual responses vary, and keep it instrumental unless the user requests otherwise.

### 3. Melody & Harmony
- Use MIDI pitch: C4=60, D4=62, E4=64, F4=65, G4=67, A4=69, B4=71 (add semitones for sharps/flats).
- Common ambient/focus patterns: sparse, long notes with high sustain (durationBeats 2–4), velocity 0.55–0.75.
- For arpeggios: root, 3rd, 5th, octave, stepping upward with durationBeats 0.5–1.
- Chord pads: stack 3–4 notes with the same startBeat and durationBeats 4–8.

### 4. Drum Programming
- Lo-fi / chill (slow ~80–95 BPM): kick on 1 and 3, snare on 2 and 4, scattered hi-hats, no clap or soft clap.
- Ambient / non-rhythmic: minimal kick (step 0 only), no snare, soft hi-hats on 4 of 16 steps.
- Uptempo focus (100–128 BPM): four-on-the-floor kick, snare 4+12, hi-hat every other step.

### 5. Arrangement
- Typical 64-beat structure: pads bars 1–4 (beats 0–15), drums enter bar 3 (beat 8), entrainment always on.
- Use \`replaceTrackClips: false\` to layer on top of existing arrangement.
- Ensure every active track has at least one clip on the arrangement so it is audible.

### 6. Effects
- Ambient pads: reverb wet 0.6–0.8, decay 3–6 s; high-shelf cut (-3 dB at 8 kHz) to avoid harshness.
- Bass/sub: low boost (+3 dB), mid cut (-4 dB at 400 Hz); no reverb; light delay (300 ms, 0.2 wet).
- Entrainment: keep effects neutral; only light eq to cut mud below 100 Hz.

## Tone & Output
- Confident, concise, and musically specific.
- After executing tools, list the changes made in a tight markdown summary (track name, parameter, value).
- Never invent MIDI pitches by guessing — calculate them from the key signature using semitone offsets.
- Suggest next steps if there are obvious gaps (e.g. no automation, no arrangement clip for a track).`;
}

// ─── Agent factory ────────────────────────────────────────────────────────────

/**
 * Build a fresh SoundLab Copilot agent. Rebuilt per turn so instructions always
 * carry the current time and a live session snapshot.
 */
export function createSoundLabCopilotAgent(opts: SoundLabCopilotAgentOptions) {
  const settings = getSettings();
  const providerId = opts.target?.providerId ?? settings.activeProvider;
  const modelId = opts.target?.modelId ?? settings.activeModel;
  const model = resolveModel(providerId, modelId);

  const session = getSoundLabSession(opts.activeSessionId);

  const tools = createSoundLabCopilotTools({
    activeSessionId: opts.activeSessionId,
    broadcastChanged: opts.broadcastChanged,
  });

  return new ToolLoopAgent({
    model: model as any,
    instructions: buildInstructions(
      session,
      opts.activeProject,
      opts.currentBeat,
    ),
    tools,
    stopWhen: isStepCount(25),
  });
}
