/**
 * __tests__/repo-tools.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The read-only repository tools: gitStatus, gitLog, gitDiffStat, grepSearch.
 *
 * These run against a REAL git repository in a temp directory, wired into a
 * real in-memory database as a project's `repo_path`. That combination is
 * deliberate: the thing most likely to break is the resolution from a project id
 * to a working directory, plus the porcelain parsing and the symlink guard. A
 * mock of any one of those would test the mock.
 *
 * The contract under test is that the tools take a PROJECT ID, never a path.
 * The security-relevant cases (no path fallback, symlink escape, truncation
 * reporting) are asserted here rather than left to review, per spec §6.1.
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
import { repoTools } from '../main/tools/repo';

/** Invoke a tool the way the SDK does: `execute(input, options)`. */
function run(tool: unknown, input: unknown): Promise<any> {
  return (
    tool as { execute: (i: unknown, o: unknown) => Promise<any> }
  ).execute(input, { toolCallId: 'test', messages: [] });
}

let db: Database.Database;
let repo: string;
/** A project whose `repo_path` points at the fixture. */
let projectId: string;

function git(args: string[], cwd = repo): void {
  execFileSync('git', args, {
    cwd,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
}

function write(rel: string, content: string): void {
  const full = path.join(repo, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

/** A project with the given repo_path (null = never configured). */
function makeProject(name: string, repoPath: string | null): string {
  return createProject({ name, repo_path: repoPath }).id;
}

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  useTestDatabase(db);

  repo = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'vellum-repo-')),
  );
  git(['init', '-b', 'main']);
  write('README.md', '# Fixture\n\nalpha beta gamma\n');
  write('src/app.ts', 'export const needle = 1;\n');
  write('src/nested/deep.ts', '// needle in a nested file\n');
  write('node_modules/pkg/index.js', 'const needle = "should not be found";\n');
  git(['add', '-A']);
  git(['commit', '-m', 'initial commit']);

  projectId = makeProject('Fixture', repo);
});

afterEach(() => {
  useTestDatabase(null as unknown as Database.Database);
  db.close();
  fs.rmSync(repo, { recursive: true, force: true });
});

describe('gitStatus', () => {
  it('resolves the project id to a repository and reports a clean tree', async () => {
    const result = await run(repoTools.gitStatus, { projectId });
    expect(result.success).toBe(true);
    expect(result.branch).toBe('main');
    expect(result.clean).toBe(true);
    expect(result.projectName).toBe('Fixture');
  });

  it('reports an unstaged modification', async () => {
    write('README.md', '# Fixture\n\nalpha beta DELTA\n');
    const result = await run(repoTools.gitStatus, { projectId });
    expect(result.clean).toBe(false);
    expect(result.unstaged).toBe(1);
  });

  it('reports a staged addition', async () => {
    write('new.txt', 'fresh\n');
    git(['add', 'new.txt']);
    const result = await run(repoTools.gitStatus, { projectId });
    expect(result.staged).toBe(1);
  });

  it('errors legibly for an unknown project id', async () => {
    const result = await run(repoTools.gitStatus, { projectId: 'nope' });
    expect(result.success).toBe(false);
    // The error must point at the recovery path, not just say "failed".
    expect(result.error).toContain('listProjects');
  });

  it('errors legibly when the project has no repository configured', async () => {
    const noRepo = makeProject('No Repo', null);
    const result = await run(repoTools.gitStatus, { projectId: noRepo });
    expect(result.success).toBe(false);
    expect(result.error).toContain('No Repo');
  });

  it('never falls back to a default path when repo_path is unset', async () => {
    // The important negative: a null repo_path must NOT silently read the
    // process working directory (which is the repo during development, so a
    // fallback would look like it worked in every local test run).
    const noRepo = makeProject('No Repo', null);
    const result = await run(repoTools.gitStatus, { projectId: noRepo });
    expect(result.success).toBe(false);
    expect(result.path).toBeUndefined();
  });

  it('errors when the configured path is not a git repository', async () => {
    const plain = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'vellum-plain-')),
    );
    try {
      const p = makeProject('Plain', plain);
      const result = await run(repoTools.gitStatus, { projectId: p });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not a git repository');
    } finally {
      fs.rmSync(plain, { recursive: true, force: true });
    }
  });
});

