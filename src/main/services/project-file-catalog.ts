/**
 * services/project-file-catalog.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds the Project File Browser's catalog: everything inside a project's
 * folders, plus every file the database already references by `project_id`.
 *
 * WHY A SCAN AND NOT A LIVE LISTING
 * ─────────────────────────────────
 * "Files for this project" is four different questions at once — what is in the
 * repo, what is in each linked codebase, what the app saved under its own assets
 * folder, and what a Studio take / message attachment / research source / RAG
 * chunk points at. Answering them on every keystroke means a git call, several
 * joins, and a filesystem walk. The scan pays that once and writes a catalog the
 * browser can page, search, and filter cheaply.
 *
 * SAFETY
 * ──────
 *  • Every path is resolved and proved to stay under the root it came from.
 *  • Symlinks are never followed — neither during the walk nor in `stat`.
 *  • Build/vendor/hidden directories are skipped by name; git roots use
 *    `ls-files`, so `.gitignore` is respected for free.
 *  • The scan is bounded (depth, per-root, per-project). Truncation is reported,
 *    never silent.
 *
 * This module is the only place that knows the roots exist. It takes the
 * `userData` assets directory as an argument rather than importing Electron, so
 * the tests can point it at a temp folder.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  getProjectFileScan,
  makeScannedFile,
  projectFilePathKey,
  recordProjectFileScan,
  upsertProjectFiles,
  type ScannedProjectFile,
} from '../db/project-files.js';
import { listCodeProjects } from '../db/code-projects.js';
import { getProject } from '../db/projects.js';
import { getDb } from '../db/client.js';
import {
  pickPrimarySource,
  type ProjectFileRoot,
  type ProjectFileSource,
} from '../../lib/project-files.js';

const execFileAsync = promisify(execFile);

/** How long a catalog is considered fresh. */
const STALE_AFTER_SECONDS = 60;
const GIT_TIMEOUT_MS = 15_000;
const GIT_MAX_BUFFER = 32 * 1024 * 1024;
const MAX_FILES_PER_ROOT = 5_000;
const MAX_FILES_PER_PROJECT = 20_000;
const MAX_WALK_DEPTH = 12;
const STAT_CONCURRENCY = 32;

const DENIED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  '.turbo',
  'coverage',
  'target',
  'vendor',
  '.venv',
  'venv',
  '__pycache__',
  '.cache',
]);

export interface ProjectFileCatalogOptions {
  /** Absolute path to `userData/projects/<projectId>/assets`. */
  assetsRoot: string;
  /** Force a scan even when the catalog is still fresh. */
  refresh?: boolean;
}

export interface ProjectFileScanSummary {
  scannedAt: number;
  fileCount: number;
  truncated: boolean;
  /** False when the cached catalog was fresh and no scan ran. */
  scanned: boolean;
}

// ─── Roots ────────────────────────────────────────────────────────────────────

/**
 * The three kinds of folder a project owns: its legacy repo path, every linked
 * code project, and the managed assets folder the downloader writes to when no
 * repo exists. Roots are de-duplicated by canonical path — a code project that
 * points at the same directory as `repo_path` must not be scanned twice.
 */
export function resolveProjectFileRoots(
  projectId: string,
  assetsRoot: string,
): ProjectFileRoot[] {
  const project = getProject(projectId);
  const roots: ProjectFileRoot[] = [];
  const seen = new Set<string>();

  const push = (
    root: Omit<ProjectFileRoot, 'path' | 'exists'> & { path: string },
  ) => {
    const resolved = path.resolve(root.path);
    const key = projectFilePathKey(resolved);
    if (seen.has(key)) return;
    seen.add(key);
    roots.push({ ...root, path: resolved, exists: existsSync(resolved) });
  };

  if (project?.repo_path) {
    push({
      key: 'repo',
      label: 'Project repo',
      type: 'repo',
      path: project.repo_path,
    });
  }

  for (const codeProject of listCodeProjects(projectId)) {
    push({
      key: `code:${codeProject.id}`,
      label: codeProject.name,
      type: 'code-project',
      path: codeProject.directory,
    });
  }

  push({
    key: 'assets',
    label: 'Project assets',
    type: 'assets',
    path: assetsRoot,
  });

  return roots;
}

export function isProjectFileCatalogStale(
  projectId: string,
  now = Math.floor(Date.now() / 1000),
): boolean {
  const scan = getProjectFileScan(projectId);
  return !scan || now - scan.scanned_at > STALE_AFTER_SECONDS;
}

