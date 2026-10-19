/**
 * main/builder/workspace.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates the directory a Builder session is bound to before any coding turn
 * can run against it, and reads the file tree / git diff for the workspace
 * surfaces.
 *
 * WHY THIS EXISTS
 * ───────────────
 * OpenCode falls back to an ambient working directory when a session is created
 * without an explicit location. That default is the wrong place to run an agent
 * that can write files and execute commands, so Builder refuses to create a
 * session until it can name a real, canonical, git-backed directory. Git is a
 * hard requirement: without it there is no reviewable unit and no honest way to
 * discard a run's changes.
 *
 * This module is deliberately Electron-free and free of the OpenCode client, so
 * it can be unit-tested against a temp fixture repository.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { BuilderWorkspace } from '../../lib/builder-workspace';

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 10_000;
const MAX_GIT_OUTPUT = 64 * 1024;

interface GitResult {
  success: boolean;
  stdout: string;
  stderr?: string;
}

async function git(cwd: string, args: string[]): Promise<GitResult> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_GIT_OUTPUT,
      encoding: 'utf8',
      // Never let git page or prompt: this is a background validation.
      env: { ...process.env, GIT_PAGER: 'cat', GIT_TERMINAL_PROMPT: '0' },
    });
    return { success: true, stdout };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; message?: string };
    return {
      success: false,
      stdout: e.stdout ?? '',
      stderr: (e.stderr || e.message || String(error)).trim(),
    };
  }
}

/**
 * Resolve `directory` to a canonical git repository root and inspect it.
 *
 * Throws an actionable error — never returns a placeholder — when the path is
 * missing, not a directory, or not inside a git repository. The caller surfaces
 * that message verbatim, so it is written for the user, not the log.
 */
export async function inspectBuilderWorkspace(
  directory: string,
  options?: { autoInit?: boolean },
): Promise<BuilderWorkspace> {
  if (typeof directory !== 'string' || directory.trim() === '') {
    throw new Error('Choose a project folder before starting a build.');
  }

  const input = path.resolve(directory);
  let stat;
  try {
    stat = await fs.stat(input);
  } catch {
    if (options?.autoInit) {
      await fs.mkdir(input, { recursive: true });
      stat = await fs.stat(input);
    } else {
      throw new Error(`That folder does not exist: ${directory}`);
    }
  }
  if (!stat.isDirectory()) {
    throw new Error(`That path is not a folder: ${directory}`);
  }

  // --show-toplevel works from any subdirectory (and from a worktree, where
  // `.git` is a file rather than a directory), so it is more reliable than
  // testing for a `.git` entry by hand.
  let toplevel = await git(input, ['rev-parse', '--show-toplevel']);
  if (!toplevel.success) {
    if (options?.autoInit) {
      // Auto-initialize git repository for fresh Node / code projects
      await git(input, ['init', '-b', 'main']);
      const readmePath = path.join(input, 'README.md');
      const gitignorePath = path.join(input, '.gitignore');
      const name = path.basename(input);

      try {
        await fs.access(readmePath);
      } catch {
        await fs.writeFile(
          readmePath,
          `# ${name}\n\nInitialized by Qeda Builder.\n`,
          'utf8',
        );
      }
      try {
        await fs.access(gitignorePath);
      } catch {
        await fs.writeFile(
          gitignorePath,
          `node_modules/\ndist/\nbuild/\n.env\n.env.local\n.DS_Store\ncoverage/\n`,
          'utf8',
        );
      }

      await git(input, ['add', '-A']);
      await git(input, [
        '-c',
        'user.name=Qeda Builder',
        '-c',
        'user.email=builder@qeda.local',
        'commit',
        '-m',
        'chore: initialize project workspace',
      ]);
      toplevel = await git(input, ['rev-parse', '--show-toplevel']);
    }

    if (!toplevel.success) {
      throw new Error(
        `"${directory}" is not a git repository. Builder needs git so each run can be reviewed and discarded safely.`,
      );
    }
  }

  let root: string;
  try {
    root = await fs.realpath(toplevel.stdout.trim());
  } catch {
    throw new Error(`Could not resolve the repository root for ${directory}.`);
  }

  const branchResult = await git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = branchResult.success ? branchResult.stdout.trim() : '';

  const statusResult = await git(root, ['status', '--porcelain']);
  const changedFileCount = statusResult.success
    ? statusResult.stdout.split('\n').filter((line) => line.trim() !== '')
        .length
    : 0;

  return {
    directory: root,
    name: path.basename(root),
    // `--abbrev-ref HEAD` prints the literal "HEAD" on a detached HEAD.
    branch: branch && branch !== 'HEAD' ? branch : null,
    dirty: changedFileCount > 0,
    changedFileCount,
    worktreePath: null,
  };
}

