/**
 * main/tts/stitch.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Combine chunked provider audio without ffmpeg.
 *
 *   • MP3 frames concatenate into a valid stream. Boundary joins are not
 *     sample-accurate, which is an accepted v1 trade-off.
 *   • linear16 WAV is exact: strip each RIFF header, concatenate the PCM and
 *     write one correct header.
 *
 * Opus/FLAC/AAC never reach this function for multi-chunk input; the engine
 * downgrades those to MP3 first.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { TtsFormat } from '../../lib/tts/types.js';

export interface WavPcm {
  pcm: Uint8Array;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let value = '';
  for (let i = 0; i < length; i += 1) {
    value += String.fromCharCode(bytes[offset + i] ?? 0);
  }
  return value;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let i = 0; i < value.length; i += 1) {
    bytes[offset + i] = value.charCodeAt(i);
  }
}

/** Parse a PCM WAV file into its header fields and raw sample data. */
export function parseWav(bytes: Uint8Array): WavPcm {
  if (
    bytes.length < 44 ||
    readAscii(bytes, 0, 4) !== 'RIFF' ||
    readAscii(bytes, 8, 4) !== 'WAVE'
  ) {
    throw new Error('Not a RIFF/WAVE file.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let pcm: Uint8Array | null = null;

  while (offset + 8 <= bytes.length) {
    const id = readAscii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    if (dataStart + size > bytes.length) break;

    if (id === 'fmt ') {
      const audioFormat = view.getUint16(dataStart, true);
      if (audioFormat !== 1) {
        throw new Error(
          `Unsupported WAV encoding ${audioFormat}; expected PCM (1).`,
        );
      }
      channels = view.getUint16(dataStart + 2, true);
      sampleRate = view.getUint32(dataStart + 4, true);
      bitsPerSample = view.getUint16(dataStart + 14, true);
    } else if (id === 'data') {
      pcm = bytes.slice(dataStart, dataStart + size);
    }

    // RIFF chunks are word-aligned.
    offset = dataStart + size + (size % 2);
  }

  if (!pcm || !channels || !sampleRate || !bitsPerSample) {
    throw new Error('WAV file is missing a fmt or data chunk.');
  }
  return { pcm, sampleRate, channels, bitsPerSample };
}

/** Build a canonical 44-byte PCM WAV header around raw sample data. */
export function buildWav(samples: Uint8Array, template: Omit<WavPcm, 'pcm'>): Uint8Array {
  const { sampleRate, channels, bitsPerSample } = template;
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const out = new Uint8Array(44 + samples.length);
  const view = new DataView(out.buffer);

  writeAscii(out, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length, true);
  writeAscii(out, 8, 'WAVE');
  writeAscii(out, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(out, 36, 'data');
  view.setUint32(40, samples.length, true);
  out.set(samples, 44);
  return out;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function stitchWav(parts: Uint8Array[]): Uint8Array {
  const parsed = parts.map(parseWav);
  const first = parsed[0]!;
  for (const part of parsed.slice(1)) {
    if (
      part.sampleRate !== first.sampleRate ||
      part.channels !== first.channels ||
      part.bitsPerSample !== first.bitsPerSample
    ) {
      throw new Error(
        'Cannot stitch WAV chunks with different sample rates, channels or bit depths.',
      );
    }
  }
  return buildWav(
    concatBytes(parsed.map((part) => part.pcm)),
    {
      sampleRate: first.sampleRate,
      channels: first.channels,
      bitsPerSample: first.bitsPerSample,
    },
  );
}

/**
 * Stitch chunk audio. Throws for formats that cannot be joined losslessly
 * without a transcoder; the engine resolves those before synthesis.
 */
export function stitchAudio(
  parts: Uint8Array[],
  format: TtsFormat,
): Uint8Array {
  if (parts.length === 0) return new Uint8Array(0);
  if (parts.length === 1) return parts[0]!;

  switch (format) {
    case 'mp3':
      return concatBytes(parts);
    case 'wav':
      return stitchWav(parts);
    default:
      throw new Error(`Cannot stitch ${format} audio without transcoding.`);
  }
}
