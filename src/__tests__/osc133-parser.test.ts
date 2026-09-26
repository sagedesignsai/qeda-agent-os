/**
 * __tests__/osc133-parser.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for OSC 133 semantic shell integration parser.
 * Tests chunk boundary handling, clean string extraction, exit code parsing,
 * duration tracking, and OSC 7 working directory parsing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Osc133Parser, type ParsedBlockEvent } from '../main/pty/osc133-parser';

describe('Osc133Parser', () => {
  it('strips OSC 133 control sequences from terminal output', () => {
    const parser = new Osc133Parser();
    const raw = '\x1b]133;A\x07user@box:~$ \x1b]133;B\x07ls\x1b]133;C\x07file1.txt\nfile2.txt\n\x1b]133;D;0\x07';
    const clean = parser.feed(raw);
    expect(clean).toBe('user@box:~$ lsfile1.txt\nfile2.txt\n');
  });

  it('slices command execution into a discrete block on 133;D', () => {
    const events: ParsedBlockEvent[] = [];
    const parser = new Osc133Parser({
      onCommandEnd: (evt) => events.push(evt),
    });

    // Prompt & command input
    parser.feed('\x1b]133;A\x07$ \x1b]133;B\x07git status');
    // Enter pressed -> command execution start
    parser.feed('\x1b]133;C\x07');
    // Output
    parser.feed('On branch main\nnothing to commit\n');
    // Command exit code 0
    parser.feed('\x1b]133;D;0\x07');

    expect(events).toHaveLength(1);
    expect(events[0].command).toBe('git status');
    expect(events[0].output).toBe('On branch main\nnothing to commit\n');
    expect(events[0].exitCode).toBe(0);
    expect(events[0].status).toBe('done');
    expect(events[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('correctly handles non-zero exit codes', () => {
    const events: ParsedBlockEvent[] = [];
    const parser = new Osc133Parser({
      onCommandEnd: (evt) => events.push(evt),
    });

    parser.feed('\x1b]133;A\x07$ \x1b]133;B\x07false\x1b]133;C\x07\x1b]133;D;1\x07');

    expect(events).toHaveLength(1);
    expect(events[0].exitCode).toBe(1);
    expect(events[0].status).toBe('error');
  });

  it('handles escape sequences split across chunk boundaries', () => {
    const events: ParsedBlockEvent[] = [];
    const parser = new Osc133Parser({
      onCommandEnd: (evt) => events.push(evt),
    });

    // Split "\x1b]133;C\x07" across two chunks
    parser.feed('\x1b]133;A\x07$ \x1b]133;B\x07echo hi\x1b]133;');
    parser.feed('C\x07hi\n\x1b]133;D;');
    parser.feed('0\x07');

    expect(events).toHaveLength(1);
    expect(events[0].command).toBe('echo hi');
    expect(events[0].output).toBe('hi\n');
    expect(events[0].exitCode).toBe(0);
  });

  it('extracts working directory updates via OSC 7', () => {
    let capturedCwd = '';
    const parser = new Osc133Parser({
      onCwdChange: (cwd) => {
        capturedCwd = cwd;
      },
    });

    parser.feed('\x1b]7;file://myhost/home/developer/projects/docugent\x07');
    expect(capturedCwd).toBe('/home/developer/projects/docugent');
    expect(parser.getCurrentCwd()).toBe('/home/developer/projects/docugent');
  });

  it('handles ST (\\x1b\\\\) as alternative terminator to BEL (\\x07)', () => {
    const events: ParsedBlockEvent[] = [];
    const parser = new Osc133Parser({
      onCommandEnd: (evt) => events.push(evt),
    });

    parser.feed('\x1b]133;A\x1b\\$ \x1b]133;B\x1b\\pwd\x1b]133;C\x1b\\/home\n\x1b]133;D;0\x1b\\');
    expect(events).toHaveLength(1);
    expect(events[0].command).toBe('pwd');
    expect(events[0].output).toBe('/home\n');
    expect(events[0].exitCode).toBe(0);
  });
});
