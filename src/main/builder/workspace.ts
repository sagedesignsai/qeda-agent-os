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
): Promise<BuilderWorkspace> {
  if (typeof directory !== 'string' || directory.trim() === '') {
    throw new Error('Choose a project folder before starting a build.');
  }

  const input = path.resolve(directory);
  let stat;
  try {
    stat = await fs.stat(input);
  } catch {
    throw new Error(`That folder does not exist: ${directory}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`That path is not a folder: ${directory}`);
  }

  // --show-toplevel works from any subdirectory (and from a worktree, where
  // `.git` is a file rather than a directory), so it is more reliable than
  // testing for a `.git` entry by hand.
  const toplevel = await git(input, ['rev-parse', '--show-toplevel']);
  if (!toplevel.success) {
    throw new Error(
      `"${directory}" is not a git repository. Builder needs git so each run can be reviewed and discarded safely.`,
    );
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
  };
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

  // Tracked changes: diff against HEAD
  const numstatResult = await git(directory, [
    'diff',
    'HEAD',
    '--numstat',
    '--no-color',
  ]);

  const changes: BuilderFileChange[] = [];
  const seen = new Set<string>();

  if (numstatResult.success) {
    for (const line of numstatResult.stdout
      .split('\n')
      .slice(0, MAX_CHANGED_FILES)) {
      const match = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line.trim());
      if (!match) continue;
      const additions = match[1] === '-' ? 0 : parseInt(match[1], 10);
      const deletions = match[2] === '-' ? 0 : parseInt(match[2], 10);
      const filePath = match[3].trim();
      seen.add(filePath);
      changes.push({
        path: filePath,
        kind: deletions > 0 && additions === 0 ? 'deleted' : 'modified',
        additions,
        deletions,
      });
    }
  }

  // Untracked files (new files not yet staged): additions only
  const untrackedResult = await git(directory, [
    'ls-files',
    '--others',
    '--exclude-standard',
  ]);
  if (untrackedResult.success) {
    for (const line of untrackedResult.stdout
      .split('\n')
      .slice(0, MAX_CHANGED_FILES)) {
      const filePath = line.trim();
      if (!filePath || seen.has(filePath)) continue;
      changes.push({
        path: filePath,
        kind: 'added',
        additions: 0,
        deletions: 0,
      });
    }
  }

  // Staged-only changes that don't appear in diff HEAD (initial commit / no HEAD)
  const stagedResult = await git(directory, [
    'diff',
    '--cached',
    '--numstat',
    '--no-color',
  ]);
  if (stagedResult.success) {
    for (const line of stagedResult.stdout
      .split('\n')
      .slice(0, MAX_CHANGED_FILES)) {
      const match = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line.trim());
      if (!match) continue;
      const filePath = match[3].trim();
      if (seen.has(filePath)) continue;
      const additions = match[1] === '-' ? 0 : parseInt(match[1], 10);
      const deletions = match[2] === '-' ? 0 : parseInt(match[2], 10);
      seen.add(filePath);
      changes.push({
        path: filePath,
        kind: (deletions > 0 && additions === 0
          ? 'deleted'
          : seen.has(filePath) && deletions === 0
            ? 'added'
            : 'modified') as BuilderChangeKind,
        additions,
        deletions,
      });
    }
  }

  // Fetch diffs concurrently, but cap total size so a large change set is not
  // transferred in full across the IPC boundary.
  let totalBytes = 0;
  await Promise.all(
    changes.map(async (change) => {
      if (change.kind === 'deleted' || totalBytes > MAX_DIFF_BYTES) return;
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
