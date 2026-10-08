/**
 * __tests__/studio-export.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for Studio export transcoding:
 *   - ffmpeg argument construction per target format/quality
 *   - WebM→WebM stays a fast file copy (no ffmpeg invocation)
 *   - MP4/GIF orchestration drives the injected runner
 *   - missing/`failed` ffmpeg errors become actionable messages
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildGifArgs,
  buildGifPaletteArgs,
  buildMp4Args,
  buildWebmArgs,
  describeFfmpegFailure,
  transcodeStudioVideo,
} from '../main/studio-export';

describe('studio export ffmpeg args', () => {
  it('re-encodes to H.264/AAC MP4 with quality-driven CRF', () => {
    const high = buildMp4Args('/in/recording.webm', '/out/clip.mp4', 'high');
    expect(high).toContain('libx264');
    expect(high).toContain('aac');
    expect(high).toContain('+faststart');
    expect(high[high.indexOf('-crf') + 1]).toBe('18');
    expect(high[high.length - 1]).toBe('/out/clip.mp4');
    expect(high[high.indexOf('-i') + 1]).toBe('/in/recording.webm');

    const medium = buildMp4Args('/in/recording.webm', '/out/clip.mp4', 'medium');
    expect(medium[medium.indexOf('-crf') + 1]).toBe('24');
  });

  it('re-encodes non-WebM sources to VP9/Opus WebM', () => {
    const args = buildWebmArgs('/in/imported.mp4', '/out/clip.webm', 'high');
    expect(args).toContain('libvpx-vp9');
    expect(args).toContain('libopus');
    expect(args[args.length - 1]).toBe('/out/clip.webm');
  });

  it('builds a two-pass GIF palette pair that shares the palette path', () => {
    const palette = buildGifPaletteArgs('/in/recording.webm', '/tmp/pal.png');
    expect(palette.join(' ')).toContain('palettegen');
    expect(palette[palette.length - 1]).toBe('/tmp/pal.png');

    const gif = buildGifArgs('/in/recording.webm', '/tmp/pal.png', '/out/clip.gif');
    expect(gif.join(' ')).toContain('paletteuse');
    // Both input and palette are fed in, and the output is last.
    expect(gif[gif.indexOf('-i') + 1]).toBe('/in/recording.webm');
    expect(gif[gif.indexOf('-i', gif.indexOf('-i') + 1) + 1]).toBe('/tmp/pal.png');
    expect(gif[gif.length - 1]).toBe('/out/clip.gif');
  });
});

describe('transcodeStudioVideo', () => {
  let tempDir: string;
  let inputPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qeda-export-test-'));
    inputPath = path.join(tempDir, 'recording.webm');
    await fs.writeFile(inputPath, Buffer.from('fake-webm-bytes'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('copies a WebM source instead of invoking ffmpeg for a WebM target', async () => {
    const outputPath = path.join(tempDir, 'copy.webm');
    const calls: string[][] = [];

    await transcodeStudioVideo(
      { inputPath, outputPath, format: 'webm' },
      async (args) => {
        calls.push(args);
      },
    );

    expect(calls).toHaveLength(0);
    expect(await fs.readFile(outputPath, 'utf8')).toBe('fake-webm-bytes');
  });

  it('invokes ffmpeg once with MP4 args for an MP4 target', async () => {
    const outputPath = path.join(tempDir, 'clip.mp4');
    const calls: string[][] = [];

    await transcodeStudioVideo(
      { inputPath, outputPath, format: 'mp4', quality: 'medium' },
      async (args) => {
        calls.push(args);
      },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('libx264');
    expect(calls[0][calls[0].indexOf('-crf') + 1]).toBe('24');
  });

  it('runs the GIF palette pass before the paletteuse pass', async () => {
    const outputPath = path.join(tempDir, 'clip.gif');
    const calls: string[][] = [];

    await transcodeStudioVideo(
      { inputPath, outputPath, format: 'gif' },
      async (args) => {
        calls.push(args);
      },
    );

    expect(calls).toHaveLength(2);
    expect(calls[0].join(' ')).toContain('palettegen');
    expect(calls[1].join(' ')).toContain('paletteuse');
  });
});

describe('describeFfmpegFailure', () => {
  it('maps a missing binary to an actionable install message', () => {
    const error = Object.assign(new Error('spawn ffmpeg ENOENT'), {
      code: 'ENOENT',
    });
    expect(describeFfmpegFailure(error).message).toMatch(/ffmpeg was not found/);
  });

  it('surfaces the tail of ffmpeg stderr for real failures', () => {
    const error = Object.assign(new Error('exit 1'), {
      code: 1,
      stderr: 'line one\nUnknown encoder libx264',
    });
    expect(describeFfmpegFailure(error).message).toContain(
      'Unknown encoder libx264',
    );
  });
});
