/**
 * main/studio-export.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Transcodes a recorded Studio take into the requested export format using the
 * system `ffmpeg` on PATH.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Recordings are always WebM (`MediaRecorder`), but the export dialog offers
 * MP4 and GIF. Those are different containers and codecs, so the file must be
 * re-encoded — renaming a `.webm` to `.mp4` produces a file most players cannot
 * open. Only a WebM→WebM export is a straight copy.
 *
 * Deliberately Electron-free so the argument construction and orchestration can
 * be unit-tested without booting the app. `ffmpeg` is resolved from PATH (or
 * `FFMPEG_PATH`), and a missing binary surfaces as an actionable message rather
 * than a raw `ENOENT`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type StudioExportFormat = 'mp4' | 'gif' | 'webm';
export type StudioExportQuality = 'high' | 'medium';

/** Fixed cadence and width for GIFs — unbounded GIFs get enormous fast. */
const GIF_FPS = 15;
const GIF_SCALE = 'scale=800:-1:flags=lanczos';

/**
 * ffmpeg binary to invoke. `FFMPEG_PATH` overrides the PATH lookup.
 *
 * Exported because the autonomous recorder shells out to the same binary, and
 * two independent PATH overrides would let export and recording disagree about
 * which ffmpeg is installed.
 */
export function resolveFfmpegPath(): string {
  const override = process.env.FFMPEG_PATH;
  return override && override.trim() ? override.trim() : 'ffmpeg';
}

/**
 * Turns an `execFile` rejection into a user-facing error. `ENOENT` is the one
 * the user can act on; everything else keeps the tail of ffmpeg's own stderr.
 */
export function describeFfmpegFailure(error: unknown): Error {
  const err = error as NodeJS.ErrnoException & { stderr?: string };
  if (err?.code === 'ENOENT') {
    return new Error(
      'ffmpeg was not found on PATH. Install ffmpeg to export MP4 or GIF videos, or set FFMPEG_PATH.',
    );
  }
  const stderr = typeof err?.stderr === 'string' ? err.stderr.trim() : '';
  const detail =
    stderr
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-3)
      .join(' ') ||
    err?.message ||
    String(error);
  return new Error(`ffmpeg export failed: ${detail}`);
}

async function runFfmpeg(args: string[]): Promise<void> {
  try {
    await execFileAsync(resolveFfmpegPath(), args, {
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    });
  } catch (error) {
    throw describeFfmpegFailure(error);
  }
}

/** Shared flags: overwrite, quiet, and never read from stdin. */
function baseArgs(inputPath: string): string[] {
  return [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-i',
    inputPath,
  ];
}

/** A source range removed from the take. Times are milliseconds. */
export interface StudioExportCut {
  startMs: number;
  endMs: number;
}

function seconds(ms: number): string {
  return (ms / 1000).toFixed(3);
}

/**
 * Audio equivalent of the renderer's cut skip.
 *
 * The composed video is already shorter than the recording, so the audio has to
 * lose the same ranges or every word after a cut drifts. `aselect` drops the
 * samples inside each cut and `asetpts` renumbers what is left, which is exactly
 * a ripple delete on the audio track.
 *
 * Returns `null` when there is nothing to remove, so callers keep the simple
 * `-map 1:a:0` path.
 */
export function buildCutAudioFilter(
  cuts: readonly StudioExportCut[] | undefined,
  label = 'a',
): string | null {
  if (!cuts || cuts.length === 0) return null;

  const ranges = cuts
    .filter((cut) => cut.endMs > cut.startMs)
    .sort((a, b) => a.startMs - b.startMs);
  if (ranges.length === 0) return null;

  // Half-open ranges, matching `timeline/ripple`: the first removed sample is
  // `startMs`, the first surviving one is `endMs`.
  const removed = ranges
    .map(
      (cut) => `(gte(t,${seconds(cut.startMs)})*lt(t,${seconds(cut.endMs)}))`,
    )
    .join('+');

  return `[1:a]aselect='not(${removed})',asetpts=N/SR/TB[${label}]`;
}

/** H.264/AAC MP4, `+faststart` so it streams from the start.
 *  When `audioInputPath` is provided the audio is sourced from that file
 *  (the original recording) rather than from the rendered WebM — the
 *  frame-by-frame renderer produces a muted video-only stream. `cuts` then
 *  removes the excised ranges from that audio so it stays in sync.
 */
export function buildMp4Args(
  inputPath: string,
  outputPath: string,
  quality: StudioExportQuality,
  audioInputPath?: string,
  cuts?: readonly StudioExportCut[],
): string[] {
  const crf = quality === 'medium' ? '24' : '18';
  const base: string[] = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-i',
    inputPath,
  ];
  if (audioInputPath) {
    base.push('-i', audioInputPath);
  }
  const audioFilter = audioInputPath ? buildCutAudioFilter(cuts) : null;
  return [
    ...base,
    ...(audioInputPath
      ? audioFilter
        ? ['-filter_complex', audioFilter, '-map', '0:v:0', '-map', '[a]']
        : ['-map', '0:v:0', '-map', '1:a:0?']
      : []),
    ...(audioFilter ? ['-shortest'] : []),
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    crf,
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    outputPath,
  ];
}

/** VP9/Opus WebM, used when the source is not already a WebM.
 *  When `audioInputPath` is provided audio is sourced from the original
 *  recording rather than the rendered (video-only) WebM, with `cuts` excised.
 */
