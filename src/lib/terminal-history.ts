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

export interface HistoryEntry {
  id: string;
  command: string;
  timestamp: number;
  cwd?: string;
}

const HISTORY_STORAGE_KEY = 'docugent_terminal_history_v1';
const MAX_HISTORY_ITEMS = 500;

export function getCommandHistory(): HistoryEntry[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

export function addCommandHistory(command: string, cwd?: string): void {
  const trimmed = command.trim();
  if (!trimmed) return;

  const history = getCommandHistory();
  // Filter out immediate identical duplicate
  const filtered = history.filter((h) => h.command !== trimmed);

  const entry: HistoryEntry = {
    id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    command: trimmed,
    timestamp: Date.now(),
    cwd,
  };

  const updated = [entry, ...filtered].slice(0, MAX_HISTORY_ITEMS);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Storage full or disabled
    }
  }
}

export function clearCommandHistory(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  }
}

/**
 * Finds the most recent command that starts with the given prefix.
 * Used for ghost text auto-completions.
 */
export function getHistorySuggestion(prefix: string): string | null {
  const trimmed = prefix.trimStart();
  if (!trimmed || trimmed.length < 2) return null;

  const history = getCommandHistory();
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
export function searchCommandHistory(query: string): HistoryEntry[] {
  const history = getCommandHistory();
  const q = query.trim().toLowerCase();
  if (!q) return history;

  return history.filter(
    (h) =>
      h.command.toLowerCase().includes(q) ||
      (h.cwd && h.cwd.toLowerCase().includes(q)),
  );
}