// ─── Worktree isolation ──────────────────────────────────────────────────────

/**
 * Create an isolated git worktree for a Builder session.
 *
 * The worktree is checked out at HEAD of the current branch so it starts
 * identical to the source tree. All OpenCode turns run inside this directory;
 * the source branch is never modified until the user explicitly keeps the
 * changes via `builder:changes-keep`.
 *
 * Returns the absolute path of the new worktree.
 */
export async function createBuilderWorktree(
  repoDirectory: string,
  sessionId: string,
  parentDirectory?: string,
): Promise<string> {
  // Worktrees must live outside the repository's working tree. A caller that
  // wants sessions to survive an OS temp cleanup can pass a stable parent
  // (the app's userData directory); otherwise fall back to the OS temp dir.
  const root = parentDirectory ?? os.tmpdir();
  await fs.mkdir(root, { recursive: true });
  const worktreeDir = path.join(root, `qeda-builder-${sessionId.slice(0, 12)}`);

  // Remove any leftover worktree from a previous crashed session at the same
  // path before creating a fresh one.
  try {
    await fs.rm(worktreeDir, { recursive: true, force: true });
  } catch {
    // Best-effort: if removal fails the `git worktree add` below will error
    // with a clear message.
  }

  const result = await git(repoDirectory, [
    'worktree',
    'add',
    '--detach',
    worktreeDir,
    'HEAD',
  ]);

  if (!result.success) {
    throw new Error(
      `Could not create an isolated workspace for Builder: ${result.stderr ?? 'git worktree add failed'}.`,
    );
  }

  return worktreeDir;
}

/**
 * Remove the isolated worktree and its directory.
 *
 * This is called on session stop and session discard. It is intentionally
 * best-effort: if the directory is already gone (e.g. the user deleted it
 * manually) it does not throw.
 */
export async function removeBuilderWorktree(
  repoDirectory: string,
  worktreePath: string,
): Promise<void> {
  // `git worktree remove --force` deregisters the worktree and deletes its
  // directory. The `--force` flag is needed because Builder's runs leave
  // uncommitted changes behind.
  await git(repoDirectory, ['worktree', 'remove', '--force', worktreePath]);
  // Belt-and-suspenders: remove the directory in case `git worktree remove`
  // left it behind (e.g. on older git versions).
  try {
    await fs.rm(worktreePath, { recursive: true, force: true });
  } catch {
    // Already gone — nothing to do.
  }
}

// ─── File tree ──────────────────────────────────────────────────────────────

/**
 * Maximum depth of directories we'll recurse into. Deep mono-repos can have
 * thousands of files; this cap keeps the response small enough to be useful.
 */
const MAX_TREE_DEPTH = 6;
/** Maximum total file nodes returned across the whole tree. */
const MAX_TREE_NODES = 2_000;

/**
 * Walk `directory` and return a renderer-safe tree of git-tracked and
 * untracked (but not git-ignored) files.
 *
 * We ask git for the file list rather than doing our own fs walk — this
 * automatically respects .gitignore and includes untracked files the user
 * can still add. The result is then arranged into a nested directory tree.
 */
