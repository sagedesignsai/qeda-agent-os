/**
 * tools/rag.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * RAG (Retrieval-Augmented Generation) tools backed by SQLite + sqlite-vec.
 *
 * Tools:
 *   indexFile   – chunk a text file and store its embeddings
 *   searchDocs  – vector-search indexed documents by query
 *   listIndexed – list all indexed file paths
 *   removeFromIndex – remove a file's chunks from the index
 *
 * Embeddings are configured separately from the chat model — most free chat
 * providers (Groq, OpenRouter's free tier) serve no embeddings endpoint, so
 * inheriting the active chat provider would fail confusingly. See
 * ai/embedding-config.ts for the resolution order and the width contract; this
 * module only does the SDK calls and the sqlite-vec work.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { tool, embed, embedMany } from 'ai';
import type { EmbeddingModel } from 'ai';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { getDb, getEmbeddingDim } from '../db/client.js';
import { getSettings } from '../ai/settings.js';
import { resolveEmbeddingModel, resolveApiKey } from '../ai/provider.js';
import { getProvider } from '../ai/registry.js';
import {
  assertEmbeddingWidth,
  embeddingProviderOptions,
  resolveEmbeddingConfig,
  type ResolvedEmbeddingConfig,
} from '../ai/embedding-config.js';

// ─── Embedding helper ─────────────────────────────────────────────────────────

/** Simple character-based chunker. Splits on paragraph breaks up to `maxChars`. */
function chunkText(text: string, maxChars = 1500): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (current.length + para.length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = '';
    }
    current += `\n\n${para}`;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/** True when this provider has a key in Settings or the environment. */
function hasProviderKey(providerId: string): boolean {
  const provider = getProvider(providerId);
  if (!provider) return false;
  if (!provider.apiKeyEnvs?.length) return true; // keyless, e.g. a local Ollama
  if (resolveApiKey(providerId)) return true;
  return false;
}

export interface EmbeddingContext {
  model: EmbeddingModel;
  config: ResolvedEmbeddingConfig;
  /** Width the local index was created with; vectors must match it. */
  tableDim: number;
  /** Present only for models that honour an explicit width. */
  providerOptions?: Record<string, Record<string, number>>;
}

/**
 * Everything an embedding call needs, resolved once per tool invocation.
 *
 * `resolveEmbeddingModel` is used rather than the chat resolver: `embed()`
 * calls `doEmbed` on what it is handed, and a LanguageModel has no such method,
 * so passing one back from the chat path fails at runtime regardless of how
 * correct the configuration is.
 */
export function getEmbeddingContext(): EmbeddingContext {
  const settings = getSettings();

  const config = resolveEmbeddingConfig({
    settingsProvider: settings.embeddingProvider,
    settingsModel: settings.embeddingModel,
    envProvider: process.env.EMBEDDING_PROVIDER,
    envModel: process.env.EMBEDDING_MODEL,
    hasKey: hasProviderKey,
  });

  const tableDim = getEmbeddingDim();
  const providerOptions = embeddingProviderOptions(config, tableDim);

  return {
    model: resolveEmbeddingModel(config.provider, config.model),
    config,
    tableDim,
    ...(providerOptions ? { providerOptions } : {}),
  };
}

/**
 * Fail before writing rather than after.
 *
 * The `vec0` table is created at a fixed width and cannot be resized, so a
 * wrong-width vector is not a recoverable insert — it is a corrupt index. Check
 * the first vector of every operation and report the real numbers.
 */
export function assertEmbeddingFits(
  ctx: EmbeddingContext,
  actual: number,
): void {
  assertEmbeddingWidth({
    provider: ctx.config.provider,
    model: ctx.config.model,
    actual,
    tableDim: ctx.tableDim,
  });
}

/** Shape the error an agent sees, so configuration problems read as such. */
function ragError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'EmbeddingWidthError') return err.message;
    if (err.name === 'EmbeddingNotConfiguredError') return err.message;
  }
  return String(err);
}

// ─── Tools ────────────────────────────────────────────────────────────────────

