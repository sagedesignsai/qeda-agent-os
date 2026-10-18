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
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { getDb, getEmbeddingDim } from '../db/client.js';
import { isIndexableCodePath } from '../../lib/code-indexing.js';
import { getSettings } from '../ai/settings.js';
import { resolveEmbeddingModel, resolveApiKey } from '../ai/provider.js';
import { getProvider } from '../ai/registry.js';
import {
  assertEmbeddingWidth,
  embeddingProviderOptions,
  resolveEmbeddingConfig,
  type ResolvedEmbeddingConfig,
} from '../ai/embedding-config.js';

const execFileAsync = promisify(execFile);

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

const MAX_CODE_FILE_BYTES = 256 * 1024;
const MAX_CODE_FILES = 3000;
const MAX_CODE_CHUNKS = 12_000;

/**
 * Explicitly index a Git codebase into the existing project-scoped semantic
 * index. Git supplies the ignore-aware file list; symlinks, secrets, generated
 * folders, binary/large files, and unsupported formats are excluded. Existing
 * vectors are replaced only after every new embedding succeeds.
 */
export async function indexCodeProjectFiles(input: {
  codeProjectId: string;
  projectId: string;
  directory: string;
}): Promise<{
  indexedFiles: number;
  indexedChunks: number;
  skippedFiles: number;
}> {
  const root = await fs.realpath(input.directory);
  const { stdout } = await execFileAsync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      cwd: root,
      timeout: 15_000,
      maxBuffer: 16 * 1024 * 1024,
      encoding: 'utf8',
      env: { ...process.env, GIT_PAGER: 'cat', GIT_TERMINAL_PROMPT: '0' },
    },
  );
  const filePaths = stdout.split('\0').filter(isIndexableCodePath);
  if (filePaths.length > MAX_CODE_FILES) {
    throw new Error(
      `This repository has ${filePaths.length} indexable files; the current limit is ${MAX_CODE_FILES}.`,
    );
  }

  const documents: Array<{
    filePath: string;
    chunkIndex: number;
    content: string;
  }> = [];
  let indexedFiles = 0;
  let skippedFiles = 0;
  for (const relativePath of filePaths) {
    const absolutePath = path.resolve(root, relativePath);
    const resolvedRelativePath = path.relative(root, absolutePath);
    if (
      resolvedRelativePath === '..' ||
      resolvedRelativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(resolvedRelativePath)
    ) {
      skippedFiles += 1;
      continue;
    }
    try {
      const stat = await fs.lstat(absolutePath);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size > MAX_CODE_FILE_BYTES
      ) {
        skippedFiles += 1;
        continue;
      }
      const text = await fs.readFile(absolutePath, 'utf8');
      if (text.includes('\0')) {
        skippedFiles += 1;
        continue;
      }
      const chunks = chunkText(text);
      if (!chunks.length) {
        skippedFiles += 1;
        continue;
      }
      chunks.forEach((content, chunkIndex) => {
        documents.push({ filePath: absolutePath, chunkIndex, content });
      });
      indexedFiles += 1;
      if (documents.length > MAX_CODE_CHUNKS) {
        throw new Error(
          `The source index exceeds ${MAX_CODE_CHUNKS} chunks. Narrow the repository or exclude generated files, then retry.`,
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith('The source index')
      ) {
        throw error;
      }
      skippedFiles += 1;
    }
  }

  const ctx = getEmbeddingContext();
  const embedded: number[][] = [];
  for (let start = 0; start < documents.length; start += 64) {
    const batch = documents.slice(start, start + 64);
    const result = await embedMany({
      model: ctx.model,
      values: batch.map(({ content }) => content),
      ...(ctx.providerOptions ? { providerOptions: ctx.providerOptions } : {}),
    });
    if (result.embeddings.length && start === 0) {
      assertEmbeddingFits(ctx, result.embeddings[0].length);
    }
    embedded.push(...result.embeddings);
  }

  const db = getDb();
  const oldIds = db
    .prepare<[string], { id: string }>(
      'SELECT id FROM chunks WHERE code_project_id = ?',
    )
    .all(input.codeProjectId)
    .map(({ id }) => id);
  const insertChunk = db.prepare(
    `INSERT INTO chunks (id, file_path, chunk_index, content, project_id, code_project_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertVector = db.prepare(
    'INSERT INTO embeddings (chunk_id, embedding) VALUES (?, ?)',
  );

  db.transaction(() => {
    if (oldIds.length) {
      const placeholders = oldIds.map(() => '?').join(',');
      db.prepare(
        `DELETE FROM embeddings WHERE chunk_id IN (${placeholders})`,
      ).run(...oldIds);
      db.prepare(`DELETE FROM chunks WHERE id IN (${placeholders})`).run(
        ...oldIds,
      );
    }
    documents.forEach((document, index) => {
      const id = randomUUID();
      insertChunk.run(
        id,
        document.filePath,
        document.chunkIndex,
        document.content,
        input.projectId,
        input.codeProjectId,
      );
      insertVector.run(
        id,
        Buffer.from(new Float32Array(embedded[index]).buffer),
      );
    });
  })();

  return { indexedFiles, indexedChunks: documents.length, skippedFiles };
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
    projectId: z
      .string()
      .optional()
      .describe(
        'Optional project ID to associate with the indexed file chunks.',
      ),
  }),
  execute: async ({ filePath, chunkSize, projectId }) => {
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
        'INSERT INTO chunks (id, file_path, chunk_index, content, project_id) VALUES (?, ?, ?, ?, ?)',
      );
      const insertVec = db.prepare(
        'INSERT INTO embeddings (chunk_id, embedding) VALUES (?, ?)',
      );

      const insertAll = db.transaction(() => {
        chunks.forEach((content, i) => {
          const id = randomUUID();
          insertChunk.run(id, resolved, i, content, projectId ?? null);
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
        projectId: projectId ?? null,
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
    projectId: z
      .string()
      .optional()
      .describe(
        'If provided, filters results to chunks belonging to this project (or unscoped/global if null).',
      ),
    codeProjectId: z
      .string()
      .optional()
      .describe('Optionally restrict results to one indexed codebase.'),
  }),
  execute: async ({ query, topK, projectId, codeProjectId }) => {
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

      // KNN search via sqlite-vec. If projectId is provided, fetch extra candidates then filter.
      const fetchCount = projectId || codeProjectId ? topK * 12 : topK;
      const results = db
        .prepare<[Buffer, number], { chunk_id: string; distance: number }>(
          `SELECT chunk_id, distance
           FROM embeddings
           WHERE embedding MATCH ?
           ORDER BY distance ASC
           LIMIT ?`,
        )
        .all(vecBuffer, fetchCount);

      if (results.length === 0) {
        return { success: true, results: [] };
      }

      // Fetch chunk text and metadata for candidate results.
      const placeholders = results.map(() => '?').join(',');
      const chunks = db
        .prepare<
          string[],
          {
            id: string;
            file_path: string;
            content: string;
            chunk_index: number;
            project_id: string | null;
            code_project_id: string | null;
          }
        >(
          `SELECT id, file_path, content, chunk_index, project_id, code_project_id
           FROM chunks WHERE id IN (${placeholders})`,
        )
        .all(...results.map((r) => r.chunk_id));

      const chunkMap = new Map(chunks.map((c) => [c.id, c]));

      let filteredResults = results;
      if (projectId || codeProjectId) {
        filteredResults = results
          .filter((r) => {
            const chunk = chunkMap.get(r.chunk_id);
            if (codeProjectId) {
              return (
                chunk?.code_project_id === codeProjectId &&
                (!projectId || chunk.project_id === projectId)
              );
            }
            return (
              chunk?.project_id === projectId || chunk?.project_id === null
            );
          })
          .slice(0, topK);
      }

      const formatted = filteredResults.map((r) => {
        const chunk = chunkMap.get(r.chunk_id);
        return {
          chunkId: r.chunk_id,
          filePath: chunk?.file_path ?? 'unknown',
          chunkIndex: chunk?.chunk_index ?? 0,
          content: chunk?.content ?? '',
          projectId: chunk?.project_id ?? null,
          codeProjectId: chunk?.code_project_id ?? null,
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

// ─── Project Vector Memory Tools ─────────────────────────────────────────────

export function memoryPath(projectId: string, memoryId: string): string {
  return `project-memory://${projectId}/${memoryId}`;
}

