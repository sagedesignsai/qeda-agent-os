/**
 * tools/repo.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Read-only repository awareness: three git introspection tools and one tree
 * search. These give an agent the ability to ground a task in the actual state
 * of a codebase ("what branch am I on", "what changed", "where is X defined")
 * without giving it the ability to change anything.
 *
 * WHY THESE EXIST INSTEAD OF `runShell`
 * ─────────────────────────────────────
 * The Focus copilot deliberately does NOT get `runShell`. It reaches the shell
 * through `handToTerminal`, which hands the work to the agentic terminal where
 * the user already approves each individual command. This module is the
 * read-only complement for when the agent only needs to LOOK.
 *
 * These commands are spawned with `execFile`, never `sh -c`. That is not a
 * stylistic choice: `runShell` passes a model-authored string to a shell, so
 * every argument is an injection surface. Here the argument vector is fixed in
 * code and only the *values* vary, so there is nothing for a crafted input to
 * break out of.
 *
 * SAFETY MODEL (spec §6.1)
 * ───────────────────────
 *  • Every tool takes a PROJECT ID, never a filesystem path. The repository
 *    root is read from the `projects.repo_path` column, so the path is never
 *    model-authored: it cannot be mistyped, cannot be pointed somewhere
 *    unintended, and needs no prompt text to be copied out of. The active
 *    project id is already in the system prompt (ai/project-context.ts), so
 *    the model can name the project with no lookup round-trip.
 *  • A project with no `repo_path` — the common case, and always true for the
 *    Inbox — returns an explicit, actionable error. It does NOT fall back to a
 *    default, a home directory, or the current working directory.
 *  • The resolved root goes through `fs.realpath`, and every file walked by
 *    grepSearch is re-checked for containment, so a symlink pointing outside
 *    the project's own tree cannot be followed.
 *  • Output is bounded everywhere. An unbounded `grep` in a large tree will
 *    exhaust the context window mid-turn, which is the realistic failure mode.
 *    Truncation is always reported rather than silent.
 *
 * These do not widen filesystem reach: the copilot already holds ungated
 * `readFile` and `listDir` over arbitrary paths. They widen *derived* reach —
 * grep can surface content the agent never explicitly fetched — which is why
 * the output caps below are normative.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { tool } from 'ai';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { getProject } from '../db/projects.js';

const execFileAsync = promisify(execFile);

/** Error text without the "Error: " prefix a bare String(err) leaves behind. */
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ─── Output bounds ────────────────────────────────────────────────────────────

/** Hard ceiling on matches returned by grepSearch. */
const MAX_GREP_MATCHES = 50;
/** Per-match line budget. Long minified/bundled lines are cut, not dropped. */
const MAX_GREP_LINE = 240;
/** Files larger than this are skipped by grepSearch rather than read whole. */
const MAX_GREP_FILE_BYTES = 512 * 1024;
/** Ceiling on files walked by grepSearch, so a huge tree cannot stall a turn. */
const MAX_GREP_FILES = 5_000;
/** Default max characters for any git subprocess. */
const MAX_GIT_OUTPUT = 64 * 1024;
const GIT_TIMEOUT_MS = 10_000;

/** Directories never worth searching; keeps grep fast and output relevant. */
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
  'target',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
]);

// ─── Path safety ──────────────────────────────────────────────────────────────

/**
 * True when `target` is `root` or lives beneath it, after resolving both.
 * Used to stop a symlink from escaping the tree the project points at.
 */
function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Resolve a path and prove it stays inside `root`. Returns the real path. */
async function resolveWithin(root: string, candidate: string): Promise<string> {
  const resolved = path.resolve(root, candidate);
  let real: string;
  try {
    real = await fs.realpath(resolved);
  } catch {
    // Path does not exist (e.g. a git ref argument); nothing to contain-check.
    return resolved;
  }
  if (!isInside(root, real)) {
    throw new Error(
      `Refusing to read ${candidate}: it resolves outside the given path (symlink escape).`,
    );
  }
  return real;
}

// ─── Project → repository root ────────────────────────────────────────────────

