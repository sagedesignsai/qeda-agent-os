/**
 * db/client.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Singleton better-sqlite3 database handle for SoundLab.
 *
 * Opens (and creates) soundlab.db in Electron's userData directory.
 * No sqlite-vec, no FTS, no Qeda migrations — just the two SoundLab tables.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { app } from 'electron';
import path from 'node:path';
import Database from 'better-sqlite3';
import { applyMigrations } from './schema.js';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = path.join(app.getPath('userData'), 'soundlab.db');

  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  applyMigrations(_db as any);

  return _db;
}

export function closeDb(): void {
  _db?.close();
  _db = null;
}

export function useTestDatabase(db: Database.Database | null): void {
  _db = db;
}
