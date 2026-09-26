/**
 * __tests__/terminal-history.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for terminal command history and ghost-text prefix matching.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  addCommandHistory,
  getCommandHistory,
  getHistorySuggestion,
  searchCommandHistory,
  clearCommandHistory,
} from '../lib/terminal-history';

describe('terminal-history', () => {
  beforeEach(() => {
    clearCommandHistory();
  });

  it('adds and retrieves history items in reverse chronological order', () => {
    addCommandHistory('ls -la');
    addCommandHistory('git status');

    const history = getCommandHistory();
    expect(history).toHaveLength(2);
    expect(history[0].command).toBe('git status');
    expect(history[1].command).toBe('ls -la');
  });

  it('deduplicates identical commands by bumping to the top', () => {
    addCommandHistory('npm test');
    addCommandHistory('git status');
    addCommandHistory('npm test');

    const history = getCommandHistory();
    expect(history).toHaveLength(2);
    expect(history[0].command).toBe('npm test');
    expect(history[1].command).toBe('git status');
  });

  it('returns completion suffix for ghost text', () => {
    addCommandHistory('git checkout -b feature/auth');
    addCommandHistory('pnpm install');

    const suggestion = getHistorySuggestion('git check');
    expect(suggestion).toBe('out -b feature/auth');
  });

  it('returns null when no suggestion matches', () => {
    addCommandHistory('npm start');
    expect(getHistorySuggestion('docker')).toBeNull();
    expect(getHistorySuggestion('')).toBeNull();
    expect(getHistorySuggestion('n')).toBeNull(); // < 2 chars
  });

  it('searches command history', () => {
    addCommandHistory('docker compose up -d');
    addCommandHistory('git log --oneline');
    addCommandHistory('docker stop container1');

    const results = searchCommandHistory('docker');
    expect(results).toHaveLength(2);
    expect(results[0].command).toBe('docker stop container1');
    expect(results[1].command).toBe('docker compose up -d');
  });
});