export async function readWorkspaceFiles(
  directory: string,
): Promise<import('../../lib/builder-workspace.js').BuilderFileNode[]> {
  type BuilderFileNode =
    import('../../lib/builder-workspace.js').BuilderFileNode;
  type BuilderFile = import('../../lib/builder-workspace.js').BuilderFile;
  type BuilderDirectory =
    import('../../lib/builder-workspace.js').BuilderDirectory;

  // `ls-files --others --exclude-standard` gives untracked-but-not-ignored.
  // Combining with tracked files gives the full relevant set.
  const [tracked, untracked] = await Promise.all([
    git(directory, ['ls-files', '--cached', '--others', '--exclude-standard']),
    git(directory, ['ls-files', '--deleted']),
  ]);

  const deletedSet = new Set(
    untracked.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  );

  const allPaths = tracked.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 && !deletedSet.has(line) && !line.includes('\0'),
    )
    .slice(0, MAX_TREE_NODES);

  // Build a nested tree from the flat list.
  interface MutableDir {
    name: string;
    kind: 'directory';
    path: string;
    children: Array<BuilderFile | MutableDir>;
  }

  const root: MutableDir = {
    name: '',
    kind: 'directory',
    path: '',
    children: [],
  };

  for (const relativePath of allPaths) {
    const parts = relativePath.split('/');
    if (parts.length > MAX_TREE_DEPTH) continue;
    let current = root;
    for (let idx = 0; idx < parts.length - 1; idx += 1) {
      const part = parts[idx];
      let dir = current.children.find(
        (child): child is MutableDir =>
          child.kind === 'directory' && child.name === part,
      );
      if (!dir) {
        dir = {
          name: part,
          kind: 'directory',
          path: parts.slice(0, idx + 1).join('/'),
          children: [],
        };
        current.children.push(dir);
      }
      current = dir;
    }
    const fileName = parts[parts.length - 1];
    current.children.push({
      name: fileName,
      kind: 'file',
      path: relativePath,
      language: languageFromPath(relativePath),
    });
  }

  // Sort: directories first, then files, both alphabetically.
  function sortChildren(
    children: Array<BuilderFile | MutableDir>,
  ): BuilderFileNode[] {
    return [...children]
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((child): BuilderFileNode => {
        if (child.kind === 'directory') {
          return {
            kind: 'directory',
            name: child.name,
            path: child.path,
            children: sortChildren(
              child.children,
            ) as BuilderDirectory['children'],
          };
        }
        return child as BuilderFile;
      });
  }

  return sortChildren(root.children);
}

const EXT_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  cpp: 'cpp',
  c: 'c',
  cs: 'csharp',
  php: 'php',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  md: 'markdown',
  mdx: 'markdown',
  svg: 'svg',
  vue: 'vue',
  svelte: 'svelte',
};

function languageFromPath(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return ext ? EXT_LANG[ext] : undefined;
}

// ─── Git diff / changes ─────────────────────────────────────────────────────

const MAX_DIFF_BYTES = 256 * 1024;
const MAX_CHANGED_FILES = 200;

/**
 * Return the list of changed files in `directory` as `BuilderFileChange[]`,
 * including their unified diffs.
 *
 * We use two passes:
 * 1. `git diff --numstat HEAD` for a fast per-file additions/deletions count.
 * 2. `git diff HEAD -- <path>` for the unified diff of each changed file.
 *
 * Untracked files are also included (as 'added') via `git ls-files --others`.
 */
