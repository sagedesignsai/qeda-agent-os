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

/** ffmpeg binary to invoke. `FFMPEG_PATH` overrides the PATH lookup. */
function resolveFfmpegPath(): string {
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
      .join(' ') || err?.message || String(error);
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

/** H.264/AAC MP4, `+faststart` so it streams from the start.
 *  When `audioInputPath` is provided the audio is sourced from that file
 *  (the original recording) rather than from the rendered WebM — the
 *  frame-by-frame renderer produces a muted video-only stream.
 */
export function buildMp4Args(
  inputPath: string,
  outputPath: string,
  quality: StudioExportQuality,
  audioInputPath?: string,
): string[] {
  const crf = quality === 'medium' ? '24' : '18';
  const base: string[] = ['-y', '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', inputPath];
  if (audioInputPath) {
    base.push('-i', audioInputPath);
  }
  return [
    ...base,
    ...(audioInputPath ? ['-map', '0:v:0', '-map', '1:a:0?'] : []),
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
 *  recording rather than the rendered (video-only) WebM.
 */
export function buildWebmArgs(
  inputPath: string,
  outputPath: string,
  quality: StudioExportQuality,
  audioInputPath?: string,
): string[] {
  const crf = quality === 'medium' ? '38' : '32';
  const base: string[] = ['-y', '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', inputPath];
  if (audioInputPath) {
    base.push('-i', audioInputPath);
  }
  return [
    ...base,
    ...(audioInputPath ? ['-map', '0:v:0', '-map', '1:a:0?'] : []),
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
): Promise<void> {
  const { inputPath, outputPath } = options;
  const quality = options.quality ?? 'high';

  const { audioInputPath } = options;

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
    await run(buildMp4Args(inputPath, outputPath, quality, audioInputPath));
    return;
  }

  if (options.format === 'webm') {
    await run(buildWebmArgs(inputPath, outputPath, quality, audioInputPath));
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
