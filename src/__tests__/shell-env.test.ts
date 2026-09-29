/**
 * __tests__/shell-env.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for shell environment, path injection, export parsing, and TTY checks.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  parseDotEnv,
  parseExportCommand,
  isInteractiveCommand,
  setSessionEnvVar,
  getSessionEnv,
  clearSessionEnv,
  buildExecutionEnv,
  getShellExecutable,
} from '../main/ai/shell-env';

describe('shell-env helpers', () => {
  it('correctly identifies default shell executable', () => {
    const shell = getShellExecutable();
    expect(shell).toBeDefined();
    expect(typeof shell).toBe('string');
  });

  describe('parseDotEnv', () => {
    it('parses unquoted, single-quoted, and double-quoted key-values', () => {
      const content = `
        # Comment line
        PORT=3000
        NODE_ENV="development"
        API_KEY='secret-123'
        export DATABASE_URL="postgres://localhost:5432/db"
      `;
      const env = parseDotEnv(content);
      expect(env.PORT).toBe('3000');
      expect(env.NODE_ENV).toBe('development');
      expect(env.API_KEY).toBe('secret-123');
      expect(env.DATABASE_URL).toBe('postgres://localhost:5432/db');
    });

    it('ignores invalid or empty lines', () => {
      const content = `
        # just a comment
        
        INVALID LINE WITHOUT EQUALS
      `;
      const env = parseDotEnv(content);
      expect(Object.keys(env)).toHaveLength(0);
    });
  });

  describe('parseExportCommand', () => {
    it('parses single export statements', () => {
      const parsed = parseExportCommand('export PORT=8080');
      expect(parsed).toEqual({ PORT: '8080' });
    });

    it('parses multiple exports in a single line with quotes', () => {
      const parsed = parseExportCommand(
        'export PORT="8080" NODE_ENV=production',
      );
      expect(parsed).toEqual({ PORT: '8080', NODE_ENV: 'production' });
    });

    it('returns null for non-export commands', () => {
      expect(parseExportCommand('npm run dev')).toBeNull();
      expect(parseExportCommand('git status')).toBeNull();
    });
  });

  describe('sessionEnv store', () => {
    const testSid = 'test-session-123';

    afterEach(() => {
      clearSessionEnv(testSid);
    });

    it('stores and retrieves session-specific environment variables', () => {
      setSessionEnvVar(testSid, 'FOO', 'bar');
      setSessionEnvVar(testSid, 'PORT', '5000');

      const vars = getSessionEnv(testSid);
      expect(vars.FOO).toBe('bar');
      expect(vars.PORT).toBe('5000');

      clearSessionEnv(testSid);
      expect(getSessionEnv(testSid)).toEqual({});
    });

    it('merges sessionEnv into buildExecutionEnv', () => {
      setSessionEnvVar(testSid, 'CUSTOM_VAR', 'hello_world');
      const env = buildExecutionEnv(testSid);
      expect(env.CUSTOM_VAR).toBe('hello_world');
    });
  });

  describe('isInteractiveCommand', () => {
    it('detects commands requiring interactive TTY input', () => {
      expect(isInteractiveCommand('sudo apt update')).toBe(true);
      expect(isInteractiveCommand('git add -p')).toBe(true);
      expect(isInteractiveCommand('git commit')).toBe(true);
      expect(isInteractiveCommand('npm init')).toBe(true);
      expect(isInteractiveCommand('nano config.json')).toBe(true);
      expect(isInteractiveCommand('vim index.ts')).toBe(true);
      expect(isInteractiveCommand('python')).toBe(true);
      expect(isInteractiveCommand('ssh server')).toBe(true);
    });

    it('allows non-interactive commands without flags', () => {
      expect(isInteractiveCommand('git status')).toBe(false);
      expect(isInteractiveCommand('git commit -m "feat: new feature"')).toBe(
        false,
      );
      expect(isInteractiveCommand('npm init -y')).toBe(false);
      expect(isInteractiveCommand('npm run dev')).toBe(false);
      expect(isInteractiveCommand('python script.py')).toBe(false);
    });
  });
});
