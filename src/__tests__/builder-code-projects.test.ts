/**
 * __tests__/builder-code-projects.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Filesystem safety for Builder-created Git codebases; these tests use a real
 * temporary parent so directory creation and Git initialization are exercised.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createGitCodeProjectDirectory } from '@/main/builder/code-projects';

describe('createGitCodeProjectDirectory', () => {
  let parent: string;

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), 'qeda-code-project-'));
  });

  afterEach(async () => {
    await fs.rm(parent, { recursive: true, force: true });
  });

  it('creates a Git repository with a reviewable initial commit', async () => {
    const result = await createGitCodeProjectDirectory({
      parentDirectory: parent,
      name: 'my-app',
    });

    expect(result.directory).toBe(path.join(parent, 'my-app'));
    expect(
      await fs.readFile(path.join(result.directory, 'README.md'), 'utf8'),
    ).toContain('# my-app');
    expect(await fs.stat(path.join(result.directory, '.git'))).toBeDefined();
  });

  it('does not overwrite an existing destination', async () => {
    const destination = path.join(parent, 'already-here');
    await fs.mkdir(destination);
    await fs.writeFile(path.join(destination, 'keep.txt'), 'user data');

    await expect(
      createGitCodeProjectDirectory({
        parentDirectory: parent,
        name: 'already-here',
      }),
    ).rejects.toThrow();
    await expect(
      fs.readFile(path.join(destination, 'keep.txt'), 'utf8'),
    ).resolves.toBe('user data');
  });
});
