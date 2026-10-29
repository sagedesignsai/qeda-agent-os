/**
 * __tests__/studio-media-prep.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for Studio media prep pipeline:
 *   - ffprobe JSON parsing and video/audio stream detection
 *   - Frame rate parsing (ratios vs floats)
 *   - Transcode argument construction (dense GOP, CFR 30fps)
 *   - Intermediate optimization lifecycle (short take guard, atomic temp renames)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { applyMigrations } from '../main/db/schema';
import { useTestDatabase } from '../main/db/client';
import { saveStudioTake, getStudioTake } from '../main/db/studio-store';
import {
  probeTake,
  buildOptimizedMediaArgs,
  ensureOptimizedMedia,
  parseFps,
  MIN_OPTIMIZE_DURATION_MS,
} from '../main/studio-media-prep';

describe('studio-media-prep', () => {
  describe('parseFps', () => {
    it('parses fractional ratio strings', () => {
      expect(parseFps('30/1')).toBe(30);
      expect(parseFps('60/1')).toBe(60);
      expect(parseFps('60000/1001')).toBe(59.94);
      expect(parseFps('24000/1001')).toBe(23.98);
    });

    it('parses integer and float strings', () => {
      expect(parseFps('25')).toBe(25);
      expect(parseFps('29.97')).toBe(29.97);
    });

    it('falls back to 30 on empty or invalid strings', () => {
      expect(parseFps('')).toBe(30);
      expect(parseFps(undefined)).toBe(30);
      expect(parseFps('invalid')).toBe(30);
      expect(parseFps('0/0')).toBe(30);
    });
  });

  describe('probeTake', () => {
    it('extracts metadata from ffprobe output', async () => {
      const mockOutput = JSON.stringify({
        streams: [
          {
            codec_type: 'video',
            width: 1920,
            height: 1080,
            r_frame_rate: '30/1',
            duration: '12.500',
            tags: { rotate: '0' },
          },
          {
            codec_type: 'audio',
            channels: 2,
            sample_rate: '48000',
          },
        ],
        format: {
          duration: '12.500',
        },
      });

      const mockRunner = jest.fn().mockResolvedValue(mockOutput);
      const probe = await probeTake('/path/to/video.mp4', mockRunner);

      expect(probe.width).toBe(1920);
      expect(probe.height).toBe(1080);
      expect(probe.fps).toBe(30);
      expect(probe.durationMs).toBe(12500);
      expect(probe.hasAudio).toBe(true);
      expect(probe.rotation).toBe(0);
      expect(mockRunner).toHaveBeenCalledWith(
        expect.arrayContaining(['-print_format', 'json', '/path/to/video.mp4']),
      );
    });

    it('detects video with no audio stream', async () => {
      const mockOutput = JSON.stringify({
        streams: [
          {
            codec_type: 'video',
            width: 1280,
            height: 720,
            r_frame_rate: '25/1',
            duration: '5.0',
          },
        ],
      });

      const mockRunner = jest.fn().mockResolvedValue(mockOutput);
      const probe = await probeTake('/path/to/silent.webm', mockRunner);

      expect(probe.width).toBe(1280);
      expect(probe.height).toBe(720);
      expect(probe.fps).toBe(25);
      expect(probe.durationMs).toBe(5000);
      expect(probe.hasAudio).toBe(false);
    });

    it('throws when ffprobe output is malformed', async () => {
      const mockRunner = jest.fn().mockResolvedValue('not json at all');
      await expect(probeTake('/path/bad.mp4', mockRunner)).rejects.toThrow(
        /Failed to parse ffprobe output/,
      );
    });
  });

  describe('buildOptimizedMediaArgs', () => {
    it('configures dense 1-second GOP, 30fps CFR, faststart, and no audio', () => {
      const args = buildOptimizedMediaArgs(
        '/in/take.webm',
        '/out/optimized.mp4',
        30,
      );

      expect(args).toContain('-i');
      expect(args).toContain('/in/take.webm');
      expect(args).toContain('-vf');
      expect(args).toContain('fps=30');
      expect(args).toContain('-g');
      expect(args).toContain('30');
      expect(args).toContain('-keyint_min');
      expect(args).toContain('30');
      expect(args).toContain('-scenecut');
      expect(args).toContain('0');
      expect(args).toContain('+faststart');
      expect(args).toContain('-an');
      expect(args[args.length - 1]).toBe('/out/optimized.mp4');
    });
  });

  describe('ensureOptimizedMedia', () => {
    let tmpDir: string;
    let db: InstanceType<typeof Database>;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qeda-media-test-'));
      db = new Database(':memory:');
      db.pragma('foreign_keys = ON');
      applyMigrations(db);
      useTestDatabase(db);
    });

    afterEach(async () => {
      // @ts-expect-error test reset
      useTestDatabase(null);
      db.close();
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('skips optimization for takes under the duration threshold', async () => {
      const mockRunner = jest.fn().mockResolvedValue(undefined);
      const shortTake = saveStudioTake({
        id: 'short-take',
        title: 'Short Clip',
        sourceType: 'screen',
        durationMs: MIN_OPTIMIZE_DURATION_MS - 5000,
        videoPath: path.join(tmpDir, 'source.mp4'),
      });

      const result = await ensureOptimizedMedia(shortTake, {
        runner: mockRunner,
        outputDir: tmpDir,
      });

      expect(result.skipped).toBe(true);
      expect(result.optimizedPath).toBeNull();
      expect(mockRunner).not.toHaveBeenCalled();
    });

    it('forces optimization when requested even for short takes', async () => {
      const mockRunner = jest.fn().mockImplementation(async (args: string[]) => {
        const out = args[args.length - 1];
        await fs.writeFile(out, 'fake-optimized-bytes');
      });

      const shortTake = saveStudioTake({
        id: 'forced-take',
        title: 'Forced Clip',
        sourceType: 'screen',
        durationMs: 5000,
        videoPath: path.join(tmpDir, 'source.mp4'),
      });

      const result = await ensureOptimizedMedia(shortTake, {
        runner: mockRunner,
        outputDir: tmpDir,
        force: true,
      });

      expect(result.ok).toBe(true);
      expect(result.optimizedPath).toBe(path.join(tmpDir, 'optimized.mp4'));
      expect(mockRunner).toHaveBeenCalled();

      // Check file was created
      const exists = await fs.stat(path.join(tmpDir, 'optimized.mp4'));
      expect(exists.size).toBeGreaterThan(0);
    });

    it('transcodes to temporary file and renames atomically, updating DB', async () => {
      const mockRunner = jest.fn().mockImplementation(async (args: string[]) => {
        const out = args[args.length - 1];
        // Target of runner must be the tmp file
        expect(out).toContain('.tmp.mp4');
        await fs.writeFile(out, 'fake-mp4-data');
      });

      const longTake = saveStudioTake({
        id: 'long-take',
        title: 'Full Product Walkthrough',
        sourceType: 'screen',
        durationMs: 60_000,
        videoPath: path.join(tmpDir, 'source.mp4'),
      });

      const result = await ensureOptimizedMedia(longTake, {
        runner: mockRunner,
        outputDir: tmpDir,
      });

      expect(result.ok).toBe(true);
      expect(result.optimizedPath).toBe(path.join(tmpDir, 'optimized.mp4'));

      // Check DB was updated with optimized_path
      const updated = getStudioTake('long-take');
      expect(updated?.optimizedPath).toBe(path.join(tmpDir, 'optimized.mp4'));
      expect(updated?.mediaReadyAt).toBeGreaterThan(0);

      // Calling again reuses the existing optimized file without running transcode again
      mockRunner.mockClear();
      const secondResult = await ensureOptimizedMedia(updated!, {
        runner: mockRunner,
        outputDir: tmpDir,
      });

      expect(secondResult.optimizedPath).toBe(path.join(tmpDir, 'optimized.mp4'));
      expect(mockRunner).not.toHaveBeenCalled();
    });
  });
});
