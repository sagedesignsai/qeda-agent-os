/**
 * main/studio-recorder.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Agent-driven showcase recording: ffmpeg captures the screen for as long as
 * the agent needs, while this module samples the cursor and accepts labelled
 * highlight marks. Stopping the session turns all three streams into one Studio
 * take — video, mouse telemetry, and highlight-timed captions/zooms.
 *
 * Why a session instead of the renderer's MediaRecorder:
 *   the chat agent drives the app with `tools/computer-use.ts`, and a tool call
 *   is synchronous with respect to the agent's turn. A single blocking
 *   `recordDemo(durationMs)` call cannot capture what the agent does *while*
 *   recording, so capture has to live in main and outlive the tool call that
 *   started it. The renderer recorder stays as the manual path — it is the one
 *   that needs microphone audio and live UI, which an unattended agent has no
 *   use for.
 *
 * Highlights are the point. Screen recording alone yields an unedited take; the
 * agent knows *when* something worth showing happened, so `markHighlight` is
 * what turns "a screen recording" into timed captions and zooms. Without a
 * highlight the pace is guesswork; with one, the composition lands on the beat
 * the agent observed.
 *
 * Every side effect (clock, cursor sampler, ffmpeg process, take store, draft
 * pass) is injectable so the whole orchestration is unit-testable without
 * spawning ffmpeg or booting Electron — the same shape `studio-export.ts` uses
 * for its ffmpeg runner.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app, screen } from 'electron';
import { nanoid } from 'nanoid';
import { resolveFfmpegPath, describeFfmpegFailure } from './studio-export.js';
import { isComputerUseEnabled } from './computer-use.js';
import { processStudioDraft } from './studio-draft.js';
import {
  saveStudioTake,
  getStudioTake,
  DEFAULT_STUDIO_STYLING,
  type StudioTake,
  type StudioZoom,
  type StudioCaption,
  type StudioCaptionWord,
  type MouseTrackerEvent,
} from './db/studio-store.js';
import type {
  StudioCaptureRect,
  StudioCaptureRequest,
  StudioRecordingSnapshot,
  StudioRecordingStateEvent,
} from '../lib/studio/types.js';
import {
  pinCaptureWindow,
  resolveCaptureRequest,
  resolveNativeWindowRect,
  toCaptureGeometry,
  type CaptureDisplay,
  type ResolvedCapture,
} from './capture-targets.js';

/** A recording cannot outlive this, so a lost session cannot leak a process. */
const MAX_RECORDING_MS = 5 * 60_000;

/** Cursor is sampled at 50Hz, matching the renderer's manual tracker. */
const CURSOR_SAMPLE_MS = 20;

/** Hard cap so a long session cannot grow the telemetry file without bound. */
const MAX_CURSOR_SAMPLES = 100_000;

/** How long a highlight's caption stays on screen, at most. */
const CAPTION_MAX_MS = 2600;

/** Breathing room before the next highlight's caption may begin. */
const CAPTION_GAP_MS = 250;

/** A highlight's kinetic zoom, shortest useful push-in. */
const ZOOM_LENGTH_MS = 2200;

// ── Pure helpers ─────────────────────────────────────────────────────────────

export interface CaptureGeometry {
  /** Top-left of the captured region, in physical pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  fps: number;
}

export interface StudioHighlight {
  /** Offset from the start of the recording, in milliseconds. */
  tMs: number;
  label: string;
}

/**
 * ffmpeg arguments for a full-screen capture.
 *
 * Kept pure and exported because the platform split is the part most likely to
 * rot silently: a wrong grabber name fails at runtime only, on someone else's
 * operating system.
 */
