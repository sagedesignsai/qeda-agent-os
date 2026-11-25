/**
 * lib/terminal-history.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Terminal command history manager with autosuggestions and fuzzy recall (Warp Pillar 3).
 *
 * Persists executed commands with timestamps, directories, and supports:
 *   - Most recent match for fish-style ghost text autosuggestions
 *   - Reverse search (Ctrl+R) across history
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  DEFAULT_TERMINAL_SETTINGS,
  TERMINAL_HISTORY_LIMITS,
} from './terminal-settings';

export interface HistoryEntry {
  id: string;
  command: string;
  timestamp: number;
  cwd?: string;
}

const HISTORY_STORAGE_KEY = 'docugent_terminal_history_v1';
const DEFAULT_HISTORY_ITEMS = DEFAULT_TERMINAL_SETTINGS.historyLimit;
const MAX_HISTORY_ITEMS =
  TERMINAL_HISTORY_LIMITS[TERMINAL_HISTORY_LIMITS.length - 1];
let memoryHistory: HistoryEntry[] | null = null;

function boundedLimit(limit: number): number {
  return Math.min(MAX_HISTORY_ITEMS, Math.max(0, Math.floor(limit)));
}

function readHistory(): HistoryEntry[] {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as HistoryEntry[];
    } catch {
      return memoryHistory ?? [];
    }
  }
  return memoryHistory ?? [];
}

function writeHistory(entries: HistoryEntry[]): void {
  memoryHistory = entries;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
      return;
    } catch {
      // The in-memory copy remains the fallback.
    }
  }
}

export function getCommandHistory(
  limit = DEFAULT_HISTORY_ITEMS,
): HistoryEntry[] {
  const history = readHistory();
  const retained = history.slice(0, boundedLimit(limit));
  if (retained.length !== history.length) writeHistory(retained);
  return retained;
}

export function addCommandHistory(
  command: string,
  cwd?: string,
  limit = DEFAULT_HISTORY_ITEMS,
): void {
  const trimmed = command.trim();
  if (!trimmed) return;

  const maxItems = boundedLimit(limit);
  const history = getCommandHistory(maxItems);
  // Filter out immediate identical duplicate
  const filtered = history.filter((h) => h.command !== trimmed);

  const entry: HistoryEntry = {
    id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    command: trimmed,
    timestamp: Date.now(),
    cwd,
  };

  const updated = [entry, ...filtered].slice(0, maxItems);
  writeHistory(updated);
}

export function clearCommandHistory(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
      // The in-memory copy is cleared below.
    }
  }
  memoryHistory = [];
}

/**
 * Finds the most recent command that starts with the given prefix.
 * Used for ghost text auto-completions.
 */
export function getHistorySuggestion(
  prefix: string,
  limit = DEFAULT_HISTORY_ITEMS,
): string | null {
  const trimmed = prefix.trimStart();
  if (!trimmed || trimmed.length < 2) return null;

  const history = getCommandHistory(limit);
  const match = history.find(
    (h) => h.command.startsWith(trimmed) && h.command !== trimmed,
  );
  if (!match) return null;

  // Return the remaining suffix
  return match.command.slice(trimmed.length);
}

/**
 * Filter command history with a search query.
 */
export function searchCommandHistory(
  query: string,
  limit = DEFAULT_HISTORY_ITEMS,
): HistoryEntry[] {
  const history = getCommandHistory(limit);
  const q = query.trim().toLowerCase();
  if (!q) return history;

  return history.filter(
    (h) =>
      h.command.toLowerCase().includes(q) ||
      (h.cwd && h.cwd.toLowerCase().includes(q)),
  );
}