export function buildWebmArgs(
  inputPath: string,
  outputPath: string,
  quality: StudioExportQuality,
  audioInputPath?: string,
  cuts?: readonly StudioExportCut[],
): string[] {
  const crf = quality === 'medium' ? '38' : '32';
  const base: string[] = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-i',
    inputPath,
  ];
  if (audioInputPath) {
    base.push('-i', audioInputPath);
  }
  const audioFilter = audioInputPath ? buildCutAudioFilter(cuts) : null;
  return [
    ...base,
    ...(audioInputPath
      ? audioFilter
        ? ['-filter_complex', audioFilter, '-map', '0:v:0', '-map', '[a]']
        : ['-map', '0:v:0', '-map', '1:a:0?']
      : []),
    ...(audioFilter ? ['-shortest'] : []),
    '-c:v',
    'libvpx-vp9',
    '-crf',
    crf,
    '-b:v',
    '0',
    '-row-mt',
    '1',
    '-c:a',
    'libopus',
    '-b:a',
    '128k',
    outputPath,
  ];
}

/** First GIF pass: sample the video into a single optimized palette frame.
 *  GIFs have no audio, so `audioInputPath` is intentionally unused here.
 */
export function buildGifPaletteArgs(
  inputPath: string,
  palettePath: string,
): string[] {
  return [
    ...baseArgs(inputPath),
    '-vf',
    `fps=${GIF_FPS},${GIF_SCALE},palettegen=stats_mode=diff`,
    '-frames:v',
    '1',
    palettePath,
  ];
}

/** Second GIF pass: apply the palette from the first pass. */
export function buildGifArgs(
  inputPath: string,
  palettePath: string,
  outputPath: string,
): string[] {
  return [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-i',
    inputPath,
    '-i',
    palettePath,
    '-lavfi',
    `fps=${GIF_FPS},${GIF_SCALE}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
    '-loop',
    '0',
    outputPath,
  ];
}

/** Injectable ffmpeg runner so orchestration can be tested without spawning. */
export type FfmpegRunner = (args: string[]) => Promise<void>;

/**
 * Whether a media file carries at least one audio stream.
 *
 * Needed because the cut filter names the audio stream explicitly and ffmpeg
 * refuses to build a filtergraph around a stream that does not exist — a
 * microphone-less recording would otherwise fail the whole export, while the
 * unfiltered `-map 1:a:0?` path quietly copes.
 */
export async function detectAudioStream(filePath: string): Promise<boolean> {
  try {
    await execFileAsync(
      resolveFfmpegPath(),
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-i',
        filePath,
        '-map',
        '0:a:0',
        '-frames:a',
        '1',
        '-f',
        'null',
        '-',
      ],
      { windowsHide: true, timeout: 15_000, maxBuffer: 1024 * 1024 },
    );
    return true;
  } catch {
    return false;
  }
}

export interface TranscodeStudioVideoOptions {
  inputPath: string;
  outputPath: string;
  format: StudioExportFormat;
  quality?: StudioExportQuality;
  /**
   * Optional path to a separate audio source (the original recording).
   * When the rendered video is produced by the frame-by-frame encoder it is
   * muted (video-only WebM). Pass the original recording path here so ffmpeg
   * can merge its audio track with the composed video in a single pass.
   */
  audioInputPath?: string;
  /** Source ranges already excised from the composed video, in ms. */
  cuts?: readonly StudioExportCut[];
}

/**
 * Writes `outputPath` in `format`, transcoding with ffmpeg.
 *
 * A WebM→WebM export is a plain file copy: same container and codecs, so
 * re-encoding would only lose quality and time.
 */
export async function transcodeStudioVideo(
  options: TranscodeStudioVideoOptions,
  run: FfmpegRunner = runFfmpeg,
  probeAudio: (filePath: string) => Promise<boolean> = detectAudioStream,
): Promise<void> {
  const { inputPath, outputPath } = options;
  const quality = options.quality ?? 'high';

  const { audioInputPath } = options;

  // Only filter audio that actually exists; a silent recording has nothing to
  // excise and must keep the optional `-map` behaviour.
  const cuts =
    options.cuts && options.cuts.length > 0 && audioInputPath
      ? (await probeAudio(audioInputPath))
        ? options.cuts
        : undefined
      : undefined;

  // If no audio needs merging, a WebM→WebM export with the same codec is a
  // straight copy (re-encoding would only lose quality).
  if (
    options.format === 'webm' &&
    path.extname(inputPath).toLowerCase() === '.webm' &&
    !audioInputPath
  ) {
    await fs.copyFile(inputPath, outputPath);
    return;
  }

  if (options.format === 'mp4') {
    await run(
      buildMp4Args(inputPath, outputPath, quality, audioInputPath, cuts),
    );
    return;
  }

  if (options.format === 'webm') {
    await run(
      buildWebmArgs(inputPath, outputPath, quality, audioInputPath, cuts),
    );
    return;
  }

  // GIF needs two passes and a temp palette file.
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qeda-studio-gif-'));
  const palettePath = path.join(tempDir, 'palette.png');
  try {
    await run(buildGifPaletteArgs(inputPath, palettePath));
    await run(buildGifArgs(inputPath, palettePath, outputPath));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
