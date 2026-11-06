/**
 * lib/focus/daily-key.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Local-time `YYYY-MM-DD` key for daily idempotency keys (morning kickoff,
 * AI day plan). `toISOString().slice(0,10)` is UTC, so around local midnight
 * the key would belong to the wrong day and a same-day second claim would
 * incorrectly pay out. This mirrors `db/focus-sessions.dayKey` for the
 * renderer, which cannot import the DB layer.
 */

export function localDayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
