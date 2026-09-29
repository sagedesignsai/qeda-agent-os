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
  extractLocalhostUrls,
  isGitDiff,
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

describe('extractLocalhostUrls', () => {
  it('extracts Next.js style localhost URL', () => {
    const output = `
   ▲ Next.js 15.0.0
   - Local:        http://localhost:3000
   - Environments: .env.local

 ✓ Starting...
 ✓ Ready in 1845ms
    `;
    expect(extractLocalhostUrls(output)).toEqual(['http://localhost:3000']);
  });

  it('extracts Vite style local and 127.0.0.1 URLs', () => {
    const output = `
  VITE v5.4.2  ready in 214 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.1.50:5173/
  ➜  Loopback: http://127.0.0.1:5173/
    `;
    const urls = extractLocalhostUrls(output);
    expect(urls).toContain('http://localhost:5173/');
    expect(urls).toContain('http://127.0.0.1:5173/');
    expect(urls).not.toContain('http://192.168.1.50:5173/');
  });

  it('cleans trailing punctuation', () => {
    const output =
      'Server running at http://localhost:8080. Check it out (http://127.0.0.1:4000)!';
    expect(extractLocalhostUrls(output)).toEqual([
      'http://localhost:8080',
      'http://127.0.0.1:4000',
    ]);
  });

  it('returns empty array when no dev servers are mentioned', () => {
    expect(extractLocalhostUrls('git commit -m "feat: init"')).toEqual([]);
    expect(extractLocalhostUrls('')).toEqual([]);
  });
});

describe('isGitDiff', () => {
  it('detects git diff command by name', () => {
    expect(isGitDiff('git diff', '')).toBe(true);
    expect(isGitDiff('git diff --staged', '')).toBe(true);
    expect(isGitDiff('git show HEAD', '')).toBe(true);
    expect(isGitDiff('git log -p -2', '')).toBe(true);
  });

  it('detects unified diff headers in output text', () => {
    const diffOutput = `
diff --git a/src/index.ts b/src/index.ts
index 83db48f..bf269f4 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
+import express from 'express';
 const app = express();
-app.listen(3000);
+app.listen(8080);
    `;
    expect(isGitDiff('my-script', diffOutput)).toBe(true);
  });

  it('returns false for standard non-diff output', () => {
    expect(isGitDiff('git status', 'On branch main\nnothing to commit')).toBe(
      false,
    );
    expect(isGitDiff('ls -la', 'total 0\ndrwxr-xr-x .')).toBe(false);
  });
});