/**
 * Resolve a project id to the repository working directory.
 *
 * The tool takes a PROJECT ID, never a filesystem path. That is a deliberate
 * inversion of the obvious design, and it is what makes these tools safe to
 * hand to an autonomous agent:
 *
 *  • The path is never model-authored, so it cannot be wrong, cannot be
 *    typo'd into somewhere unintended, and needs no prompt text to be copied
 *    out of. An earlier iteration took a required `path` and relied on the
 *    system prompt's `Repo: …` line; that silently degraded to a guess
 *    whenever the prompt had no repo in it.
 *  • Containment is exact: the root comes from the `projects.repo_path`
 *    column, not from the call.
 *  • A project with no `repo_path` — the common case, and always true for the
 *    Inbox — returns a clear, actionable error instead of an empty result the
 *    model would try to work around.
 *
 * The active project id is already present in the system prompt
 * (`ai/project-context.ts`: "… (id: proj-1)"), so the model can name the
 * project without a lookup round-trip.
 */
async function resolveRepoRoot(
  projectId: string,
): Promise<{ root: string; projectName: string }> {
  const project = getProject(projectId);
  if (!project) {
    throw new Error(
      `No project with id "${projectId}". Call listProjects to see the available projects and their ids.`,
    );
  }
  if (!project.repo_path) {
    throw new Error(
      `The project "${project.name}" has no repository path configured. ` +
        `Set one on the project before asking about its code.`,
    );
  }

  const real = await fs.realpath(path.resolve(project.repo_path));
  const stat = await fs.stat(real);
  if (!stat.isDirectory()) {
    throw new Error(
      `The repository path for "${project.name}" is not a directory: ${project.repo_path}`,
    );
  }
  // A worktree or submodule has `.git` as a FILE, so test existence, not type.
  if (!(await fs.stat(path.join(real, '.git')).catch(() => null))) {
    throw new Error(
      `The configured path for "${project.name}" is not a git repository: ${project.repo_path}`,
    );
  }

  return { root: real, projectName: project.name };
}

// ─── git plumbing ─────────────────────────────────────────────────────────────

interface GitResult {
  success: boolean;
  stdout: string;
  stderr?: string;
}

async function git(cwd: string, args: string[]): Promise<GitResult> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_GIT_OUTPUT,
      encoding: 'utf8',
      // Keep git from paging or prompting; never let it try to be interactive.
      env: { ...process.env, GIT_PAGER: 'cat', GIT_TERMINAL_PROMPT: '0' },
    });
    return { success: true, stdout };
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    return {
      success: false,
      stdout: e.stdout ?? '',
      stderr: (e.stderr || e.message || String(err)).trim(),
    };
  }
}

/** Required project id, reused by all four tools. */
const projectArg = z
  .string()
  .describe(
    'The id of the project whose repository to inspect (e.g. "proj-1"). ' +
      'The repository path is read from the project record — do not pass a filesystem path. ' +
      'Your active project id is stated in the system prompt; call listProjects to see others.',
  );

// ─── gitStatus ────────────────────────────────────────────────────────────────

export const gitStatusTool = tool({
  description:
    'Report the current git branch, HEAD commit, how many commits it is ahead/behind its upstream, ' +
    'and whether the working tree is clean. Read-only: cannot change anything. ' +
    'Use this first to orient yourself in an unfamiliar repository.',
  inputSchema: z.object({
    projectId: projectArg,
  }),
  execute: async ({ projectId }) => {
    let cwd: string;
    let projectName: string;
    try {
      ({ root: cwd, projectName } = await resolveRepoRoot(projectId));
    } catch (err) {
      return { success: false as const, error: errMsg(err) };
    }

    // --porcelain=v1 --branch gives a machine-readable branch header line
    // (`## main...origin/main [ahead 1]`) followed by one line per change.
    const res = await git(cwd, ['status', '--porcelain=v1', '--branch']);
    if (!res.success) {
      return {
        success: false as const,
        error: res.stderr || 'git status failed',
      };
    }

    const lines = res.stdout.split('\n');
    const header = lines[0]?.startsWith('## ') ? lines[0].slice(3) : '';
    const changes = lines.slice(1).filter((l) => l.trim().length > 0);

    const branch = header.split('...')[0]?.trim() || 'unknown';
    const upstream = header.includes('...')
      ? header.split('...')[1]?.split('[')[0]?.trim()
      : undefined;
    const aheadBehind = header.match(/\[(?:ahead|behind)\s+(\d+)\]/);
    const ahead =
      aheadBehind?.[1] && header.includes('ahead') ? Number(aheadBehind[1]) : 0;
    const behind =
      aheadBehind?.[1] && header.includes('behind')
        ? Number(aheadBehind[1])
        : 0;

    // XY code: X = staged, Y = unstaged. Both letters matter for "is it clean".
    const staged = changes.filter((l) => l[0] !== ' ' && l[0] !== '?').length;
    const unstaged = changes.filter((l) => l[1] !== ' ' && l[1] !== '?').length;
    const untracked = changes.filter((l) => l.startsWith('??')).length;

    return {
      success: true as const,
      projectId,
      projectName,
      path: cwd,
      branch,
      upstream,
      ahead,
      behind,
      clean: changes.length === 0,
      changedFileCount: changes.length,
      staged,
      unstaged,
      untracked,
      // Cap the listing but say so, so the model never assumes it saw everything.
      changes: changes.slice(0, 40),
      changesTruncated: changes.length > 40,
    };
  },
});

