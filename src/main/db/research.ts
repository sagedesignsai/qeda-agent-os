/**
 * db/research.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD for deep-research runs and their audit trail: sources, evidence and
 * citations. A "run" records one structured investigation — the question, the
 * sources discovered, the evidence extracted from each source and the final
 * synthesized report.
 *
 * The agent writes into this store via its research tools; the UI reads it to
 * render the transparent research trace on a page.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { randomUUID } from 'node:crypto';
import { getDb } from './client.js';

// ─── Row types ────────────────────────────────────────────────────────────────

export type ResearchRunStatus = 'running' | 'completed' | 'failed' | 'cancelled';
export type ResearchSourceKind = 'web' | 'page' | 'file';

export interface ResearchRun {
  id: string;
  session_id: string | null;
  page_id: string | null;
  notebook_id: string | null;
  question: string;
  status: ResearchRunStatus;
  report: string;
  created_at: number;
  updated_at: number;
}

export interface ResearchSource {
  id: string;
  run_id: string;
  url: string | null;
  page_id: string | null;
  title: string;
  kind: ResearchSourceKind;
  snippet: string;
  created_at: number;
}

export interface ResearchEvidence {
  id: string;
  source_id: string;
  run_id: string;
  quote: string;
  note: string;
  created_at: number;
}

/** A source with its collected evidence, for the UI trace view. */
export interface ResearchSourceWithEvidence extends ResearchSource {
  evidence: ResearchEvidence[];
}

// ─── Runs ─────────────────────────────────────────────────────────────────────

export interface CreateResearchRunInput {
  question: string;
  sessionId?: string | null;
  pageId?: string | null;
  notebookId?: string | null;
}

export function createResearchRun(input: CreateResearchRunInput): ResearchRun {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO research_runs (id, session_id, page_id, notebook_id, question)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, input.sessionId ?? null, input.pageId ?? null, input.notebookId ?? null, input.question);
  return db
    .prepare<[string], ResearchRun>('SELECT * FROM research_runs WHERE id = ?')
    .get(id)!;
}

export function getResearchRun(id: string): ResearchRun | undefined {
  return getDb()
    .prepare<[string], ResearchRun>('SELECT * FROM research_runs WHERE id = ?')
    .get(id);
}

export function updateResearchRun(
  id: string,
  patch: { status?: ResearchRunStatus; report?: string },
): void {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (patch.status !== undefined) fields.push('status = ?'), values.push(patch.status);
  if (patch.report !== undefined) fields.push('report = ?'), values.push(patch.report);
  if (fields.length === 0) return;
  values.push(id);
  getDb()
    .prepare(
      `UPDATE research_runs SET ${fields.join(', ')}, updated_at = unixepoch() WHERE id = ?`,
    )
    .run(...values);
}

export function listResearchRuns(filter: { pageId?: string; notebookId?: string; limit?: number } = {}): ResearchRun[] {
  const db = getDb();
  const limit = filter.limit ?? 25;
  if (filter.pageId) {
    return db
      .prepare<[string, number], ResearchRun>(
        'SELECT * FROM research_runs WHERE page_id = ? ORDER BY created_at DESC LIMIT ?',
      )
      .all(filter.pageId, limit);
  }
  if (filter.notebookId) {
    return db
      .prepare<[string, number], ResearchRun>(
        'SELECT * FROM research_runs WHERE notebook_id = ? ORDER BY created_at DESC LIMIT ?',
      )
      .all(filter.notebookId, limit);
  }
  return db
    .prepare<[number], ResearchRun>(
      'SELECT * FROM research_runs ORDER BY created_at DESC LIMIT ?',
    )
    .all(limit);
}

// ─── Sources ──────────────────────────────────────────────────────────────────

export interface AddSourceInput {
  runId: string;
  url?: string | null;
  pageId?: string | null;
  title?: string;
  kind?: ResearchSourceKind;
  snippet?: string;
}

export function addResearchSource(input: AddSourceInput): ResearchSource {
  const db = getDb();

  // Dedup: the same URL discovered twice in one run is one source.
  if (input.url) {
    const existing = db
      .prepare<[string, string], ResearchSource>(
        'SELECT * FROM research_sources WHERE run_id = ? AND url = ?',
      )
      .get(input.runId, input.url);
    if (existing) return existing;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO research_sources (id, run_id, url, page_id, title, kind, snippet)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.runId,
    input.url ?? null,
    input.pageId ?? null,
    input.title ?? '',
    input.kind ?? 'web',
    input.snippet ?? '',
  );
  return db
    .prepare<[string], ResearchSource>('SELECT * FROM research_sources WHERE id = ?')
    .get(id)!;
}

// ─── Evidence ─────────────────────────────────────────────────────────────────

export interface AddEvidenceInput {
  runId: string;
  sourceId: string;
  quote: string;
  note?: string;
}

export function addResearchEvidence(input: AddEvidenceInput): ResearchEvidence {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    'INSERT INTO research_evidence (id, source_id, run_id, quote, note) VALUES (?, ?, ?, ?, ?)',
  ).run(id, input.sourceId, input.runId, input.quote, input.note ?? '');
  return db
    .prepare<[string], ResearchEvidence>('SELECT * FROM research_evidence WHERE id = ?')
    .get(id)!;
}

// ─── Composite reads (the research trace) ─────────────────────────────────────

/** Full audit trail for one run: sources with their evidence, in discovery order. */
export function getResearchTrace(runId: string): {
  run: ResearchRun;
  sources: ResearchSourceWithEvidence[];
} | undefined {
  const db = getDb();
  const run = getResearchRun(runId);
  if (!run) return undefined;

  const sources = db
    .prepare<[string], ResearchSource>(
      // `created_at` is unixepoch() (1s resolution), so same-second rows tie and
      // `id` is a random UUID — ordering by it would be non-deterministic.
      // The implicit rowid is monotonic, giving true insertion ("discovery") order.
      'SELECT * FROM research_sources WHERE run_id = ? ORDER BY created_at, rowid',
    )
    .all(runId);

  const evidence = db
    .prepare<[string], ResearchEvidence>(
      'SELECT * FROM research_evidence WHERE run_id = ? ORDER BY created_at, rowid',
    )
    .all(runId);

  const bySource = new Map<string, ResearchEvidence[]>();
  for (const item of evidence) {
    const list = bySource.get(item.source_id) ?? [];
    list.push(item);
    bySource.set(item.source_id, list);
  }

  return {
    run,
    sources: sources.map((source) => ({
      ...source,
      evidence: bySource.get(source.id) ?? [],
    })),
  };
}

/**
 * Formatted citation list for a run — what the agent embeds in its reports and
 * the UI shows as "Sources".
 */
export function getRunCitations(runId: string): { n: number; title: string; url: string | null }[] {
  const sources = getDb()
    .prepare<[string], ResearchSource>(
      'SELECT * FROM research_sources WHERE run_id = ? ORDER BY created_at, rowid',
    )
    .all(runId);

  return sources.map((source, index) => ({
    n: index + 1,
    title: source.title || source.url || 'Untitled source',
    url: source.url,
  }));
}
