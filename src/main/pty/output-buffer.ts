import { DEFAULT_TERMINAL_SETTINGS } from '../../lib/terminal-settings.js';

export const MAX_PTY_OUTPUT_BYTES =
  DEFAULT_TERMINAL_SETTINGS.ptyReplayBufferBytes;

export function appendPtyOutput(
  outputBuffer: string[],
  data: string,
  currentBytes: number,
  maxBytes = MAX_PTY_OUTPUT_BYTES,
): number {
  if (maxBytes <= 0) {
    outputBuffer.length = 0;
    return 0;
  }

  outputBuffer.push(data);
  let totalBytes = currentBytes + Buffer.byteLength(data);

  while (totalBytes > maxBytes && outputBuffer.length > 0) {
    const oldest = outputBuffer[0];
    const oldestBytes = Buffer.from(oldest);
    const excessBytes = totalBytes - maxBytes;

    if (oldestBytes.length <= excessBytes) {
      outputBuffer.shift();
      totalBytes -= oldestBytes.length;
      continue;
    }

    let start = excessBytes;
    while (
      start < oldestBytes.length &&
      (oldestBytes[start] & 0b1100_0000) === 0b1000_0000
    ) {
      start += 1;
    }

    const trimmed = oldestBytes.subarray(start).toString('utf8');
    outputBuffer[0] = trimmed;
    totalBytes -= oldestBytes.length - Buffer.byteLength(trimmed);
  }

  return totalBytes;
}