export async function readWorkspaceChanges(
  directory: string,
): Promise<import('../../lib/builder-workspace.js').BuilderFileChange[]> {
  type BuilderFileChange =
    import('../../lib/builder-workspace.js').BuilderFileChange;
  type BuilderChangeKind =
    import('../../lib/builder-workspace.js').BuilderChangeKind;

  /**
   * Read `--numstat` into a path → counts map.
   *
   * `git diff HEAD` is the authoritative view of tracked changes because it
   * includes staged and unstaged edits in one pass. On an unborn HEAD (a brand
   * new repository before its first commit) the command fails, so fall back to
   * cached + unstaged diffs and sum them per path.
   */
  const readNumstat = async (args: string[]) => {
    const result = await git(directory, args);
    const counts = new Map<string, { additions: number; deletions: number }>();
    if (!result.success) return counts;
    for (const line of result.stdout.split('\n')) {
      const match = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line.trim());
      if (!match) continue;
      const filePath = match[3].trim();
      if (!filePath) continue;
      const additions = match[1] === '-' ? 0 : parseInt(match[1], 10);
      const deletions = match[2] === '-' ? 0 : parseInt(match[2], 10);
      const current = counts.get(filePath);
      counts.set(filePath, {
        additions: (current?.additions ?? 0) + additions,
        deletions: (current?.deletions ?? 0) + deletions,
      });
    }
    return counts;
  };

  /**
   * Read `--name-status` into a path → change kind map. `D` is the only status
   * that changes the *kind*; an added file is `A`, everything else is modified.
   * Renames/copies are reported as modifications of the new path.
   */
  const readKinds = async (args: string[]) => {
    const result = await git(directory, args);
    const kinds = new Map<string, BuilderChangeKind>();
    if (!result.success) return kinds;
    for (const line of result.stdout.split('\n')) {
      const match = /^([A-Z])(?:\d+)?\t(.+)$/.exec(line.trim());
      if (!match) continue;
      const code = match[1];
      const paths = match[2].split('\t');
      const filePath = (paths[paths.length - 1] ?? '').trim();
      if (!filePath) continue;
      kinds.set(
        filePath,
        code === 'D' ? 'deleted' : code === 'A' ? 'added' : 'modified',
      );
    }
    return kinds;
  };

  let counts = await readNumstat(['diff', 'HEAD', '--numstat', '--no-color']);
  let kinds = await readKinds(['diff', 'HEAD', '--name-status', '--no-color']);
  if (counts.size === 0 && kinds.size === 0) {
    // Unborn HEAD, or a repository where `diff HEAD` is unavailable.
    const [stagedCounts, unstagedCounts, stagedKinds, unstagedKinds] =
      await Promise.all([
        readNumstat(['diff', '--cached', '--numstat', '--no-color']),
        readNumstat(['diff', '--numstat', '--no-color']),
        readKinds(['diff', '--cached', '--name-status', '--no-color']),
        readKinds(['diff', '--name-status', '--no-color']),
      ]);
    counts = new Map(stagedCounts);
    for (const [filePath, value] of unstagedCounts) {
      const current = counts.get(filePath);
      counts.set(filePath, {
        additions: (current?.additions ?? 0) + value.additions,
        deletions: (current?.deletions ?? 0) + value.deletions,
      });
    }
    kinds = new Map([...stagedKinds, ...unstagedKinds]);
  }

  const changes: BuilderFileChange[] = [];
  const seen = new Set<string>();
  for (const [filePath, value] of counts) {
    if (changes.length >= MAX_CHANGED_FILES) break;
    seen.add(filePath);
    changes.push({
      path: filePath,
      kind: kinds.get(filePath) ?? 'modified',
      additions: value.additions,
      deletions: value.deletions,
    });
  }

  // Untracked files (new files not yet staged). Compute real line counts
  // instead of reporting +0/−0, which made every new file look empty.
  const untrackedResult = await git(directory, [
    'ls-files',
    '--others',
    '--exclude-standard',
  ]);
  if (untrackedResult.success) {
    for (const line of untrackedResult.stdout.split('\n')) {
      if (changes.length >= MAX_CHANGED_FILES) break;
      const filePath = line.trim();
      if (!filePath || seen.has(filePath)) continue;
      seen.add(filePath);

      let additions = 0;
      try {
        const buffer = await fs.readFile(path.join(directory, filePath));
        if (!buffer.includes(0)) {
          const text = buffer.toString('utf8');
          if (text.length > 0) {
            additions = text.split('\n').length;
            if (text.endsWith('\n')) additions -= 1;
          }
        }
      } catch {
        // A file that vanished between `ls-files` and the read is still
        // reported as untracked; the diff below will be empty.
      }

      changes.push({
        path: filePath,
        kind: 'added',
        additions,
        deletions: 0,
      });
    }
  }

  // Fetch diffs concurrently, but cap total size so a large change set is not
  // transferred in full across the IPC boundary. Deletions are included now:
  // the deleted content is precisely what the reviewer needs to see.
  let totalBytes = 0;
  await Promise.all(
    changes.map(async (change) => {
      if (totalBytes > MAX_DIFF_BYTES) return;
      const diffArgs =
        change.kind === 'added'
          ? ['diff', '--no-index', '/dev/null', change.path]
          : ['diff', 'HEAD', '--', change.path];
      const result = await git(directory, [
        ...diffArgs,
        '--no-color',
        '--unified=3',
      ]);
      if (result.success || result.stdout) {
        const diffText = result.stdout.trim();
        if (diffText) {
          totalBytes += diffText.length;
          change.diff = diffText;
        }
      }
    }),
  );

  return changes;
}

