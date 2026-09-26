/**
 * __tests__/shell-integration.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for shell integration script generation (bash and zsh).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs';
import {
  getBashIntegrationPath,
  getZshIntegrationDir,
  cleanupShellIntegration,
} from '../main/pty/shell-integration';

describe('shell-integration', () => {
  afterAll(() => {
    cleanupShellIntegration();
  });

  describe('bash integration', () => {
    it('generates a valid bash integration script with OSC 133 hooks', () => {
      const scriptPath = getBashIntegrationPath();
      expect(fs.existsSync(scriptPath)).toBe(true);

      const content = fs.readFileSync(scriptPath, 'utf8');
      // Sources user's existing .bashrc
      expect(content).toContain('. ~/.bashrc');
      // Contains OSC 133 semantic escape sequences
      expect(content).toContain('133;A');
      expect(content).toContain('133;B');
      expect(content).toContain('133;C');
      expect(content).toContain('133;D');
      // Contains OSC 7 directory notification
      expect(content).toContain('7;file://');
    });
  });

  describe('zsh integration', () => {
    it('generates a valid zsh integration directory with .zshrc and hooks', () => {
      const zdotdir = getZshIntegrationDir();
      expect(fs.existsSync(zdotdir)).toBe(true);

      const zshrcPath = `${zdotdir}/.zshrc`;
      expect(fs.existsSync(zshrcPath)).toBe(true);

      const content = fs.readFileSync(zshrcPath, 'utf8');
      expect(content).toContain('source "$HOME/.zshrc"');
      expect(content).toContain('add-zsh-hook');
      expect(content).toContain('133;A');
      expect(content).toContain('133;B');
      expect(content).toContain('133;C');
      expect(content).toContain('133;D');
    });
  });
});
