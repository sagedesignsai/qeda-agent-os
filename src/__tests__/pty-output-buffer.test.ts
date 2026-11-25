import {
  appendPtyOutput,
  MAX_PTY_OUTPUT_BYTES,
} from '../main/pty/output-buffer';

describe('appendPtyOutput', () => {
  it('keeps the newest output within the byte limit', () => {
    const output: string[] = [];

    let totalBytes = appendPtyOutput(output, 'first ', 0, 10);
    totalBytes = appendPtyOutput(output, 'second', totalBytes, 10);

    expect(totalBytes).toBe(10);
    expect(output.join('')).toBe('rst second');
  });

  it('trims a single oversized output chunk', () => {
    const output: string[] = [];

    const totalBytes = appendPtyOutput(output, 'x'.repeat(20), 0, 8);

    expect(totalBytes).toBe(8);
    expect(output.join('')).toBe('x'.repeat(8));
  });

  it('keeps UTF-8 output within the byte limit without splitting a code point', () => {
    const output: string[] = [];

    const totalBytes = appendPtyOutput(output, 'a🙂b', 0, 5);

    expect(totalBytes).toBe(5);
    expect(output.join('')).toBe('🙂b');
    expect(Buffer.byteLength(output.join(''))).toBeLessThanOrEqual(5);
  });

  it('uses the production scrollback limit by default', () => {
    const output: string[] = [];

    const totalBytes = appendPtyOutput(
      output,
      'x'.repeat(MAX_PTY_OUTPUT_BYTES + 1),
      0,
    );

    expect(totalBytes).toBe(MAX_PTY_OUTPUT_BYTES);
  });
});