// ─── File content ────────────────────────────────────────────────────────────

const MAX_FILE_READ_BYTES = 512 * 1024;

/**
 * Read a single file from the active workspace for the code viewer.
 *
 * `filePath` is relative to `directory`. Returns the raw text content capped
 * at 512 KB (binary files are detected by a NUL byte and rejected with a
 * descriptive message).
 */
export async function readWorkspaceFileContent(
  directory: string,
  filePath: string,
): Promise<{ content: string; language?: string; truncated: boolean }> {
  // Prevent path traversal *and* symlink escapes: resolving the lexical target
  // is not enough when a file inside the workspace links to /etc/passwd. The
  // real paths of both roots are compared after the target exists.
  let canonicalRoot: string;
  let canonicalTarget: string;
  try {
    canonicalRoot = await fs.realpath(directory);
    canonicalTarget = await fs.realpath(path.resolve(directory, filePath));
  } catch (error) {
    const e = error as NodeJS.ErrnoException;
    throw new Error(
      e.code === 'ENOENT'
        ? `File not found: ${filePath}`
        : `Could not read ${filePath}: ${e.message}`,
      { cause: error },
    );
  }
  if (
    canonicalTarget !== canonicalRoot &&
    !canonicalTarget.startsWith(canonicalRoot + path.sep)
  ) {
    throw new Error(`Access denied: "${filePath}" is outside the workspace.`);
  }

  let buf: Buffer;
  try {
    const handle = await fs.open(canonicalTarget, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) {
        const error = new Error('Path is not a file');
        Object.assign(error, { code: 'EISDIR' });
        throw error;
      }
      const { size } = stat;
      const readSize = Math.min(size, MAX_FILE_READ_BYTES + 1);
      buf = Buffer.allocUnsafe(readSize);
      const { bytesRead } = await handle.read(buf, 0, readSize, 0);
      buf = buf.slice(0, bytesRead);
    } finally {
      await handle.close();
    }
  } catch (error) {
    const e = error as NodeJS.ErrnoException;
    throw new Error(
      e.code === 'ENOENT'
        ? `File not found: ${filePath}`
        : e.code === 'EISDIR'
          ? `Not a file: ${filePath}`
          : `Could not read ${filePath}: ${e.message}`,
      { cause: error },
    );
  }

  // Binary detection: presence of a NUL byte is a reliable heuristic.
  if (buf.includes(0)) {
    throw new Error(`Cannot display binary file: ${filePath}`);
  }

  const truncated = buf.length > MAX_FILE_READ_BYTES;
  const content = buf.slice(0, MAX_FILE_READ_BYTES).toString('utf8');
  return { content, language: languageFromPath(filePath), truncated };
}

// ─── Keep / Discard ──────────────────────────────────────────────────────────

/**
 * Apply the worktree's changes to the source repository.
 *
 * We take the diff between the worktree's HEAD and its working tree (all the
 * agent's edits) and apply it to the source repo's working tree with
 * `git apply`. The user still needs to commit manually — Builder never
 * commits to the source branch on the user's behalf.
 *
 * After a successful apply the worktree's changes are committed on its own
 * detached HEAD. That makes Keep idempotent: the next review starts from the
 * kept state instead of showing (and trying to re-apply) the same patch. The
 * source repository still has only a dirty working tree; no source branch ref
 * moves.
 *
 * Returns the list of changed file paths that were applied.
 */
