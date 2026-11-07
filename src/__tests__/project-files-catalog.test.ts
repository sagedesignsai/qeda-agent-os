/**
 * __tests__/project-files-catalog.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Project File Browser's scanner.
 *
 * Fixtures are real temp folders wired into an in-memory database as a project's
 * `repo_path`, linked code project, and managed assets folder. The assertions are
 * the security-relevant ones — hidden/build directories skipped, symlinks not
 * followed, another project's take never leaks in — plus the catalog semantics
 * that matter to the UI: stable ids across rescans, dedupe by path, missing files
 * marked rather than dropped, and deleted database references cleaned up.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { useTestDatabase } from '../main/db/client';
import { applyMigrations } from '../main/db/schema';
import { createProject } from '../main/db/projects';
import { createCodeProject } from '../main/db/code-projects';
import { listProjectFiles, projectFileCounts } from '../main/db/project-files';
import { ensureProjectFileCatalog } from '../main/services/project-file-catalog';

function write(filePath: string, contents = 'x'): string {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  return filePath;
}

function insertTake(
  db: Database.Database,
  input: {
    id: string;
    projectId: string | null;
    videoPath: string;
    audioPath?: string | null;
    overlays?: unknown;
  },
): void {
  db.prepare(
    `INSERT INTO studio_takes
       (id, project_id, title, video_path, audio_path, duration_ms, overlays_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.projectId,
    'Take',
    input.videoPath,
    input.audioPath ?? null,
    1000,
    input.overlays ? JSON.stringify(input.overlays) : null,
  );
}

describe('project file catalog', () => {
  let db: Database.Database;
  let root: string;
  let assetsRoot: string;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db);
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'qeda-project-files-'));
    assetsRoot = path.join(root, 'userData', 'assets');
  });

  afterEach(() => {
    useTestDatabase(null as unknown as Database.Database);
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function scan(projectId: string) {
    return ensureProjectFileCatalog(projectId, {
      assetsRoot,
      refresh: true,
    });
  }

  it('scans the repo recursively while skipping hidden and build folders', async () => {
    const repo = path.join(root, 'repo');
    write(path.join(repo, 'src', 'index.ts'));
    write(path.join(repo, 'docs', 'brief.md'));
    write(path.join(repo, '.secret.txt'));
    write(path.join(repo, '.hidden', 'inside.txt'));
    write(path.join(repo, 'node_modules', 'pkg', 'index.js'));
    write(path.join(repo, 'dist', 'bundle.js'));

    const project = createProject({ name: 'Alpha', repo_path: repo });
    await scan(project.id);

    const { files } = listProjectFiles({
      projectId: project.id,
      includeMissing: true,
      limit: 500,
    });
    const names = files.map((file) => file.name).sort();

    expect(names).toEqual(['brief.md', 'index.ts']);
    expect(files.every((file) => file.primarySource === 'repo')).toBe(true);
    expect(files.find((file) => file.name === 'index.ts')).toMatchObject({
      relativePath: 'src/index.ts',
      kind: 'text',
      missing: false,
    });
  });

  it('respects .gitignore in a git work tree', async () => {
    const repo = path.join(root, 'git-repo');
    write(path.join(repo, 'keep.txt'));
    write(path.join(repo, 'ignored.txt'));
    write(path.join(repo, '.gitignore'), 'ignored.txt\n');
    execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' });

    const project = createProject({ name: 'Git', repo_path: repo });
    await scan(project.id);

    const { files } = listProjectFiles({ projectId: project.id, limit: 100 });
    const names = files.map((file) => file.name);

    expect(names).toContain('keep.txt');
    expect(names).not.toContain('ignored.txt');
  });

  it('never follows symlinks out of a root', async () => {
    const repo = path.join(root, 'repo');
    write(path.join(repo, 'real.txt'));
    const outside = write(path.join(root, 'outside.txt'));
    fs.symlinkSync(outside, path.join(repo, 'escape.txt'));

    const project = createProject({ name: 'Symlinks', repo_path: repo });
    await scan(project.id);

    const { files } = listProjectFiles({ projectId: project.id, limit: 100 });
    expect(files.map((file) => file.name)).toEqual(['real.txt']);
  });

  it('includes linked code projects and the managed assets folder', async () => {
    const repo = path.join(root, 'repo');
    const code = path.join(root, 'code-web');
    write(path.join(repo, 'README.md'));
    write(path.join(code, 'app.tsx'));
    write(path.join(assetsRoot, 'downloaded.png'));

    const project = createProject({ name: 'Roots', repo_path: repo });
    createCodeProject({
      projectId: project.id,
      name: 'web',
      directory: code,
      source: 'existing',
    });

    await scan(project.id);

    const { files } = listProjectFiles({
      projectId: project.id,
      limit: 100,
    });
    const byName = new Map(files.map((file) => [file.name, file]));

    expect(byName.get('README.md')?.primarySource).toBe('repo');
    expect(byName.get('app.tsx')?.primarySource).toBe('code-project');
    expect(byName.get('app.tsx')?.rootKey).toMatch(/^code:/);
    expect(byName.get('downloaded.png')?.primarySource).toBe('assets');
  });

  it('catalogues files the database references, scoped to their project', async () => {
    const mediaDir = path.join(root, 'media');
    const video = write(path.join(mediaDir, 'take.webm'));
    const audio = write(path.join(mediaDir, 'take.wav'));
    const overlay = write(path.join(mediaDir, 'overlay.png'));

    const alpha = createProject({ name: 'Alpha' });
    const beta = createProject({ name: 'Beta' });

    insertTake(db, {
      id: 'take-alpha',
      projectId: alpha.id,
      videoPath: video,
      audioPath: audio,
      overlays: [{ srcPath: overlay }],
    });
    insertTake(db, {
      id: 'take-beta',
      projectId: beta.id,
      videoPath: write(path.join(mediaDir, 'beta.webm')),
    });

    await scan(alpha.id);

    const { files } = listProjectFiles({
      projectId: alpha.id,
      includeMissing: true,
      limit: 100,
    });
    const names = files.map((file) => file.name).sort();

    expect(names).toEqual(['overlay.png', 'take.wav', 'take.webm']);
    expect(files.every((file) => file.primarySource === 'studio-take')).toBe(
      true,
    );
    expect(names).not.toContain('beta.webm');

    const videoEntry = files.find((file) => file.name === 'take.webm');
    expect(videoEntry?.mediaUrl).toMatch(/^qeda-media:\/\/project-file\//);
    expect(videoEntry?.meta).toMatchObject({ studioTakeId: 'take-alpha' });
  });

  it('catalogues message attachments, research files, and indexed chunks', async () => {
    const repo = path.join(root, 'repo');
    const repoFile = write(path.join(repo, 'notes.md'));
    const attachment = write(path.join(root, 'files', 'demand.pdf'));
    const research = write(path.join(root, 'research', 'paper.pdf'));

    const project = createProject({ name: 'Refs', repo_path: repo });

    db.prepare(
      'INSERT INTO correspondence_messages (id, project_id, subject) VALUES (?, ?, ?)',
    ).run('message-1', project.id, 'Demand');
    db.prepare(
      `INSERT INTO message_attachments (id, message_id, kind, path, label)
       VALUES (?, ?, 'file', ?, ?)`,
    ).run('attachment-1', 'message-1', attachment, 'Demand letter');

    db.prepare(
      'INSERT INTO research_runs (id, project_id, question) VALUES (?, ?, ?)',
    ).run('run-1', project.id, 'What?');
    db.prepare(
      `INSERT INTO research_sources (id, run_id, url, title, kind)
       VALUES (?, ?, ?, ?, 'file')`,
    ).run('source-1', 'run-1', `file://${research}`, 'Paper');
    db.prepare(
      `INSERT INTO research_sources (id, run_id, url, title, kind)
       VALUES (?, ?, ?, ?, 'file')`,
    ).run('source-2', 'run-1', 'https://example.com/x.pdf', 'Web');

    db.prepare(
      `INSERT INTO chunks (id, file_path, chunk_index, content, project_id)
       VALUES ('chunk-1', ?, 0, 'body', ?)`,
    ).run(repoFile, project.id);

    await scan(project.id);

    const { files } = listProjectFiles({ projectId: project.id, limit: 100 });
    const byName = new Map(files.map((file) => [file.name, file]));

    expect(byName.get('demand.pdf')?.sources).toContain('attachment');
    expect(byName.get('paper.pdf')?.sources).toContain('research-file');
    expect(byName.has('x.pdf')).toBe(false);

    // The repo file and the chunk are the same file: one row, two sources.
    const notes = byName.get('notes.md');
    expect(notes?.sources).toEqual(expect.arrayContaining(['repo', 'indexed']));
    expect(files.filter((file) => file.name === 'notes.md')).toHaveLength(1);
  });

  it('marks database references whose file vanished instead of hiding them', async () => {
    const missingVideo = path.join(root, 'media', 'gone.webm');
    const project = createProject({ name: 'Missing' });
    insertTake(db, {
      id: 'take-missing',
      projectId: project.id,
      videoPath: missingVideo,
    });

    await scan(project.id);

    const { files } = listProjectFiles({
      projectId: project.id,
      includeMissing: true,
      limit: 100,
    });
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ name: 'gone.webm', missing: true });
    expect(files[0].mediaUrl).toMatch(/^qeda-media:\/\//);
  });

  it('drops a catalog row when its only database reference is deleted', async () => {
    const video = write(path.join(root, 'media', 'take.webm'));
    const project = createProject({ name: 'Cleanup' });
    insertTake(db, {
      id: 'take-1',
      projectId: project.id,
      videoPath: video,
    });

    await scan(project.id);
    expect(
      listProjectFiles({ projectId: project.id, limit: 10 }).files,
    ).toHaveLength(1);

    db.prepare('DELETE FROM studio_takes WHERE id = ?').run('take-1');
    await scan(project.id);

    expect(
      listProjectFiles({ projectId: project.id, limit: 10 }).files,
    ).toHaveLength(0);
  });

  it('keeps the same id across rescans', async () => {
    const repo = path.join(root, 'repo');
    write(path.join(repo, 'stable.txt'));
    const project = createProject({ name: 'Stable', repo_path: repo });

    await scan(project.id);
    const first = listProjectFiles({ projectId: project.id, limit: 10 }).files;
    await scan(project.id);
    const second = listProjectFiles({ projectId: project.id, limit: 10 }).files;

    expect(second[0].id).toBe(first[0].id);
  });

  it('groups files into browsable folders and counts sources', async () => {
    const repo = path.join(root, 'repo');
    write(path.join(repo, 'top.txt'));
    write(path.join(repo, 'src', 'a.ts'));
    write(path.join(repo, 'src', 'deep', 'b.ts'));

    const project = createProject({ name: 'Folders', repo_path: repo });
    await scan(project.id);

    const atRoot = listProjectFiles({
      projectId: project.id,
      source: 'repo',
      directory: '',
      limit: 100,
    });
    expect(atRoot.directories).toEqual([
      { path: 'src', name: 'src', fileCount: 2, sizeBytes: 2 },
    ]);
    expect(atRoot.files.map((file) => file.name)).toEqual(['top.txt']);

    const inSrc = listProjectFiles({
      projectId: project.id,
      source: 'repo',
      directory: 'src',
      limit: 100,
    });
    expect(inSrc.files.map((file) => file.name)).toEqual(['a.ts']);
    expect(inSrc.directories.map((dir) => dir.name)).toEqual(['deep']);

    const counts = projectFileCounts(project.id);
    expect(counts.repo).toBe(3);
  });

  it('restricts a code-project listing to the selected root', async () => {
    const repo = path.join(root, 'repo');
    const web = path.join(root, 'web');
    const api = path.join(root, 'api');
    write(path.join(repo, 'readme.md'));
    write(path.join(web, 'index.html'));
    write(path.join(api, 'server.ts'));

    const project = createProject({ name: 'Multi', repo_path: repo });
    const webProject = createCodeProject({
      projectId: project.id,
      name: 'web',
      directory: web,
      source: 'existing',
    });
    createCodeProject({
      projectId: project.id,
      name: 'api',
      directory: api,
      source: 'existing',
    });

    await scan(project.id);

    const onlyWeb = listProjectFiles({
      projectId: project.id,
      source: 'code-project',
      rootKey: `code:${webProject.id}`,
      limit: 100,
    });
    expect(onlyWeb.files.map((file) => file.name)).toEqual(['index.html']);
  });

  it('restricts the listing to requested extensions', async () => {
    const repo = path.join(root, 'repo');
    write(path.join(repo, 'logo.svg'));
    write(path.join(repo, 'brief.md'));
    write(path.join(repo, 'notes.mdx'));

    const project = createProject({ name: 'Extensions', repo_path: repo });
    await scan(project.id);

    const svgOnly = listProjectFiles({
      projectId: project.id,
      extensions: ['svg'],
      limit: 100,
    });
    expect(svgOnly.files.map((file) => file.name)).toEqual(['logo.svg']);

    // `md` must not also match `mdx`.
    const markdown = listProjectFiles({
      projectId: project.id,
      extensions: ['.md'],
      limit: 100,
    });
    expect(markdown.files.map((file) => file.name)).toEqual(['brief.md']);
  });
});