export function buildCaptureArgs(
  platform: NodeJS.Platform,
  geometry: CaptureGeometry,
  outputPath: string,
): string[] {
  const videoSize = `${geometry.width}x${geometry.height}`;
  const args: string[] = ['-y', '-hide_banner', '-loglevel', 'error'];

  if (platform === 'darwin') {
    args.push(
      '-f',
      'avfoundation',
      '-framerate',
      String(geometry.fps),
      // Screen device index 1 is the main display; `1:none` records no audio.
      '-capture_cursor',
      '1',
      '-i',
      '1:none',
    );
  } else if (platform === 'win32') {
    args.push(
      '-f',
      'gdigrab',
      '-framerate',
      String(geometry.fps),
      '-capture_cursor',
      '1',
      '-offset_x',
      String(geometry.x),
      '-offset_y',
      String(geometry.y),
      '-video_size',
      videoSize,
      '-i',
      'desktop',
    );
  } else {
    args.push(
      '-f',
      'x11grab',
      '-framerate',
      String(geometry.fps),
      '-video_size',
      videoSize,
      '-i',
      `:0.0+${geometry.x},${geometry.y}`,
    );
  }

  const gop = String(Math.max(1, Math.round(geometry.fps || 30)));

  args.push(
    '-pix_fmt',
    'yuv420p',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    // Bound GOP to 1 second so every frame-accurate seek decodes <= 1s of media.
    '-g',
    gop,
    '-keyint_min',
    gop,
    '-scenecut',
    '0',
    // faststart makes the finished take seekable by the canvas preview.
    '-movflags',
    '+faststart',
    outputPath,
  );

  return args;
}

export interface HighlightPlacements {
  zooms: StudioZoom[];
  captions: StudioCaption[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Splits a label into evenly-spread karaoke words across the caption window. */
function toWords(
  label: string,
  startMs: number,
  endMs: number,
): StudioCaptionWord[] | undefined {
  const tokens = label.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return undefined;

  const span = Math.max(endMs - startMs, tokens.length * 40);
  const perWord = span / tokens.length;
  return tokens.map((word, index) => ({
    word,
    startMs: Math.round(startMs + index * perWord),
    endMs: Math.round(startMs + (index + 1) * perWord),
  }));
}

/**
 * Turns highlight marks into captions and zooms.
 *
 * Each highlight becomes a caption carrying its label, plus one zoom centred on
 * where the cursor actually was at that moment — that is what makes the camera
 * land on the thing the agent pointed at rather than on the middle of the
 * frame. Zooms are staggered so they never overlap, because two active zooms
 * have no defined resolution in the renderer.
 */
export function deriveHighlightPlacements({
  durationMs,
  highlights,
  cursorSamples,
  displaySize,
  cursorWindowMs = 600,
}: {
  durationMs: number;
  highlights: StudioHighlight[];
  cursorSamples: MouseTrackerEvent[];
  displaySize: { width: number; height: number };
  cursorWindowMs?: number;
}): HighlightPlacements {
  const zooms: StudioZoom[] = [];
  const captions: StudioCaption[] = [];
  if (highlights.length === 0 || durationMs <= 0) return { zooms, captions };

  const ordered = [...highlights].sort((a, b) => a.tMs - b.tMs);
  const displayWidth = displaySize.width || 1920;
  const displayHeight = displaySize.height || 1080;

  let zoomCursor = 0;

  ordered.forEach((highlight, index) => {
    const startMs = clamp(Math.round(highlight.tMs), 0, durationMs);
    const nextStartMs = ordered[index + 1]?.tMs ?? durationMs;

    // Caption: hold the label until the next highlight, but never longer than
    // one comfortable read, and never shorter than a glance.
    const captionEndMs = clamp(
      Math.min(startMs + CAPTION_MAX_MS, nextStartMs - CAPTION_GAP_MS),
      startMs + 300,
      durationMs,
    );

    captions.push({
      id: nanoid(),
      startMs,
      endMs: captionEndMs,
      text: highlight.label,
      words: toWords(highlight.label, startMs, captionEndMs),
    });

    // Zoom: aim at the cursor during the highlight, falling back to the frame
    // centre when telemetry is missing (headless or a stationary cursor).
    const near = cursorSamples.filter(
      (sample) =>
        sample.t >= startMs - cursorWindowMs &&
        sample.t <= startMs + cursorWindowMs,
    );
    const targetX = near.length
      ? clamp(
          near.reduce((sum, s) => sum + s.x, 0) / near.length / displayWidth,
          0.15,
          0.85,
        )
      : 0.5;
    const targetY = near.length
      ? clamp(
          near.reduce((sum, s) => sum + s.y, 0) / near.length / displayHeight,
          0.15,
          0.85,
        )
      : 0.5;

    const zoomStartMs = clamp(
      Math.max(zoomCursor + 150, startMs - 200),
      0,
      durationMs,
    );
    const zoomEndMs = clamp(
      Math.min(durationMs, zoomStartMs + ZOOM_LENGTH_MS),
      0,
      durationMs,
    );
    if (zoomEndMs - zoomStartMs >= 400) {
      zooms.push({
        id: nanoid(),
        startMs: zoomStartMs,
        endMs: zoomEndMs,
        targetX: Number(targetX.toFixed(3)),
        targetY: Number(targetY.toFixed(3)),
        scale: 1.5,
      });
      zoomCursor = zoomEndMs;
    }
  });

  return { zooms, captions };
}

// ── Capture process ──────────────────────────────────────────────────────────

/**
 * A running capture. `stop()` must resolve once the file is finalized — for
 * ffmpeg that means after the process exits, not when the signal is sent, or
 * the take would be saved pointing at a truncated MP4.
 */
export interface CaptureHandle {
  stop(): Promise<void>;
}

export type CaptureStarter = (
  args: string[],
  outputPath: string,
) => Promise<CaptureHandle>;

async function startFfmpegCapture(
  args: string[],
  outputPath: string,
): Promise<CaptureHandle> {
  const child = spawn(resolveFfmpegPath(), args, {
    stdio: ['pipe', 'ignore', 'pipe'],
    windowsHide: true,
  });

  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr = (stderr + String(chunk)).slice(-4000);
  });

