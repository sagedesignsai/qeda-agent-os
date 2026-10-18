/**
 * db/code-projects.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Codebases attached to an outcome Project. This is separate from the legacy
 * single `projects.repo_path` field so a Project can own several repositories.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { nanoid } from 'nanoid';
import { getDb } from './client.js';

export type CodeProjectSource = 'existing' | 'created' | 'clone';
export type CodeProjectIndexStatus =
  'not-indexed' | 'indexing' | 'ready' | 'error';

export interface CodeProject {
  id: string;
  project_id: string | null;
  name: string;
  directory: string;
  source: CodeProjectSource;
  remote_url: string | null;
  index_status: CodeProjectIndexStatus;
  indexed_files: number;
  indexed_at: number | null;
  index_error: string | null;
  created_at: number;
  updated_at: number;
}

export function listCodeProjects(projectId: string): CodeProject[] {
  return getDb()
    .prepare<[string], CodeProject>(
      `SELECT * FROM code_projects
       WHERE project_id = ?
       ORDER BY updated_at DESC, lower(name)`,
    )
    .all(projectId);
}

export function getCodeProject(id: string): CodeProject | null {
  return (
    getDb()
      .prepare<[string], CodeProject>(
        'SELECT * FROM code_projects WHERE id = ?',
      )
      .get(id) ?? null
  );
}

export function createCodeProject(input: {
  projectId: string;
  name: string;
  directory: string;
  source: CodeProjectSource;
  remoteUrl?: string | null;
}): CodeProject {
  const id = nanoid();
  getDb()
    .prepare(
      `INSERT INTO code_projects
         (id, project_id, name, directory, source, remote_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.projectId,
      input.name,
      input.directory,
      input.source,
      input.remoteUrl ?? null,
    );
  return getCodeProject(id)!;
}

export function setCodeProjectIndexState(
  id: string,
  state: {
    status: CodeProjectIndexStatus;
    indexedFiles?: number;
    error?: string | null;
  },
): void {
  getDb()
    .prepare(
      `UPDATE code_projects
       SET index_status = ?,
           indexed_files = COALESCE(?, indexed_files),
           indexed_at = CASE WHEN ? = 'ready' THEN unixepoch() ELSE indexed_at END,
           index_error = ?,
           updated_at = unixepoch()
       WHERE id = ?`,
    )
    .run(
      state.status,
      state.indexedFiles ?? null,
      state.status,
      state.error ?? null,
      id,
    );
}

/** Remove the codebase record and its vector/chunk index, never the files. */
export function deleteCodeProject(id: string): boolean {
  const db = getDb();
  const chunkIds = db
    .prepare<[string], { id: string }>(
      'SELECT id FROM chunks WHERE code_project_id = ?',
    )
    .all(id)
    .map(({ id: chunkId }) => chunkId);
  const hasVectorTable = Boolean(
    db
      .prepare<[], { name: string }>(
        "SELECT name FROM sqlite_master WHERE name = 'embeddings'",
      )
      .get(),
  );

  return db.transaction(() => {
    if (hasVectorTable && chunkIds.length) {
      const placeholders = chunkIds.map(() => '?').join(',');
      db.prepare(
        `DELETE FROM embeddings WHERE chunk_id IN (${placeholders})`,
      ).run(...chunkIds);
    }
    return (
      db.prepare('DELETE FROM code_projects WHERE id = ?').run(id).changes > 0
    );
  })();
}
