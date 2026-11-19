/**
 * __tests__/tts-stitch.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Chunked speech only works if the joins are valid audio. WAV is checked
 * sample-exactly (header rebuilt, PCM preserved); MP3 is checked as a byte
 * concatenation because frame-boundary joins are an accepted v1 trade-off.
 * The downgrade helper is included here because it decides when stitching is
 * even legal.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  buildWav,
  parseWav,
  stitchAudio,
  type WavPcm,
} from '../main/tts/stitch';
import { wavDurationMs } from '../main/tts/duration';
import { resolveTtsFormat } from '../main/tts/format';
import { DEEPGRAM_CAPABILITIES } from '../main/tts/providers/deepgram';

function tone(frames: number, sampleRate = 24_000): Uint8Array {
  const samples = new Uint8Array(frames * 2);
  for (let i = 0; i < frames; i += 1) {
    const value = Math.round(Math.sin(i / 8) * 8_000);
    samples[i * 2] = value & 0xff;
    samples[i * 2 + 1] = (value >> 8) & 0xff;
  }
  return buildWav(samples, { sampleRate, channels: 1, bitsPerSample: 16 });
}

describe('stitchAudio', () => {
  it('rebuilds one WAV header around concatenated PCM', () => {
    const a = tone(240); // 10 ms at 24 kHz
    const b = tone(480); // 20 ms
    const stitched = stitchAudio([a, b], 'wav');
    const parsed: WavPcm = parseWav(stitched);

    expect(parsed.sampleRate).toBe(24_000);
    expect(parsed.channels).toBe(1);
    expect(parsed.bitsPerSample).toBe(16);
    expect(parsed.pcm.byteLength).toBe(
      parseWav(a).pcm.byteLength + parseWav(b).pcm.byteLength,
    );
    expect(wavDurationMs(stitched)).toBe(30);
  });

  it('rejects WAV chunks recorded at different rates', () => {
    const a = tone(100, 24_000);
    const b = tone(100, 16_000);
    expect(() => stitchAudio([a, b], 'wav')).toThrow(/different sample rates/);
  });

  it('concatenates MP3 bytes unchanged', () => {
    const a = new Uint8Array([0xff, 0xfb, 1]);
    const b = new Uint8Array([0xff, 0xfb, 2]);
    expect([...stitchAudio([a, b], 'mp3')]).toEqual([
      0xff, 0xfb, 1, 0xff, 0xfb, 2,
    ]);
  });

  it('refuses formats that need a transcoder', () => {
    expect(() =>
      stitchAudio([new Uint8Array([1]), new Uint8Array([2])], 'flac'),
    ).toThrow(/without transcoding/);
  });
});

describe('resolveTtsFormat', () => {
  it('downgrades unstitchable long-form formats to MP3', () => {
    const resolved = resolveTtsFormat('flac', 3, DEEPGRAM_CAPABILITIES);
    expect(resolved.format).toBe('mp3');
    expect(resolved.warning).toBe('FORMAT_DOWNGRADED_FOR_LONGFORM:flac->mp3');
  });

  it('keeps a single-chunk request in its requested format', () => {
    expect(resolveTtsFormat('flac', 1, DEEPGRAM_CAPABILITIES)).toEqual({
      format: 'flac',
    });
  });

  it('reports genuinely unsupported formats', () => {
    expect(() =>
      resolveTtsFormat('wav', 1, {
        ...DEEPGRAM_CAPABILITIES,
        formats: ['mp3'],
      }),
    ).toThrow(/does not support wav/);
  });
});