  let exited = false;
  const exitPromise = new Promise<void>((resolve) => {
    child.on('exit', () => {
      exited = true;
      resolve();
    });
    child.on('error', () => {
      exited = true;
      resolve();
    });
  });

  const failure = new Promise<never>((resolve, reject) => {
    child.on('error', (error) => reject(describeFfmpegFailure(error)));
  });

  const spawned = new Promise<void>((resolve) => {
    child.on('spawn', () => resolve());
  });

  await Promise.race([spawned, failure]);

  // Grabbers fail *after* spawn on a missing DISPLAY or a busy screen, so a
  // short settle window is the only way to report the real reason instead of
  // letting the agent drive for a minute into a capture that never started.
  await new Promise((resolve) => setTimeout(resolve, 700));
  if (exited) {
    const detail = stderr
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-2)
      .join(' ');
    throw new Error(
      `ffmpeg screen capture failed for ${outputPath}: ${detail || 'the capture process exited immediately.'}`,
    );
  }

  return {
    stop: async () => {
      // ffmpeg finalizes the container on a graceful request; SIGINT is the
      // signal it handles, and `q` on stdin is the documented soft stop.
      try {
        child.stdin?.write('q');
      } catch {
        // stdin already closed; fall through to the signals below.
      }
      const hardKill = setTimeout(() => child.kill('SIGINT'), 1500);
      const forceKill = setTimeout(() => child.kill('SIGKILL'), 5000);
      try {
        await exitPromise;
      } finally {
        clearTimeout(hardKill);
        clearTimeout(forceKill);
      }
    },
  };
}

// ── Session management ───────────────────────────────────────────────────────

interface RecordingSession {
  id: string;
  takeId: string;
  projectId: string | null;
  title: string;
  sourceName: string;
  takeDir: string;
  videoPath: string;
  geometry: CaptureGeometry;
  capture: ResolvedCapture;
  fps: number;
  maxDurationMs: number;
  displaySize: { width: number; height: number };
  startedAt: number;
  cursorSamples: MouseTrackerEvent[];
  highlights: StudioHighlight[];
  sampler: NodeJS.Timeout | null;
  watchdog: NodeJS.Timeout | null;
  handle: CaptureHandle;
  /** Restores the recorded window's stacking; idempotent. */
  unpin: () => void;
  stopping: Promise<StopRecordingResult> | null;
}

