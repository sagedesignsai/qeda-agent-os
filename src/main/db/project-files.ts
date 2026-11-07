/**
 * db/project-files.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Storage for the Project File Browser's catalog.
 *
 * The scanner (services/project-file-catalog.ts) decides *what* exists; this
 * module only persists the result and answers the browser's queries. Keeping the
 * filesystem walk out of here is what lets the tests run against an in-memory
 * database with no temp folders.
 *
 * Rows are deduped by `(project_id, path_key)` and upserted — never replaced —
 * so a file keeps its id (and therefore its media URL) across rescans.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import path from 'node:path';
import { nanoid } from 'nanoid';
import { getDb } from './client.js';
import {
  isFilesystemSource,
  isPreviewableKind,
  pickPrimarySource,
  projectFileMediaUrl,
  type ProjectFileDirectory,
  type ProjectFileEntry,
  type ProjectFileKind,
  type ProjectFileListResult,
  type ProjectFileSource,
} from '../../lib/project-files.js';
import {
  classifyProjectFile,
  projectFileMimeType,
} from '../../lib/project-files.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** The raw row, before it is dressed up for the renderer. */
export interface ProjectFileRecord {
  id: string;
  project_id: string;
  path_key: string;
  path: string;
  name: string;
  relative_path: string;
  root_key: string;
  kind: ProjectFileKind;
  mime_type: string;
  size_bytes: number | null;
  mtime_ms: number | null;
  sources_json: string;
  primary_source: ProjectFileSource;
  meta_json: string;
  missing_at: number | null;
  last_seen_at: number;
}

/** One file the scanner found. Merged by `pathKey` before it reaches here. */
export interface ScannedProjectFile {
  pathKey: string;
  path: string;
  name: string;
  relativePath: string;
  rootKey: string;
  kind: ProjectFileKind;
  mimeType: string;
  sizeBytes: number | null;
  mtimeMs: number | null;
  sources: ProjectFileSource[];
  primarySource: ProjectFileSource;
  meta: Record<string, unknown>;
  /** True when a database reference points at a path that no longer exists. */
  missing?: boolean;
}

export interface ProjectFileScanState {
  project_id: string;
  scanned_at: number;
  file_count: number;
  truncated: number;
}

export interface ListProjectFilesQuery {
  projectId: string;
  source?: ProjectFileSource;
  /** Restrict to one scan root (`repo`, `code:<id>`, `assets`). */
  rootKey?: string;
  /** Relative folder to browse. `null`/undefined means "flat list". */
  directory?: string | null;
  kind?: ProjectFileKind;
  /** Restrict to these filename extensions, without the leading dot. */
  extensions?: string[];
  query?: string;
  includeMissing?: boolean;
  limit?: number;
  offset?: number;
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const DIRECTORY_ROW_CAP = 20_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Canonical dedupe key for a path.
 *
 * Symlinks are refused by the scanner, so resolving the path is enough. The
 * lower-casing matters on macOS/Windows: the same file reached through two
 * casings must not become two rows.
 */
export function projectFilePathKey(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === 'linux' ? resolved : resolved.toLowerCase();
}

export function makeScannedFile(input: {
  filePath: string;
  name?: string;
  relativePath?: string;
  rootKey?: string;
  sources: ProjectFileSource[];
  meta?: Record<string, unknown>;
  missing?: boolean;
  sizeBytes?: number | null;
  mtimeMs?: number | null;
}): ScannedProjectFile {
  const resolved = path.resolve(input.filePath);
  const name = input.name ?? path.basename(resolved);
  const sources = Array.from(new Set(input.sources));
  return {
    pathKey: projectFilePathKey(resolved),
    path: resolved,
    name,
    relativePath: input.relativePath ?? '',
    rootKey: input.rootKey ?? 'db',
    kind: classifyProjectFile(name),
    mimeType: projectFileMimeType(name),
    sizeBytes: input.sizeBytes ?? null,
    mtimeMs: input.mtimeMs ?? null,
    sources,
    primarySource: pickPrimarySource(sources),
    meta: input.meta ?? {},
    missing: input.missing ?? false,
  };
}

function parseSources(json: string): ProjectFileSource[] {
  try {
    const value = JSON.parse(json) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is ProjectFileSource =>
        item === 'repo' ||
        item === 'code-project' ||
        item === 'assets' ||
        item === 'studio-take' ||
        item === 'attachment' ||
        item === 'research-file' ||
        item === 'indexed',
    );
  } catch {
    return [];
  }
}

