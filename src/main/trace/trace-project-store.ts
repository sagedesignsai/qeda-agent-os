/**
 * main/trace/trace-project-store.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Durable Nova Trace project bundles.
 *
 * The folder is the source of truth and the SQLite index is a rebuildable
 * catalog — the same contract as the 3D Motion store, kept in its own directory
 * and its own table so the two systems never share documents.
 *
 * Writes are atomic (write-file-atomic) and revision-checked: a save carrying a
 * stale `expectedRevision` is rejected instead of silently clobbering a newer
 * document.
 */

import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path';

import writeFileAtomic from 'write-file-atomic'

import { createBlankTraceProject } from '../../lib/trace/defaults'
import { migrateTraceProject } from '../../lib/trace/migrate'
import type { TraceProject } from '../../lib/trace/types'
import type { TraceProjectIndex, TraceProjectIndexRow } from './trace-project-index.js'

const PROJECT_FILENAME = 'project.json'

export type TraceProjectSummary = {
  id: string
  name: string
  path: string
  width: number
  height: number
  durationMs: number
  fps: number
  elementCount: number
  sceneCount: number
  revision: number
  thumbnailSvg: string | null
  createdAt: string
  updatedAt: string
  lastOpenedAt: string | null
  missing: boolean
}

export type TraceOpenResult = {
  project: TraceProject
  path: string
  revision: number
}

export class TraceProjectError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
    this.name = 'TraceProjectError'
  }
}

type ProjectFile = {
  format: 1
  revision: number
  savedAt: string
  project: TraceProject
}

type IndexPort = Pick<
  TraceProjectIndex,
  'list' | 'get' | 'upsert' | 'markMissing' | 'touch' | 'delete'
>

export class TraceProjectStore {
  readonly projectsDirectory: string

  constructor(
    readonly traceDirectory: string,
    private readonly index: IndexPort,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = () => `trc_${randomBytes(10).toString('hex')}`,
  ) {
    this.projectsDirectory = path.join(traceDirectory, 'projects')
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.projectsDirectory, { recursive: true })
  }

  listProjects(includeMissing = true): TraceProjectSummary[] {
    return this.index
      .list()
      .filter((row) => includeMissing || !row.missing)
      .map(toSummary)
  }

  /** Reconcile the catalog with what is actually on disk. */
  async rescan(): Promise<void> {
    await this.initialize()
    for (const row of this.index.list()) {
      const exists = await fs
        .access(path.join(row.path, PROJECT_FILENAME))
        .then(() => true)
        .catch(() => false)
      if (!exists) this.index.markMissing(row.id, true)
    }
  }

  async createProject(
    options: { name?: string; project?: TraceProject } = {},
  ): Promise<TraceProjectSummary> {
    await this.initialize()

    const id = this.createId()
    const directory = this.projectPath(id)
    await fs.mkdir(directory, { recursive: true })

    const now = this.now().toISOString()
    const base = options.project ?? createBlankTraceProject()
    const project: TraceProject = {
      ...base,
      id,
      name: options.name?.trim() || base.name || 'Untitled Trace',
    }

    const file: ProjectFile = { format: 1, revision: 0, savedAt: now, project }
    await this.writeBundle(directory, file)

    const row = toRow(file, directory, now, now)
    this.index.upsert(row)

    return toSummary(row)
  }

  async openProject(id: string): Promise<TraceOpenResult> {
    const row = this.index.get(id)
    const directory = row?.path ?? this.projectPath(id)
    const file = await this.readBundle(directory)

    this.index.touch(id, this.now().toISOString())

    return { project: migrateTraceProject(file.project), path: directory, revision: file.revision }
  }

  async saveProject(
    id: string,
    project: TraceProject,
    options: { expectedRevision?: number } = {},
  ): Promise<{ revision: number; savedAt: string }> {
    const row = this.index.get(id)
    const directory = row?.path ?? this.projectPath(id)
    const current = await this.readBundle(directory)

    if (
      options.expectedRevision !== undefined &&
      options.expectedRevision !== current.revision
    ) {
      throw new TraceProjectError(
        `Trace project "${id}" changed on disk (expected revision ${options.expectedRevision}, found ${current.revision}).`,
        'TRACE_REVISION_CONFLICT',
      )
    }

    const savedAt = this.now().toISOString()
    const file: ProjectFile = {
      format: 1,
      revision: current.revision + 1,
      savedAt,
      project: { ...project, id },
    }
    await this.writeBundle(directory, file)

    this.index.upsert(toRow(file, directory, row?.created_at ?? savedAt, savedAt))

    return { revision: file.revision, savedAt }
  }

  async renameProject(id: string, name: string): Promise<TraceProjectSummary> {
    const opened = await this.openProject(id)
    const trimmed = name.trim()
    if (!trimmed) {
      throw new TraceProjectError('A Trace project name cannot be empty.', 'TRACE_INVALID_NAME')
    }
    await this.saveProject(id, { ...opened.project, name: trimmed })

    const row = this.index.get(id)
    if (!row) {
      throw new TraceProjectError(`Trace project "${id}" is not indexed.`, 'TRACE_PROJECT_UNKNOWN')
    }
    return toSummary(row)
  }

  async deleteProject(id: string): Promise<boolean> {
    const row = this.index.get(id)
    if (!row) return false

    await fs.rm(row.path, { recursive: true, force: true })
    this.index.delete(id)
    return true
  }

  projectPath(id: string): string {
    return path.join(this.projectsDirectory, id)
  }

  private async writeBundle(directory: string, file: ProjectFile): Promise<void> {
    await fs.mkdir(directory, { recursive: true })
    await writeFileAtomic(
      path.join(directory, PROJECT_FILENAME),
      `${JSON.stringify(file, null, 2)}\n`,
    )
  }

  private async readBundle(directory: string): Promise<ProjectFile> {
    const filePath = path.join(directory, PROJECT_FILENAME)
    let raw: string
    try {
      raw = await fs.readFile(filePath, 'utf8')
    } catch {
      throw new TraceProjectError(
        `Trace project file is missing at ${filePath}.`,
        'TRACE_PROJECT_MISSING',
      )
    }

    try {
      const parsed = JSON.parse(raw) as Partial<ProjectFile>
      if (!parsed || typeof parsed !== 'object' || !parsed.project) {
        throw new Error('no project payload')
      }
      return {
        format: 1,
        revision: typeof parsed.revision === 'number' ? parsed.revision : 0,
        savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : this.now().toISOString(),
        project: parsed.project,
      }
    } catch {
      throw new TraceProjectError(
        `Trace project file at ${filePath} is not valid JSON.`,
        'TRACE_PROJECT_UNREADABLE',
      )
    }
  }
}

function toRow(
  file: ProjectFile,
  directory: string,
  createdAt: string,
  updatedAt: string,
): TraceProjectIndexRow {
  const project = file.project
  return {
    id: project.id,
    name: project.name,
    path: directory,
    width: project.width,
    height: project.height,
    duration_ms: project.durationMs,
    fps: project.fps,
    element_count: Object.keys(project.elements ?? {}).length,
    scene_count: project.storyboard?.scenes.length ?? 1,
    revision: file.revision,
    thumbnail_svg: null,
    last_opened_at: null,
    updated_at: updatedAt,
    created_at: createdAt,
    missing: 0,
  }
}

function toSummary(row: TraceProjectIndexRow): TraceProjectSummary {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    fps: row.fps,
    elementCount: row.element_count,
    sceneCount: row.scene_count,
    revision: row.revision,
    thumbnailSvg: row.thumbnail_svg,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at,
    missing: Boolean(row.missing),
  }
}
