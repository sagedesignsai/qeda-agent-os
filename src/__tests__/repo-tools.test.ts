/**
 * __tests__/repo-tools.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The read-only repository tools: gitStatus, gitLog, gitDiffStat, grepSearch.
 *
 * These run against a REAL git repository in a temp directory rather than a
 * mock, because the thing most likely to break is the interaction between the
 * porcelain output format, the filesystem, and the path-containment guard —
 * none of which a mock would exercise.
 *
 * The security-relevant cases (symlink escape, required path, truncation
 * reporting) are asserted here rather than left to review, per spec §6.1.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repoTools } from '../main/tools/repo';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Invoke a tool the way the SDK does: `execute(input, options)`. */
function run(tool: unknown, input: unknown): Promise<any> {
  return (tool as { execute: (i: unknown, o: unknown) => Promise<any> }).execute(
    input,
    { toolCallId: 'test', messages: [] },
  );
}

let repo: string;

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

beforeEach(() => {
  repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vellum-repo-')));
  git(['init', '-b', 'main']);
  write('README.md', '# Fixture\n\nalpha beta gamma\n');
  write('src/app.ts', 'export const needle = 1;\n');
  write('src/nested/deep.ts', '// needle in a nested file\n');
  write('node_modules/pkg/index.js', 'const needle = "should not be found";\n');
  git(['add', '-A']);
  git(['commit', '-m', 'initial commit']);
});

afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

describe('gitStatus', () => {
  it('reports a clean tree on a fresh repository', async () => {
    const result = await run(repoTools.gitStatus, { path: repo });
    expect(result.success).toBe(true);
    expect(result.branch).toBe('main');
    expect(result.clean).toBe(true);
    expect(result.changedFileCount).toBe(0);
  });

  it('reports an unstaged modification', async () => {
    write('README.md', '# Fixture\n\nalpha beta DELTA\n');
    const result = await run(repoTools.gitStatus, { path: repo });
    expect(result.success).toBe(true);
    expect(result.clean).toBe(false);
    expect(result.unstaged).toBe(1);
    expect(result.changes.length).toBeGreaterThan(0);
  });

  it('reports a staged addition', async () => {
    write('new.txt', 'fresh\n');
    git(['add', 'new.txt']);
    const result = await run(repoTools.gitStatus, { path: repo });
    expect(result.staged).toBe(1);
  });

  it('fails cleanly when the path is not a repository', async () => {
    const notARepo = fs.mkdtempSync(path.join(os.tmpdir(), 'vellum-plain-'));
    try {
      const result = await run(repoTools.gitStatus, { path: notARepo });
      expect(result.success).toBe(false);
      expect(typeof result.error).toBe('string');
    } finally {
      fs.rmSync(notARepo, { recursive: true, force: true });
    }
  });

  it('fails cleanly when the path does not exist', async () => {
    const result = await run(repoTools.gitStatus, { path: path.join(repo, 'nope') });
    expect(result.success).toBe(false);
  });
});

describe('gitLog', () => {
  it('lists commits with sha, author and subject', async () => {
    const result = await run(repoTools.gitLog, { path: repo, count: 5 });
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

    const scoped = await run(repoTools.gitLog, { path: repo, file: 'README.md' });
    expect(scoped.count).toBe(2);

    const unscopedToOther = await run(repoTools.gitLog, { path: repo, file: 'src/app.ts' });
    expect(unscopedToOther.count).toBe(1);
    expect(unscopedToOther.commits[0].subject).toBe('initial commit');
  });
});

describe('gitDiffStat', () => {
  it('summarises uncommitted changes as added/removed counts', async () => {
    write('src/app.ts', 'export const needle = 1;\nexport const extra = 2;\n');
    const result = await run(repoTools.gitDiffStat, { path: repo });
    expect(result.success).toBe(true);
    expect(result.changedFileCount).toBe(1);
    const file = result.files.find((f: { file: string }) => f.file.endsWith('app.ts'));
    expect(file.added).toBe(1);
    expect(file.removed).toBe(0);
  });

  it('diffs against a ref', async () => {
    write('src/app.ts', 'export const needle = 2;\n');
    git(['add', '-A']);
    git(['commit', '-m', 'second']);

    const result = await run(repoTools.gitDiffStat, { path: repo, ref: 'HEAD~1' });
    expect(result.success).toBe(true);
    expect(result.ref).toBe('HEAD~1');
    expect(result.changedFileCount).toBeGreaterThan(0);
  });
});

describe('grepSearch', () => {
  it('finds matches and groups them by file with line numbers', async () => {
    const result = await run(repoTools.grepSearch, { path: repo, pattern: 'needle' });
    expect(result.success).toBe(true);
    expect(result.matchCount).toBe(2);
    expect(result.truncated).toBe(false);
    const files = result.results.map((r: { file: string }) => r.file).sort();
    expect(files).toEqual(['src/app.ts', 'src/nested/deep.ts']);
  });

  it('never searches node_modules or .git', async () => {
    const result = await run(repoTools.grepSearch, { path: repo, pattern: 'should not be found' });
    expect(result.matchCount).toBe(0);
  });

  it('honours a file-name filter', async () => {
    const result = await run(repoTools.grepSearch, {
      path: repo,
      pattern: 'needle',
      include: '.ts',
    });
    // Both fixtures are .ts; the node_modules one is .js and stays excluded anyway.
    expect(result.matchCount).toBe(2);
  });

  it('reports truncation rather than silently capping', async () => {
    for (let i = 0; i < 10; i++) write(`many/f${i}.ts`, `needle ${i}\n`);

    const result = await run(repoTools.grepSearch, {
      path: repo,
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
    const result = await run(repoTools.grepSearch, { path: repo, pattern: 'needle' });
    const hit = result.results[0].matches[0];
    expect(hit.text.length).toBeLessThanOrEqual(240);
  });

  it('skips binary files', async () => {
    fs.writeFileSync(path.join(repo, 'blob.bin'), Buffer.from([0x00, 0x01, 0x00]));
    const result = await run(repoTools.grepSearch, { path: repo, pattern: 'needle' });
    expect(result.success).toBe(true);
    expect(result.matchCount).toBe(2);
  });

  it('refuses to follow a symlink out of the tree', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'vellum-outside-'));
    try {
      fs.writeFileSync(path.join(outside, 'secret.txt'), 'needle in a secret file\n');
      fs.symlinkSync(outside, path.join(repo, 'escape'));

      const result = await run(repoTools.grepSearch, { path: repo, pattern: 'needle' });
      expect(result.success).toBe(true);
      // The secret is outside the root and must not be reachable through it.
      expect(result.matchCount).toBe(2);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('returns no matches rather than failing when there are none', async () => {
    const result = await run(repoTools.grepSearch, { path: repo, pattern: 'zzz-absent' });
    expect(result.success).toBe(true);
    expect(result.matchCount).toBe(0);
    expect(result.truncated).toBe(false);
  });
});
