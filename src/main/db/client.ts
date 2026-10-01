/**
 * db/client.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Singleton better-sqlite3 database handle.
 *
 * • Opens (and creates) the SQLite file in Electron's userData directory.
 * • Loads the sqlite-vec extension for vector search (RAG).
 * • Runs all DDL migrations on first open via db/schema.ts.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { app } from 'electron';
import path from 'node:path';
import Database from 'better-sqlite3';
import { applyMigrations, CREATE_EMBEDDINGS } from './schema.js';

// Embedding dimension – override with env var when using non-1536 models.
const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM ?? 1536);

/**
 * The width the vector index was created with.
 *
 * Read once, here, when the database is first opened — and the `vec0` table is
 * created at that width, which makes it immutable for the life of the file.
 * RAG compares this against the vectors a model actually returns
 * (see ai/embedding-config.ts) so a mismatch is reported as configuration rather
 * than discovered as a corrupt index during a query.
 */
export function getEmbeddingDim(): number {
  return EMBEDDING_DIM;
}

let _db: Database.Database | null = null;

/**
 * Returns the process-wide singleton database connection.
 * Safe to call multiple times – opens only once.
 */
export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = path.join(app.getPath('userData'), 'vellum.db');

  _db = new Database(dbPath);

  // WAL mode for better concurrent read performance.
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  // Run all relational + FTS migrations (idempotent).
  applyMigrations(_db);

  // sqlite-vec is a native extension – only attempt to load it.
  // If the binary isn't present (e.g. first dev run without rebuild),
  // RAG features degrade gracefully; other features are unaffected.
  try {
    const { getLoadablePath } = require('sqlite-vec') as {
      getLoadablePath: () => string;
    };
    _db.loadExtension(getLoadablePath());
    _db.exec(CREATE_EMBEDDINGS(EMBEDDING_DIM));
  } catch {
    console.warn(
      '[db] sqlite-vec extension not available – RAG features disabled.',
    );
  }

  return _db;
}

/** Cleanly close the database (call from app.on('quit')). */
export function closeDb(): void {
  _db?.close();
  _db = null;
}

/**
 * Test/advanced hook: run the stores against an explicit handle (e.g. an
 * in-memory database) instead of the app database. The stores all resolve the
 * connection through getDb(), so swapping it here redirects every caller.
 */
export function useTestDatabase(db: Database.Database): void {
  _db = db;
}
