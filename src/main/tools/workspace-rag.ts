/**
 * tools/workspace-rag.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Bridges the knowledge workspace and the RAG index: `indexPage` embeds a
 * page's markdown with the same chunk/embed pipeline used for files, so pages
 * become searchable via `searchDocs` alongside uploaded files.
 *
 * The indexPageTool agent tool writes through the same helpers, keeping
 * page-derived embeddings traceable to their page id.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { tool, embedMany, embed } from 'ai';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/client.js';
import { getEmbeddingContext, assertEmbeddingFits } from './rag.js';
import { getPage, loadPageMarkdown, type Page } from '../db/workspace.js';

/** Stable pseudo-path so page chunks can be cleaned up by path prefix. */
export function pageIndexPath(pageId: string): string {
  return `vellum-page://${pageId}`;
}

/** Remove all RAG chunks previously indexed for a page. */
export function removePageFromRagIndex(pageId: string): number {
  const db = getDb();
  const indexPath = pageIndexPath(pageId);
  const ids = db
    .prepare<[string], { id: string }>(
      'SELECT id FROM chunks WHERE file_path = ?',
    )
    .all(indexPath)
    .map((r) => r.id);
  if (ids.length === 0) return 0;

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM chunks WHERE file_path = ?').run(indexPath);
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(
      `DELETE FROM embeddings WHERE chunk_id IN (${placeholders})`,
    ).run(...ids);
  });
  tx();
  return ids.length;
}

/** Chunk + embed a page's markdown into the RAG index. */
export async function indexPageIntoRag(
  page: Page,
): Promise<{ chunksIndexed: number }> {
  const db = getDb();
  const markdown = loadPageMarkdown(page.id);

  // Re-indexing a page replaces its previous vectors.
  removePageFromRagIndex(page.id);

  // Same paragraph chunker as rag.ts.
  const paragraphs = markdown.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';
  for (const para of paragraphs) {
    if (current.length + para.length > 1500 && current.length > 0) {
      chunks.push(current.trim());
      current = '';
    }
    current += `\n\n${para}`;
  }
  if (current.trim()) chunks.push(current.trim());
  if (chunks.length === 0) return { chunksIndexed: 0 };

  const ctx = getEmbeddingContext();
  const { embeddings } = await embedMany({
    model: ctx.model,
    values: chunks,
    ...(ctx.providerOptions ? { providerOptions: ctx.providerOptions } : {}),
  });
  // Width is checked before the insert, for the same reason as indexFile: the
  // vec table is fixed-width and a wrong-width write is not recoverable.
  if (embeddings.length > 0) assertEmbeddingFits(ctx, embeddings[0].length);

  const indexPath = pageIndexPath(page.id);
  const insertChunk = db.prepare(
    'INSERT INTO chunks (id, file_path, chunk_index, content) VALUES (?, ?, ?, ?)',
  );
  const insertVec = db.prepare(
    'INSERT INTO embeddings (chunk_id, embedding) VALUES (?, ?)',
  );

  const insertAll = db.transaction(() => {
    chunks.forEach((content, i) => {
      const id = randomUUID();
      insertChunk.run(id, indexPath, i, `${page.title}\n\n${content}`);
      const vecBuffer = Buffer.from(new Float32Array(embeddings[i]).buffer);
      insertVec.run(id, vecBuffer);
    });
  });
  insertAll();

  return { chunksIndexed: chunks.length };
}

/** Semantic search restricted to workspace pages (post-filter by path prefix). */
export async function searchWorkspaceRag(query: string, topK = 5) {
  const db = getDb();
  const ctx = getEmbeddingContext();
  const { embedding } = await embed({
    model: ctx.model,
    value: query,
    ...(ctx.providerOptions ? { providerOptions: ctx.providerOptions } : {}),
  });
  assertEmbeddingFits(ctx, embedding.length);
  const vecBuffer = Buffer.from(new Float32Array(embedding).buffer);

  // Over-fetch so the page filter doesn't starve results.
  const results = db
    .prepare<[Buffer, number], { chunk_id: string; distance: number }>(
      `SELECT chunk_id, distance
       FROM embeddings
       WHERE embedding MATCH ?
       ORDER BY distance ASC
       LIMIT ?`,
    )
    .all(vecBuffer, topK * 4);

  const filtered = results.filter((r) => {
    const row = db
      .prepare<[string], { file_path: string }>(
        'SELECT file_path FROM chunks WHERE id = ?',
      )
      .get(r.chunk_id);
    return row?.file_path.startsWith('vellum-page://') ?? false;
  });

  const limited = filtered.slice(0, topK);
  const placeholders = limited.map(() => '?').join(',');
  const chunks =
    limited.length === 0
      ? []
      : db
          .prepare<
            string[],
            { id: string; file_path: string; content: string }
          >(
            `SELECT id, file_path, content FROM chunks WHERE id IN (${placeholders})`,
          )
          .all(...limited.map((r) => r.chunk_id));

  const chunkMap = new Map(chunks.map((c) => [c.id, c]));
  return limited.map((r) => {
    const chunk = chunkMap.get(r.chunk_id);
    return {
      pageId: chunk?.file_path.replace(/^vellum-page:\/\//, '') ?? '',
      content: chunk?.content ?? '',
      score: Math.round((1 - r.distance) * 1000) / 1000,
    };
  });
}

// ─── Agent tool ───────────────────────────────────────────────────────────────

export const indexPageTool = tool({
  description:
    'Index a workspace page into the semantic (vector) index so it can be found by searchDocs. Run it after significant page edits.',
  inputSchema: z.object({
    pageId: z.string().describe('The page to index.'),
  }),
  execute: async ({ pageId }) => {
    try {
      const page = getPage(pageId);
      if (!page) return { success: false, error: `No page with id ${pageId}` };
      const { chunksIndexed } = await indexPageIntoRag(page);
      return { success: true, pageId, chunksIndexed };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});
