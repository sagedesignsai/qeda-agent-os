/**
 * __tests__/studio-recorder.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The agent-driven showcase recorder: capture argument construction per
 * platform, highlight → caption/zoom placement, and the start/mark/stop session
 * that turns all three streams into one take.
 *
 * The session tests inject every side effect (clock, cursor sampler, ffmpeg
 * process, draft pass) so the orchestration runs against a real SQLite store and
 * a real take directory without spawning ffmpeg or booting Electron — the same
 * recipe `studio-export.test.ts` uses for its ffmpeg runner.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { applyMigrations } from '../main/db/schema';
import { useTestDatabase } from '../main/db/client';
import { getStudioTake } from '../main/db/studio-store';
import {
  buildCaptureArgs,
  deriveHighlightPlacements,
  startStudioRecording,
  markStudioHighlight,
  stopStudioRecording,
  hasActiveStudioRecording,
  getActiveStudioRecordingState,
  getLastCompletedStudioRecording,
  __studioRecorderTesting,
  type StudioRecorderDeps,
} from '../main/studio-recorder';
import { computerUseTools } from '../main/tools/computer-use';

describe('buildCaptureArgs', () => {
  const geometry = { x: 16, y: 32, width: 1920, height: 1080, fps: 30 };
  const out = '/tmp/studio/recording.mp4';

  it('drives the Linux X11 grabber with an explicit region', () => {
    const args = buildCaptureArgs('linux', geometry, out);

    expect(args).toContain('x11grab');
    expect(args).toContain('-video_size');
    expect(args).toContain('1920x1080');
    expect(args).toContain(':0.0+16,32');
    expect(args[args.length - 1]).toBe(out);
    expect(args).toContain('+faststart');
    expect(args).toContain('-g');
    expect(args).toContain('30');
    expect(args).toContain('-keyint_min');
    expect(args).toContain('-scenecut');
    expect(args).toContain('0');
  });

  it('drives gdigrab with its own offset flags, since it takes no display key', () => {
    const args = buildCaptureArgs('win32', geometry, out);

    expect(args).toContain('gdigrab');
    expect(args).toContain('-offset_x');
    expect(args).toContain('16');
    expect(args).toContain('-video_size');
    expect(args).toContain('desktop');
    expect(args[args.length - 1]).toBe(out);
  });

  it('drives avfoundation and records no audio', () => {
    const args = buildCaptureArgs('darwin', geometry, out);

    expect(args).toContain('avfoundation');
    expect(args).toContain('1:none');
    expect(args).toContain('-framerate');
    expect(args).toContain('30');
    expect(args[args.length - 1]).toBe(out);
  });
});

describe('deriveHighlightPlacements', () => {
  const displaySize = { width: 1920, height: 1080 };
  const cursorSamples = [
    { t: 2300, x: 800, y: 200, type: 'move' as const },
    { t: 2500, x: 1000, y: 400, type: 'move' as const },
    // Outside the window around the highlight: must not pull the zoom off target.
    { t: 6000, x: 1900, y: 1000, type: 'move' as const },
  ];

  it('turns each highlight into a caption at its own timestamp', () => {
    const { captions } = deriveHighlightPlacements({
      durationMs: 12000,
      highlights: [
        { tMs: 2400, label: 'Live preview updates' },
        { tMs: 8000, label: 'One command deploys' },
      ],
      cursorSamples,
      displaySize,
    });

    expect(captions).toHaveLength(2);
    expect(captions[0].startMs).toBe(2400);
    expect(captions[0].text).toBe('Live preview updates');
    expect(captions[1].startMs).toBe(8000);
    expect(captions[1].text).toBe('One command deploys');

    // Each caption holds until the next one starts, or until a comfortable read
    // is up — never past the end of the take.
    expect(captions[0].endMs).toBeLessThan(captions[1].startMs);
    expect(captions[1].endMs).toBeLessThanOrEqual(12000);
    expect(captions[1].endMs).toBeGreaterThan(captions[1].startMs);

    // Karaoke words spread across the caption window.
    const words = captions[0].words!;
    expect(words).toHaveLength(3);
    expect(words[0].startMs).toBe(captions[0].startMs);
    expect(words[words.length - 1].endMs).toBe(captions[0].endMs);
  });

  it('aims the zoom at where the cursor was during the highlight', () => {
    const { zooms } = deriveHighlightPlacements({
      durationMs: 12000,
      highlights: [{ tMs: 2400, label: 'Look here' }],
      cursorSamples,
      displaySize,
    });

    expect(zooms).toHaveLength(1);
    // 900/1920 and 300/1080 — the 6000ms sample must not have been averaged in.
    expect(zooms[0].targetX).toBe(0.469);
    expect(zooms[0].targetY).toBe(0.278);
    expect(zooms[0].startMs).toBeLessThanOrEqual(2400);
    expect(zooms[0].endMs).toBeGreaterThan(zooms[0].startMs);
    expect(zooms[0].scale).toBeGreaterThan(1);
  });

  it('falls back to a centred zoom when telemetry is missing', () => {
    const { zooms } = deriveHighlightPlacements({
      durationMs: 12000,
      highlights: [{ tMs: 2400, label: 'Look here' }],
      cursorSamples: [],
      displaySize,
    });

    expect(zooms).toHaveLength(1);
    expect(zooms[0].targetX).toBe(0.5);
    expect(zooms[0].targetY).toBe(0.5);
  });

  it('staggers zooms so two highlights never fight over the camera', () => {
    const { zooms } = deriveHighlightPlacements({
      durationMs: 20000,
      highlights: [
        { tMs: 2000, label: 'First beat' },
        { tMs: 2500, label: 'Second beat' },
      ],
      cursorSamples,
      displaySize,
    });

    expect(zooms).toHaveLength(2);
    expect(zooms[1].startMs).toBeGreaterThanOrEqual(zooms[0].endMs);
  });

  it('sorts unordered marks and keeps everything inside the take', () => {
    const { captions } = deriveHighlightPlacements({
      durationMs: 3000,
      highlights: [
        { tMs: 2500, label: 'Later' },
        { tMs: 500, label: 'Earlier' },
      ],
      cursorSamples,
      displaySize,
    });

    expect(captions.map((c) => c.text)).toEqual(['Earlier', 'Later']);
    for (const caption of captions) {
      expect(caption.startMs).toBeGreaterThanOrEqual(0);
      expect(caption.endMs).toBeLessThanOrEqual(3000);
      expect(caption.endMs).toBeGreaterThan(caption.startMs);
    }
  });

  it('produces nothing when there are no marks or no duration', () => {
    expect(
      deriveHighlightPlacements({
        durationMs: 5000,
        highlights: [],
        cursorSamples,
        displaySize,
      }),
    ).toEqual({ zooms: [], captions: [] });

    expect(
      deriveHighlightPlacements({
        durationMs: 0,
        highlights: [{ tMs: 0, label: 'Nothing to show' }],
        cursorSamples,
        displaySize,
      }),
    ).toEqual({ zooms: [], captions: [] });
  });
});

describe('studio recording sessions', () => {
  let db: Database.Database;
  let clock: number;
  const broadcast = jest.fn();
  const emitState = jest.fn();
  const stopCapture = jest.fn(async () => undefined);
  const capturedArgs: string[][] = [];
  const startCapture = jest.fn(async (args: string[]) => {
    capturedArgs.push(args);
    return { stop: stopCapture };
  });
  const applyDraft = jest.fn(async (takeId: string) => getStudioTake(takeId)!);

  const makeDeps = (
    overrides: Partial<StudioRecorderDeps> = {},
  ): StudioRecorderDeps => ({
    now: () => clock,
    enabled: () => true,
    startCapture,
    sampleCursor: () => ({ x: 100, y: 50 }),
    primaryDisplay: () => ({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      scaleFactor: 1,
    }),
    ensureDir: async () => undefined,
    applyDraft,
    broadcast,
    emitState,
    ...overrides,
  });

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db);
    clock = 1_000_000;
    broadcast.mockClear();
    emitState.mockClear();
    startCapture.mockClear();
    capturedArgs.length = 0;
    stopCapture.mockClear();
    applyDraft.mockClear();
    __studioRecorderTesting.reset();
  });

  afterEach(() => {
    __studioRecorderTesting.reset();
    useTestDatabase(null as any);
    db.close();
  });

  it('refuses to record when Computer Use is off', async () => {
    await expect(
      startStudioRecording({}, makeDeps({ enabled: () => false })),
    ).rejects.toThrow(/Computer Use/);
    expect(hasActiveStudioRecording()).toBe(false);
  });

  it('surfaces a capture that never starts, leaving no session behind', async () => {
    const failure = makeDeps({
      startCapture: jest.fn(async () => {
        throw new Error('ffmpeg screen capture failed: no DISPLAY');
      }),
    });

    await expect(startStudioRecording({}, failure)).rejects.toThrow(/DISPLAY/);
    expect(hasActiveStudioRecording()).toBe(false);
  });

  it('records a take with telemetry, then composes from the marks on stop', async () => {
    const written: Record<string, string> = {};
    const deps = makeDeps({
      writeFile: async (file, contents) => {
        written[file] = contents;
      },
    });

    const started = await startStudioRecording(
      { title: 'Builder Walkthrough', sourceName: 'Builder', projectId: null },
      deps,
    );

    expect(started.sessionId).toBeTruthy();
    expect(started.takeId).toBeTruthy();
    expect(hasActiveStudioRecording()).toBe(true);
    // The capture is live: the process was handed a grabber with a region.
    expect(capturedArgs[0]).toContain('x11grab');

    // The renderer can see what is being recorded without polling.
    expect(getActiveStudioRecordingState()).toMatchObject({
      sessionId: started.sessionId,
      takeId: started.takeId,
      title: 'Builder Walkthrough',
      sourceName: 'Builder',
      highlightCount: 0,
      fps: 30,
    });
    expect(emitState).toHaveBeenLastCalledWith({
      active: expect.objectContaining({ takeId: started.takeId }),
    });

    clock += 2400;
    const mark = markStudioHighlight(
      started.sessionId,
      'Live preview updates',
      deps,
    );
    expect(mark.tMs).toBe(2400);
    expect(getActiveStudioRecordingState()?.highlightCount).toBe(1);

    clock += 4600; // stop at 7000ms
    // The cursor sampler runs on a real 20ms interval, so give it a tick.
    await new Promise((resolve) => setTimeout(resolve, 60));
    const stopped = await stopStudioRecording(started.sessionId, deps);

    expect(stopped.durationMs).toBe(7000);
    expect(stopped.highlightCount).toBe(1);
    expect(hasActiveStudioRecording()).toBe(false);
    expect(stopCapture).toHaveBeenCalledTimes(1);
    expect(applyDraft).toHaveBeenCalledWith(started.takeId);
    expect(broadcast).toHaveBeenCalledTimes(1);
    // The finished take is named so the Studio page selects it, and the live
    // pill is told the capture ended.
    expect(broadcast).toHaveBeenCalledWith(started.takeId);
    expect(emitState).toHaveBeenLastCalledWith({ active: null });
    expect(getActiveStudioRecordingState()).toBeNull();
    expect(getLastCompletedStudioRecording()?.takeId).toBe(started.takeId);

    // Both observation streams were persisted beside the video.
    const mousePath = Object.keys(written).find((f) =>
      f.endsWith('mouse_events.json'),
    );
    const highlightsPath = Object.keys(written).find((f) =>
      f.endsWith('highlights.json'),
    );
    expect(mousePath).toBeTruthy();
    expect(highlightsPath).toBeTruthy();
    expect(JSON.parse(written[highlightsPath!])).toEqual([
      { tMs: 2400, label: 'Live preview updates' },
    ]);
    expect(JSON.parse(written[mousePath!]).length).toBeGreaterThan(0);

    const take = getStudioTake(started.takeId)!;
    expect(take.mouseEventsPath).toBe(mousePath);
    expect(take.videoPath).toContain('recording.mp4');
    expect(take.durationMs).toBe(7000);
    // Highlights win over telemetry: a caption and a zoom land on the mark.
    expect(take.captions).toHaveLength(1);
    expect(take.captions[0].text).toBe('Live preview updates');
    expect(take.zooms.length).toBeGreaterThan(0);
    expect(take.styling.showCaptions).toBe(true);
  });

  it('crops the capture to the selected window and keeps telemetry frame-relative', async () => {
    const written: Record<string, string> = {};
    const unpin = jest.fn();
    const pinWindow = jest.fn(() => unpin);
    const deps = makeDeps({
      resolveCapture: () => ({
        kind: 'window',
        label: 'Qeda Builder',
        captureRect: { x: 400, y: 200, width: 800, height: 600 },
        regionRect: { x: 400, y: 200, width: 800, height: 600 },
        display: {
          id: '1',
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          scaleFactor: 1,
          primary: true,
        },
        windowId: 7,
      }),
      pinWindow,
      sampleCursor: () => ({ x: 500, y: 300 }),
      writeFile: async (file, contents) => {
        written[file] = contents;
      },
    });

    const started = await startStudioRecording({ title: 'Window demo' }, deps);

    // The window is pinned before the first frame, so the opening seconds are
    // not a recording of whatever was covering it.
    expect(pinWindow).toHaveBeenCalledWith(7);
    // The grabber is cropped to the window, not the display.
    expect(capturedArgs[0]).toContain('800x600');
    expect(capturedArgs[0]).toContain(':0.0+400,200');
    expect(started.capture).toEqual({
      kind: 'window',
      label: 'Qeda Builder',
      width: 800,
      height: 600,
    });
    expect(getActiveStudioRecordingState()?.capture.kind).toBe('window');

    clock += 1000;
    // The sampler runs on a real interval, so give it a tick.
    await new Promise((resolve) => setTimeout(resolve, 60));
    const stopped = await stopStudioRecording(started.sessionId, deps);

    expect(unpin).toHaveBeenCalledTimes(1);

    // Telemetry is relative to the frame: the cursor at (500,300) on screen is
    // at (100,100) inside the window's recording.
    const mousePath = Object.keys(written).find((f) =>
      f.endsWith('mouse_events.json'),
    )!;
    const samples = JSON.parse(written[mousePath]);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples[0]).toMatchObject({ x: 100, y: 100 });

    const capturePath = Object.keys(written).find((f) =>
      f.endsWith('capture.json'),
    )!;
    expect(JSON.parse(written[capturePath])).toMatchObject({
      kind: 'window',
      label: 'Qeda Builder',
      width: 800,
      height: 600,
    });

    const take = getStudioTake(started.takeId)!;
    expect(take.sourceType).toBe('window');
    expect(take.sourceName).toBe('Qeda Builder');
    expect(stopped.highlightCount).toBe(0);
  });

  it('persists a display-level crop supplied by the resolver', async () => {
    const written: Record<string, string> = {};
    const deps = makeDeps({
      sampleCursor: () => ({ x: 500, y: 300 }),
      writeFile: async (file, contents) => {
        written[file] = contents;
      },
      resolveCapture: () => ({
        kind: 'window',
        label: 'Qeda Builder',
        // macOS captures the display and crops at render time.
        captureRect: { x: 0, y: 0, width: 1920, height: 1080 },
        regionRect: { x: 480, y: 270, width: 960, height: 540 },
        display: {
          id: '1',
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          scaleFactor: 1,
          primary: true,
        },
        videoCrop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      }),
    });

    const started = await startStudioRecording({}, deps);
    // The grabber still takes the whole display...
    expect(capturedArgs[0]).toContain('1920x1080');
    // ...but the reported frame is the crop, so telemetry is normalized to it.
    expect(started.capture).toMatchObject({ width: 960, height: 540 });

    clock += 1000;
    await new Promise((resolve) => setTimeout(resolve, 60));
    await stopStudioRecording(started.sessionId, deps);

    // The take knows to crop to the window when rendering.
    expect(getStudioTake(started.takeId)!.videoCrop).toEqual({
      x: 0.25,
      y: 0.25,
      width: 0.5,
      height: 0.5,
    });

    const capturePath = Object.keys(written).find((f) =>
      f.endsWith('capture.json'),
    )!;
    expect(JSON.parse(written[capturePath])).toMatchObject({
      width: 960,
      height: 540,
    });
  });

  it('releases the window pin when the capture cannot start', async () => {
    const unpin = jest.fn();
    const deps = makeDeps({
      resolveCapture: () => ({
        kind: 'window',
        label: 'Qeda Builder',
        captureRect: { x: 0, y: 0, width: 800, height: 600 },
        regionRect: { x: 0, y: 0, width: 800, height: 600 },
        display: {
          id: '1',
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          scaleFactor: 1,
          primary: true,
        },
        windowId: 7,
      }),
      pinWindow: () => unpin,
      startCapture: jest.fn(async () => {
        throw new Error('ffmpeg screen capture failed: no DISPLAY');
      }),
    });

    await expect(startStudioRecording({}, deps)).rejects.toThrow(/DISPLAY/);

    expect(unpin).toHaveBeenCalledTimes(1);
    expect(hasActiveStudioRecording()).toBe(false);
  });

  it('still saves a take when the agent marked nothing', async () => {
    const deps = makeDeps({ writeFile: async () => undefined });
    const started = await startStudioRecording({}, deps);

    clock += 5000;
    const stopped = await stopStudioRecording(started.sessionId, deps);

    expect(stopped.highlightCount).toBe(0);
    expect(stopped.captionCount).toBe(0);
    expect(getStudioTake(started.takeId)).toBeTruthy();
  });

  it('stops the recording on its own if the agent turn dies', async () => {
    const deps = makeDeps({
      maxDurationMs: 40,
      writeFile: async () => undefined,
    });
    await startStudioRecording({}, deps);

    expect(hasActiveStudioRecording()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(hasActiveStudioRecording()).toBe(false);
    expect(stopCapture).toHaveBeenCalledTimes(1);
    expect(broadcast).toHaveBeenCalled();
  });

  it('rejects a second capture while one is running', async () => {
    const deps = makeDeps({ writeFile: async () => undefined });
    const started = await startStudioRecording({}, deps);

    await expect(startStudioRecording({}, deps)).rejects.toThrow(
      /already in progress/,
    );

    await stopStudioRecording(started.sessionId, deps);
    // The guard clears once the session is gone, so the next one may start.
    await expect(startStudioRecording({}, deps)).resolves.toBeTruthy();
  });

  it('reports an unknown session rather than silently no-oping', () => {
    expect(() => markStudioHighlight('nope', 'label')).toThrow(/not running/);
    return expect(stopStudioRecording('nope')).rejects.toThrow(/not running/);
  });
});

describe('recorder tools', () => {
  it('explains how to enable recording when the feature is off', async () => {
    const result = await (computerUseTools.startDemoRecording as any).execute(
      {},
      {},
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Settings/);
  });

  it('fails loudly on marks and stops for a session that is not running', async () => {
    const mark = await (computerUseTools.markHighlight as any).execute(
      { sessionId: 'missing', label: 'Anything' },
      {},
    );
    expect(mark.success).toBe(false);
    expect(mark.error).toMatch(/not running/);

    const stop = await (computerUseTools.stopDemoRecording as any).execute(
      { sessionId: 'missing' },
      {},
    );
    expect(stop.success).toBe(false);
    expect(stop.error).toMatch(/not running/);
  });
});