function parseMeta(json: string): Record<string, unknown> {
  try {
    const value = JSON.parse(json) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function toEntry(record: ProjectFileRecord): ProjectFileEntry {
  const meta = parseMeta(record.meta_json);
  const filmstrip =
    typeof meta.filmstripUrl === 'string' ? meta.filmstripUrl : null;
  return {
    id: record.id,
    projectId: record.project_id,
    name: record.name,
    path: record.path,
    relativePath: record.relative_path,
    rootKey: record.root_key,
    kind: record.kind,
    mimeType: record.mime_type,
    sizeBytes: record.size_bytes,
    mtimeMs: record.mtime_ms,
    sources: parseSources(record.sources_json),
    primarySource: record.primary_source,
    missing: record.missing_at !== null,
    mediaUrl: isPreviewableKind(record.kind)
      ? projectFileMediaUrl(record.id)
      : null,
    thumbnailUrl: filmstrip,
    meta,
  };
}

// ─── Scan bookkeeping ─────────────────────────────────────────────────────────

export function getProjectFileScan(
  projectId: string,
): ProjectFileScanState | null {
  return (
    (getDb()
      .prepare<[string], ProjectFileScanState>(
        'SELECT * FROM project_file_scans WHERE project_id = ?',
      )
      .get(projectId) as ProjectFileScanState | undefined) ?? null
  );
}

export function recordProjectFileScan(
  projectId: string,
  scan: { scannedAt: number; fileCount: number; truncated: boolean },
): void {
  getDb()
    .prepare(
      `INSERT INTO project_file_scans (project_id, scanned_at, file_count, truncated)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         scanned_at = excluded.scanned_at,
         file_count = excluded.file_count,
         truncated  = excluded.truncated`,
    )
    .run(projectId, scan.scannedAt, scan.fileCount, scan.truncated ? 1 : 0);
}

// ─── Writes ───────────────────────────────────────────────────────────────────

/**
 * Replace the project's catalog with one scan's result.
 *
 * Seen files are upserted (ids preserved). Rows that were not seen are handled
 * by provenance: a file that used to be on disk is marked missing so the browser
 * can explain the gap, while a row whose only reason to exist was a database
 * reference that has since been deleted is dropped.
 */
export function upsertProjectFiles(
  projectId: string,
  files: ScannedProjectFile[],
  scanStartedAt: number,
): void {
  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO project_files
       (id, project_id, path_key, path, name, relative_path, root_key, kind,
        mime_type, size_bytes, mtime_ms, sources_json, primary_source,
        meta_json, missing_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, path_key) DO UPDATE SET
       path           = excluded.path,
       name           = excluded.name,
       relative_path  = excluded.relative_path,
       root_key       = excluded.root_key,
       kind           = excluded.kind,
       mime_type      = excluded.mime_type,
       size_bytes     = excluded.size_bytes,
       mtime_ms       = excluded.mtime_ms,
       sources_json   = excluded.sources_json,
       primary_source = excluded.primary_source,
       meta_json      = excluded.meta_json,
       missing_at     = excluded.missing_at,
       last_seen_at   = excluded.last_seen_at`,
  );
  const existing = db.prepare<
    [string],
    { id: string; path_key: string; sources_json: string }
  >(
    'SELECT id, path_key, sources_json FROM project_files WHERE project_id = ?',
  );
  const markMissing = db.prepare(
    'UPDATE project_files SET missing_at = ? WHERE id = ?',
  );
  const remove = db.prepare('DELETE FROM project_files WHERE id = ?');

  const seen = new Set(files.map((file) => file.pathKey));

  db.transaction(() => {
    for (const file of files) {
      upsert.run(
        nanoid(),
        projectId,
        file.pathKey,
        file.path,
        file.name,
        file.relativePath,
        file.rootKey,
        file.kind,
        file.mimeType,
        file.sizeBytes,
        file.mtimeMs,
        JSON.stringify(file.sources),
        file.primarySource,
        JSON.stringify(file.meta),
        file.missing ? scanStartedAt : null,
        scanStartedAt,
      );
    }

    for (const row of existing.all(projectId)) {
      if (seen.has(row.path_key)) continue;
      const sources = parseSources(row.sources_json);
      if (sources.some(isFilesystemSource)) {
        markMissing.run(scanStartedAt, row.id);
      } else {
        remove.run(row.id);
      }
    }
  })();
}

// ─── Reads ────────────────────────────────────────────────────────────────────

interface WhereParts {
  sql: string;
  params: unknown[];
}

/** Filters shared by the page query, the count, and directory derivation. */
function baseConditions(query: ListProjectFilesQuery): WhereParts {
  const clauses = ['project_id = ?'];
  const params: unknown[] = [query.projectId];

  if (query.source) {
    clauses.push(
      'EXISTS (SELECT 1 FROM json_each(project_files.sources_json) WHERE json_each.value = ?)',
    );
    params.push(query.source);
  }
  if (query.rootKey) {
    clauses.push('root_key = ?');
    params.push(query.rootKey);
  }
  if (query.kind) {
    clauses.push('kind = ?');
    params.push(query.kind);
  }
  const extensions = (query.extensions ?? [])
    .map((extension) => extension.trim().toLowerCase().replace(/^\.+/, ''))
    .filter(Boolean);
  if (extensions.length > 0) {
    // Exact suffix match, so `md` does not also match `mdx`. LIKE is used
    // rather than string slicing because `name` is already in the row.
    clauses.push(
      `(${extensions.map(() => "lower(name) LIKE ? ESCAPE '!'").join(' OR ')})`,
    );
    for (const extension of extensions) {
      const escaped = extension.replace(/[!%_]/g, '!$&');
      params.push(`%.${escaped}`);
    }
  }
  if (!query.includeMissing) {
    clauses.push('missing_at IS NULL');
  }
  const search = query.query?.trim();
  if (search) {
    clauses.push('(name LIKE ? OR relative_path LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  return { sql: clauses.join(' AND '), params };
}

/**
 * Rows directly inside `directory`.
 *
 * `''` is the root: only paths with no slash. A deeper directory means "one
 * segment below this prefix". Database-sourced rows (`relative_path = ''`,
 * `root_key = 'db'`) only appear in the flat view.
 */
function directoryConditions(directory: string): WhereParts {
  if (directory === '') {
    return {
      sql: "relative_path != '' AND instr(relative_path, '/') = 0",
      params: [],
    };
  }
  return {
    sql: "relative_path LIKE ? AND instr(substr(relative_path, ?), '/') = 0",
    params: [`${directory}/%`, directory.length + 2],
  };
}

function deriveDirectories(
  query: ListProjectFilesQuery,
  directory: string,
): ProjectFileDirectory[] {
  const db = getDb();
  const base = baseConditions({ ...query, includeMissing: false });
  const rows = db
    .prepare<unknown[], { relative_path: string; size_bytes: number | null }>(
      `SELECT relative_path, size_bytes FROM project_files
        WHERE ${base.sql} AND relative_path != ''
        LIMIT ${DIRECTORY_ROW_CAP}`,
    )
    .all(...base.params);

  const prefix = directory === '' ? '' : `${directory}/`;
  const buckets = new Map<string, ProjectFileDirectory>();

  for (const row of rows) {
    if (!row.relative_path.startsWith(prefix)) continue;
    const rest = row.relative_path.slice(prefix.length);
    const slash = rest.indexOf('/');
    if (slash === -1) continue; // a file in this folder, not a subfolder
    const name = rest.slice(0, slash);
    const childPath = prefix ? `${prefix}${name}` : name;
    const bucket = buckets.get(childPath);
    if (bucket) {
      bucket.fileCount += 1;
      bucket.sizeBytes += row.size_bytes ?? 0;
    } else {
      buckets.set(childPath, {
        path: childPath,
        name,
        fileCount: 1,
        sizeBytes: row.size_bytes ?? 0,
      });
    }
  }

  return Array.from(buckets.values()).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}

export function listProjectFiles(
  query: ListProjectFilesQuery,
): ProjectFileListResult {
  const db = getDb();
  const limit = Math.max(
    1,
    Math.min(MAX_LIMIT, Math.floor(query.limit ?? DEFAULT_LIMIT)),
  );
  const offset = Math.max(0, Math.floor(query.offset ?? 0));

  const base = baseConditions(query);
  const directory =
    query.directory === null || query.directory === undefined
      ? null
      : query.directory.replace(/^\/+|\/+$/g, '');

  const pageClauses = [base.sql];
  const pageParams = [...base.params];
  if (directory !== null) {
    const part = directoryConditions(directory);
    pageClauses.push(part.sql);
    pageParams.push(...part.params);
  }

  const where = pageClauses.join(' AND ');
  const total = (
    db
      .prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM project_files WHERE ${where}`,
      )
      .get(...pageParams) as { n: number }
  ).n;

  const records = db
    .prepare<unknown[], ProjectFileRecord>(
      `SELECT * FROM project_files
        WHERE ${where}
        ORDER BY missing_at IS NOT NULL ASC, lower(name) ASC
        LIMIT ? OFFSET ?`,
    )
    .all(...pageParams, limit, offset);

  const scan = getProjectFileScan(query.projectId);

  return {
    files: records.map(toEntry),
    directories: directory !== null ? deriveDirectories(query, directory) : [],
    total,
    truncated: Boolean(scan?.truncated),
    scannedAt: scan?.scanned_at ?? null,
  };
}

