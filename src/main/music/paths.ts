/**
 * main/music/paths.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical identity for a file on disk.
 *
 * The scanner sees the same file through symlinks and, on macOS/Windows, through
 * different casings. `realpath` collapses the first; lower-casing collapses the
 * second. Without this a rescan would insert a second row for a track the user
 * already has in a playlist.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { realpathSync } from 'node:fs';
import path from 'node:path';

const CASE_INSENSITIVE = process.platform === 'darwin' || process.platform === 'win32';

/** The title a track shows before (or without) any tags: its file name. */
export function titleFromFilename(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

export function pathKeyFor(filePath: string): string {
  const resolved = path.resolve(filePath);
  let canonical = resolved;
  try {
    canonical = realpathSync.native(resolved);
  } catch {
    // The file may have vanished between listing and indexing; the resolved
    // path is still a stable key for the row we are about to mark missing.
  }
  return CASE_INSENSITIVE ? canonical.toLowerCase() : canonical;
}