export const storeProjectMemoryTool = tool({
  description:
    'Store a fact, decision, preference, instruction, or key context into the project vector memory for cross-agent long-term recall.',
  inputSchema: z.object({
    projectId: z
      .string()
      .describe('The project ID to associate this vector memory with.'),
    content: z
      .string()
      .describe('The memory content/fact/decision to remember.'),
    category: z
      .string()
      .optional()
      .describe(
        'Optional category label (e.g. decision, goal, architecture, preference, context).',
      ),
  }),
  execute: async ({ projectId, content, category }) => {
    const db = getDb();
    try {
      const memoryId = randomUUID();
      const filePath = memoryPath(projectId, memoryId);
      const formattedContent = category
        ? `[${category.toUpperCase()}] ${content}`
        : content;

      const ctx = getEmbeddingContext();
      const { embedding } = await embed({
        model: ctx.model,
        value: formattedContent,
        ...(ctx.providerOptions
          ? { providerOptions: ctx.providerOptions }
          : {}),
      });

      assertEmbeddingFits(ctx, embedding.length);

      const chunkId = randomUUID();
      const insertChunk = db.prepare(
        'INSERT INTO chunks (id, file_path, chunk_index, content, project_id) VALUES (?, ?, ?, ?, ?)',
      );
      const insertVec = db.prepare(
        'INSERT INTO embeddings (chunk_id, embedding) VALUES (?, ?)',
      );

      const vecBuffer = Buffer.from(new Float32Array(embedding).buffer);

      const tx = db.transaction(() => {
        insertChunk.run(chunkId, filePath, 0, formattedContent, projectId);
        insertVec.run(chunkId, vecBuffer);
      });
      tx();

      return {
        success: true,
        memoryId,
        projectId,
        category: category ?? null,
        content: formattedContent,
      };
    } catch (err) {
      return { success: false, error: ragError(err) };
    }
  },
});