/** Count of live files per source, for the rail badges. */
export function projectFileCounts(
  projectId: string,
): Record<ProjectFileSource, number> {
  const totals: Record<ProjectFileSource, number> = {
    repo: 0,
    'code-project': 0,
    assets: 0,
    'studio-take': 0,
    attachment: 0,
    'research-file': 0,
    indexed: 0,
  };

  const rows = getDb()
    .prepare<[string], { source: string; n: number }>(
      `SELECT j.value AS source, COUNT(*) AS n
         FROM project_files pf, json_each(pf.sources_json) j
        WHERE pf.project_id = ? AND pf.missing_at IS NULL
        GROUP BY j.value`,
    )
    .all(projectId);

  for (const row of rows) {
    if (row.source in totals) {
      totals[row.source as ProjectFileSource] = row.n;
    }
  }
  return totals;
}

/** Unscoped lookup for the `qeda-media://project-file/<id>` host. */
export function getProjectFileRecord(fileId: string): ProjectFileRecord | null {
  return (
    (getDb()
      .prepare<[string], ProjectFileRecord>(
        'SELECT * FROM project_files WHERE id = ?',
      )
      .get(fileId) as ProjectFileRecord | undefined) ?? null
  );
}

/** Project-scoped lookup for the renderer's read/reveal actions. */
export function findProjectFileRecord(
  projectId: string,
  fileId: string,
): ProjectFileRecord | null {
  return (
    (getDb()
      .prepare<[string, string], ProjectFileRecord>(
        'SELECT * FROM project_files WHERE project_id = ? AND id = ?',
      )
      .get(projectId, fileId) as ProjectFileRecord | undefined) ?? null
  );
}

export function getProjectFileEntry(
  projectId: string,
  fileId: string,
): ProjectFileEntry | null {
  const record = findProjectFileRecord(projectId, fileId);
  return record ? toEntry(record) : null;
}
