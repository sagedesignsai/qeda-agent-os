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
import fs from 'node:fs';
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

  const userData = app.getPath('userData');
  const oldDbPath = path.join(userData, 'vellum.db');
  const newDbPath = path.join(userData, 'qeda.db');

  // One-time migration: copy vellum.db → qeda.db on first launch after rename.
  if (!fs.existsSync(newDbPath) && fs.existsSync(oldDbPath)) {
    try {
      fs.copyFileSync(oldDbPath, newDbPath);
      // Copy associated WAL and SHM files if they exist
      if (fs.existsSync(oldDbPath + '-wal')) {
        fs.copyFileSync(oldDbPath + '-wal', newDbPath + '-wal');
      }
      if (fs.existsSync(oldDbPath + '-shm')) {
        fs.copyFileSync(oldDbPath + '-shm', newDbPath + '-shm');
      }
      // Remove the old file so we don't copy again on next launch
      try { fs.unlinkSync(oldDbPath); } catch { /* ignore */ }
      try { fs.unlinkSync(oldDbPath + '-wal'); } catch { /* ignore */ }
      try { fs.unlinkSync(oldDbPath + '-shm'); } catch { /* ignore */ }
    } catch (err) {
      console.warn('[db] Failed to migrate vellum.db → qeda.db, falling back to old file:', err);
      // Fall back to the old file so the app still works
      const dbPath = oldDbPath;
      _db = new Database(dbPath);
      _db.pragma('journal_mode = WAL');
      _db.pragma('foreign_keys = ON');
      applyMigrations(_db);
      try {
        const { getLoadablePath } = require('sqlite-vec') as {
          getLoadablePath: () => string;
        };
        _db.loadExtension(getLoadablePath());
        _db.exec(CREATE_EMBEDDINGS(EMBEDDING_DIM));
      } catch {
        console.warn('[db] sqlite-vec extension not available – RAG features disabled.');
      }
      return _db;
    }
  }

  _db = new Database(newDbPath);

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