const sessions = new Map<string, RecordingSession>();

/**
 * The most recent finished capture, used by the Studio Copilot to resolve
 * "the demo we just recorded" without threading an id through every tool call.
 */
let lastCompleted: { takeId: string; completedAt: number } | null = null;

function toSnapshot(session: RecordingSession): StudioRecordingSnapshot {
  return {
    sessionId: session.id,
    takeId: session.takeId,
    title: session.title,
    sourceName: session.sourceName,
    startedAt: session.startedAt,
    maxDurationMs: session.maxDurationMs,
    fps: session.fps,
    highlightCount: session.highlights.length,
    cursorSampleCount: session.cursorSamples.length,
    capture: {
      kind: session.capture.kind,
      label: session.capture.label,
      width: session.displaySize.width,
      height: session.displaySize.height,
    },
  };
}

const noop = () => undefined;

/** Release the window pin at most once, whichever stop path runs. */
function releasePin(session: RecordingSession): void {
  const unpin = session.unpin ?? noop;
  session.unpin = noop;
  try {
    unpin();
  } catch {
    // A window that closed mid-recording has nothing to restore.
  }
}

/** Late-bound so the tool registry can be imported by tests without Electron. */
function broadcastRecordingState(state: StudioRecordingStateEvent): void {
  try {
    const { BrowserWindow } = require('electron');
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send('studio:recording-state', state);
      }
    }
  } catch {
    // No window is listening; the state is still queryable in main.
  }
}

function emitRecordingState(
  deps: StudioRecorderDeps,
  active: StudioRecordingSnapshot | null,
): void {
  (deps.emitState ?? broadcastRecordingState)({ active });
}

/** Snapshot of the running capture, or null. Survives renderer reloads. */
export function getActiveStudioRecordingState(): StudioRecordingSnapshot | null {
  const session = sessions.values().next().value as
    RecordingSession | undefined;
  return session ? toSnapshot(session) : null;
}

/** The last capture that finished, for "the take we just recorded" lookups. */
export function getLastCompletedStudioRecording(): {
  takeId: string;
  completedAt: number;
} | null {
  return lastCompleted;
}

export interface StudioRecorderDeps {
  now?: () => number;
  enabled?: () => boolean;
  startCapture?: CaptureStarter;
  sampleCursor?: () => { x: number; y: number };
  primaryDisplay?: () => {
    x: number;
    y: number;
    width: number;
    height: number;
    scaleFactor: number;
  };
  takeDir?: (takeId: string) => string;
  ensureDir?: (dir: string) => Promise<void>;
  saveTake?: typeof saveStudioTake;
  getTake?: typeof getStudioTake;
  applyDraft?: (takeId: string) => Promise<StudioTake>;
  writeFile?: (file: string, contents: string) => Promise<void>;
  /** Resolve a capture target to a region; injectable for tests. */
  resolveCapture?: (target?: StudioCaptureRequest) => ResolvedCapture;
  /** Resolve a native window title to a DIP rect; injectable for tests. */
  resolveNativeWindow?: (title: string) => Promise<StudioCaptureRect | null>;
  /** Pin the recorded window above others; injectable for tests. */
  pinWindow?: (windowId?: number) => () => void;
  broadcast?: (takeId?: string) => void;
  /** Push a live recording snapshot; defaults to a BrowserWindow broadcast. */
  emitState?: (state: StudioRecordingStateEvent) => void;
  /** Watchdog period; overridable so the safety net can be tested in real time. */
  maxDurationMs?: number;
}

function takeDirectory(takeId: string): string {
  return path.join(app.getPath('userData'), 'studio', takeId);
}

