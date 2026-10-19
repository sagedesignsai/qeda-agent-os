/**
 * __tests__/builder-review-loop.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The review loop's ground truth: what changed, what a Keep actually means,
 * and what the workspace will not let a file read escape to. These run against
 * a real git repository and a real worktree — a mocked git would test the
 * mock, and the bugs this file guards against (misclassified staged files,
 * zero-line-count untracked files, a second Keep re-applying the same patch,
 * a symlink escaping the workspace) only exist in the real thing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyWorktreeChanges,
  createBuilderWorktree,
  discardWorktreeChanges,
  readWorkspaceChanges,
  readWorkspaceFileContent,
  removeBuilderWorktree,
} from '@/main/builder/workspace';

let repo: string;
let worktree: string;
let outside: string;

function git(args: string[], cwd: string): void {
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

beforeEach(async () => {
  repo = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'builder-review-repo-')),
  );
  git(['init', '-b', 'main'], repo);
  fs.writeFileSync(path.join(repo, 'modified.txt'), 'one\ntwo\n', 'utf8');
  fs.writeFileSync(path.join(repo, 'deleted.txt'), 'gone\n', 'utf8');
  git(['add', '-A'], repo);
  git(['commit', '-m', 'initial commit'], repo);

  outside = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'builder-review-outside-')),
  );
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'outside\n', 'utf8');

  worktree = await createBuilderWorktree(repo, 'ses-review-loop');
});

afterEach(async () => {
  if (worktree) {
    await removeBuilderWorktree(repo, worktree).catch(() => undefined);
  }
  fs.rmSync(repo, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

describe('readWorkspaceChanges', () => {
  it('classifies added, modified, deleted, and staged files with real counts', async () => {
    fs.writeFileSync(path.join(worktree, 'modified.txt'), 'one\nTWO\n', 'utf8');
    fs.rmSync(path.join(worktree, 'deleted.txt'));
    fs.writeFileSync(path.join(worktree, 'added.txt'), 'a\nb\nc\n', 'utf8');
    fs.writeFileSync(path.join(worktree, 'staged.txt'), 's1\ns2\n', 'utf8');
    git(['add', 'staged.txt'], worktree);

    const changes = await readWorkspaceChanges(worktree);
    const byPath = new Map(changes.map((change) => [change.path, change]));

    const added = byPath.get('added.txt');
    expect(added?.kind).toBe('added');
    expect(added?.additions).toBe(3);
    // An untracked file must not render as +0 and look empty.
    expect(added?.diff).toContain('+c');

    const modified = byPath.get('modified.txt');
    expect(modified?.kind).toBe('modified');
    expect(modified?.additions).toBe(1);
    expect(modified?.deletions).toBe(1);
    expect(modified?.diff).toContain('+TWO');

    const deleted = byPath.get('deleted.txt');
    expect(deleted?.kind).toBe('deleted');
    expect(deleted?.deletions).toBe(1);
    // The reviewer needs to see what was removed, not just that a file went away.
    expect(deleted?.diff).toContain('-gone');

    const staged = byPath.get('staged.txt');
    expect(staged?.kind).toBe('added');
    expect(staged?.additions).toBe(2);
  });
});

describe('applyWorktreeChanges', () => {
  it('applies to the source tree and advances the review baseline so Keep is repeatable', async () => {
    fs.writeFileSync(
      path.join(worktree, 'modified.txt'),
      'one\nkept\n',
      'utf8',
    );

    const firstPaths = await applyWorktreeChanges(repo, worktree);
    expect(firstPaths).toEqual(['modified.txt']);
    expect(fs.readFileSync(path.join(repo, 'modified.txt'), 'utf8')).toBe(
      'one\nkept\n',
    );
    // The worktree is committed on its own detached HEAD, so the next review
    // starts from the kept state rather than re-offering the same patch.
    expect(await readWorkspaceChanges(worktree)).toEqual([]);

    expect(await applyWorktreeChanges(repo, worktree)).toEqual([]);

    fs.writeFileSync(
      path.join(worktree, 'modified.txt'),
      'one\nkept-again\n',
      'utf8',
    );
    expect(await applyWorktreeChanges(repo, worktree)).toEqual([
      'modified.txt',
    ]);
    expect(fs.readFileSync(path.join(repo, 'modified.txt'), 'utf8')).toBe(
      'one\nkept-again\n',
    );

    fs.writeFileSync(
      path.join(worktree, 'modified.txt'),
      'one\nunkept\n',
      'utf8',
    );
    await discardWorktreeChanges(worktree);
    // Discard resets to the last kept baseline, not the original commit.
    expect(fs.readFileSync(path.join(worktree, 'modified.txt'), 'utf8')).toBe(
      'one\nkept-again\n',
    );
  });
});

describe('readWorkspaceFileContent', () => {
  it('reads a normal file', async () => {
    const result = await readWorkspaceFileContent(repo, 'modified.txt');
    expect(result.content).toBe('one\ntwo\n');
  });

  it('refuses a symlink that points outside the workspace', async () => {
    fs.symlinkSync(
      path.join(outside, 'secret.txt'),
      path.join(repo, 'escape-link.txt'),
    );

    await expect(
      readWorkspaceFileContent(repo, 'escape-link.txt'),
    ).rejects.toThrow(/outside the workspace/);
  });

  it('refuses a path through a symlinked directory outside the workspace', async () => {
    fs.symlinkSync(outside, path.join(repo, 'escape-dir'));

    await expect(
      readWorkspaceFileContent(repo, 'escape-dir/secret.txt'),
    ).rejects.toThrow(/outside the workspace/);
  });
});
