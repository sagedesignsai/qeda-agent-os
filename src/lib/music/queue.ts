/**
 * lib/music/queue.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure queue arithmetic — the part of playback that is worth testing without a
 * DOM. The engine owns audio; this module only answers "which index is next".
 *
 * Auto-advance and manual skip deliberately differ on `repeat: 'one'`: finishing
 * a track must replay it, but pressing Next must move on. Collapsing those two
 * into one function is how a player ends up unable to leave a repeated track.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { MusicQueue, RepeatMode } from './types';

export type NextMode = 'auto' | 'manual';

export function clampIndex(index: number, length: number): number {
  if (length <= 0) return -1;
  return Math.min(length - 1, Math.max(0, index));
}

function randomOtherIndex(length: number, current: number, random: () => number): number {
  if (length <= 1) return current;
  // Draw from `length - 1` slots so the result can never equal `current`.
  const slot = Math.floor(random() * (length - 1));
  return slot >= current ? slot + 1 : slot;
}

/**
 * The next index to play, or null when playback should stop.
 *
 * `random` is injectable so tests do not depend on `Math.random`.
 */
export function nextIndex(
  queue: Pick<MusicQueue, 'index' | 'repeat' | 'shuffle'>,
  length: number,
  mode: NextMode = 'manual',
  random: () => number = Math.random,
): number | null {
  if (length <= 0) return null;
  const current = clampIndex(queue.index, length);
  if (queue.repeat === 'one' && mode === 'auto') return current;
  if (queue.shuffle) {
    if (length === 1) {
      return queue.repeat === 'off' && mode === 'auto' ? null : current;
    }
    return randomOtherIndex(length, current, random);
  }
  if (current + 1 < length) return current + 1;
  return queue.repeat === 'off' ? null : 0;
}

/** Previously played index. Restarting the current track is handled by the store. */
export function previousIndex(
  queue: Pick<MusicQueue, 'index' | 'repeat' | 'shuffle'>,
  length: number,
  random: () => number = Math.random,
): number | null {
  if (length <= 0) return null;
  const current = clampIndex(queue.index, length);
  if (queue.shuffle) {
    if (length === 1) return current;
    return randomOtherIndex(length, current, random);
  }
  if (current - 1 >= 0) return current - 1;
  return queue.repeat === 'off' ? null : length - 1;
}

/** Fisher–Yates, returning a new array. */
export function shuffleIds(ids: readonly string[], random: () => number = Math.random): string[] {
  const out = ids.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Move an item within a list, clamping the destination. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to) return items.slice();
  const out = items.slice();
  if (from < 0 || from >= out.length) return out;
  const [item] = out.splice(from, 1);
  out.splice(Math.min(out.length, Math.max(0, to)), 0, item);
  return out;
}

/**
 * Drop ids that no longer exist (a deleted playlist, a removed missing track)
 * while keeping the currently-playing track if it still exists.
 */
export function reconcileQueue(
  ids: readonly string[],
  knownIds: ReadonlySet<string>,
  currentId: string | null,
): { ids: string[]; index: number } {
  const kept = ids.filter((id) => knownIds.has(id));
  const index = currentId ? kept.indexOf(currentId) : -1;
  return {
    ids: kept,
    index: index >= 0 ? index : kept.length > 0 ? 0 : -1,
  };
}

export function isRepeatMode(value: unknown): value is RepeatMode {
  return value === 'off' || value === 'all' || value === 'one';
}