// ─── Scan orchestration ───────────────────────────────────────────────────────

const inFlight = new Map<string, Promise<ProjectFileScanSummary>>();

/**
 * Return a fresh catalog, scanning if it is stale or `refresh` is set.
 *
 * Concurrent callers share one scan. This matters because the modal asks for
 * roots and the first page at nearly the same time; without the map the user
 * would pay for two git calls and two walks.
 */
export async function ensureProjectFileCatalog(
  projectId: string,
  options: ProjectFileCatalogOptions,
): Promise<ProjectFileScanSummary> {
  const running = inFlight.get(projectId);
  if (running) return running;

  const scan = getProjectFileScan(projectId);
  const fresh =
    scan !== null &&
    Math.floor(Date.now() / 1000) - scan.scanned_at <= STALE_AFTER_SECONDS;

  if (fresh && !options.refresh && scan) {
    return {
      scannedAt: scan.scanned_at,
      fileCount: scan.file_count,
      truncated: Boolean(scan.truncated),
      scanned: false,
    };
  }

  const promise = runScan(projectId, options.assetsRoot).finally(() => {
    inFlight.delete(projectId);
  });
  inFlight.set(projectId, promise);
  return promise;
}

async function runScan(
  projectId: string,
  assetsRoot: string,
): Promise<ProjectFileScanSummary> {
  const scannedAt = Math.floor(Date.now() / 1000);
  const roots = resolveProjectFileRoots(projectId, assetsRoot);
  const merged = new Map<string, ScannedProjectFile>();

  let truncated = false;
  let enumerated = 0;

  for (const root of roots) {
    if (!root.exists) continue;
    const remaining = MAX_FILES_PER_PROJECT - enumerated;
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    const listing = await enumerateRoot(
      root,
      Math.min(MAX_FILES_PER_ROOT, remaining),
    );
    if (listing.truncated) truncated = true;
    enumerated += listing.relative.length;

    const files = await statFiles(root, listing.relative);
    for (const file of files) mergeInto(merged, file);
  }

  const references = await collectDatabaseReferences(projectId);
  for (const reference of references) mergeInto(merged, reference);

  const files = Array.from(merged.values());
  upsertProjectFiles(projectId, files, scannedAt);
  recordProjectFileScan(projectId, {
    scannedAt,
    fileCount: files.length,
    truncated,
  });

  return { scannedAt, fileCount: files.length, truncated, scanned: true };
}

// ─── Filesystem enumeration ───────────────────────────────────────────────────

interface RootListing {
  relative: string[];
  truncated: boolean;
}

async function enumerateRoot(
  root: ProjectFileRoot,
  cap: number,
): Promise<RootListing> {
  if (await isGitWorkTree(root.path)) {
    const tracked = await gitListFiles(root.path);
    if (tracked) {
      const filtered = tracked.filter(isAllowedRelativePath);
      return {
        relative: filtered.slice(0, cap),
        truncated: filtered.length > cap,
      };
    }
  }
  return walkRoot(root.path, cap);
}

async function isGitWorkTree(directory: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', directory, 'rev-parse', '--is-inside-work-tree'],
      { timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER },
    );
    return String(stdout).trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * `ls-files` is run INSIDE the root, so entries are already relative to it.
 * `--cached --others --exclude-standard` is the tracked + untracked-but-not-
 * ignored set, which is what a user means by "the files in this repo".
 */
async function gitListFiles(directory: string): Promise<string[] | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      [
        '-C',
        directory,
        'ls-files',
        '-z',
        '--cached',
        '--others',
        '--exclude-standard',
      ],
      { timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER },
    );
    return String(stdout).split('\0').filter(Boolean);
  } catch {
    return null;
  }
}

function isAllowedRelativePath(relative: string): boolean {
  const segments = relative.split('/');
  if (segments.length === 0) return false;
  return segments.every(
    (segment) =>
      segment.length > 0 &&
      !segment.startsWith('.') &&
      !DENIED_DIRECTORIES.has(segment),
  );
}

