/**
 * __tests__/studio-copilot.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit and integration tests for the Studio Copilot AI Agent & Tools:
 *   - Autonomous studio tools (getTakeDetails, addKineticZoom, removeKineticZoom,
 *     cutSilenceOrRange, setCaptions, updateStyling, generateSocialKit)
 *   - Database mutation and broadcastChanged notifications
 *   - Agent creation and dynamic context assembly
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
  saveStudioTake,
  getStudioTake,
  type StudioTake,
  DEFAULT_STUDIO_STYLING,
} from '../main/db/studio-store';
import { createStudioTools } from '../main/tools/studio';
import { createStudioCopilotAgent } from '../main/ai/studio-copilot-agent';

describe('Studio Copilot AI Tools & Agent', () => {
  let db: Database.Database;
  const mockBroadcast = jest.fn();

  const sampleTake: StudioTake = {
    id: 'take-copilot-test-1',
    projectId: null,
    title: 'Copilot Feature Walkthrough',
    description: 'Testing studio copilot autonomous tools',
    sourceType: 'window',
    sourceName: 'VSCode Window',
    durationMs: 15000,
    videoPath: '/path/to/demo.webm',
    audioPath: null,
    mouseEventsPath: null,
    cuts: [],
    zooms: [],
    captions: [],
    styling: {
      ...DEFAULT_STUDIO_STYLING,
      aspectRatio: '16:9',
      padding: 35,
    },
    socialKit: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db);
    mockBroadcast.mockClear();

    saveStudioTake(sampleTake);
  });

  afterEach(() => {
    useTestDatabase(null as any);
    db.close();
  });

  describe('Autonomous Studio Tools Suite', () => {
    it('getTakeDetails returns take overview and styling', async () => {
      const tools = createStudioTools({
        activeTakeId: sampleTake.id,
        broadcastChanged: mockBroadcast,
      });

      const result = await (tools.getTakeDetails as any).execute({}, {} as any);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.take.id).toBe(sampleTake.id);
        expect(result.take.title).toBe(sampleTake.title);
        expect(result.take.durationSec).toBe(15);
        expect(result.take.zoomCount).toBe(0);
        expect(result.take.cutCount).toBe(0);
      }
    });

    it('addKineticZoom creates a zoom keyframe and notifies renderer', async () => {
      const tools = createStudioTools({
        activeTakeId: sampleTake.id,
        broadcastChanged: mockBroadcast,
      });

      const result = await (tools.addKineticZoom as any).execute(
        {
          startMs: 2000,
          endMs: 5000,
          scale: 1.8,
          targetX: 0.65,
          targetY: 0.35,
          reason: 'Highlight navbar interactive items',
        },
        {} as any
      );

      expect(result.success).toBe(true);
      expect(mockBroadcast).toHaveBeenCalledTimes(1);

      const updated = getStudioTake(sampleTake.id);
      expect(updated?.zooms).toHaveLength(1);
      expect(updated?.zooms[0].scale).toBe(1.8);
      expect(updated?.zooms[0].targetX).toBe(0.65);
      expect(updated?.zooms[0].targetY).toBe(0.35);
      expect(updated?.zooms[0].startMs).toBe(2000);
      expect(updated?.zooms[0].endMs).toBe(5000);
    });

    it('removeKineticZoom removes a zoom keyframe by ID', async () => {
      const tools = createStudioTools({
        activeTakeId: sampleTake.id,
        broadcastChanged: mockBroadcast,
      });

      // Add zoom first
      const addRes = await (tools.addKineticZoom as any).execute(
        {
          startMs: 1000,
          endMs: 3000,
          scale: 1.5,
          targetX: 0.5,
          targetY: 0.5,
        },
        {} as any
      );
      expect(addRes.success).toBe(true);

      const zoomId = addRes.addedZoom.id;
      mockBroadcast.mockClear();

      const removeRes = await (tools.removeKineticZoom as any).execute(
        { zoomId },
        {} as any
      );
      expect(removeRes.success).toBe(true);
      expect(mockBroadcast).toHaveBeenCalledTimes(1);

      const updated = getStudioTake(sampleTake.id);
      expect(updated?.zooms).toHaveLength(0);
    });

    it('cutSilenceOrRange marks a dead-air interval as pruned', async () => {
      const tools = createStudioTools({
        activeTakeId: sampleTake.id,
        broadcastChanged: mockBroadcast,
      });

      const cutRes = await (tools.cutSilenceOrRange as any).execute(
        {
          startMs: 6000,
          endMs: 7500,
          reason: 'Dead air silence',
        },
        {} as any
      );

      expect(cutRes.success).toBe(true);
      expect(mockBroadcast).toHaveBeenCalledTimes(1);

      const updated = getStudioTake(sampleTake.id);
      expect(updated?.cuts).toHaveLength(1);
      expect(updated?.cuts[0].startMs).toBe(6000);
      expect(updated?.cuts[0].endMs).toBe(7500);
      expect(updated?.cuts[0].reason).toBe('Dead air silence');
    });

    it('setCaptions configures timed subtitle snippets', async () => {
      const tools = createStudioTools({
        activeTakeId: sampleTake.id,
        broadcastChanged: mockBroadcast,
      });

      const captionRes = await (tools.setCaptions as any).execute(
        {
          captions: [
            {
              startMs: 500,
              endMs: 3500,
              text: 'Welcome to Qeda Studio Showcase',
              words: [
                { word: 'Welcome', startMs: 500, endMs: 1000 },
                { word: 'to', startMs: 1050, endMs: 1200 },
                { word: 'Qeda', startMs: 1250, endMs: 1800 },
              ],
            },
          ],
        },
        {} as any
      );

      expect(captionRes.success).toBe(true);
      expect(mockBroadcast).toHaveBeenCalledTimes(1);

      const updated = getStudioTake(sampleTake.id);
      expect(updated?.captions).toHaveLength(1);
      expect(updated?.captions[0].text).toBe('Welcome to Qeda Studio Showcase');
      expect(updated?.styling.showCaptions).toBe(true);
    });

    it('updateStyling adjusts aspect ratio, padding, and background', async () => {
      const tools = createStudioTools({
        activeTakeId: sampleTake.id,
        broadcastChanged: mockBroadcast,
      });

      const styleRes = await (tools.updateStyling as any).execute(
        {
          aspectRatio: '9:16',
          padding: 25,
          borderRadius: 20,
          background: '#09090b',
          cameraEasing: 'snappy',
        },
        {} as any
      );

      expect(styleRes.success).toBe(true);
      expect(mockBroadcast).toHaveBeenCalledTimes(1);

      const updated = getStudioTake(sampleTake.id);
      expect(updated?.styling.aspectRatio).toBe('9:16');
      expect(updated?.styling.padding).toBe(25);
      expect(updated?.styling.borderRadius).toBe(20);
      expect(updated?.styling.background).toBe('#09090b');
      expect(updated?.styling.cameraEasing).toBe('snappy');
    });

    it('generateSocialKit stores release copy into the take', async () => {
      const tools = createStudioTools({
        activeTakeId: sampleTake.id,
        broadcastChanged: mockBroadcast,
      });

      const kitRes = await (tools.generateSocialKit as any).execute(
        {
          title: 'Introducing Studio Copilot',
          summary: 'Automate your video showcase directing with autonomous AI.',
          tweet: '🚀 Turn raw recordings into viral showcases with AI! #devrel',
          changelog: '### Features\n- Added Studio Copilot with kinetic zoom tools',
          linkedIn: 'Excited to announce our new Studio Video Copilot!',
        },
        {} as any
      );

      expect(kitRes.success).toBe(true);
      expect(mockBroadcast).toHaveBeenCalledTimes(1);

      const updated = getStudioTake(sampleTake.id);
      expect(updated?.socialKit?.title).toBe('Introducing Studio Copilot');
      expect(updated?.socialKit?.tweet).toContain('#devrel');
    });
  });

  describe('Studio Copilot Agent Construction', () => {
    it('creates ToolLoopAgent with dynamic instructions and studio tools', () => {
      const agent = createStudioCopilotAgent({
        activeTakeId: sampleTake.id,
        activeProject: 'Project Alpha: Desktop Agent OS',
        currentTimeMs: 4200,
        broadcastChanged: mockBroadcast,
      });

      expect(agent).toBeDefined();
      expect(agent.tools).toBeDefined();
      expect(agent.tools.addKineticZoom).toBeDefined();
      expect(agent.tools.setCaptions).toBeDefined();
      expect(agent.tools.cutSilenceOrRange).toBeDefined();
      expect(agent.tools.updateStyling).toBeDefined();
      expect(agent.tools.generateSocialKit).toBeDefined();
    });
  });
});