// ─── gitLog ───────────────────────────────────────────────────────────────────

export const gitLogTool = tool({
  description:
    'List recent commits on the current branch (sha, author, relative date, subject). ' +
    'Read-only. Optionally filter to commits touching a single path, which is the fastest way to ' +
    'learn what a file has been for.',
  inputSchema: z.object({
    projectId: projectArg,
    count: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe('How many commits to return (1-50).'),
    file: z
      .string()
      .optional()
      .describe(
        'Only show commits that touched this path, relative to the repository root.',
      ),
  }),
  execute: async ({ projectId, count = 10, file }) => {
    let cwd: string;
    let projectName: string;
    try {
      ({ root: cwd, projectName } = await resolveRepoRoot(projectId));
    } catch (err) {
      return { success: false as const, error: errMsg(err) };
    }

    const args = [
      'log',
      `--max-count=${count}`,
      '--pretty=format:%h%x1f%an%x1f%ar%x1f%s',
    ];
    if (file) {
      try {
        const target = await resolveWithin(cwd, file);
        args.push('--', path.relative(cwd, target) || '.');
      } catch (err) {
        return { success: false as const, error: String(err) };
      }
    }

    const res = await git(cwd, args);
    if (!res.success) {
      return { success: false as const, error: res.stderr || 'git log failed' };
    }

    const commits = res.stdout
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((line) => {
        const [sha = '', author = '', when = '', ...subject] =
          line.split('\x1f');
        return {
          sha,
          author,
          when,
          subject: subject.join('\x1f').slice(0, MAX_GREP_LINE),
        };
      });

    return {
      success: true as const,
      projectId,
      projectName,
      path: cwd,
      commits,
      count: commits.length,
    };
  },
});

// ─── gitDiffStat ──────────────────────────────────────────────────────────────

export const gitDiffStatTool = tool({
  description:
    'Summarise what changed in the working tree and/or against a git ref, as per-file ' +
    'added/removed line counts. Read-only. Use `ref: "HEAD"` for uncommitted work, or a branch ' +
    'or tag name to compare against.',
  inputSchema: z.object({
    projectId: projectArg,
    ref: z
      .string()
      .optional()
      .describe(
        'Git ref to diff against. Omit to diff the working tree against HEAD.',
      ),
  }),
  execute: async ({ projectId, ref }) => {
    let cwd: string;
    let projectName: string;
    try {
      ({ root: cwd, projectName } = await resolveRepoRoot(projectId));
    } catch (err) {
      return { success: false as const, error: errMsg(err) };
    }

    const args = ['diff', '--numstat'];
    if (ref) args.push(ref);

    const res = await git(cwd, args);
    if (!res.success) {
      return {
        success: false as const,
        error: res.stderr || 'git diff failed',
      };
    }

    const files = res.stdout
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((line) => {
        const [added = '0', removed = '0', ...rest] = line.split('\t');
        return {
          file: rest.join('\t'),
          // Binary files report "-" instead of counts.
          added: added === '-' ? null : Number(added),
          removed: removed === '-' ? null : Number(removed),
        };
      });

    const totals = files.reduce(
      (acc, f) => ({
        added: acc.added + (f.added ?? 0),
        removed: acc.removed + (f.removed ?? 0),
      }),
      { added: 0, removed: 0 },
    );

    return {
      success: true as const,
      projectId,
      projectName,
      path: cwd,
      ref: ref ?? 'working tree (vs HEAD)',
      changedFileCount: files.length,
      totalAdded: totals.added,
      totalRemoved: totals.removed,
      files: files.slice(0, 60),
      filesTruncated: files.length > 60,
    };
  },
});

