/**
 * stores/trace/slices/history.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Undo/redo primitives. History is a stack of whole Trace documents: they are
 * small, immutable and structurally shared, so snapshots stay cheap and never
 * drift from the op contract.
 */

import type { TraceProject } from '@/lib/trace/types';

export const TRACE_HISTORY_LIMIT = 50;

let internalHistoryOp = false;

export function isHistoryOpActive(): boolean {
  return internalHistoryOp;
}

export function setHistoryOpActive(active: boolean): void {
  internalHistoryOp = active;
}

export function cloneProject(project: TraceProject): TraceProject {
  if (!project) return project;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(project);
    } catch {
      return JSON.parse(JSON.stringify(project)) as TraceProject;
    }
  }
  return JSON.parse(JSON.stringify(project)) as TraceProject;
}

export function pushHistory(
  past: TraceProject[],
  project: TraceProject,
): TraceProject[] {
  const next = [...past, cloneProject(project)];
  return next.length > TRACE_HISTORY_LIMIT
    ? next.slice(next.length - TRACE_HISTORY_LIMIT)
    : next;
}
