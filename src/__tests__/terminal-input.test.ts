/**
 * Tests for the terminal composer parser and duration formatter.
 *
 * The prefix rule decides whether text is planned by the agent or executed
 * directly against the shell, so getting it wrong is a safety-relevant bug:
 * a misclassified goal runs as a command, and a misclassified command silently
 * becomes something the model rewrites.
 */
import {
  parseComposerInput,
  isDirectCommandInput,
  formatDuration,
} from '../lib/terminal-input';

describe('parseComposerInput', () => {
  describe('goals (agent-planned)', () => {
    it.each([
      'what is this folder?',
      'find all files larger than 10MB',
      '   leading whitespace is fine   ',
      'show me disk usage',
    ])('treats %j as a goal', (input) => {
      expect(parseComposerInput(input)).toEqual({
        kind: 'goal',
        text: input.trim(),
      });
    });
  });

  describe('direct commands', () => {
    it('accepts the ! prefix', () => {
      expect(parseComposerInput('!git status')).toEqual({
        kind: 'command',
        command: 'git status',
      });
    });

    it('accepts the $ prefix', () => {
      expect(parseComposerInput('$ls -la')).toEqual({
        kind: 'command',
        command: 'ls -la',
      });
    });

    it('accepts a prefix followed by a space', () => {
      expect(parseComposerInput('! pnpm test')).toEqual({
        kind: 'command',
        command: 'pnpm test',
      });
    });

    it('strips the prefix rather than passing it to the shell', () => {
      const result = parseComposerInput('!echo hello');
      expect(result.kind).toBe('command');
      // The leading "!" must not survive into the executed command.
      expect(result.kind === 'command' && result.command).toBe('echo hello');
      expect(result.kind === 'command' && result.command).not.toContain('!');
    });

    it('keeps interior and trailing shell metacharacters intact', () => {
      const cmd = 'grep -rn "TODO" . | head -20 && echo done';
      expect(parseComposerInput(`!${cmd}`)).toEqual({
        kind: 'command',
        command: cmd,
      });
    });

    it('handles a prefix with extra whitespace', () => {
      expect(parseComposerInput('  !   ls -la  ')).toEqual({
        kind: 'command',
        command: 'ls -la',
      });
    });
  });

  describe('degenerate prefixes', () => {
    // A bare prefix carries no command. Dispatching an empty string to the
    // shell would create a meaningless block, so it must fall back to a goal.
    it.each(['!', '$', '! ', '$   ', '  !  '])(
      'treats bare prefix %j as a goal, not an empty command',
      (input) => {
        const result = parseComposerInput(input);
        expect(result.kind).toBe('goal');
        expect(result.kind === 'goal' && result.text).toBe(input.trim());
      },
    );
  });

  describe('prefix must be leading', () => {
    // "!" is valid shell syntax (history expansion / negation), so only a
    // *leading* marker may switch modes.
    it('does not treat an interior ! as a command marker', () => {
      expect(parseComposerInput('echo hi!')).toEqual({
        kind: 'goal',
        text: 'echo hi!',
      });
    });

    it('does not treat a trailing ! as a command marker', () => {
      expect(parseComposerInput('fix this please!')).toEqual({
        kind: 'goal',
        text: 'fix this please!',
      });
    });
  });

  it('agrees with isDirectCommandInput', () => {
    expect(isDirectCommandInput('!ls')).toBe(true);
    expect(isDirectCommandInput('$ls')).toBe(true);
    expect(isDirectCommandInput('ls')).toBe(false);
    expect(isDirectCommandInput('!')).toBe(false);
  });
});

describe('formatDuration', () => {
  it('renders sub-second durations in ms', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(412)).toBe('412ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('keeps one decimal for sub-minute durations', () => {
    expect(formatDuration(1000)).toBe('1.0s');
    expect(formatDuration(2400)).toBe('2.4s');
    expect(formatDuration(59_400)).toBe('59.4s');
  });

  it('rolls over to minutes plus seconds', () => {
    expect(formatDuration(60_000)).toBe('1m 0s');
    expect(formatDuration(72_000)).toBe('1m 12s');
    expect(formatDuration(3_600_000)).toBe('60m 0s');
  });

  it('never renders a misleading negative or non-finite value', () => {
    expect(formatDuration(-1)).toBe('—');
    expect(formatDuration(Number.NaN)).toBe('—');
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('—');
  });
});