async function walkRoot(rootPath: string, cap: number): Promise<RootListing> {
  const found: string[] = [];
  const queue: Array<{ directory: string; relative: string; depth: number }> = [
    { directory: rootPath, relative: '', depth: 0 },
  ];
  let truncated = false;

  while (queue.length > 0) {
    if (found.length >= cap) {
      truncated = true;
      break;
    }

    const current = queue.shift()!;
    let entries;
    try {
      entries = await fs.readdir(current.directory, { withFileTypes: true });
    } catch {
      continue; // unreadable folder: skip it, do not fail the scan
    }

    for (const entry of entries) {
      if (found.length >= cap) {
        truncated = true;
        break;
      }
      if (entry.name.startsWith('.')) continue;
      if (entry.isSymbolicLink()) continue;

      const relative = current.relative
        ? `${current.relative}/${entry.name}`
        : entry.name;

      if (entry.isDirectory()) {
        if (DENIED_DIRECTORIES.has(entry.name)) continue;
        if (current.depth >= MAX_WALK_DEPTH) {
          truncated = true;
          continue;
        }
        queue.push({
          directory: path.join(current.directory, entry.name),
          relative,
          depth: current.depth + 1,
        });
        continue;
      }

      if (entry.isFile()) found.push(relative);
    }
  }

  return { relative: found, truncated };
}

function isInside(rootPath: string, candidate: string): boolean {
  return candidate === rootPath || candidate.startsWith(rootPath + path.sep);
}

async function statFiles(
  root: ProjectFileRoot,
  relatives: string[],
): Promise<ScannedProjectFile[]> {
  const source: ProjectFileSource =
    root.type === 'repo'
      ? 'repo'
      : root.type === 'code-project'
        ? 'code-project'
        : 'assets';

  const files: ScannedProjectFile[] = [];
  let next = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= relatives.length) return;

      const relative = relatives[index];
      const absolute = path.resolve(root.path, relative);
      if (!isInside(root.path, absolute)) continue;

      try {
        const stat = await fs.lstat(absolute);
        if (!stat.isFile() || stat.isSymbolicLink()) continue;
        files.push(
          makeScannedFile({
            filePath: absolute,
            relativePath: relative,
            rootKey: root.key,
            sources: [source],
            sizeBytes: stat.size,
            mtimeMs: stat.mtimeMs,
          }),
        );
      } catch {
        // The file vanished between listing and stat; a later scan will pick it
        // up if it comes back.
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(STAT_CONCURRENCY, Math.max(1, relatives.length)) },
      worker,
    ),
  );

  return files;
}

// ─── Database references ──────────────────────────────────────────────────────

/**
 * Everything the project's own rows point at.
 *
 * Studio takes are collapsed to the take itself: the optimized/filmstrip/
 * waveform derivatives ride along in `meta` (the filmstrip doubles as the
 * thumbnail) instead of becoming six separate selectable rows.
 */