describe('gitLog', () => {
  it('lists commits with sha, author and subject', async () => {
    const result = await run(repoTools.gitLog, { projectId, count: 5 });
    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.commits[0].subject).toBe('initial commit');
    expect(result.commits[0].author).toBe('Test');
    // Fields must be split, not glued together by the separator.
    expect(result.commits[0].sha).toMatch(/^[0-9a-f]{7,}$/);
  });

  it('scopes to a single file', async () => {
    write('README.md', '# Fixture\n\nchanged\n');
    git(['add', '-A']);
    git(['commit', '-m', 'touch readme']);

    const scoped = await run(repoTools.gitLog, {
      projectId,
      file: 'README.md',
    });
    expect(scoped.count).toBe(2);

    const other = await run(repoTools.gitLog, {
      projectId,
      file: 'src/app.ts',
    });
    expect(other.count).toBe(1);
    expect(other.commits[0].subject).toBe('initial commit');
  });
});

describe('gitDiffStat', () => {
  it('summarises uncommitted changes as added/removed counts', async () => {
    write('src/app.ts', 'export const needle = 1;\nexport const extra = 2;\n');
    const result = await run(repoTools.gitDiffStat, { projectId });
    expect(result.success).toBe(true);
    expect(result.changedFileCount).toBe(1);
    const file = result.files.find((f: { file: string }) =>
      f.file.endsWith('app.ts'),
    );
    expect(file.added).toBe(1);
  });

  it('diffs against a ref', async () => {
    write('src/app.ts', 'export const needle = 2;\n');
    git(['add', '-A']);
    git(['commit', '-m', 'second']);

    const result = await run(repoTools.gitDiffStat, {
      projectId,
      ref: 'HEAD~1',
    });
    expect(result.ref).toBe('HEAD~1');
    expect(result.changedFileCount).toBeGreaterThan(0);
  });
});

describe('grepSearch', () => {
  it('finds matches and groups them by file with line numbers', async () => {
    const result = await run(repoTools.grepSearch, {
      projectId,
      pattern: 'needle',
    });
    expect(result.success).toBe(true);
    expect(result.matchCount).toBe(2);
    expect(result.truncated).toBe(false);
    const files = result.results.map((r: { file: string }) => r.file).sort();
    expect(files).toEqual(['src/app.ts', 'src/nested/deep.ts']);
  });

  it('never searches node_modules or .git', async () => {
    const result = await run(repoTools.grepSearch, {
      projectId,
      pattern: 'should not be found',
    });
    expect(result.matchCount).toBe(0);
  });

  it('honours a file-name filter', async () => {
    const result = await run(repoTools.grepSearch, {
      projectId,
      pattern: 'needle',
      include: '.ts',
    });
    expect(result.matchCount).toBe(2);
  });

  it('reports truncation rather than silently capping', async () => {
    for (let i = 0; i < 10; i++) write(`many/f${i}.ts`, `needle ${i}\n`);

    const result = await run(repoTools.grepSearch, {
      projectId,
      pattern: 'needle',
      maxMatches: 3,
    });
    expect(result.matchCount).toBe(3);
    // A capped result must never read as exhaustive.
    expect(result.truncated).toBe(true);
    expect(result.truncatedReason).toContain('cap');
  });

  it('truncates long lines instead of emitting them whole', async () => {
    write('long.txt', `${'x'.repeat(5_000)}needle\n`);
    const result = await run(repoTools.grepSearch, {
      projectId,
      pattern: 'needle',
    });
    const hit = result.results[0].matches[0];
    expect(hit.text.length).toBeLessThanOrEqual(240);
  });

  it('skips binary files', async () => {
    fs.writeFileSync(
      path.join(repo, 'blob.bin'),
      Buffer.from([0x00, 0x01, 0x00]),
    );
    const result = await run(repoTools.grepSearch, {
      projectId,
      pattern: 'needle',
    });
    expect(result.success).toBe(true);
    expect(result.matchCount).toBe(2);
  });

  it('refuses to follow a symlink out of the project tree', async () => {
    const outside = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'vellum-outside-')),
    );
    try {
      fs.writeFileSync(
        path.join(outside, 'secret.txt'),
        'needle in a secret file\n',
      );
      fs.symlinkSync(outside, path.join(repo, 'escape'));

      const result = await run(repoTools.grepSearch, {
        projectId,
        pattern: 'needle',
      });
      expect(result.success).toBe(true);
      // The secret is outside the project tree and must not be reachable.
      expect(result.matchCount).toBe(2);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('returns no matches rather than failing when there are none', async () => {
    const result = await run(repoTools.grepSearch, {
      projectId,
      pattern: 'zzz-absent',
    });
    expect(result.success).toBe(true);
    expect(result.matchCount).toBe(0);
    expect(result.truncated).toBe(false);
  });
});
