/**
 * __tests__/studio-thumbs.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for Studio thumbnails and waveforms:
 *   - Filmstrip grid dimension calculation (dynamic rows/cols, cadence)
 *   - Filmstrip ffmpeg argument construction
 *   - Pure PCM audio bucketing into peak waveforms (Float32Array)
 *   - Filmstrip sprite sheet and waveform sidecar generation orchestration
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { applyMigrations } from '../main/db/schema';
import { useTestDatabase } from '../main/db/client';
import { saveStudioTake, getStudioTake } from '../main/db/studio-store';
import { computePeaksFromFloat32 } from '../lib/studio/audio-peaks';
import {
  calculateFilmstripGrid,
  buildFilmstripArgs,
  buildPcmArgs,
  generateFilmstrip,
  generateWaveform,
} from '../main/studio-thumbs';

describe('studio-thumbs & audio-peaks', () => {
  describe('calculateFilmstripGrid', () => {
    it('calculates tiles for short clip (< 30s)', () => {
      // 10 seconds at 1.5s interval -> ceil(10 / 1.5) = 7 tiles
      const grid = calculateFilmstripGrid(10_000, 1.5);
      expect(grid.totalTiles).toBe(7);
      expect(grid.cols).toBe(7);
      expect(grid.rows).toBe(1);
    });

    it('caps columns at 20 and stacks rows for longer clips', () => {
      // 5 minutes = 300 seconds at 1.5s interval = 200 tiles
      const grid = calculateFilmstripGrid(300_000, 1.5);
      expect(grid.totalTiles).toBe(200);
      expect(grid.cols).toBe(20);
      expect(grid.rows).toBe(10);
    });

    it('handles zero or negative duration safely', () => {
      const grid = calculateFilmstripGrid(0, 1.5);
      expect(grid.totalTiles).toBe(1);
      expect(grid.cols).toBe(1);
      expect(grid.rows).toBe(1);
    });
  });

  describe('buildFilmstripArgs', () => {
    it('builds tile filter with specified grid and interval', () => {
      const args = buildFilmstripArgs(
        '/path/in.mp4',
        '/path/filmstrip.webp',
        20,
        10,
        1.5,
      );

      expect(args).toContain('-i');
      expect(args).toContain('/path/in.mp4');
      expect(args).toContain('-vf');
      expect(args).toContain('fps=1/1.5,scale=120:68,tile=20x10');
      expect(args).toContain('-frames:v');
      expect(args).toContain('1');
      expect(args[args.length - 1]).toBe('/path/filmstrip.webp');
    });
  });

  describe('buildPcmArgs', () => {
    it('configures mono 48kHz float32le pipe output', () => {
      const args = buildPcmArgs('/path/in.mp4');
      expect(args).toContain('-map');
      expect(args).toContain('0:a:0');
      expect(args).toContain('-ac');
      expect(args).toContain('1');
      expect(args).toContain('-ar');
      expect(args).toContain('48000');
      expect(args).toContain('-f');
      expect(args).toContain('f32le');
      expect(args[args.length - 1]).toBe('-');
    });
  });

  describe('computePeaksFromFloat32', () => {
    it('returns empty array for empty sample buffer', () => {
      const peaks = computePeaksFromFloat32(new Float32Array(0), {
        sampleRate: 48000,
      });
      expect(peaks.length).toBe(0);
    });

    it('buckets samples into normalized peak amplitudes', () => {
      // 1 second of audio at 48kHz = 48,000 samples
      const sampleRate = 48000;
      const samples = new Float32Array(sampleRate);
      // Fill first half second with silence, second half with 0.4 amplitude
      for (let i = 24000; i < 48000; i++) {
        samples[i] = 0.4;
      }

      // 80 peaks/sec -> 80 peaks
      const peaks = computePeaksFromFloat32(samples, {
        sampleRate,
        peaksPerSecond: 80,
      });

      expect(peaks.length).toBe(80);
      // First 40 peaks should be near 0
      expect(peaks[0]).toBe(0);
      expect(peaks[39]).toBe(0);
      // Next 40 peaks should be amplified (0.4 * 2.5 = 1.0 capped)
      expect(peaks[40]).toBe(1.0);
      expect(peaks[79]).toBe(1.0);
    });

    it('caps peak count to maxPeaks', () => {
      // 1000 seconds of audio = 48,000,000 samples
      // At 80 peaks/sec that would be 80,000 peaks, but maxPeaks is 8000
      const sampleRate = 48000;
      const smallSamples = new Float32Array(48000 * 10); // 10s
      const peaks = computePeaksFromFloat32(smallSamples, {
        sampleRate,
        peaksPerSecond: 80,
        maxPeaks: 50,
      });

      expect(peaks.length).toBe(50);
    });
  });

  describe('sidecar generation orchestration', () => {
    let tmpDir: string;
    let db: InstanceType<typeof Database>;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qeda-thumbs-test-'));
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

    it('generates filmstrip image and metadata json, updating DB', async () => {
      const mockRunner = jest.fn().mockImplementation(async (args: string[]) => {
        const out = args[args.length - 1];
        await fs.writeFile(out, 'fake-webp-image');
      });

      const take = saveStudioTake({
        id: 'filmstrip-take',
        title: 'Filmstrip Test Take',
        sourceType: 'screen',
        durationMs: 30_000,
        videoPath: path.join(tmpDir, 'recording.mp4'),
      });

      const result = await generateFilmstrip(take, {
        runner: mockRunner,
        outputDir: tmpDir,
      });

      expect(result.ok).toBe(true);
      expect(result.filmstripPath).toBe(path.join(tmpDir, 'filmstrip.webp'));
      expect(result.meta.cols).toBe(20);
      expect(result.meta.rows).toBe(1);
      expect(result.meta.totalTiles).toBe(20);

      // Verify files written to disk
      const webpExists = await fs.stat(path.join(tmpDir, 'filmstrip.webp'));
      expect(webpExists.size).toBeGreaterThan(0);

      const jsonStr = await fs.readFile(
        path.join(tmpDir, 'filmstrip.json'),
        'utf-8',
      );
      const parsedJson = JSON.parse(jsonStr);
      expect(parsedJson.tileW).toBe(120);
      expect(parsedJson.tileH).toBe(68);
      expect(parsedJson.totalTiles).toBe(20);

      // Verify DB updated
      const updated = getStudioTake('filmstrip-take');
      expect(updated?.filmstripPath).toBe(path.join(tmpDir, 'filmstrip.webp'));
    });

    it('generates waveform sidecar binary and updates DB', async () => {
      // 1 second of 48kHz audio = 48,000 float samples = 192,000 bytes
      const sampleCount = 48000;
      const floatArr = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        floatArr[i] = 0.2;
      }
      const pcmBuffer = Buffer.from(
        floatArr.buffer,
        floatArr.byteOffset,
        floatArr.byteLength,
      );

      const mockRunner = jest.fn().mockResolvedValue(pcmBuffer);

      const take = saveStudioTake({
        id: 'waveform-take',
        title: 'Waveform Test Take',
        sourceType: 'screen',
        durationMs: 1000,
        videoPath: path.join(tmpDir, 'recording.mp4'),
      });

      const result = await generateWaveform(take, {
        runner: mockRunner,
        outputDir: tmpDir,
      });

      expect(result.ok).toBe(true);
      expect(result.peaks.length).toBe(80);
      expect(result.waveformPath).toBe(path.join(tmpDir, 'peaks.bin'));

      // Check binary file exists on disk
      const binStats = await fs.stat(path.join(tmpDir, 'peaks.bin'));
      expect(binStats.size).toBe(80 * 4); // 80 float32 values = 320 bytes

      // Check DB updated
      const updated = getStudioTake('waveform-take');
      expect(updated?.waveformPath).toBe(path.join(tmpDir, 'peaks.bin'));
    });
  });
});