async function collectDatabaseReferences(
  projectId: string,
): Promise<ScannedProjectFile[]> {
  const db = getDb();
  const collected = new Map<string, ScannedProjectFile>();

  const add = async (
    filePath: string | null | undefined,
    source: ProjectFileSource,
    meta: Record<string, unknown>,
  ): Promise<void> => {
    if (!filePath || !path.isAbsolute(filePath)) return;
    const key = projectFilePathKey(filePath);
    const existing = collected.get(key);
    if (existing) {
      const sources = Array.from(new Set([...existing.sources, source]));
      existing.sources = sources;
      existing.primarySource = pickPrimarySource(sources);
      existing.meta = { ...existing.meta, ...meta };
      return;
    }

    const described = await describePath(filePath);
    collected.set(
      key,
      makeScannedFile({
        filePath,
        sources: [source],
        meta,
        missing: !described.exists,
        sizeBytes: described.sizeBytes,
        mtimeMs: described.mtimeMs,
      }),
    );
  };

  // ── Studio takes ──────────────────────────────────────────────────────────
  const takes = db
    .prepare<
      [string],
      {
        id: string;
        title: string;
        duration_ms: number;
        video_path: string;
        audio_path: string | null;
        filmstrip_path: string | null;
        overlays_json: string | null;
      }
    >(
      `SELECT id, title, duration_ms, video_path, audio_path, filmstrip_path, overlays_json
         FROM studio_takes
        WHERE project_id = ?`,
    )
    .all(projectId);

  for (const take of takes) {
    const filmstripUrl = take.filmstrip_path
      ? `qeda-media://studio/${encodeURIComponent(take.id)}?variant=filmstrip`
      : null;
    const baseMeta = {
      studioTakeId: take.id,
      title: take.title,
      durationMs: take.duration_ms,
      filmstripUrl,
    };

    await add(take.video_path, 'studio-take', baseMeta);
    await add(take.audio_path, 'studio-take', { ...baseMeta, audio: true });

    if (take.overlays_json) {
      try {
        const overlays = JSON.parse(take.overlays_json) as unknown;
        if (Array.isArray(overlays)) {
          for (const overlay of overlays) {
            if (!overlay || typeof overlay !== 'object') continue;
            const record = overlay as Record<string, unknown>;
            const candidate =
              typeof record.srcPath === 'string'
                ? record.srcPath
                : typeof record.source === 'string'
                  ? record.source
                  : null;
            await add(candidate, 'studio-take', { ...baseMeta, overlay: true });
          }
        }
      } catch {
        // A malformed overlays blob must not break the whole catalog.
      }
    }
  }

  // ── Message attachments ───────────────────────────────────────────────────
  const attachments = db
    .prepare<
      [string],
      { path: string; label: string; message_id: string; subject: string }
    >(
      `SELECT a.path AS path, a.label AS label, m.id AS message_id, m.subject AS subject
         FROM message_attachments a
         JOIN correspondence_messages m ON m.id = a.message_id
        WHERE m.project_id = ? AND a.kind = 'file'
          AND a.path IS NOT NULL AND a.path != ''`,
    )
    .all(projectId);

  for (const attachment of attachments) {
    await add(attachment.path, 'attachment', {
      messageId: attachment.message_id,
      subject: attachment.subject,
      label: attachment.label,
    });
  }

  // ── Research file sources ─────────────────────────────────────────────────
  const sources = db
    .prepare<
      [string],
      { url: string; title: string; source_id: string; question: string }
    >(
      `SELECT s.url AS url, s.title AS title, s.id AS source_id, r.question AS question
         FROM research_sources s
         JOIN research_runs r ON r.id = s.run_id
        WHERE r.project_id = ? AND s.kind = 'file'
          AND s.url IS NOT NULL AND s.url != ''`,
    )
    .all(projectId);

  for (const source of sources) {
    const local = localPathFromReference(source.url);
    await add(local, 'research-file', {
      researchSourceId: source.source_id,
      title: source.title,
      question: source.question,
    });
  }

  // ── RAG-indexed files ─────────────────────────────────────────────────────
  const chunks = db
    .prepare<[string, string], { file_path: string; chunk_count: number }>(
      `SELECT file_path, COUNT(*) AS chunk_count
         FROM chunks
        WHERE project_id = ?
           OR code_project_id IN (SELECT id FROM code_projects WHERE project_id = ?)
        GROUP BY file_path`,
    )
    .all(projectId, projectId);

  for (const chunk of chunks) {
    await add(chunk.file_path, 'indexed', {
      chunkCount: chunk.chunk_count,
    });
  }

  return Array.from(collected.values());
}

function localPathFromReference(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith('file://')) {
    try {
      return fileURLToPath(trimmed);
    } catch {
      return null;
    }
  }
  return path.isAbsolute(trimmed) ? trimmed : null;
}

async function describePath(filePath: string): Promise<{
  exists: boolean;
  sizeBytes: number | null;
  mtimeMs: number | null;
}> {
  try {
    const stat = await fs.lstat(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      return { exists: false, sizeBytes: null, mtimeMs: null };
    }
    return { exists: true, sizeBytes: stat.size, mtimeMs: stat.mtimeMs };
  } catch {
    return { exists: false, sizeBytes: null, mtimeMs: null };
  }
}

// ─── Merge ────────────────────────────────────────────────────────────────────

/**
 * Merge a file discovered by two sources into one catalog row.
 *
 * The filesystem wins on location (a real relative path beats a bare database
 * reference); the database wins on provenance metadata. A file is missing only
 * if every discovery says so.
 */
function mergeInto(
  map: Map<string, ScannedProjectFile>,
  file: ScannedProjectFile,
): void {
  const existing = map.get(file.pathKey);
  if (!existing) {
    map.set(file.pathKey, file);
    return;
  }

  const sources = Array.from(new Set([...existing.sources, ...file.sources]));
  const preferNewLocation = existing.rootKey === 'db' && file.rootKey !== 'db';

  map.set(file.pathKey, {
    ...existing,
    sources,
    primarySource: pickPrimarySource(sources),
    meta: { ...existing.meta, ...file.meta },
    relativePath: preferNewLocation ? file.relativePath : existing.relativePath,
    rootKey: preferNewLocation ? file.rootKey : existing.rootKey,
    sizeBytes: existing.sizeBytes ?? file.sizeBytes,
    mtimeMs: existing.mtimeMs ?? file.mtimeMs,
    missing: Boolean(existing.missing) && Boolean(file.missing),
  });
}
