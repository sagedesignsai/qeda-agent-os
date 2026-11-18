/**
 * __tests__/browser-use-recording.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * A screen take only shows what is on screen, so `openBrowser` must not honour
 * a hidden-window request while the agent is recording. That forced-visible
 * branch is the difference between a demo and a recording of an empty desktop.
 * ─────────────────────────────────────────────────────────────────────────────
 */

jest.mock('ai', () => ({
  tool: jest.fn((config: unknown) => config),
}));

jest.mock('../main/browser-use', () => ({
  openBrowser: jest.fn(() => ({ id: 'browser-1' })),
}));

import * as bu from '../main/browser-use';
import { browserUseTools } from '../main/tools/browser-use';
import {
  startStudioRecording,
  __studioRecorderTesting,
  type StudioRecorderDeps,
} from '../main/studio-recorder';

const recordingDeps = (): StudioRecorderDeps => ({
  now: () => 1_000_000,
  enabled: () => true,
  startCapture: async () => ({ stop: async () => undefined }),
  sampleCursor: () => ({ x: 0, y: 0 }),
  primaryDisplay: () => ({
    x: 0,
    y: 0,
    width: 1280,
    height: 800,
    scaleFactor: 1,
  }),
  ensureDir: async () => undefined,
});

const execute = (
  browserUseTools.openBrowser as unknown as {
    execute: (
      input: { url: string; visible?: boolean },
      opts: unknown,
    ) => Promise<any>;
  }
).execute;

describe('openBrowser during a demo recording', () => {
  beforeEach(() => {
    __studioRecorderTesting.reset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    __studioRecorderTesting.reset();
  });

  it('forces the browser visible while a capture is running', async () => {
    await startStudioRecording({}, recordingDeps());

    const result = await execute({ url: 'https://example.com' }, {});

    expect(bu.openBrowser).toHaveBeenCalledWith('https://example.com', {
      visible: true,
      partition: undefined,
    });
    expect(result).toMatchObject({ success: true, visible: true });
  });

  it('respects the caller default when nothing is being recorded', async () => {
    const result = await execute({ url: 'https://example.com' }, {});

    expect(bu.openBrowser).toHaveBeenCalledWith('https://example.com', {
      visible: false,
      partition: undefined,
    });
    expect(result).toMatchObject({ success: true, visible: false });
  });
});
