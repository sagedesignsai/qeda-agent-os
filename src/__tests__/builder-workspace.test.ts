/**
 * __tests__/builder-workspace.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Builder workspace boundary. These run against a REAL git repository in a
 * temp directory, because the thing that matters is whether a chosen folder can
 * be trusted as a reviewable, reversible unit — a mocked git would test the mock.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectBuilderWorkspace } from '@/main/builder/workspace';

let repo: string;
let plain: string;

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

beforeEach(() => {
  repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'builder-repo-')));
  git(['init', '-b', 'main']);
  fs.writeFileSync(path.join(repo, 'README.md'), '# Fixture\n', 'utf8');
  git(['add', '-A']);
  git(['commit', '-m', 'initial commit']);

  plain = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'builder-plain-')),
  );
});

afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
  fs.rmSync(plain, { recursive: true, force: true });
});

describe('inspectBuilderWorkspace', () => {
  it('resolves a repository root, branch, and a clean tree', async () => {
    const workspace = await inspectBuilderWorkspace(repo);
    expect(workspace.directory).toBe(repo);
    expect(workspace.name).toBe(path.basename(repo));
    expect(workspace.branch).toBe('main');
    expect(workspace.dirty).toBe(false);
    expect(workspace.changedFileCount).toBe(0);
  });

  it('reports a dirty tree with the number of changed entries', async () => {
    fs.writeFileSync(path.join(repo, 'README.md'), '# Fixture\nchanged\n');
    fs.writeFileSync(path.join(repo, 'untracked.txt'), 'new\n');
    const workspace = await inspectBuilderWorkspace(repo);
    expect(workspace.dirty).toBe(true);
    expect(workspace.changedFileCount).toBe(2);
  });

  it('resolves a subdirectory to the canonical repository root', async () => {
    const nested = path.join(repo, 'src', 'nested');
    fs.mkdirSync(nested, { recursive: true });
    const workspace = await inspectBuilderWorkspace(nested);
    expect(workspace.directory).toBe(repo);
  });

  it('refuses a folder that is not a git repository', async () => {
    await expect(inspectBuilderWorkspace(plain)).rejects.toThrow(
      /not a git repository/,
    );
  });

  it('refuses a folder that does not exist', async () => {
    await expect(
      inspectBuilderWorkspace(path.join(plain, 'missing')),
    ).rejects.toThrow(/does not exist/);
  });

  it('refuses an empty selection', async () => {
    await expect(inspectBuilderWorkspace('   ')).rejects.toThrow(
      /Choose a project folder/,
    );
  });
});
