/**
 * main/studio-media-prep.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Native media preparation pipeline for Studio takes:
 *   1. ffprobe extraction of duration, resolution, fps, audio presence.
 *   2. Dense-GOP CFR intermediate generation for frame-accurate seeking.
 *
 * Designed with dependency injection so media orchestration can be unit tested
 * without spawning ffmpeg or requiring Electron.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { StudioTake, StudioMediaProbe } from '../lib/studio-types';
import { resolveFfmpegPath, describeFfmpegFailure } from './studio-export';
import { updateStudioTakeMediaPrep } from './db/studio-store';

const execFileAsync = promisify(execFile);

/** Minimum take duration in milliseconds to justify generating an optimized intermediate. */
export const MIN_OPTIMIZE_DURATION_MS = 20_000;

export type FfprobeRunner = (args: string[]) => Promise<string>;
export type FfmpegRunner = (args: string[]) => Promise<void>;

export function resolveFfprobePath(): string {
  const override = process.env.FFPROBE_PATH;
  return override && override.trim() ? override.trim() : 'ffprobe';
}

/** Default ffprobe runner shelling out to the system binary. */
export async function defaultFfprobeRunner(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(resolveFfprobePath(), args, {
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    throw describeFfmpegFailure(error);
  }
}

/** Default ffmpeg runner shelling out to the system binary. */
export async function defaultFfmpegRunner(args: string[]): Promise<void> {
  try {
    await execFileAsync(resolveFfmpegPath(), args, {
      windowsHide: true,
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (error) {
    throw describeFfmpegFailure(error);
  }
}

/** Parse an ffmpeg frame rate ratio like "30/1" or "29.97" into a float. */
export function parseFps(fpsStr?: string): number {
  if (!fpsStr) return 30;
  if (fpsStr.includes('/')) {
    const [num, den] = fpsStr.split('/').map(Number);
    if (den && den > 0 && Number.isFinite(num)) {
      return Math.round((num / den) * 100) / 100;
    }
  }
  const parsed = parseFloat(fpsStr);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

/** Probe media file using ffprobe JSON output. */
export async function probeTake(
  videoPath: string,
  runner: FfprobeRunner = defaultFfprobeRunner,
): Promise<StudioMediaProbe> {
  const args = [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    videoPath,
  ];

  const stdout = await runner(args);
  let parsed: any;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`Failed to parse ffprobe output for ${videoPath}`);
  }

  const streams = parsed.streams ?? [];
  const videoStream = streams.find((s: any) => s.codec_type === 'video');
  const audioStream = streams.find((s: any) => s.codec_type === 'audio');

  const format = parsed.format ?? {};
  const durationSec = parseFloat(
    videoStream?.duration || format.duration || '0',
  );
  const durationMs = Math.round(durationSec * 1000);

  const width = parseInt(videoStream?.width || '0', 10);
  const height = parseInt(videoStream?.height || '0', 10);
  const fps = parseFps(
    videoStream?.r_frame_rate || videoStream?.avg_frame_rate,
  );

  // Rotation check from stream tags or side_data_list
  let rotation = 0;
  if (videoStream?.tags?.rotate) {
    rotation = parseInt(videoStream.tags.rotate, 10) || 0;
  } else if (Array.isArray(videoStream?.side_data_list)) {
    const displayMatrix = videoStream.side_data_list.find(
      (sd: any) => sd.side_data_type === 'Display Matrix',
    );
    if (displayMatrix && typeof displayMatrix.rotation === 'number') {
      rotation = displayMatrix.rotation;
    }
  }

  return {
    durationMs,
    width,
    height,
    fps,
    rotation,
    hasAudio: Boolean(audioStream),
  };
}

/** Build ffmpeg arguments for transcoding to dense-GOP intermediate. */
export function buildOptimizedMediaArgs(
  inputPath: string,
  outputPath: string,
  targetFps = 30,
): string[] {
  const gop = String(Math.max(1, Math.round(targetFps)));
  return [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-i',
    inputPath,
    '-vf',
    `fps=${targetFps}`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '18',
    '-g',
    gop,
    '-keyint_min',
    gop,
    '-scenecut',
    '0',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-an',
    outputPath,
  ];
}

export interface EnsureOptimizedMediaOptions {
  runner?: FfmpegRunner;
  outputDir?: string;
  force?: boolean;
}

/**
 * Ensures an optimized dense-GOP intermediate exists for the take.
 * Writes to a temporary file before renaming atomically.
 */
export async function ensureOptimizedMedia(
  take: StudioTake,
  options: EnsureOptimizedMediaOptions = {},
): Promise<{ ok: boolean; optimizedPath: string | null; skipped?: boolean }> {
  // If take is shorter than minimum threshold, skip optimization unless forced
  if (
    !options.force &&
    take.durationMs > 0 &&
    take.durationMs < MIN_OPTIMIZE_DURATION_MS
  ) {
    return { ok: true, optimizedPath: null, skipped: true };
  }

  const takeDir = options.outputDir || path.dirname(take.videoPath);
  const targetPath = path.join(takeDir, 'optimized.mp4');
  const tempPath = path.join(takeDir, 'optimized.tmp.mp4');

  // If already prepared and exists on disk with content, reuse
  if (!options.force && take.optimizedPath) {
    try {
      const stats = await fs.stat(take.optimizedPath);
      if (stats.size > 0) {
        return { ok: true, optimizedPath: take.optimizedPath };
      }
    } catch {
      // File missing on disk, regenerate
    }
  }

  await fs.mkdir(takeDir, { recursive: true });

  const runner = options.runner || defaultFfmpegRunner;
  const args = buildOptimizedMediaArgs(take.videoPath, tempPath, 30);

  await runner(args);
  await fs.rename(tempPath, targetPath);

  try {
    updateStudioTakeMediaPrep(take.id, {
      optimizedPath: targetPath,
      mediaReadyAt: Math.floor(Date.now() / 1000),
    });
  } catch {
    // If DB update fails (e.g. in standalone test without DB), ignore
  }

  return { ok: true, optimizedPath: targetPath };
}