export const indexFileTool = tool({
  description:
    'Read a text file, split it into chunks, embed them, and store in the local vector index for future retrieval.',
  inputSchema: z.object({
    filePath: z.string().describe('Path to the text file to index.'),
    chunkSize: z
      .number()
      .int()
      .min(200)
      .max(4000)
      .default(1500)
      .describe('Maximum characters per chunk.'),
  }),
  execute: async ({ filePath, chunkSize }) => {
    const resolved = path.resolve(filePath);
    const db = getDb();

    try {
      const text = await fs.readFile(resolved, 'utf8');
      const chunks = chunkText(text, chunkSize);

      // Remove stale chunks for this file first.
      const oldIds = db
        .prepare<[string], { id: string }>(
          'SELECT id FROM chunks WHERE file_path = ?',
        )
        .all(resolved)
        .map((r) => r.id);

      if (oldIds.length > 0) {
        db.prepare(`DELETE FROM chunks WHERE file_path = ?`).run(resolved);
        // Also remove from vec table
        const placeholders = oldIds.map(() => '?').join(',');
        db.prepare(
          `DELETE FROM embeddings WHERE chunk_id IN (${placeholders})`,
        ).run(...oldIds);
      }

      // Embed all chunks in one batch call.
      const ctx = getEmbeddingContext();
      const { embeddings } = await embedMany({
        model: ctx.model,
        values: chunks,
        ...(ctx.providerOptions
          ? { providerOptions: ctx.providerOptions }
          : {}),
      });

      // Check the width BEFORE inserting anything: the vec table cannot be
      // resized, so a mismatch discovered here is recoverable and one
      // discovered by sqlite-vec later is not.
      if (embeddings.length > 0) {
        assertEmbeddingFits(ctx, embeddings[0].length);
      }

      // Insert chunks + vectors.
      const insertChunk = db.prepare(
        'INSERT INTO chunks (id, file_path, chunk_index, content) VALUES (?, ?, ?, ?)',
      );
      const insertVec = db.prepare(
        'INSERT INTO embeddings (chunk_id, embedding) VALUES (?, ?)',
      );

      const insertAll = db.transaction(() => {
        chunks.forEach((content, i) => {
          const id = randomUUID();
          insertChunk.run(id, resolved, i, content);
          // sqlite-vec expects a Float32Array serialized as a Buffer.
          const vecBuffer = Buffer.from(new Float32Array(embeddings[i]).buffer);
          insertVec.run(id, vecBuffer);
        });
      });

      insertAll();

      return {
        success: true,
        path: resolved,
        chunksIndexed: chunks.length,
        model: `${ctx.config.provider}/${ctx.config.model}`,
        dimensions: ctx.tableDim,
      };
    } catch (err) {
      return { success: false, error: ragError(err) };
    }
  },
});

export const searchDocsTool = tool({
  description:
    'Search the local document index for content semantically similar to the query.',
  inputSchema: z.object({
    query: z.string().describe('Natural language search query.'),
    topK: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(5)
      .describe('Maximum number of results to return.'),
  }),
  execute: async ({ query, topK }) => {
    const db = getDb();
    try {
      const ctx = getEmbeddingContext();
      const { embedding } = await embed({
        model: ctx.model,
        value: query,
        ...(ctx.providerOptions
          ? { providerOptions: ctx.providerOptions }
          : {}),
      });

      // A query vector of the wrong width cannot be compared against anything,
      // and sqlite-vec reports that as an opaque failure deep in the KNN.
      assertEmbeddingFits(ctx, embedding.length);

      const vecBuffer = Buffer.from(new Float32Array(embedding).buffer);

      // KNN search via sqlite-vec.
      const results = db
        .prepare<[Buffer, number], { chunk_id: string; distance: number }>(
          `SELECT chunk_id, distance
           FROM embeddings
           WHERE embedding MATCH ?
           ORDER BY distance ASC
           LIMIT ?`,
        )
        .all(vecBuffer, topK);

      if (results.length === 0) {
        return { success: true, results: [] };
      }

      // Fetch chunk text for each result.
      const placeholders = results.map(() => '?').join(',');
      const chunks = db
        .prepare<
          string[],
          {
            id: string;
            file_path: string;
            content: string;
            chunk_index: number;
          }
        >(
          `SELECT id, file_path, content, chunk_index
           FROM chunks WHERE id IN (${placeholders})`,
        )
        .all(...results.map((r) => r.chunk_id));

      const chunkMap = new Map(chunks.map((c) => [c.id, c]));

      const formatted = results.map((r) => {
        const chunk = chunkMap.get(r.chunk_id);
        return {
          chunkId: r.chunk_id,
          filePath: chunk?.file_path ?? 'unknown',
          chunkIndex: chunk?.chunk_index ?? 0,
          content: chunk?.content ?? '',
          score: Math.round((1 - r.distance) * 1000) / 1000,
        };
      });

      return { success: true, results: formatted };
    } catch (err) {
      return { success: false, error: ragError(err) };
    }
  },
});

export const listIndexedTool = tool({
  description: 'List all file paths currently in the document index.',
  inputSchema: z.object({}),
  execute: async () => {
    const db = getDb();
    try {
      const files = db
        .prepare<[], { file_path: string; count: number }>(
          'SELECT file_path, COUNT(*) as count FROM chunks GROUP BY file_path',
        )
        .all();
      return { success: true, indexedFiles: files };
    } catch (err) {
      return { success: false, error: ragError(err) };
    }
  },
});

export const removeFromIndexTool = tool({
  description: "Remove a file's chunks from the local document index.",
  inputSchema: z.object({
    filePath: z.string().describe('Path of the file to remove from the index.'),
  }),
  execute: async ({ filePath }) => {
    const resolved = path.resolve(filePath);
    const db = getDb();
    try {
      const ids = db
        .prepare<[string], { id: string }>(
          'SELECT id FROM chunks WHERE file_path = ?',
        )
        .all(resolved)
        .map((r) => r.id);

      if (ids.length === 0) {
        return { success: false, error: 'File not found in index.' };
      }

      db.prepare('DELETE FROM chunks WHERE file_path = ?').run(resolved);
      const ph = ids.map(() => '?').join(',');
      db.prepare(`DELETE FROM embeddings WHERE chunk_id IN (${ph})`).run(
        ...ids,
      );

      return { success: true, path: resolved, chunksRemoved: ids.length };
    } catch (err) {
      return { success: false, error: ragError(err) };
    }
  },
});

export const ragTools = {
  indexFile: indexFileTool,
  searchDocs: searchDocsTool,
  listIndexed: listIndexedTool,
  removeFromIndex: removeFromIndexTool,
};
