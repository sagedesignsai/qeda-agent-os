/**
 * main/motion/project-store.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Durable Motion project bundles. The folder is the source of truth; the
 * injected index is a rebuildable catalog. Every canonical write uses a lock,
 * autosave sidecar, atomic replacement, read-back verification, and backup.
 */

import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { createStarterMotionDocument } from '../../lib/motion/defaults';
import { parseMotionDocument, serializeMotionDocument } from '../../lib/motion/schema';
import type { MotionDocument } from '../../lib/motion/types';
import type { MotionProjectIndex, MotionProjectIndexRow } from './project-index.js';

const writeFileAtomic = require('write-file-atomic') as (
  file: string,
  data: string | Uint8Array,
  options?: Record<string, unknown>,
) => Promise<void>;
const properLockfile = require('proper-lockfile') as {
  lock: (file: string, options: Record<string, unknown>) => Promise<() => Promise<void>>;
};

const BACKUP_LIMIT = 10;
const BACKUP_INTERVAL_MS = 5 * 60 * 1000;
const BACKUP_REVISION_DELTA = 20;
const queues = new Map<string, Promise<unknown>>();

export type MotionProjectSummary = {
  id: string;
  name: string;
  path: string;
  sceneCount: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
  missing: boolean;
  lastOpenedAt: string | null;
  latestRender: { filePath: string; createdAt: string } | null;
};

export type MotionOpenResult = {
  document: MotionDocument;
  path: string;
  dirty: boolean;
  readOnly: boolean;
  recovery: null | {
    savedAt: string;
    revision: number;
    canonicalRevision: number | null;
    canonicalDamaged: boolean;
    canonicalError?: string;
  };
  warnings: string[];
};

export type MotionBackupSummary = {
  revision: number;
  bytes: number;
  modifiedAt: string;
};

type AutosaveSidecar = {
  format: 1;
  revision: number;
  savedAt: string;
  sha256: string;
  document: unknown;
};

export class MotionProjectError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'MotionProjectError';
  }
}

export class MotionProjectStore {
  readonly projectsDirectory: string;
  private lastRescanAt = 0;

