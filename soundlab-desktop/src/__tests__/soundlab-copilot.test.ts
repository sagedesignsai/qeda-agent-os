/**
 * __tests__/soundlab-copilot.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit and integration tests for the SoundLab Copilot AI Agent & Tools:
 *   - Autonomous sound design tools (getSessionDetails, tuneEntrainment,
 *     generateMelody, generateDrumPattern, arrangeTimeline, configureEffects,
 *     addAutomationCurve)
 *   - Database persistence and broadcastChanged notifications
 *   - ToolLoopAgent setup, instructions grounding, and session context assembly
 * ─────────────────────────────────────────────────────────────────────────────
 */

// The `ai` package is ESM-only; mock tool and ToolLoopAgent before any imports
jest.mock('ai', () => ({
  tool: jest.fn((config: unknown) => config),
  ToolLoopAgent: jest.fn().mockImplementation((config: unknown) => config),
  isStepCount: jest.fn(),
}));

// Mock electron app and safeStorage
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn().mockReturnValue('/tmp/test-docugent-userData'),
  },
  safeStorage: {
    isEncryptionAvailable: jest.fn().mockReturnValue(false),
  },
  ipcMain: {
    handle: jest.fn(),
  },
}));

// Mock ai settings and provider
jest.mock('../main/ai/settings.js', () => ({
  getSettings: jest.fn(() => ({
    activeProvider: 'mock-provider',
    activeModel: 'mock-model',
  })),
}));

jest.mock('../main/ai/provider.js', () => ({
  resolveModel: jest.fn().mockReturnValue({
    modelId: 'mock-model',
    doGenerate: jest.fn(),
    doStream: jest.fn(),
  }),
}));

import Database from 'better-sqlite3';
import { applyMigrations } from '../main/db/schema';
import { useTestDatabase } from '../main/db/client';
import {
  saveSoundLabSession,
  getSoundLabSession,
} from '../main/db/soundlab-store';
import {
  buildDefaultTracks,
  type SoundLabSessionWithTracks,
} from '../lib/soundlab-types';
import { createSoundLabCopilotTools } from '../main/tools/soundlab-copilot';
import { createSoundLabCopilotAgent } from '../main/ai/soundlab-copilot-agent';

