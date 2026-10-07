/**
 * tools/soundlab-copilot.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SoundLab Copilot AI Tools — verbs allowing the autonomous neuro-acoustic
 * producer agent to compose, tune, arrange, and mix a brain-entrainment DAW
 * session in response to natural-language instructions.
 *
 * Every tool reads the current session state via getSoundLabSession, mutates it
 * in-memory, then persists the result with saveSoundLabSession. After each
 * mutation broadcastChanged() fires 'soundlab:changed' so the DAW UI refreshes
 * without a page reload.
 *
 * Tool taxonomy:
 *   1. getSessionDetails   — read-only snapshot for grounding
 *   2. tuneEntrainment     — adjust carrier Hz, beat Hz, band and mode
 *   3. generateMelody      — write MIDI notes into an instrument track pattern
 *   4. generateDrumPattern — write a 16-step grid for a drums track
 *   5. arrangeTimeline     — place clips onto the arrangement ruler
 *   6. configureEffects    — set per-track EQ, reverb and delay
 *   7. addAutomationCurve  — insert automation points on a lane
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { tool } from 'ai';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import {
  getSoundLabSession,
  saveSoundLabSession,
} from '../db/soundlab-store.js';
import type {
  SoundLabNote,
  SoundLabAutomationPoint,
  SoundLabAutomationLane,
  AutomationParameterId,
  EntrainmentMode,
  SoundLabClip,
} from '../../lib/soundlab-types.js';

export interface CreateSoundLabCopilotToolsOptions {
  activeSessionId: string;
  broadcastChanged?: () => void;
}

export function createSoundLabCopilotTools({
  activeSessionId,
  broadcastChanged,
}: CreateSoundLabCopilotToolsOptions) {
  const notify = () => broadcastChanged?.();

  // ─── 1. Read-only session snapshot ──────────────────────────────────────────

  const getSessionDetails = tool({
    description:
      'Inspect the active SoundLab session: BPM, key signature, modulation settings, ' +
      'all tracks with their type, config, patterns, clips, and automation lanes. ' +
      'Always call this first to ground subsequent edits in real session state.',
    inputSchema: z.object({
      sessionId: z
        .string()
        .optional()
        .describe('Session ID to inspect (defaults to active session)'),
    }),
    execute: async ({ sessionId }) => {
      const session = getSoundLabSession(sessionId ?? activeSessionId);
      if (!session) {
        return {
          success: false,
          error: `Session ${sessionId ?? activeSessionId} not found`,
        };
      }

      return {
        success: true,
        session: {
          id: session.id,
          title: session.title,
          bpm: session.bpm,
          keySignature: session.keySignature,
          durationBeats: session.durationBeats,
          loopEnabled: session.loopEnabled,
          loopStartBeat: session.loopStartBeat,
          loopEndBeat: session.loopEndBeat,
          trackCount: session.tracks.length,
          tracks: session.tracks.map((t) => ({
            id: t.id,
            name: t.name,
            type: t.type,
            muted: t.muted,
            solo: t.solo,
            volume: t.volume,
            pan: t.pan,
            color: t.color,
            config: t.config,
            patternCount: t.patterns.length,
            patterns: t.patterns.map((p) => ({
              id: p.id,
              name: p.name,
              lengthBeats: p.lengthBeats,
              noteCount: p.notes.length,
              hasStepData: !!p.stepData,
            })),
            clipCount: t.clips.length,
            clips: t.clips,
            automationLanes: t.automation.map((a) => ({
              id: a.id,
              parameterId: a.parameterId,
              pointCount: a.points.length,
            })),
          })),
        },
      };
    },
  });

  // ─── 2. Tune entrainment parameters ─────────────────────────────────────────

  const tuneEntrainment = tool({
    description:
      'Adjust an entrainment track using physical audio settings: carrier frequency, modulation rate, mode, and AM depth. ' +
      'Treat these as sound-design parameters; do not imply a particular mental-state or clinical effect.',
    inputSchema: z.object({
      trackId: z.string().describe('ID of the entrainment track to tune'),
      carrierHz: z
        .number()
        .min(40)
        .max(1000)
        .optional()
        .describe('Carrier tone frequency in Hz (e.g. 432, 216, 136.1)'),
      beatHz: z
        .number()
        .min(0.5)
        .max(100)
        .optional()
        .describe('Modulation rate in Hz'),
      mode: z
        .enum(['binaural', 'isochronic', 'monaural', 'am-embed'])
        .optional()
        .describe('Entrainment delivery mode'),
      amDepth: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe(
          'AM modulation depth 0–1 (isochronic / monaural / am-embed only)',
        ),
      volume: z.number().min(0).max(1).optional().describe('Track volume 0–1'),
      sessionId: z.string().optional(),
    }),
    execute: async ({
      trackId,
      carrierHz,
      beatHz,
      mode,
      amDepth,
      volume,
      sessionId,
    }) => {
      const session = getSoundLabSession(sessionId ?? activeSessionId);
      if (!session) return { success: false, error: 'Session not found' };

      const trackIdx = session.tracks.findIndex((t) => t.id === trackId);
      if (trackIdx === -1)
        return { success: false, error: `Track ${trackId} not found` };

      const track = session.tracks[trackIdx];
      const updatedConfig = {
        ...track.config,
        ...(carrierHz !== undefined && { carrierHz }),
        ...(beatHz !== undefined && { beatHz }),
        ...(mode !== undefined && { mode: mode as EntrainmentMode }),
        ...(amDepth !== undefined && { amDepth }),
      };

      const updatedTrack = {
        ...track,
        config: updatedConfig,
        ...(volume !== undefined && { volume }),
      };

      const updatedTracks = [...session.tracks];
      updatedTracks[trackIdx] = updatedTrack;

      saveSoundLabSession({ ...session, tracks: updatedTracks });
      notify();

      return {
        success: true,
        trackId,
        updatedConfig,
        note:
          `Entrainment track "${track.name}" tuned: ` +
          [
            carrierHz && `carrier=${carrierHz}Hz`,
            beatHz && `beat=${beatHz}Hz`,
            mode && `mode=${mode}`,
            amDepth !== undefined && `amDepth=${amDepth}`,
          ]
            .filter(Boolean)
            .join(', '),
      };
    },
  });

  // ─── 3. Generate melody / chord pattern ─────────────────────────────────────

  const generateMelody = tool({
    description:
      'Write MIDI notes into a specific pattern of an instrument track. ' +
      'Notes are expressed as MIDI pitch (0–127; middle C = 60), start beat, ' +
      'duration in beats, and velocity 0–1. ' +
      'Use this to compose chords, arpeggios, bass lines, or ambient motifs in the session key.',
    inputSchema: z.object({
      trackId: z.string().describe('Instrument track ID'),
      patternId: z.string().describe('Pattern ID within that track'),
      notes: z
        .array(
          z.object({
            pitch: z
              .number()
              .int()
              .min(0)
              .max(127)
              .describe('MIDI pitch 0–127 (60 = C4)'),
            startBeat: z
              .number()
              .min(0)
              .describe('Beat offset from pattern start'),
            durationBeats: z
              .number()
              .positive()
              .describe('Note length in beats'),
            velocity: z
              .number()
              .min(0)
              .max(1)
              .default(0.7)
              .describe('Amplitude 0–1'),
          }),
        )
        .min(1)
        .describe('Array of note events to write'),
      replaceExisting: z
        .boolean()
        .default(true)
        .describe(
          'If true, clears existing notes before writing; false appends',
        ),
      sessionId: z.string().optional(),
    }),
    execute: async ({
      trackId,
      patternId,
      notes,
      replaceExisting,
      sessionId,
    }) => {
      const session = getSoundLabSession(sessionId ?? activeSessionId);
      if (!session) return { success: false, error: 'Session not found' };

      const trackIdx = session.tracks.findIndex((t) => t.id === trackId);
      if (trackIdx === -1)
        return { success: false, error: `Track ${trackId} not found` };

      const track = session.tracks[trackIdx];
      const patternIdx = track.patterns.findIndex((p) => p.id === patternId);
      if (patternIdx === -1)
        return { success: false, error: `Pattern ${patternId} not found` };

      const pattern = track.patterns[patternIdx];
      const newNotes: SoundLabNote[] = notes.map((n) => ({
        id: nanoid(),
        pitch: n.pitch,
        startBeat: n.startBeat,
        durationBeats: n.durationBeats,
        velocity: n.velocity,
      }));

      const finalNotes = replaceExisting
        ? newNotes
        : [...pattern.notes, ...newNotes];

      const updatedPattern = { ...pattern, notes: finalNotes };
      const updatedPatterns = [...track.patterns];
      updatedPatterns[patternIdx] = updatedPattern;

      const updatedTrack = { ...track, patterns: updatedPatterns };
      const updatedTracks = [...session.tracks];
      updatedTracks[trackIdx] = updatedTrack;

      saveSoundLabSession({ ...session, tracks: updatedTracks });
      notify();

      return {
        success: true,
        trackId,
        patternId,
        noteCount: finalNotes.length,
        note: `Wrote ${newNotes.length} note(s) into pattern "${pattern.name}" on track "${track.name}".`,
      };
    },
  });

  // ─── 4. Generate 16-step drum pattern ───────────────────────────────────────

  const generateDrumPattern = tool({
    description:
      'Write a 16-step trigger grid for a drums track. ' +
      'The grid is 4 voices × 16 steps: voice 0 = Kick, 1 = Snare, 2 = Hi-hat, 3 = Clap. ' +
      'Each entry is a boolean (true = hit). ' +
      'Provide hip-hop, lo-fi, techno, or ambient patterns as requested.',
    inputSchema: z.object({
      trackId: z.string().describe('Drums track ID'),
      patternId: z.string().describe('Pattern ID within that track'),
      stepData: z
        .array(z.array(z.boolean()).length(16))
        .length(4)
        .describe(
          '4-voice × 16-step grid: [[kick16steps], [snare16steps], [hihat16steps], [clap16steps]]',
        ),
      sessionId: z.string().optional(),
    }),
    execute: async ({ trackId, patternId, stepData, sessionId }) => {
      const session = getSoundLabSession(sessionId ?? activeSessionId);
      if (!session) return { success: false, error: 'Session not found' };

      const trackIdx = session.tracks.findIndex((t) => t.id === trackId);
      if (trackIdx === -1)
        return { success: false, error: `Track ${trackId} not found` };

      const track = session.tracks[trackIdx];
      const patternIdx = track.patterns.findIndex((p) => p.id === patternId);
      if (patternIdx === -1)
        return { success: false, error: `Pattern ${patternId} not found` };

      const updatedPattern = {
        ...track.patterns[patternIdx],
        stepData,
      };
      const updatedPatterns = [...track.patterns];
      updatedPatterns[patternIdx] = updatedPattern;

      const updatedTrack = { ...track, patterns: updatedPatterns };
      const updatedTracks = [...session.tracks];
      updatedTracks[trackIdx] = updatedTrack;

      saveSoundLabSession({ ...session, tracks: updatedTracks });
      notify();

      const voices = ['Kick', 'Snare', 'Hi-hat', 'Clap'];
      const hitSummary = stepData
        .map((row, i) => `${voices[i]}: ${row.filter(Boolean).length}/16`)
        .join(', ');

      return {
        success: true,
        trackId,
        patternId,
        hitSummary,
        note: `Drum grid written on track "${track.name}": ${hitSummary}`,
      };
    },
  });

  // ─── 5. Arrange clips on the timeline ───────────────────────────────────────

  const arrangeTimeline = tool({
    description:
      'Place pattern clips on the arrangement ruler, creating the song structure. ' +
      'Each clip references a pattern and specifies an absolute start beat and duration. ' +
      'Use this to layer pads in bars 1–16, bring drums in at bar 9, and add entrainment sweeps later.',
    inputSchema: z.object({
      clips: z
        .array(
          z.object({
            trackId: z.string().describe('Track that owns the pattern'),
            patternId: z.string().describe('Pattern to instance as a clip'),
            startBeat: z
              .number()
              .min(0)
              .describe('Absolute beat position on the arrangement'),
            durationBeats: z
              .number()
              .positive()
              .describe(
                'Clip duration in beats (may be shorter than pattern for trim)',
              ),
          }),
        )
        .min(1)
        .describe('Clips to add to the arrangement'),
      replaceTrackClips: z
        .boolean()
        .default(false)
        .describe(
          'If true, clear all existing clips from affected tracks before adding new ones',
        ),
      sessionId: z.string().optional(),
    }),
    execute: async ({ clips, replaceTrackClips, sessionId }) => {
      const session = getSoundLabSession(sessionId ?? activeSessionId);
      if (!session) return { success: false, error: 'Session not found' };

      const affectedTrackIds = [...new Set(clips.map((c) => c.trackId))];
      const updatedTracks = session.tracks.map((track) => {
        if (!affectedTrackIds.includes(track.id)) return track;

        const existingClips = replaceTrackClips ? [] : [...track.clips];
        const newClips: SoundLabClip[] = clips
          .filter((c) => c.trackId === track.id)
          .map((c) => ({
            id: nanoid(),
            trackId: track.id,
            patternId: c.patternId,
            startBeat: c.startBeat,
            durationBeats: c.durationBeats,
          }));

        return {
          ...track,
          clips: [...existingClips, ...newClips].sort(
            (a, b) => a.startBeat - b.startBeat,
          ),
        };
      });

      saveSoundLabSession({ ...session, tracks: updatedTracks });
      notify();

      return {
        success: true,
        clipsAdded: clips.length,
        affectedTracks: affectedTrackIds.length,
        note: `Added ${clips.length} clip(s) across ${affectedTrackIds.length} track(s) on the arrangement.`,
      };
    },
  });

  // ─── 6. Configure per-track effects ─────────────────────────────────────────

  const configureEffects = tool({
    description:
      'Set 3-band EQ, convolution reverb (wet level + decay), and stereo delay (time, feedback, wet) ' +
      'on any track. Use to push pads deep in reverb space, cut low-mid mud from bass, ' +
      'add ping-pong delay shimmer, or sculpt spectral space between layers.',
    inputSchema: z.object({
      trackId: z.string().describe('Track to configure'),
      eq: z
        .object({
          lowGain: z.number().min(-18).max(18).describe('Low-shelf gain in dB'),
          midGain: z.number().min(-18).max(18).describe('Mid-peak gain in dB'),
          highGain: z
            .number()
            .min(-18)
            .max(18)
            .describe('High-shelf gain in dB'),
          midFreq: z
            .number()
            .min(200)
            .max(8000)
            .describe('Mid-peak centre frequency in Hz'),
        })
        .optional()
        .describe('3-band EQ settings'),
      reverb: z
        .object({
          wet: z.number().min(0).max(1).describe('Reverb wet level 0–1'),
          decay: z
            .number()
            .min(0.1)
            .max(10)
            .describe('Reverb decay time in seconds'),
        })
        .optional()
        .describe('Convolution reverb settings'),
      delay: z
        .object({
          timeMs: z.number().min(10).max(2000).describe('Delay time in ms'),
          feedback: z
            .number()
            .min(0)
            .max(0.95)
            .describe('Delay feedback 0–0.95'),
          wet: z.number().min(0).max(1).describe('Delay wet level 0–1'),
        })
        .optional()
        .describe('Stereo delay settings'),
      sessionId: z.string().optional(),
    }),
    execute: async ({ trackId, eq, reverb, delay, sessionId }) => {
      const session = getSoundLabSession(sessionId ?? activeSessionId);
      if (!session) return { success: false, error: 'Session not found' };

      const trackIdx = session.tracks.findIndex((t) => t.id === trackId);
      if (trackIdx === -1)
        return { success: false, error: `Track ${trackId} not found` };

      const track = session.tracks[trackIdx];
      const updatedConfig = {
        ...track.config,
        ...(eq !== undefined && { eq }),
        ...(reverb !== undefined && { reverb }),
        ...(delay !== undefined && { delay }),
      };

      const updatedTracks = [...session.tracks];
      updatedTracks[trackIdx] = { ...track, config: updatedConfig };

      saveSoundLabSession({ ...session, tracks: updatedTracks });
      notify();

      const applied = [eq && 'EQ', reverb && 'Reverb', delay && 'Delay']
        .filter(Boolean)
        .join(', ');

      return {
        success: true,
        trackId,
        appliedEffects: applied,
        note: `Effects updated on track "${track.name}": ${applied}`,
      };
    },
  });

  // ─── 7. Add automation curve ─────────────────────────────────────────────────

  const addAutomationCurve = tool({
    description:
      'Insert automation points on a track lane to create dynamic sweeps and ramps. ' +
      'Supported parameters: entrainment.beatHz, entrainment.carrierHz, entrainment.depth, ' +
      'track.volume, track.pan. ' +
      'Use for gentle volume fade-ins, entrainment beat-Hz ramps across a session, ' +
      'or stereo movement across the arrangement.',
    inputSchema: z.object({
      trackId: z.string().describe('Track that owns the automation lane'),
      parameterId: z
        .enum([
          'entrainment.beatHz',
          'entrainment.carrierHz',
          'entrainment.depth',
          'track.volume',
          'track.pan',
        ])
        .describe('Parameter to automate'),
      points: z
        .array(
          z.object({
            beat: z
              .number()
              .min(0)
              .describe('Absolute beat position of this automation point'),
            value: z
              .number()
              .describe(
                'Normalised parameter value in its native range ' +
                  '(Hz for Hz params, 0–1 for volume/depth, -1..1 for pan)',
              ),
          }),
        )
        .min(2)
        .describe('Automation points — minimum 2 for a meaningful curve'),
      replaceExisting: z
        .boolean()
        .default(false)
        .describe('If true, replaces any existing points on this lane'),
      sessionId: z.string().optional(),
    }),
    execute: async ({
      trackId,
      parameterId,
      points,
      replaceExisting,
      sessionId,
    }) => {
      const session = getSoundLabSession(sessionId ?? activeSessionId);
      if (!session) return { success: false, error: 'Session not found' };

      const trackIdx = session.tracks.findIndex((t) => t.id === trackId);
      if (trackIdx === -1)
        return { success: false, error: `Track ${trackId} not found` };

      const track = session.tracks[trackIdx];

      const newPoints: SoundLabAutomationPoint[] = points.map((p) => ({
        id: nanoid(),
        beat: p.beat,
        value: p.value,
      }));

      const existingLaneIdx = track.automation.findIndex(
        (a) => a.parameterId === parameterId,
      );

      let updatedAutomation: SoundLabAutomationLane[];

      if (existingLaneIdx === -1) {
        // Create a new lane
        const newLane: SoundLabAutomationLane = {
          id: nanoid(),
          parameterId: parameterId as AutomationParameterId,
          expanded: true,
          points: newPoints,
        };
        updatedAutomation = [...track.automation, newLane];
      } else {
        const existingLane = track.automation[existingLaneIdx];
        const mergedPoints = replaceExisting
          ? newPoints
          : [...existingLane.points, ...newPoints].sort(
              (a, b) => a.beat - b.beat,
            );

        const updatedLane: SoundLabAutomationLane = {
          ...existingLane,
          points: mergedPoints,
        };
        updatedAutomation = [...track.automation];
        updatedAutomation[existingLaneIdx] = updatedLane;
      }

      const updatedTracks = [...session.tracks];
      updatedTracks[trackIdx] = { ...track, automation: updatedAutomation };

      saveSoundLabSession({ ...session, tracks: updatedTracks });
      notify();

      const range =
        points.length >= 2
          ? ` (beat ${points[0].beat} → ${points[points.length - 1].beat}, ` +
            `value ${points[0].value} → ${points[points.length - 1].value})`
          : '';

      return {
        success: true,
        trackId,
        parameterId,
        pointsAdded: newPoints.length,
        note: `Automation curve written for ${parameterId} on track "${track.name}"${range}.`,
      };
    },
  });

  return {
    getSessionDetails,
    tuneEntrainment,
    generateMelody,
    generateDrumPattern,
    arrangeTimeline,
    configureEffects,
    addAutomationCurve,
  };
}
