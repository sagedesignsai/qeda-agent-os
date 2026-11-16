/**
 * db/knowledge-index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Derived-index cleanup for knowledge pages.
 *
 * A page's content is copied into two places outside the `pages` table: the
 * FTS5 index (`pages_fts`) and the semantic RAG store (`chunks` + the sqlite-vec
 * `embeddings` virtual table, keyed by `qeda-page://<pageId>`). Neither has a
 * foreign key back to `pages`, so SQLite cascade deletes do not reach them.
 *
 * Every page/notebook/project deletion must call `forgetPages` with the ids it
 * is about to remove — otherwise deleted content stays searchable, and
 * `searchDocs` can return pages the user believes are gone.
 *
 * Kept in its own module because both `db/workspace.ts` and `db/projects.ts`
 * need it, and importing one store from the other would create a cycle.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getDb } from './client.js';

/** Stay well under SQLite's bound-parameter limit. */
const PARAM_CHUNK = 400;

function inChunks<T>(items: readonly T[], size = PARAM_CHUNK): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * The vec0 table is created by `db/client.ts` after the native extension loads,
 * and is deliberately absent in tests that run without it. Probe instead of
 * assuming, so a page delete still works on a build without vector support.
 */
function hasEmbeddingsTable(db: ReturnType<typeof getDb>): boolean {
  const row = db
    .prepare<[], { ok: number }>(
      `SELECT 1 AS ok FROM sqlite_master
        WHERE type IN ('table', 'view') AND name = 'embeddings'
        LIMIT 1`,
    )
    .get();
  return Boolean(row);
}

/**
 * Remove the FTS and RAG rows that belong to the given pages.
 *
 * Safe to call inside an existing transaction; it issues plain statements and
 * does not open one of its own. Returns the number of RAG chunks removed.
 */
export function forgetPages(pageIds: readonly string[]): number {
  const ids = [...new Set(pageIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return 0;

  const db = getDb();
  const embeddings = hasEmbeddingsTable(db);
  let removedChunks = 0;

  for (const batch of inChunks(ids)) {
    const placeholders = batch.map(() => '?').join(', ');

    // Full-text index. An inner join guards reads, but the rows would otherwise
    // accumulate forever and resurface if an id were ever reused.
    db.prepare(`DELETE FROM pages_fts WHERE page_id IN (${placeholders})`).run(
      ...batch,
    );

    // Semantic index. Chunk paths are the stable page pseudo-URI written by
    // `tools/workspace-rag.ts`.
    const paths = batch.map((id) => `qeda-page://${id}`);
    const pathPlaceholders = paths.map(() => '?').join(', ');

    if (embeddings) {
      try {
        const chunkIds = db
          .prepare<string[], { id: string }>(
            `SELECT id FROM chunks WHERE file_path IN (${pathPlaceholders})`,
          )
          .all(...paths)
          .map((row) => row.id);

        for (const chunkBatch of inChunks(chunkIds)) {
          const chunkPlaceholders = chunkBatch.map(() => '?').join(', ');
          db.prepare(
            `DELETE FROM embeddings WHERE chunk_id IN (${chunkPlaceholders})`,
          ).run(...chunkBatch);
        }
      } catch {
        // A broken vec table must not block deleting the page itself. The chunk
        // rows are still removed below, which is what makes a re-index clean.
      }
    }

    removedChunks += db
      .prepare(
        `DELETE FROM chunks WHERE file_path IN (${pathPlaceholders})`,
      )
      .run(...paths).changes;
  }

  return removedChunks;
}