describe('SoundLab Copilot AI Tools & Agent', () => {
  let db: InstanceType<typeof Database>;
  const mockBroadcast = jest.fn();

  const sessionId = 'test-session-copilot-1';
  let sampleSession: SoundLabSessionWithTracks;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db as any);
    mockBroadcast.mockClear();

    sampleSession = {
      id: sessionId,
      projectId: null,
      title: 'Deep Focus Alpha Session',
      bpm: 90,
      keySignature: 'Am',
      targetBand: 'alpha',
      durationBeats: 64,
      loopEnabled: false,
      loopStartBeat: 0,
      loopEndBeat: 32,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tracks: buildDefaultTracks(sessionId, 'alpha', 'deep-focus'),
    };

    saveSoundLabSession(sampleSession);
  });

  afterEach(() => {
    useTestDatabase(null as any);
    db.close();
  });

  describe('Autonomous SoundLab Tools Suite', () => {
    it('getSessionDetails returns session overview and tracks', async () => {
      const tools = createSoundLabCopilotTools({
        activeSessionId: sessionId,
        broadcastChanged: mockBroadcast,
      });

      const result = await (tools.getSessionDetails as any).execute(
        {},
        {} as any,
      );
      expect(result.success).toBe(true);
      expect(result.session.id).toBe(sessionId);
      expect(result.session.bpm).toBe(90);
      expect(result.session.keySignature).toBe('Am');
      expect(result.session.tracks.length).toBeGreaterThan(0);
    });

    it('getSessionDetails returns error for non-existent session', async () => {
      const tools = createSoundLabCopilotTools({
        activeSessionId: 'non-existent-id',
        broadcastChanged: mockBroadcast,
      });

      const result = await (tools.getSessionDetails as any).execute(
        {},
        {} as any,
      );
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found/i);
    });

    it('tuneEntrainment updates entrainment parameters and notifies renderer', async () => {
      const tools = createSoundLabCopilotTools({
        activeSessionId: sessionId,
        broadcastChanged: mockBroadcast,
      });

      const entrainmentTrack = sampleSession.tracks.find(
        (t) => t.type === 'entrainment',
      )!;
      expect(entrainmentTrack).toBeDefined();

      const result = await (tools.tuneEntrainment as any).execute(
        {
          trackId: entrainmentTrack.id,
          carrierHz: 432,
          beatHz: 6,
          mode: 'isochronic',
          amDepth: 0.85,
          volume: 0.9,
        },
        {} as any,
      );

      expect(result.success).toBe(true);
      expect(mockBroadcast).toHaveBeenCalledTimes(1);

      // Verify persisted in DB
      const updated = getSoundLabSession(sessionId);
      const updatedTrack = updated?.tracks.find(
        (t) => t.id === entrainmentTrack.id,
      );
      expect(updatedTrack?.config.targetBand).toBe('alpha');
      expect(updatedTrack?.config.carrierHz).toBe(432);
      expect(updatedTrack?.config.beatHz).toBe(6);
      expect(updatedTrack?.config.mode).toBe('isochronic');
      expect(updatedTrack?.config.amDepth).toBe(0.85);
      expect(updatedTrack?.volume).toBe(0.9);
    });

    it('generateMelody writes notes into pattern with replaceExisting=true', async () => {
      const tools = createSoundLabCopilotTools({
        activeSessionId: sessionId,
        broadcastChanged: mockBroadcast,
      });

      const instrumentTrack = sampleSession.tracks.find(
        (t) => t.type === 'instrument',
      )!;
      expect(instrumentTrack).toBeDefined();
      const pattern = instrumentTrack.patterns[0];

      const newNotes = [
        { pitch: 60, startBeat: 0, durationBeats: 2, velocity: 0.8 },
        { pitch: 64, startBeat: 2, durationBeats: 2, velocity: 0.8 },
        { pitch: 67, startBeat: 4, durationBeats: 4, velocity: 0.8 },
      ];

      const result = await (tools.generateMelody as any).execute(
        {
          trackId: instrumentTrack.id,
          patternId: pattern.id,
          notes: newNotes,
          replaceExisting: true,
        },
        {} as any,
      );

      expect(result.success).toBe(true);
      expect(result.noteCount).toBe(3);
      expect(mockBroadcast).toHaveBeenCalledTimes(1);

      const updated = getSoundLabSession(sessionId);
      const updatedPat = updated?.tracks
        .find((t) => t.id === instrumentTrack.id)
        ?.patterns.find((p) => p.id === pattern.id);
      expect(updatedPat?.notes.length).toBe(3);
      expect(updatedPat?.notes[0].pitch).toBe(60);
    });

    it('generateMelody appends notes when replaceExisting=false', async () => {
      const tools = createSoundLabCopilotTools({
        activeSessionId: sessionId,
        broadcastChanged: mockBroadcast,
      });

      const instrumentTrack = sampleSession.tracks.find(
        (t) => t.type === 'instrument',
      )!;
      const pattern = instrumentTrack.patterns[0];
      const initialCount = pattern.notes.length;

      const appendNotes = [
        { pitch: 72, startBeat: 8, durationBeats: 1, velocity: 0.9 },
      ];

      const result = await (tools.generateMelody as any).execute(
        {
          trackId: instrumentTrack.id,
          patternId: pattern.id,
          notes: appendNotes,
          replaceExisting: false,
        },
        {} as any,
      );

      expect(result.success).toBe(true);
      expect(result.noteCount).toBe(initialCount + 1);

      const updated = getSoundLabSession(sessionId);
      const updatedPat = updated?.tracks
        .find((t) => t.id === instrumentTrack.id)
        ?.patterns.find((p) => p.id === pattern.id);
      expect(updatedPat?.notes.length).toBe(initialCount + 1);
    });

    it('generateDrumPattern writes 4x16 step grid for drum track', async () => {
      const tools = createSoundLabCopilotTools({
        activeSessionId: sessionId,
        broadcastChanged: mockBroadcast,
      });

      const drumsTrack = sampleSession.tracks.find((t) => t.type === 'drums')!;
      const pattern = drumsTrack.patterns[0];

      // 4 voices x 16 steps
      const kick = Array(16).fill(false);
      kick[0] = true;
      kick[8] = true;
      const snare = Array(16).fill(false);
      snare[4] = true;
      snare[12] = true;
      const hihat = Array(16).fill(true);
      const clap = Array(16).fill(false);

      const stepData = [kick, snare, hihat, clap];

      const result = await (tools.generateDrumPattern as any).execute(
        {
          trackId: drumsTrack.id,
          patternId: pattern.id,
          stepData,
        },
        {} as any,
      );

      expect(result.success).toBe(true);
      expect(mockBroadcast).toHaveBeenCalledTimes(1);

      const updated = getSoundLabSession(sessionId);
      const updatedPat = updated?.tracks
        .find((t) => t.id === drumsTrack.id)
        ?.patterns.find((p) => p.id === pattern.id);
      expect(updatedPat?.stepData).toEqual(stepData);
    });

    it('arrangeTimeline places clips and sorts by startBeat', async () => {
      const tools = createSoundLabCopilotTools({
        activeSessionId: sessionId,
        broadcastChanged: mockBroadcast,
      });

      const track = sampleSession.tracks[0];
      const pattern = track.patterns[0];

      const clips = [
        {
          trackId: track.id,
          patternId: pattern.id,
          startBeat: 16,
          durationBeats: 8,
        },
        {
          trackId: track.id,
          patternId: pattern.id,
          startBeat: 0,
          durationBeats: 8,
        },
      ];

      const result = await (tools.arrangeTimeline as any).execute(
        {
          clips,
          replaceTrackClips: true,
        },
        {} as any,
      );

      expect(result.success).toBe(true);
      expect(result.clipsAdded).toBe(2);
      expect(mockBroadcast).toHaveBeenCalledTimes(1);

      const updated = getSoundLabSession(sessionId);
      const updatedClips = updated?.tracks.find(
        (t) => t.id === track.id,
      )?.clips;
      expect(updatedClips?.length).toBe(2);
      // Verify sorted by startBeat
      expect(updatedClips?.[0].startBeat).toBe(0);
      expect(updatedClips?.[1].startBeat).toBe(16);
    });

    it('configureEffects adjusts EQ, reverb, and delay settings', async () => {
      const tools = createSoundLabCopilotTools({
        activeSessionId: sessionId,
        broadcastChanged: mockBroadcast,
      });

      const track = sampleSession.tracks[0];

      const result = await (tools.configureEffects as any).execute(
        {
          trackId: track.id,
          eq: {
            lowGain: -3,
            midGain: 2,
            highGain: -4,
            midFreq: 1200,
          },
          reverb: {
            decay: 4.5,
            wet: 0.65,
          },
          delay: {
            timeMs: 375,
            feedback: 0.45,
            wet: 0.3,
          },
        },
        {} as any,
      );

      expect(result.success).toBe(true);
      expect(mockBroadcast).toHaveBeenCalledTimes(1);

      const updated = getSoundLabSession(sessionId);
      const config = updated?.tracks.find((t) => t.id === track.id)
        ?.config as any;
      expect(config?.eq?.lowGain).toBe(-3);
      expect(config?.eq?.midGain).toBe(2);
      expect(config?.eq?.midFreq).toBe(1200);
      expect(config?.reverb?.decay).toBe(4.5);
      expect(config?.reverb?.wet).toBe(0.65);
      expect(config?.delay?.timeMs).toBe(375);
      expect(config?.delay?.feedback).toBe(0.45);
    });

    it('addAutomationCurve inserts and merges automation points', async () => {
      const tools = createSoundLabCopilotTools({
        activeSessionId: sessionId,
        broadcastChanged: mockBroadcast,
      });

      const track = sampleSession.tracks[0];

      const result = await (tools.addAutomationCurve as any).execute(
        {
          trackId: track.id,
          parameterId: 'track.volume',
          points: [
            { beat: 0, value: 0 },
            { beat: 8, value: 0.8 },
            { beat: 16, value: 0.8 },
          ],
          replaceExisting: true,
        },
        {} as any,
      );

      expect(result.success).toBe(true);
      expect(result.pointsAdded).toBe(3);
      expect(mockBroadcast).toHaveBeenCalledTimes(1);

      const updated = getSoundLabSession(sessionId);
      const lane = updated?.tracks
        .find((t) => t.id === track.id)
        ?.automation.find((a) => a.parameterId === 'track.volume');
      expect(lane).toBeDefined();
      expect(lane?.points.length).toBe(3);
      expect(lane?.points[1].beat).toBe(8);
      expect(lane?.points[1].value).toBe(0.8);
    });
  });

  describe('Autonomous SoundLab Copilot Agent', () => {
    it('creates ToolLoopAgent with session instructions and all 7 tools', () => {
      const agent = createSoundLabCopilotAgent({
        activeSessionId: sessionId,
        currentBeat: 16,
        broadcastChanged: mockBroadcast,
      });

      expect(agent).toBeDefined();
      const agentConfig = agent as any;
      expect(agentConfig.tools).toBeDefined();
      expect(agentConfig.tools.getSessionDetails).toBeDefined();
      expect(agentConfig.tools.tuneEntrainment).toBeDefined();
      expect(agentConfig.tools.generateMelody).toBeDefined();
      expect(agentConfig.tools.generateDrumPattern).toBeDefined();
      expect(agentConfig.tools.arrangeTimeline).toBeDefined();
      expect(agentConfig.tools.configureEffects).toBeDefined();
      expect(agentConfig.tools.addAutomationCurve).toBeDefined();

      // Check instructions contain session context
      expect(agentConfig.instructions).toContain('Deep Focus Alpha Session');
      expect(agentConfig.instructions).toContain('BPM: 90');
      expect(agentConfig.instructions).toContain('Playhead: beat 16');
      expect(agentConfig.instructions).toContain('Target band: alpha');
    });
  });
});
