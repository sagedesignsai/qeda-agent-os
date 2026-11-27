/**
 * lib/trace/review/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Timestamped review notes: pure helpers over `TraceProject.reviewNotes`.
 *
 * Notes are the human review layer. They survive resolution (a flag, not a
 * delete) so the copilot can read what was asked, at what time, on which layer.
 * The store and the copilot both mutate the array through the `setReviewNotes`
 * op, so notes are undoable like every other document change.
 */

import type { TraceReviewNote } from '../types';

let fallbackCounter = 0;

export function createReviewNoteId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `note-${uuid.slice(0, 8)}`;
  fallbackCounter += 1;
  return `note-${Date.now().toString(36)}-${fallbackCounter}`;
}

export interface ReviewNoteInput {
  id?: string;
  text: string;
  timeMs?: number;
  sceneId?: string | null;
  elementId?: string | null;
  resolved?: boolean;
  createdAt?: string;
}

export function createReviewNote(input: ReviewNoteInput): TraceReviewNote {
  return {
    id: input.id ?? createReviewNoteId(),
    text: input.text.trim(),
    timeMs: Math.max(0, Math.round(input.timeMs ?? 0)),
    ...(input.sceneId !== undefined ? { sceneId: input.sceneId } : {}),
    ...(input.elementId !== undefined ? { elementId: input.elementId } : {}),
    createdAt: input.createdAt ?? new Date().toISOString(),
    ...(input.resolved !== undefined ? { resolved: input.resolved } : {}),
  };
}

/** Timeline order: by time, then by creation order. */
export function sortReviewNotes(
  notes: readonly TraceReviewNote[],
): TraceReviewNote[] {
  return [...notes].sort(
    (a, b) => a.timeMs - b.timeMs || a.createdAt.localeCompare(b.createdAt),
  );
}

export function addReviewNote(
  notes: readonly TraceReviewNote[] | undefined,
  input: ReviewNoteInput,
): TraceReviewNote[] {
  const text = input.text.trim();
  if (!text) return [...(notes ?? [])];
  return sortReviewNotes([...(notes ?? []), createReviewNote({ ...input, text })]);
}

export function updateReviewNote(
  notes: readonly TraceReviewNote[] | undefined,
  id: string,
  patch: Partial<Pick<TraceReviewNote, 'text' | 'timeMs' | 'resolved'>>,
): TraceReviewNote[] {
  return sortReviewNotes(
    (notes ?? []).map((note) =>
      note.id === id
        ? {
            ...note,
            ...(patch.text !== undefined ? { text: patch.text.trim() } : {}),
            ...(patch.timeMs !== undefined
              ? { timeMs: Math.max(0, Math.round(patch.timeMs)) }
              : {}),
            ...(patch.resolved !== undefined ? { resolved: patch.resolved } : {}),
          }
        : note,
    ),
  );
}

export function removeReviewNote(
  notes: readonly TraceReviewNote[] | undefined,
  id: string,
): TraceReviewNote[] {
  return (notes ?? []).filter((note) => note.id !== id);
}

export function unresolvedReviewNotes(
  notes: readonly TraceReviewNote[] | undefined,
): TraceReviewNote[] {
  return (notes ?? []).filter((note) => !note.resolved);
}

export function reviewNoteSummary(
  notes: readonly TraceReviewNote[] | undefined,
): { total: number; unresolved: number } {
  const total = notes?.length ?? 0;
  return { total, unresolved: unresolvedReviewNotes(notes).length };
}