function broadcastStudioChanged(takeId?: string): void {
  try {
    // Deliberately late-bound: this module is imported by the tool registry,
    // which is imported by tests that never mock BrowserWindow.
    const { BrowserWindow } = require('electron');
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        // The id lets the Studio page select a freshly recorded take instead
        // of reloading whichever take happened to be open.
        window.webContents.send(
          'studio:changed',
          takeId ? { takeId } : undefined,
        );
      }
    }
  } catch {
    // No window to notify; the take is on disk either way.
  }
}

export interface StartRecordingInput {
  projectId?: string | null;
  title?: string;
  sourceName?: string;
  fps?: number;
  /** What to capture; defaults to the primary display. */
  target?: StudioCaptureRequest;
}

export interface StartRecordingResult {
  sessionId: string;
  takeId: string;
  fps: number;
  /** Wall-clock stop is enforced, so the caller knows the ceiling. */
  maxDurationMs: number;
  /** What the take will contain, so the agent can confirm its target. */
  capture: {
    kind: 'display' | 'window' | 'region';
    label: string;
    width: number;
    height: number;
  };
}

export async function startStudioRecording(
  input: StartRecordingInput = {},
  deps: StudioRecorderDeps = {},
): Promise<StartRecordingResult> {
  const enabled = deps.enabled ?? isComputerUseEnabled;
  if (!enabled()) {
    throw new Error(
      'Recording the screen on the agent’s behalf is off. Enable Computer Use in Settings first.',
    );
  }

  if (sessions.size > 0) {
    throw new Error(
      'A demo recording is already in progress. Stop it before starting another.',
    );
  }

  const now = deps.now ?? Date.now;
  const takeId = nanoid();
  const sessionId = nanoid();
  const dir = (deps.takeDir ?? takeDirectory)(takeId);
  const videoPath = path.join(dir, 'recording.mp4');
  await (
    deps.ensureDir ??
    ((target: string) => fs.mkdir(target, { recursive: true }))
  )(dir);

  // Tests supply one fake display; production asks Electron for all of them.
  let displays: CaptureDisplay[] | undefined;
  if (deps.primaryDisplay) {
    const display = deps.primaryDisplay();
    displays = [
      {
        id: 'primary',
        bounds: {
          x: display.x,
          y: display.y,
          width: display.width,
          height: display.height,
        },
        scaleFactor: display.scaleFactor || 1,
        primary: true,
      },
    ];
  }

  // A native window has no Electron handle, so it is measured first and then
  // travels as a rect, with the original title kept as the take's label.
  let target = input.target;
  if (target?.windowTitle && !target.windowId && !target.rect) {
    const resolveNative = deps.resolveNativeWindow ?? resolveNativeWindowRect;
    const rect = await resolveNative(target.windowTitle);
    if (!rect) {
      throw new Error(
        `No open window matches "${target.windowTitle}". Call listCaptureTargets to see recordable windows.`,
      );
    }
    target = {
      rect,
      kindHint: 'window',
      label: target.windowTitle,
    };
  }

  const capture = deps.resolveCapture
    ? deps.resolveCapture(target)
    : resolveCaptureRequest(target, displays);
  const fps = input.fps ?? 30;
  // The grabber captures physical pixels; cursor telemetry is in DIP, so the
  // two are kept in separate spaces and normalized at the end.
  const geometry: CaptureGeometry = toCaptureGeometry(
    capture.captureRect,
    capture.display.scaleFactor,
    fps,
  );
  // Telemetry is normalized against the frame the viewer sees. When the
  // grabber itself is cropped, that is the (possibly even-rounded) region.
  // When the crop happens at render time — macOS, where the display is
  // captured whole — it is the crop region, not the display.
  const frameScale = capture.display.scaleFactor || 1;
  const frameSize = capture.videoCrop
    ? {
        width: capture.regionRect.width,
        height: capture.regionRect.height,
      }
    : {
        width: geometry.width / frameScale,
        height: geometry.height / frameScale,
      };

  const maxDurationMs = deps.maxDurationMs ?? MAX_RECORDING_MS;
  const startCapture = deps.startCapture ?? startFfmpegCapture;
  // Pin before the first frame: if the window is behind something, the opening
  // seconds of the take are of the wrong app.
  const unpin = (deps.pinWindow ?? pinCaptureWindow)(capture.windowId);
  let handle: CaptureHandle;
  try {
    handle = await startCapture(
      buildCaptureArgs(process.platform, geometry, videoPath),
      videoPath,
    );
  } catch (error) {
    unpin();
    throw error;
  }

  const session: RecordingSession = {
    id: sessionId,
    takeId,
    projectId: input.projectId ?? null,
    title: input.title?.trim() || 'Agent Recorded Demo',
    sourceName: input.sourceName?.trim() || capture.label,
    takeDir: dir,
    videoPath,
    geometry,
    capture,
    fps,
    maxDurationMs,
    displaySize: frameSize,
    startedAt: now(),
    cursorSamples: [],
    highlights: [],
    sampler: null,
    watchdog: null,
    handle,
    unpin,
    stopping: null,
  };

  const sampleCursor =
    deps.sampleCursor ?? (() => screen.getCursorScreenPoint());
  const region = capture.regionRect;
  let lastX = Number.NaN;
  let lastY = Number.NaN;
  session.sampler = setInterval(() => {
    try {
      const point = sampleCursor();
      if (point.x === lastX && point.y === lastY) return;
      lastX = point.x;
      lastY = point.y;
      // Telemetry is stored relative to the recorded frame, not the desktop:
      // zoom targets are normalized against the frame, so an absolute point
      // would aim a window-scoped crop at the wrong pixel.
      const x = point.x - region.x;
      const y = point.y - region.y;
      if (x < 0 || y < 0 || x > region.width || y > region.height) return;
      if (session.cursorSamples.length < MAX_CURSOR_SAMPLES) {
        session.cursorSamples.push({
          t: now() - session.startedAt,
          x,
          y,
          type: 'move',
        });
      }
    } catch {
      // A screen query that races a display change is not worth failing on.
    }
  }, CURSOR_SAMPLE_MS);

  // Safety net: an agent turn can die mid-recording, and a capture left running
  // holds both the process and a growing file.
  session.watchdog = setTimeout(() => {
    void stopStudioRecording(sessionId, deps).catch(() => undefined);
  }, maxDurationMs);

  sessions.set(sessionId, session);
  emitRecordingState(deps, toSnapshot(session));

  return {
    sessionId,
    takeId,
    fps,
    maxDurationMs,
    capture: {
      kind: capture.kind,
      label: capture.label,
      width: frameSize.width,
      height: frameSize.height,
    },
  };
}