// ─── grepSearch ───────────────────────────────────────────────────────────────

export const grepSearchTool = tool({
  description:
    'Search file contents across a directory tree, returning matching lines with their file paths ' +
    'and line numbers. Read-only. Skips binary files, .git, node_modules and build output, and ' +
    'caps the number of matches — the response always reports whether it was truncated.',
  inputSchema: z.object({
    projectId: projectArg,
    pattern: z
      .string()
      .min(1)
      .describe('Literal substring to search for. Not a regex.'),
    include: z
      .string()
      .optional()
      .describe(
        'Only search files whose name ends with this suffix, e.g. ".ts".',
      ),
    maxMatches: z
      .number()
      .int()
      .min(1)
      .max(MAX_GREP_MATCHES)
      .default(MAX_GREP_MATCHES)
      .describe(`Maximum matches to return (1-${MAX_GREP_MATCHES}).`),
  }),
  execute: async ({
    projectId,
    pattern,
    include,
    maxMatches = MAX_GREP_MATCHES,
  }) => {
    let cwd: string;
    let projectName: string;
    try {
      ({ root: cwd, projectName } = await resolveRepoRoot(projectId));
    } catch (err) {
      return { success: false as const, error: errMsg(err) };
    }

    const matches: { file: string; line: number; text: string }[] = [];
    let filesScanned = 0;
    let filesSkipped = 0;
    let hitFileCap = false;

    const walk = async (dir: string): Promise<void> => {
      if (matches.length >= maxMatches || filesScanned >= MAX_GREP_FILES) {
        hitFileCap = filesScanned >= MAX_GREP_FILES;
        return;
      }
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return; // unreadable directory is not an error worth failing the turn on
      }

      for (const entry of entries) {
        if (matches.length >= maxMatches) return;
        if (filesScanned >= MAX_GREP_FILES) {
          hitFileCap = true;
          return;
        }

        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
          await walk(full);
          continue;
        }
        if (!entry.isFile()) continue;
        if (include && !entry.name.endsWith(include)) continue;

        let real: string;
        try {
          real = await fs.realpath(full);
        } catch {
          continue;
        }
        // Symlink escape guard: a link out of the tree is not searched.
        if (!isInside(cwd, real)) continue;

        let stat;
        try {
          stat = await fs.stat(real);
        } catch {
          continue;
        }
        if (stat.size > MAX_GREP_FILE_BYTES) {
          filesSkipped++;
          continue;
        }

        filesScanned++;
        let content: string;
        try {
          content = await fs.readFile(real, 'utf8');
        } catch {
          continue;
        }
        // Binary content decodes to NUL; treat that as "not a text file".
        if (content.includes('\0')) continue;

        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (!lines[i].includes(pattern)) continue;
          matches.push({
            file: path.relative(cwd, real),
            line: i + 1,
            text: lines[i].trim().slice(0, MAX_GREP_LINE),
          });
          if (matches.length >= maxMatches) break;
        }
      }
    };

    await walk(cwd);

    // Group by file so the model sees structure, not a flat wall of hits.
    const byFile = new Map<string, { line: number; text: string }[]>();
    for (const m of matches) {
      const list = byFile.get(m.file);
      if (list) list.push({ line: m.line, text: m.text });
      else byFile.set(m.file, [{ line: m.line, text: m.text }]);
    }

    return {
      success: true as const,
      projectId,
      projectName,
      path: cwd,
      pattern,
      matchCount: matches.length,
      filesWithMatches: byFile.size,
      filesScanned,
      filesSkippedOversize: filesSkipped,
      // Always explicit: a truncated result must never read as exhaustive.
      truncated: matches.length >= maxMatches || hitFileCap,
      truncatedReason: hitFileCap
        ? `Stopped after scanning ${MAX_GREP_FILES} files.`
        : matches.length >= maxMatches
          ? `Reached the ${maxMatches}-match cap.`
          : undefined,
      results: [...byFile.entries()].map(([file, hits]) => ({
        file,
        matches: hits,
      })),
    };
  },
});

export const repoTools = {
  gitStatus: gitStatusTool,
  gitLog: gitLogTool,
  gitDiffStat: gitDiffStatTool,
  grepSearch: grepSearchTool,
};