  constructor(
    readonly motionDirectory: string,
    private readonly index: Pick<MotionProjectIndex, 'list' | 'get' | 'upsert' | 'markMissing' | 'delete'>,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = () => `prj_${randomBytes(10).toString('hex')}`,
  ) {
    this.projectsDirectory = path.join(motionDirectory, 'projects');
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.projectsDirectory, { recursive: true });
    await fs.mkdir(path.join(this.motionDirectory, 'templates'), { recursive: true });
    await fs.mkdir(path.join(this.motionDirectory, 'cache', 'thumbnails'), { recursive: true });
    await fs.mkdir(path.join(this.motionDirectory, 'cache', 'fonts'), { recursive: true });
  }

  listProjects(): MotionProjectSummary[] {
    return this.index.list().map(toSummary);
  }

  async createProject(options: { name?: string; document?: MotionDocument } = {}): Promise<MotionProjectSummary> {
    await this.initialize();
    const id = this.createId();
    const projectPath = this.projectPath(id);
    if (this.index.get(id) || await fs.access(projectPath).then(() => true, () => false)) {
      throw new MotionProjectError(`Motion project id "${id}" is already in use.`, 'MOTION_PROJECT_ID_COLLISION');
    }
    const createdAt = this.now().toISOString();
    const document = options.document ?? createStarterMotionDocument(createdAt);
    const doc: MotionDocument = {
      ...document,
      revision: 0,
      meta: {
        ...document.meta,
        id,
        name: options.name?.trim() || document.meta.name,
        createdAt,
        updatedAt: createdAt,
      },
    };
    await this.createBundleDirectories(projectPath);
    try {
      await this.saveProject(id, doc, { forceBackup: true });
    } catch (error) {
      // Keep a failed bundle if it contains a sidecar: it may be the only
      // recoverable copy after a partial write.
      throw error;
    }
    return this.getSummary(id)!;
  }

  async saveCopy(document: MotionDocument, name?: string): Promise<MotionProjectSummary> {
    const copyName = name?.trim() || `${document.meta.name} copy`;
    return this.createProject({ name: copyName, document });
  }

  async openProject(id: string): Promise<MotionOpenResult> {
    const projectPath = this.projectPath(id);
    const canonicalPath = path.join(projectPath, 'project.json');
    let document: MotionDocument | undefined;
    let canonicalError: string | undefined;
    let canonicalRevision = -1;
    let migrated = false;
    let newerSchema = false;
    try {
      const raw = JSON.parse(await fs.readFile(canonicalPath, 'utf8')) as Record<string, unknown>;
      const schemaVersion = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
      newerSchema = schemaVersion > 4;
      if (newerSchema) {
        throw new MotionProjectError(
          `This project was made with a newer version of Motion (schema ${schemaVersion}). Update the app to open it.`,
          'MOTION_PROJECT_NEWER_SCHEMA',
        );
      }
      migrated = schemaVersion < 4;
      document = parseMotionDocument(raw);
      canonicalRevision = document.revision;
    } catch (error) {
      canonicalError = error instanceof Error ? error.message : String(error);
    }

    if (newerSchema) {
      throw new MotionProjectError(canonicalError!, 'MOTION_PROJECT_NEWER_SCHEMA');
    }

    const sidecarPath = path.join(projectPath, 'project.autosave.json');
    const sidecar = await this.readSidecar(sidecarPath);
    const warnings: string[] = [];
    const hasSidecar = await fs.access(sidecarPath).then(() => true, () => false);
    if (hasSidecar && !sidecar) warnings.push('An autosave recovery file is invalid and was preserved for inspection.');
    if (document && sidecar && sidecar.revision <= canonicalRevision) {
      if (await this.isWritable(projectPath)) await fs.rm(sidecarPath, { force: true });
    } else if (sidecar && (!document || sidecar.revision > canonicalRevision)) {
      const readOnly = !(await this.isWritable(projectPath));
      return {
        document: sidecar.document,
        path: projectPath,
        dirty: true,
        readOnly,
        recovery: {
          savedAt: sidecar.savedAt,
          revision: sidecar.revision,
          canonicalRevision: canonicalRevision >= 0 ? canonicalRevision : null,
          canonicalDamaged: !document,
          ...(canonicalError ? { canonicalError } : {}),
        },
        warnings: canonicalError ? [`Canonical project could not be read: ${canonicalError}`] : [],
      };
    }

    if (!document) {
      throw new MotionProjectError(canonicalError ?? `Project "${id}" has no valid project.json.`, 'MOTION_PROJECT_INVALID');
    }
    if (document.meta.id !== id) warnings.push('The project document id does not match its bundle folder.');
    if (migrated) warnings.push('This project was migrated in memory and will be saved in the current format on the next save.');
    const readOnly = !(await this.isWritable(projectPath));
    this.index.upsert(this.toIndexRow(id, projectPath, document, this.now().toISOString()));
    return { document, path: projectPath, dirty: migrated, readOnly, recovery: null, warnings };
  }

  async resolveRecovery(id: string, action: 'recover' | 'discard'): Promise<MotionOpenResult> {
    const projectPath = this.projectPath(id);
    const sidecarPath = path.join(projectPath, 'project.autosave.json');
    const sidecar = await this.readSidecar(sidecarPath);
    if (!sidecar) throw new MotionProjectError('The recovery sidecar is missing or invalid.', 'MOTION_RECOVERY_INVALID');
    if (action === 'discard') {
      await fs.rm(sidecarPath, { force: true });
      return this.openProject(id);
    }
    const canonical = await this.readCanonicalRevision(projectPath).catch(() => -1);
    const recovered: MotionDocument = { ...sidecar.document, revision: Math.max(canonical, sidecar.revision) + 1 };
    await this.saveProject(id, recovered, { forceBackup: true });
    return this.openProject(id);
  }

  async listBackups(id: string): Promise<MotionBackupSummary[]> {
    const directory = path.join(this.projectPath(id), 'backups');
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
    const backups = await Promise.all(entries.flatMap((entry) => {
      const match = entry.isFile() && /^project-(\d+)\.json$/.exec(entry.name);
      if (!match) return [];
      const filePath = path.join(directory, entry.name);
      return [fs.stat(filePath).then((stat) => ({
        revision: Number(match[1]),
        bytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      }))];
    }));
    return backups.sort((a, b) => b.revision - a.revision);
  }

  async restoreBackup(id: string, revision: number): Promise<MotionOpenResult> {
    if (!Number.isInteger(revision) || revision < 0) {
      throw new MotionProjectError('Backup revision is invalid.', 'MOTION_BACKUP_INVALID');
    }
    const backupPath = path.join(this.projectPath(id), 'backups', `project-${revision}.json`);
    let backup: MotionDocument;
    try {
      backup = parseMotionDocument(JSON.parse(await fs.readFile(backupPath, 'utf8')));
    } catch (error) {
      throw new MotionProjectError(`Backup revision ${revision} is invalid: ${error instanceof Error ? error.message : String(error)}`, 'MOTION_BACKUP_INVALID');
    }
    if (backup.meta.id !== id) throw new MotionProjectError('The backup belongs to a different project.', 'MOTION_BACKUP_ID_MISMATCH');
    const canonicalPath = path.join(this.projectPath(id), 'project.json');
    let canonicalRevision = -1;
    try {
      canonicalRevision = await this.readCanonicalRevision(this.projectPath(id));
    } catch {
      const corruptBytes = await fs.readFile(canonicalPath).catch(() => null);
      if (corruptBytes) {
        const preservedPath = path.join(this.projectPath(id), `project.corrupt-${this.now().getTime()}.json`);
        await writeFileAtomic(preservedPath, corruptBytes);
      }
    }
    const restored: MotionDocument = {
      ...backup,
      revision: Math.max(canonicalRevision, backup.revision) + 1,
      meta: { ...backup.meta, updatedAt: this.now().toISOString() },
    };
    await this.saveProject(id, restored, { forceBackup: true });
    return this.openProject(id);
  }

  async duplicateForRepair(id: string): Promise<MotionProjectSummary> {
    const sourcePath = this.projectPath(id);
    const destinationId = this.createId();
    const destinationPath = this.projectPath(destinationId);
    if (this.index.get(destinationId) || await fs.access(destinationPath).then(() => true, () => false)) {
      throw new MotionProjectError(`Motion project id "${destinationId}" is already in use.`, 'MOTION_PROJECT_ID_COLLISION');
    }
    await this.createBundleDirectories(destinationPath);
    const sourceAssets = path.join(sourcePath, 'assets');
    await fs.cp(sourceAssets, path.join(destinationPath, 'assets'), { recursive: true, errorOnExist: false, force: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
    const createdAt = this.now().toISOString();
    const blank = createStarterMotionDocument(createdAt);
    const document: MotionDocument = {
      ...blank,
      revision: 0,
      meta: { ...blank.meta, id: destinationId, name: `${id} (repair copy)`, createdAt, updatedAt: createdAt },
    };
    await this.saveProject(destinationId, document, { forceBackup: true });
    return this.getSummary(destinationId)!;
  }

  async preserveInvalidRecoveryCopy(id: string): Promise<string> {
    const sidecarPath = path.join(this.projectPath(id), 'project.autosave.json');
    const bytes = await fs.readFile(sidecarPath).catch(() => {
      throw new MotionProjectError('The recovery sidecar is no longer available.', 'MOTION_RECOVERY_MISSING');
    });
    const copyPath = path.join(this.projectPath(id), `project.autosave.inspection-${this.now().getTime()}.json`);
    await writeFileAtomic(copyPath, bytes);
    return copyPath;
  }

  saveProject(
    id: string,
    document: MotionDocument,
    options: { forceBackup?: boolean; destructive?: boolean; expectedRevision?: number } = {},
  ): Promise<{ revision: number; savedAt: string; bytes: number }> {
    return this.enqueue(id, () => this.saveProjectUnlocked(id, document, options));
  }

  async renameProject(id: string, name: string): Promise<MotionProjectSummary> {
    const cleaned = name.trim();
    if (!cleaned) throw new MotionProjectError('Project name cannot be empty.', 'MOTION_PROJECT_NAME_EMPTY');
    const opened = await this.openProject(id);
    const updated: MotionDocument = {
      ...opened.document,
      revision: opened.document.revision + 1,
      meta: { ...opened.document.meta, name: cleaned, updatedAt: this.now().toISOString() },
    };
    await this.saveProject(id, updated, { forceBackup: true });
    return this.getSummary(id)!;
  }

  async locateProject(id: string, directory: string): Promise<MotionProjectSummary> {
    const canonical = path.join(directory, 'project.json');
    let document: MotionDocument;
    try {
      document = parseMotionDocument(JSON.parse(await fs.readFile(canonical, 'utf8')));
    } catch (error) {
      throw new MotionProjectError(`The selected folder does not contain a valid Motion project: ${error instanceof Error ? error.message : String(error)}`, 'MOTION_PROJECT_INVALID');
    }
    if (document.meta.id !== id) throw new MotionProjectError('The selected project id does not match the missing project.', 'MOTION_PROJECT_ID_MISMATCH');
    this.index.upsert(this.toIndexRow(id, directory, document));
    return this.getSummary(id)!;
  }

  async duplicateProject(id: string): Promise<MotionProjectSummary> {
    const opened = await this.openProject(id);
    const duplicateId = this.createId();
    const sourcePath = this.projectPath(id);
    const destination = this.projectPath(duplicateId);
    await fs.cp(sourcePath, destination, {
      recursive: true,
      filter: (source) => {
        const relative = path.relative(sourcePath, source).split(path.sep);
        return !relative.some((part) => part === 'project.lock' || part === 'project.autosave.json' || part === 'editor-state.json' || part === 'renders' || part === '.staging' || part === '.trash');
      },
    });
    const createdAt = this.now().toISOString();
    const document: MotionDocument = {
      ...opened.document,
      revision: 0,
      meta: { ...opened.document.meta, id: duplicateId, createdAt, updatedAt: createdAt },
    };
    await this.saveProject(duplicateId, document, { forceBackup: true });
    return this.getSummary(duplicateId)!;
  }

  async deleteProject(id: string, trashItem: (projectPath: string) => Promise<void>): Promise<boolean> {
    const row = this.index.get(id);
    if (!row) return false;
    await trashItem(row.path);
    this.index.delete(id);
    return true;
  }

  async rescan(force = false): Promise<MotionProjectSummary[]> {
    await this.initialize();
    if (!force && Date.now() - this.lastRescanAt < 24 * 60 * 60 * 1000) return this.listProjects();
    this.lastRescanAt = Date.now();
    await this.cleanupExpiredProjectFiles();
    const indexed = this.index.list();
    const foundFolders = new Set<string>();
    for (const entry of await fs.readdir(this.projectsDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory() || !isProjectId(entry.name)) continue;
      foundFolders.add(entry.name);
      const directory = path.join(this.projectsDirectory, entry.name);
      try {
        const raw = JSON.parse(await fs.readFile(path.join(directory, 'project.json'), 'utf8')) as Record<string, unknown>;
        const document = parseMotionDocument(raw);
        this.index.upsert(this.toIndexRow(entry.name, directory, document));
      } catch {
        // Keep even an unknown corrupt bundle visible after index loss. The
        // browser can then open its error/repair flow instead of hiding data.
        const existing = this.index.get(entry.name);
        if (existing) {
          this.index.upsert({ ...existing, path: directory, missing: 0 });
        } else {
          const stat = await fs.stat(directory);
          this.index.upsert({
            id: entry.name,
            name: entry.name,
            path: directory,
            scene_count: 1,
            duration: 0,
            width: 1920,
            height: 1080,
            fps: 30,
            thumbnail_path: null,
            last_opened_at: null,
            updated_at: stat.mtime.toISOString(),
            created_at: stat.birthtime.toISOString(),
            missing: 0,
          });
        }
      }
    }
    for (const row of indexed) {
      if (foundFolders.has(row.id)) {
        this.index.markMissing(row.id, false);
        continue;
      }
      const pathExists = await fs.access(row.path).then(() => true, () => false);
      this.index.markMissing(row.id, !pathExists);
    }
    return this.listProjects();
  }

  getSummary(id: string): MotionProjectSummary | undefined {
    const row = this.index.get(id);
    return row ? toSummary(row) : undefined;
  }

  getProjectDirectory(id: string): string {
    return this.projectPath(id);
  }

  async readEditorState(id: string): Promise<unknown | null> {
    try {
      return JSON.parse(await fs.readFile(path.join(this.projectPath(id), 'editor-state.json'), 'utf8'));
    } catch {
      return null;
    }
  }

  async writeEditorState(id: string, value: unknown): Promise<void> {
    let serialized: string;
    try { serialized = `${JSON.stringify(value)}\n`; } catch {
      throw new MotionProjectError('Editor state must be JSON serializable.', 'MOTION_EDITOR_STATE_INVALID');
    }
    if (Buffer.byteLength(serialized, 'utf8') > 256 * 1024) {
      throw new MotionProjectError('Editor state exceeds the 256 KB limit.', 'MOTION_EDITOR_STATE_TOO_LARGE');
    }
    await writeFileAtomic(path.join(this.projectPath(id), 'editor-state.json'), serialized);
  }

  private async saveProjectUnlocked(
    id: string,
    document: MotionDocument,
    options: { forceBackup?: boolean; destructive?: boolean; expectedRevision?: number },
  ): Promise<{ revision: number; savedAt: string; bytes: number }> {
    const projectPath = this.projectPath(id);
    const canonicalPath = path.join(projectPath, 'project.json');
    const sidecarPath = path.join(projectPath, 'project.autosave.json');
    await this.createBundleDirectories(projectPath);
    const release = await properLockfile.lock(projectPath, {
      stale: 30_000,
      update: 5_000,
      retries: 0,
      lockfilePath: path.join(projectPath, 'project.lock'),
    }).catch((error: unknown) => {
      throw new MotionProjectError(`This project is open in another window: ${error instanceof Error ? error.message : String(error)}`, 'MOTION_PROJECT_LOCKED');
    });
    try {
      if (options.expectedRevision !== undefined) {
        const actualRevision = await this.readCanonicalRevision(projectPath).catch(() => null);
        if (actualRevision !== options.expectedRevision) {
          throw new MotionProjectError(
            `The project changed since it was opened (expected revision ${options.expectedRevision}, found ${actualRevision ?? 'unreadable'}). Reopen before saving.`,
            'MOTION_SAVE_CONFLICT',
          );
        }
      }
      const validated = parseMotionDocument(document);
      const serialized = serializeMotionDocument(validated);
      const hash = sha256(serialized);
      const sidecar: AutosaveSidecar = {
        format: 1,
        revision: validated.revision,
        savedAt: this.now().toISOString(),
        sha256: hash,
        document: JSON.parse(serialized),
      };
      await writeFileAtomic(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`);
      await this.maybeBackup(canonicalPath, path.join(projectPath, 'backups'), validated.revision, options);
      await writeFileAtomic(canonicalPath, serialized);
      const written = await fs.readFile(canonicalPath, 'utf8');
      if (sha256(written) !== hash) throw new MotionProjectError('The saved project did not pass read-back hash verification.', 'MOTION_SAVE_VERIFY_FAILED');
      await fs.rm(sidecarPath, { force: true });
      await this.pruneBackups(path.join(projectPath, 'backups')).catch(() => undefined);
      this.index.upsert(this.toIndexRow(id, projectPath, validated));
      return { revision: validated.revision, savedAt: sidecar.savedAt, bytes: Buffer.byteLength(serialized, 'utf8') };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === 'EXDEV' || code === 'EPERM') {
        throw new MotionProjectError(
          `This location does not support a safe atomic save (${code}). The autosave was preserved; save a copy in the local Motion projects folder.`,
          'MOTION_UNSAFE_STORAGE',
        );
      }
      throw error;
    } finally {
      await release();
    }
  }

  private async maybeBackup(
    canonicalPath: string,
    backupsDirectory: string,
    newRevision: number,
    options: { forceBackup?: boolean; destructive?: boolean },
  ): Promise<void> {
    let current: string;
    try { current = await fs.readFile(canonicalPath, 'utf8'); } catch { return; }
    let oldRevision = -1;
    try { oldRevision = parseMotionDocument(JSON.parse(current)).revision; } catch { /* preserve unreadable canonical; don't copy a known-invalid file */ return; }
    await fs.mkdir(backupsDirectory, { recursive: true });
    const backups = (await fs.readdir(backupsDirectory)).filter((name) => /^project-\d+\.json$/.test(name)).sort((a, b) => Number(b.match(/\d+/)?.[0]) - Number(a.match(/\d+/)?.[0]));
    const newest = backups[0];
    const newestPath = newest ? path.join(backupsDirectory, newest) : undefined;
    const elapsed = newestPath ? this.now().getTime() - (await fs.stat(newestPath)).mtimeMs : Infinity;
    const previousBackupRevision = newest ? Number(newest.match(/\d+/)?.[0]) : -1;
    if (!(options.forceBackup || options.destructive || elapsed > BACKUP_INTERVAL_MS || newRevision - previousBackupRevision > BACKUP_REVISION_DELTA)) return;
    await writeFileAtomic(path.join(backupsDirectory, `project-${oldRevision}.json`), current);
  }

  private async pruneBackups(backupsDirectory: string): Promise<void> {
    const ordered = (await fs.readdir(backupsDirectory)).filter((name) => /^project-\d+\.json$/.test(name)).sort((a, b) => Number(b.match(/\d+/)?.[0]) - Number(a.match(/\d+/)?.[0]));
    await Promise.all(ordered.slice(BACKUP_LIMIT).map((name) => fs.rm(path.join(backupsDirectory, name), { force: true })));
  }

  private async cleanupExpiredProjectFiles(): Promise<void> {
    const now = this.now().getTime();
    const projects = await fs.readdir(this.projectsDirectory, { withFileTypes: true });
    for (const project of projects) {
      if (!project.isDirectory() || !isProjectId(project.name)) continue;
      const root = path.join(this.projectsDirectory, project.name);
      await Promise.all([
        this.removeExpiredEntries(path.join(root, '.staging'), now - 24 * 60 * 60 * 1000),
        this.removeExpiredEntries(path.join(root, '.trash'), now - 7 * 24 * 60 * 60 * 1000),
      ]);
    }
  }

  private async removeExpiredEntries(directory: string, cutoff: number): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
    await Promise.all(entries.map(async (entry) => {
      const itemPath = path.join(directory, entry.name);
      const stat = await fs.lstat(itemPath).catch(() => null);
      if (stat && stat.mtimeMs < cutoff) await fs.rm(itemPath, { recursive: entry.isDirectory(), force: true });
    }));
  }

  private async readSidecar(filePath: string): Promise<{ savedAt: string; revision: number; document: MotionDocument } | null> {
    try {
      const sidecar = JSON.parse(await fs.readFile(filePath, 'utf8')) as AutosaveSidecar;
      if (sidecar.format !== 1 || !Number.isInteger(sidecar.revision) || sha256(serializeMotionDocument(parseMotionDocument(sidecar.document))) !== sidecar.sha256) return null;
      return { savedAt: sidecar.savedAt, revision: sidecar.revision, document: parseMotionDocument(sidecar.document) };
    } catch {
      // Invalid sidecars are retained for inspection and are never silently deleted.
      return null;
    }
  }

  private async readCanonicalRevision(projectPath: string): Promise<number> {
    const document = parseMotionDocument(JSON.parse(await fs.readFile(path.join(projectPath, 'project.json'), 'utf8')));
    return document.revision;
  }

  private async isWritable(directory: string): Promise<boolean> {
    try { await fs.access(directory, 2); return true; } catch { return false; }
  }

  private async createBundleDirectories(projectPath: string): Promise<void> {
    await Promise.all([
      fs.mkdir(projectPath, { recursive: true }),
      fs.mkdir(path.join(projectPath, 'backups'), { recursive: true }),
      fs.mkdir(path.join(projectPath, 'assets'), { recursive: true }),
      fs.mkdir(path.join(projectPath, 'renders'), { recursive: true }),
      fs.mkdir(path.join(projectPath, '.staging'), { recursive: true }),
      fs.mkdir(path.join(projectPath, '.trash'), { recursive: true }),
    ]);
  }

  private projectPath(id: string): string {
    if (!isProjectId(id)) throw new MotionProjectError(`Invalid Motion project id "${id}".`, 'MOTION_PROJECT_ID_INVALID');
    return this.index.get(id)?.path ?? path.join(this.projectsDirectory, id);
  }

  private toIndexRow(
    id: string,
    projectPath: string,
    doc: MotionDocument,
    lastOpenedAt: string | null = this.index.get(id)?.last_opened_at ?? null,
  ): MotionProjectIndexRow {
    return {
      id,
      name: doc.meta.name,
      path: projectPath,
      scene_count: doc.scenes.length,
      duration: doc.timeline.duration,
      width: doc.meta.output.width,
      height: doc.meta.output.height,
      fps: doc.meta.output.fps,
      thumbnail_path: null,
      last_opened_at: lastOpenedAt,
      updated_at: doc.meta.updatedAt,
      created_at: doc.meta.createdAt,
      missing: 0,
    };
  }

  private enqueue<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const current = queues.get(id) ?? Promise.resolve();
    const next = current.catch(() => undefined).then(operation);
    queues.set(id, next);
    return next.finally(() => { if (queues.get(id) === next) queues.delete(id); });
  }
}

function toSummary(row: MotionProjectIndexRow): MotionProjectSummary {
  return {
    id: row.id, name: row.name, path: row.path, sceneCount: row.scene_count,
    duration: row.duration, width: row.width, height: row.height, fps: row.fps,
    thumbnailUrl: null,
    createdAt: row.created_at, updatedAt: row.updated_at, missing: row.missing === 1,
    lastOpenedAt: row.last_opened_at,
    latestRender: null,
  };
}

function isProjectId(id: string): boolean {
  return /^prj_[a-zA-Z0-9_-]{6,64}$/.test(id);
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