export function markStudioHighlight(
  sessionId: string,
  label: string,
  deps: StudioRecorderDeps = {},
): StudioHighlight {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Recording session ${sessionId} is not running.`);
  }
  const now = deps.now ?? Date.now;
  const highlight: StudioHighlight = {
    tMs: Math.max(0, now() - session.startedAt),
    label: label.trim() || `Highlight ${session.highlights.length + 1}`,
  };
  session.highlights.push(highlight);
  // Each mark is a progress beat the pill can show without a timer channel.
  emitRecordingState(deps, toSnapshot(session));
  return highlight;
}

export interface StopRecordingResult {
  take: StudioTake;
  durationMs: number;
  highlightCount: number;
  captionCount: number;
  zoomCount: number;
}

async function finalizeSession(
  session: RecordingSession,
  deps: StudioRecorderDeps,
): Promise<StopRecordingResult> {
  if (session.sampler) clearInterval(session.sampler);
  session.sampler = null;
  if (session.watchdog) clearTimeout(session.watchdog);
  session.watchdog = null;

  const now = deps.now ?? Date.now;
  const durationMs = Math.max(0, now() - session.startedAt);

  try {
    await session.handle.stop();
  } catch (error) {
    releasePin(session);
    sessions.delete(session.id);
    emitRecordingState(deps, null);
    throw error instanceof Error
      ? error
      : new Error(`Capture stop failed: ${String(error)}`);
  }

  // The sink is closed; the app no longer needs to sit on top of everything.
  releasePin(session);

  const writeFile =
    deps.writeFile ??
    ((file: string, contents: string) => fs.writeFile(file, contents, 'utf-8'));
  const mouseEventsPath = path.join(session.takeDir, 'mouse_events.json');
  await writeFile(mouseEventsPath, JSON.stringify(session.cursorSamples));
  await writeFile(
    path.join(session.takeDir, 'highlights.json'),
    JSON.stringify(session.highlights),
  );
  // Telemetry is frame-relative, so the draft pass needs the frame size. Kept
  // beside the events rather than in the DB so old takes stay valid.
  await writeFile(
    path.join(session.takeDir, 'capture.json'),
    JSON.stringify({
      kind: session.capture.kind,
      label: session.capture.label,
      width: session.displaySize.width,
      height: session.displaySize.height,
    }),
  );

  const saveTake = deps.saveTake ?? saveStudioTake;
  const getTake = deps.getTake ?? getStudioTake;

  saveTake({
    id: session.takeId,
    projectId: session.projectId,
    title: session.title,
    sourceType: session.capture.kind === 'window' ? 'window' : 'screen',
    sourceName: session.sourceName,
    videoPath: session.videoPath,
    durationMs,
    mouseEventsPath,
    // macOS captures the display and crops at render time; the rest crop in
    // the grabber and must not double-crop here.
    videoCrop: session.capture.videoCrop,
    styling: DEFAULT_STUDIO_STYLING,
  });

  // Magic Draft first: it derives zooms from telemetry for takes with no
  // highlights, and gives a sane baseline when the agent's marks are sparse.
  const applyDraft = deps.applyDraft ?? processStudioDraft;
  try {
    await applyDraft(session.takeId);
  } catch {
    // A draft failure must not discard a recording that is already on disk.
  }

  let take = getTake(session.takeId);
  if (!take) {
    releasePin(session);
    sessions.delete(session.id);
    emitRecordingState(deps, null);
    throw new Error(
      `The recording was written to ${session.videoPath}, but its take record could not be reloaded.`,
    );
  }

  if (session.highlights.length > 0) {
    const placements = deriveHighlightPlacements({
      durationMs,
      highlights: session.highlights,
      cursorSamples: session.cursorSamples,
      displaySize: session.displaySize,
    });
    take = saveTake({
      id: session.takeId,
      zooms: placements.zooms,
      captions: placements.captions,
      styling: { ...take.styling, showCaptions: true },
    });
  }

  sessions.delete(session.id);
  lastCompleted = { takeId: session.takeId, completedAt: now() };
  emitRecordingState(deps, null);

  const broadcast = deps.broadcast ?? broadcastStudioChanged;
  // Name the take so the Studio page can select it rather than reload the old one.
  broadcast(session.takeId);

  return {
    take,
    durationMs,
    highlightCount: session.highlights.length,
    captionCount: take.captions.length,
    zoomCount: take.zooms.length,
  };
}

export function stopStudioRecording(
  sessionId: string,
  deps: StudioRecorderDeps = {},
): Promise<StopRecordingResult> {
  const session = sessions.get(sessionId);
  if (!session) {
    return Promise.reject(
      new Error(`Recording session ${sessionId} is not running.`),
    );
  }
  if (!session.stopping) {
    session.stopping = finalizeSession(session, deps);
  }
  return session.stopping;
}

/** Whether a session is still capturing — used by tests and tool guards. */
export function hasActiveStudioRecording(): boolean {
  return sessions.size > 0;
}

export const __studioRecorderTesting = {
  /** Drops every session without touching ffmpeg; tests only. */
  reset(): void {
    for (const session of sessions.values()) {
      if (session.sampler) clearInterval(session.sampler);
      if (session.watchdog) clearTimeout(session.watchdog);
      releasePin(session);
    }
    sessions.clear();
    lastCompleted = null;
  },
};