export const searchProjectMemoryTool = tool({
  description:
    'Search long-term project vector memory for relevant facts, architectural decisions, and previous insights.',
  inputSchema: z.object({
    projectId: z.string().describe('The project ID whose memory to search.'),
    query: z.string().describe('Natural language search query.'),
    topK: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(5)
      .describe('Maximum number of memory items to return.'),
  }),
  execute: async ({ projectId, query, topK }) => {
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

      assertEmbeddingFits(ctx, embedding.length);
      const vecBuffer = Buffer.from(new Float32Array(embedding).buffer);

      const results = db
        .prepare<[Buffer, number], { chunk_id: string; distance: number }>(
          `SELECT chunk_id, distance
           FROM embeddings
           WHERE embedding MATCH ?
           ORDER BY distance ASC
           LIMIT ?`,
        )
        .all(vecBuffer, topK * 4);

      if (results.length === 0) {
        return { success: true, memories: [] };
      }

      const placeholders = results.map(() => '?').join(',');
      const chunks = db
        .prepare<
          string[],
          {
            id: string;
            file_path: string;
            content: string;
            project_id: string | null;
            created_at: number;
          }
        >(
          `SELECT id, file_path, content, project_id, created_at
           FROM chunks WHERE id IN (${placeholders})`,
        )
        .all(...results.map((r) => r.chunk_id));

      const chunkMap = new Map(chunks.map((c) => [c.id, c]));

      const filtered = results
        .filter((r) => {
          const chunk = chunkMap.get(r.chunk_id);
          return (
            chunk?.project_id === projectId &&
            chunk?.file_path.startsWith('project-memory://')
          );
        })
        .slice(0, topK);

      const memories = filtered.map((r) => {
        const chunk = chunkMap.get(r.chunk_id);
        return {
          id: chunk?.id ?? '',
          content: chunk?.content ?? '',
          score: Math.round((1 - r.distance) * 1000) / 1000,
          createdAt: chunk?.created_at ?? 0,
        };
      });

      return { success: true, memories };
    } catch (err) {
      return { success: false, error: ragError(err) };
    }
  },
});

export const listProjectMemoriesTool = tool({
  description:
    'List recent vector memory entries stored for a specific project.',
  inputSchema: z.object({
    projectId: z.string().describe('The project ID to list memories for.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(20)
      .describe('Maximum number of recent memories to return.'),
  }),
  execute: async ({ projectId, limit }) => {
    const db = getDb();
    try {
      const rows = db
        .prepare<
          [string, number],
          { id: string; file_path: string; content: string; created_at: number }
        >(
          `SELECT id, file_path, content, created_at
           FROM chunks
           WHERE project_id = ? AND file_path LIKE 'project-memory://%'
           ORDER BY created_at DESC
           LIMIT ?`,
        )
        .all(projectId, limit);

      return {
        success: true,
        projectId,
        memories: rows.map((r) => ({
          id: r.id,
          content: r.content,
          createdAt: r.created_at,
        })),
      };
    } catch (err) {
      return { success: false, error: ragError(err) };
    }
  },
});

/** Retrieve recent project memories directly for system prompt context. */
export function getRecentProjectMemories(
  projectId: string,
  limit = 5,
): Array<{ content: string; createdAt: number }> {
  try {
    const db = getDb();
    const rows = db
      .prepare<[string, number], { content: string; created_at: number }>(
        `SELECT content, created_at
         FROM chunks
         WHERE project_id = ? AND file_path LIKE 'project-memory://%'
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(projectId, limit);
    return rows.map((r) => ({ content: r.content, createdAt: r.created_at }));
  } catch {
    return [];
  }
}

export const ragTools = {
  indexFile: indexFileTool,
  searchDocs: searchDocsTool,
  listIndexed: listIndexedTool,
  removeFromIndex: removeFromIndexTool,
  storeProjectMemory: storeProjectMemoryTool,
  searchProjectMemory: searchProjectMemoryTool,
  listProjectMemories: listProjectMemoriesTool,
};
