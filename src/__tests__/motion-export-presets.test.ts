/**
 * __tests__/motion-export-presets.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pins the preset contract: size/fps resolution, even-dimension handling, and
 * the chunk validators main uses to distrust the hidden render window.
 */

import {
  MOTION_EXPORT_PRESETS,
  MotionExportPresetError,
  estimateMotionExportBytes,
  motionExportFileName,
  resolveMotionExportSettings,
} from '@/lib/motion/export/presets';
import {
  MotionExportProtocolError,
  parseMotionExportChunk,
  parseMotionExportFailure,
  parseMotionExportProgress,
} from '@/lib/motion/export/protocol';

const OUTPUT = { width: 1920, height: 1080, fps: 30 };

describe('Motion export presets', () => {
  it('resolves fixed presets and source presets from project output', () => {
    expect(resolveMotionExportSettings('launch-1080p', OUTPUT)).toMatchObject({
      width: 1920, height: 1080, fps: 30, extension: '.mp4', container: 'mp4', codecs: ['avc'],
    });
    expect(resolveMotionExportSettings('webm-vp9', { width: 1000, height: 700, fps: 24 })).toMatchObject({
      width: 1000, height: 700, fps: 24, extension: '.webm', codecs: ['vp9'],
    });
    expect(resolveMotionExportSettings('social-vertical', OUTPUT)).toMatchObject({ width: 1080, height: 1920 });
  });

  it('floors odd source dimensions to an even pixel count', () => {
    expect(resolveMotionExportSettings('webm-av1', { width: 1001, height: 999, fps: 60 })).toMatchObject({
      width: 1000, height: 998, fps: 60,
    });
  });

  it('rejects unknown presets, unsupported frame rates, and impossible sizes', () => {
    expect(() => resolveMotionExportSettings('nope', OUTPUT)).toThrow(MotionExportPresetError);
    expect(() => resolveMotionExportSettings('webm-vp9', { ...OUTPUT, fps: 25 })).toThrow('must be 24, 30, or 60');
    expect(() => resolveMotionExportSettings('webm-vp9', { ...OUTPUT, width: 1 })).toThrow('whole pixel count');
  });

  it('offers MP4 and WebM presets and estimates output size from duration', () => {
    expect(MOTION_EXPORT_PRESETS.some((preset) => preset.container === 'mp4')).toBe(true);
    expect(MOTION_EXPORT_PRESETS.some((preset) => preset.container === 'webm')).toBe(true);
    expect(estimateMotionExportBytes({ bitrate: 8_000_000 }, 2)).toBe(2_000_000);
    expect(estimateMotionExportBytes({ bitrate: 8_000_000 }, 0)).toBe(0);
  });

  it('derives a filesystem-safe file name with the preset extension', () => {
    expect(motionExportFileName('  Launch / Hero — v2  ', { extension: '.mp4' })).toBe('launch-hero-v2.mp4');
    expect(motionExportFileName('', { extension: '.webm' })).toBe('motion-export.webm');
  });
});

describe('Motion export protocol', () => {
  it('accepts a valid positioned chunk and preserves byte identity', () => {
    const chunk = parseMotionExportChunk({ jobId: 'rnd_abc123', data: new Uint8Array([1, 2, 3]), position: 4096 });
    expect(chunk.position).toBe(4096);
    expect([...chunk.data]).toEqual([1, 2, 3]);
  });

  it('rejects empty chunks, negative positions, and malformed job ids', () => {
    expect(() => parseMotionExportChunk({ jobId: 'rnd_abc', data: new Uint8Array(), position: 0 })).toThrow(MotionExportProtocolError);
    expect(() => parseMotionExportChunk({ jobId: 'rnd_abc', data: new Uint8Array([1]), position: -1 })).toThrow('non-negative integer');
    expect(() => parseMotionExportChunk({ jobId: 'job-1', data: new Uint8Array([1]), position: 0 })).toThrow('invalid job id');
  });

  it('validates progress phases and clamps failure messages', () => {
    expect(parseMotionExportProgress({ jobId: 'rnd_abc', phase: 'render', frame: 12 })).toEqual({
      jobId: 'rnd_abc', phase: 'render', frame: 12,
    });
    expect(() => parseMotionExportProgress({ jobId: 'rnd_abc', phase: 'done' })).toThrow('phase is invalid');
    expect(parseMotionExportFailure({ jobId: 'rnd_abc', message: '  codec failed  ' }).message).toBe('codec failed');
    expect(parseMotionExportFailure({ jobId: 'rnd_abc' }).message).toBe('The export renderer failed.');
  });
});