export async function applyWorktreeChanges(
  repoDirectory: string,
  worktreeDirectory: string,
): Promise<string[]> {
  // Produce the diff of everything the agent changed in the worktree.
  const diffResult = await git(worktreeDirectory, [
    'diff',
    'HEAD',
    '--no-color',
    '--binary',
  ]);

  if (!diffResult.success && !diffResult.stdout) {
    throw new Error(
      `Could not read the worktree diff: ${diffResult.stderr ?? 'git diff failed'}`,
    );
  }

  const diffText = diffResult.stdout.trim();
  if (!diffText) {
    // Nothing to apply — worktree is clean.
    return [];
  }

  // Also include untracked files: git diff only covers tracked changes.
  // For untracked files we generate a diff against /dev/null per file.
  const untrackedResult = await git(worktreeDirectory, [
    'ls-files',
    '--others',
    '--exclude-standard',
  ]);
  const untrackedFiles = untrackedResult.success
    ? untrackedResult.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
    : [];

  const untrackedDiffs: string[] = [];
  for (const rel of untrackedFiles) {
    const ud = await git(worktreeDirectory, [
      'diff',
      '--no-index',
      '--no-color',
      '--binary',
      '/dev/null',
      rel,
    ]);
    // diff --no-index exits 1 for differences (that's normal).
    if (ud.stdout.trim()) untrackedDiffs.push(ud.stdout.trim());
  }

  const fullDiff = [diffText, ...untrackedDiffs].join('\n');

  // Write the diff to a temp file and pass it to `git apply` by path, because
  // execFile does not support piping stdin.
  const tmpPatch = path.join(
    os.tmpdir(),
    `qeda-builder-patch-${Date.now()}.patch`,
  );
  try {
    // git apply treats a missing final newline as a corrupt patch. The diff is
    // trimmed above for the "nothing to apply" check, so restore the newline
    // that every hunk terminator expects.
    await fs.writeFile(tmpPatch, `${fullDiff}\n`, 'utf8');

    // Apply using --3way so conflicts surface cleanly rather than aborting.
    // `nowarn` (not `fix`) keeps the agent's bytes intact: a review tool must
    // not silently rewrite whitespace while claiming it applied the diff.
    const applyResult = await git(repoDirectory, [
      'apply',
      '--3way',
      '--whitespace=nowarn',
      '--allow-empty',
      tmpPatch,
    ]);

    if (!applyResult.success) {
      throw new Error(
        `Failed to apply the worktree changes to your repository: ${applyResult.stderr ?? 'git apply failed'}. You can apply the diff manually from the Changes tab.`,
      );
    }
  } finally {
    await fs.unlink(tmpPatch).catch(() => undefined);
  }

  // Snapshot the affected paths before the checkpoint moves HEAD. `git diff
  // --name-only` is safer than parsing `diff --git` headers, which breaks on
  // paths containing spaces.
  const changedPathResult = await git(worktreeDirectory, [
    'diff',
    '--name-only',
    'HEAD',
  ]);
  const changedPaths = changedPathResult.success
    ? changedPathResult.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    : [];

  // Move the worktree's baseline forward. This is deliberately best-effort:
  // the source apply already succeeded, and a commit failure (for example a
  // repository with an unusual identity policy) must not report Keep as failed.
  try {
    await git(worktreeDirectory, ['add', '-A']);
    await git(worktreeDirectory, [
      '-c',
      'user.name=Qeda Builder',
      '-c',
      'user.email=builder@qeda.local',
      'commit',
      '--no-gpg-sign',
      '-m',
      'chore: builder checkpoint after keep',
    ]);
  } catch {
    // Leave the worktree unchanged if the checkpoint could not be written.
  }

  return [...new Set([...changedPaths, ...untrackedFiles])];
}

/**
 * Discard all agent changes in the worktree by resetting it to HEAD.
 *
 * This does NOT remove the worktree (the session can continue with a fresh
 * slate). Use `removeBuilderWorktree` to fully tear down.
 */
export async function discardWorktreeChanges(
  worktreeDirectory: string,
): Promise<void> {
  // Reset tracked files to HEAD.
  const resetResult = await git(worktreeDirectory, ['checkout', '--', '.']);
  if (!resetResult.success) {
    throw new Error(
      `Could not discard changes: ${resetResult.stderr ?? 'git checkout failed'}`,
    );
  }

  // Remove untracked files the agent created.
  await git(worktreeDirectory, ['clean', '-fd']);
}
