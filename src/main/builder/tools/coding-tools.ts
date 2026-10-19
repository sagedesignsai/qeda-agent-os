/**
 * main/builder/tools/coding-tools.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Workspace-scoped coding tools for the Local Builder ToolLoopAgent.
 *
 * SAFETY & WORKSPACE CONTAINMENT:
 * ───────────────────────────────
 * Every tool operates strictly inside the active Builder workspace or its
 * isolated git worktree. Paths are sanitized, canonicalized, and checked for
 * tree containment before any read, write, or search operation. Symlink escapes
 * and traversals outside the workspace root are rejected immediately.
 *
 * REVIEWS & DIFF FEED:
 * ────────────────────
 * File writes and edits automatically notify the session via `onFileChanged`,
 * streaming live diff updates to the Builder workspace surfaces.
 *
 * SUPERVISED SHELL EXECUTION:
 * ───────────────────────────
 * Shell commands (e.g. `npm install`, `npm test`, `npm run build`) are executed
 * strictly inside the workspace directory and are gated behind explicit user
 * approval cards via `requestPermission`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { tool, type Tool } from 'ai';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { BuilderPermissionDecision } from '../../../lib/builder-interactions';

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 15_000;
const SHELL_TIMEOUT_MS = 60_000;
const MAX_GREP_MATCHES = 50;
const MAX_FILE_READ_BYTES = 512 * 1024;

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  '.turbo',
  '.cache',
  'coverage',
  '.venv',
  '__pycache__',
]);

/** Check whether target is inside root or equals root. */
function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Resolve and verify that a candidate path stays strictly inside root. */
async function resolveWithinWorkspace(
  root: string,
  candidate: string,
  mustExist = false,
): Promise<string> {
  const resolved = path.resolve(root, candidate);
  if (mustExist) {
    let real: string;
    try {
      real = await fs.realpath(resolved);
    } catch {
      throw new Error(`File does not exist: ${candidate}`);
    }
    if (!isInside(root, real)) {
      throw new Error(`Path traverses outside workspace: ${candidate}`);
    }
    return real;
  }

  // Candidate might not exist yet (e.g. creating a new file)
  const normalizedCandidate = path.normalize(resolved);
  if (!isInside(root, normalizedCandidate)) {
    throw new Error(`Path traverses outside workspace: ${candidate}`);
  }

  // The lexical check above cannot see a symlinked parent directory. Walk up
  // to the nearest existing ancestor and verify its real path, so
  // `workspace/link-to-etc/passwd` is rejected even though the final file may
  // not exist yet.
  let probe = normalizedCandidate;
  for (;;) {
    try {
      const realAncestor = await fs.realpath(probe);
      if (!isInside(root, realAncestor)) {
        throw new Error(`Path traverses outside workspace: ${candidate}`);
      }
      break;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('outside workspace')
      ) {
        throw error;
      }
      const parent = path.dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
  }

  return normalizedCandidate;
}

export interface BuilderToolingContext {
  workspaceDirectory: string;
  onFileChanged: (filePath: string) => void;
  requestPermission: (params: {
    toolName: string;
    description: string;
    details: Record<string, unknown>;
  }) => Promise<BuilderPermissionDecision>;
  /**
   * Session-scoped exact commands approved with "Always allow".
   *
   * Shared by reference across turns so the approval survives a prompt; keyed
   * by the exact trimmed command so a broad approval never becomes a blanket
   * shell grant.
   */
  allowedShellCommands?: Set<string>;
}

export function createWorkspaceCodingTools(
  ctx: BuilderToolingContext,
): Record<string, Tool> {
  const {
    workspaceDirectory,
    onFileChanged,
    requestPermission,
    allowedShellCommands = new Set<string>(),
  } = ctx;

  // ─── 1. readFile ─────────────────────────────────────────────────────────────
  const readFile = tool({
    description:
      'Read the contents of a file in the workspace. Supports optional startLine and endLine (1-indexed) ' +
      'for inspecting specific portions of code.',
    inputSchema: z.object({
      filePath: z
        .string()
        .describe(
          'Relative path to the file within the workspace (e.g. "package.json" or "src/index.ts").',
        ),
      startLine: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Optional starting line number (1-indexed).'),
      endLine: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Optional ending line number (1-indexed, inclusive).'),
    }),
    execute: async ({ filePath, startLine, endLine }) => {
      try {
        const fullPath = await resolveWithinWorkspace(
          workspaceDirectory,
          filePath,
          true,
        );
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          return {
            error: `"${filePath}" is a directory, not a file. Use listFiles instead.`,
          };
        }
        if (stat.size > MAX_FILE_READ_BYTES && !startLine) {
          return {
            error: `File is large (${Math.round(stat.size / 1024)} KB). Specify startLine and endLine to read in slices.`,
          };
        }

        const raw = await fs.readFile(fullPath, 'utf8');
        const lines = raw.split('\n');
        const totalLines = lines.length;

        const start = Math.max(1, startLine ?? 1);
        const end = Math.min(totalLines, endLine ?? totalLines);

        const sliced = lines.slice(start - 1, end);
        const numbered = sliced
          .map(
            (line, idx) => `${String(start + idx).padStart(5, ' ')} | ${line}`,
          )
          .join('\n');

        return {
          filePath,
          totalLines,
          startLine: start,
          endLine: end,
          content: numbered,
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  });

  // ─── 2. writeFile ────────────────────────────────────────────────────────────
  const writeFile = tool({
    description:
      'Create a new file or completely overwrite an existing file in the workspace. ' +
      'Creates parent directories automatically. Live diffs are immediately recorded.',
    inputSchema: z.object({
      filePath: z
        .string()
        .describe(
          'Relative path to the file to create or overwrite (e.g. "src/server.ts").',
        ),
      content: z.string().describe('The complete file content to write.'),
    }),
    execute: async ({ filePath, content }) => {
      try {
        const fullPath = await resolveWithinWorkspace(
          workspaceDirectory,
          filePath,
          false,
        );
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, 'utf8');

        const relPath = path.relative(workspaceDirectory, fullPath);
        onFileChanged(relPath);

        return {
          success: true,
          filePath: relPath,
          bytesWritten: Buffer.byteLength(content, 'utf8'),
          message: `Successfully wrote ${relPath}.`,
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  });

  // ─── 3. editFile ─────────────────────────────────────────────────────────────
  const editFile = tool({
    description:
      'Perform a precise search-and-replace block edit inside an existing file. ' +
      'targetContent must match existing characters in the file exactly. ' +
      'Provide sufficient surrounding context to ensure targetContent matches exactly once.',
    inputSchema: z.object({
      filePath: z
        .string()
        .describe(
          'Relative path to the file to edit (e.g. "package.json" or "src/app.ts").',
        ),
      targetContent: z
        .string()
        .describe(
          'Exact string or code block to replace (must match uniquely).',
        ),
      replacementContent: z
        .string()
        .describe('New string or code block to replace targetContent with.'),
    }),
    execute: async ({ filePath, targetContent, replacementContent }) => {
      try {
        const fullPath = await resolveWithinWorkspace(
          workspaceDirectory,
          filePath,
          true,
        );
        const original = await fs.readFile(fullPath, 'utf8');

        const occurrences = original.split(targetContent).length - 1;
        if (occurrences === 0) {
          return {
            error: `Target content not found in ${filePath}. Verify line formatting, indentation, and exact text.`,
          };
        }
        if (occurrences > 1) {
          return {
            error: `Target content matches ${occurrences} locations in ${filePath}. Provide more surrounding lines to make it unique.`,
          };
        }

        const updated = original.replace(targetContent, replacementContent);
        await fs.writeFile(fullPath, updated, 'utf8');

        const relPath = path.relative(workspaceDirectory, fullPath);
        onFileChanged(relPath);

        return {
          success: true,
          filePath: relPath,
          message: `Successfully updated ${relPath}.`,
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  });

  // ─── 4. listFiles ────────────────────────────────────────────────────────────
  const listFiles = tool({
    description:
      'List files and directories in the workspace. Skips node_modules, .git, and build outputs.',
    inputSchema: z.object({
      subDirectory: z
        .string()
        .optional()
        .describe(
          'Optional subfolder to list (relative to workspace root). Defaults to workspace root.',
        ),
      maxDepth: z
        .number()
        .int()
        .min(1)
        .max(6)
        .default(3)
        .describe(
          'Maximum directory depth to recurse into (1-6). Default is 3.',
        ),
    }),
    execute: async ({ subDirectory, maxDepth = 3 }) => {
      try {
        const targetDir = await resolveWithinWorkspace(
          workspaceDirectory,
          subDirectory ?? '.',
          true,
        );

        const fileList: string[] = [];
        let totalCount = 0;

        const walk = async (dir: string, depth: number) => {
          if (depth > maxDepth || totalCount >= 1000) return;
          let entries;
          try {
            entries = await fs.readdir(dir, { withFileTypes: true });
          } catch {
            return;
          }

          for (const entry of entries) {
            if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.'))
              continue;
            const full = path.join(dir, entry.name);
            const rel = path.relative(workspaceDirectory, full);
            totalCount++;

            if (entry.isDirectory()) {
              fileList.push(`${rel}/`);
              await walk(full, depth + 1);
            } else if (entry.isFile()) {
              fileList.push(rel);
            }
          }
        };

        await walk(targetDir, 1);
        return {
          workspace: path.basename(workspaceDirectory),
          totalEntries: fileList.length,
          files: fileList.slice(0, 500),
          truncated: fileList.length > 500,
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  });

  // ─── 5. grepWorkspace ────────────────────────────────────────────────────────
  const grepWorkspace = tool({
    description:
      'Search for text or patterns across files in the workspace. Returns matching file paths and line numbers.',
    inputSchema: z.object({
      pattern: z.string().min(1).describe('Literal string to search for.'),
      extension: z
        .string()
        .optional()
        .describe('Optional file extension filter, e.g. ".ts", ".json".'),
    }),
    execute: async ({ pattern, extension }) => {
      try {
        const matches: Array<{ file: string; line: number; text: string }> = [];

        const walk = async (dir: string) => {
          if (matches.length >= MAX_GREP_MATCHES) return;
          let entries;
          try {
            entries = await fs.readdir(dir, { withFileTypes: true });
          } catch {
            return;
          }

          for (const entry of entries) {
            if (matches.length >= MAX_GREP_MATCHES) return;
            if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.'))
              continue;

            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              await walk(full);
            } else if (entry.isFile()) {
              if (extension && !entry.name.endsWith(extension)) continue;
              try {
                const stat = await fs.stat(full);
                if (stat.size > MAX_FILE_READ_BYTES) continue;
                const text = await fs.readFile(full, 'utf8');
                if (text.includes('\0')) continue; // Skip binaries

                const lines = text.split('\n');
                for (let i = 0; i < lines.length; i++) {
                  if (lines[i].includes(pattern)) {
                    matches.push({
                      file: path.relative(workspaceDirectory, full),
                      line: i + 1,
                      text: lines[i].trim().slice(0, 200),
                    });
                    if (matches.length >= MAX_GREP_MATCHES) break;
                  }
                }
              } catch {
                // Ignore unreadable files
              }
            }
          }
        };

        await walk(workspaceDirectory);

        return {
          pattern,
          matchCount: matches.length,
          matches,
          truncated: matches.length >= MAX_GREP_MATCHES,
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  });

  // ─── 6. gitStatus ────────────────────────────────────────────────────────────
  const gitStatus = tool({
    description:
      'Check the current git branch and changed files in the workspace/worktree.',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const { stdout } = await execFileAsync(
          'git',
          ['status', '--porcelain=v1', '--branch'],
          {
            cwd: workspaceDirectory,
            timeout: GIT_TIMEOUT_MS,
            encoding: 'utf8',
          },
        );
        const lines = stdout.split('\n').filter((l) => l.trim().length > 0);
        const branchHeader = lines[0] ?? '';
        const changedFiles = lines.slice(1);

        return {
          branchHeader,
          changedFileCount: changedFiles.length,
          clean: changedFiles.length === 0,
          changes: changedFiles.slice(0, 50),
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  });

  // ─── 7. gitDiff ──────────────────────────────────────────────────────────────
  const gitDiff = tool({
    description:
      'View unified git diff of uncommitted changes in the workspace or for a specific file.',
    inputSchema: z.object({
      filePath: z
        .string()
        .optional()
        .describe('Optional specific file to diff against HEAD.'),
    }),
    execute: async ({ filePath }) => {
      try {
        const args = ['diff'];
        if (filePath) {
          const full = await resolveWithinWorkspace(
            workspaceDirectory,
            filePath,
            true,
          );
          args.push('--', path.relative(workspaceDirectory, full));
        }

        const { stdout } = await execFileAsync('git', args, {
          cwd: workspaceDirectory,
          timeout: GIT_TIMEOUT_MS,
          maxBuffer: 1024 * 1024,
          encoding: 'utf8',
        });

        return {
          diff: stdout.slice(0, 32_000),
          truncated: stdout.length > 32_000,
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  });

  // ─── 8. runShellCommand ──────────────────────────────────────────────────────
  const runShellCommand = tool({
    description:
      'Execute a shell command inside the workspace directory (e.g. "npm install", "npm test", "npm run build"). ' +
      'Gated behind user approval. Commands run with a timeout.',
    inputSchema: z.object({
      command: z
        .string()
        .describe('The command to run, e.g. "npm install express".'),
    }),
    execute: async ({ command }) => {
      const trimmed = command.trim();
      if (!trimmed) return { error: 'Empty command.' };

      // Request user approval unless this exact command was already approved
      // with "Always allow" in this session.
      if (!allowedShellCommands.has(trimmed)) {
        const decision = await requestPermission({
          toolName: 'runShellCommand',
          description: `Run shell command in workspace: \`${trimmed}\``,
          details: { command: trimmed, cwd: workspaceDirectory },
        });

        if (decision === 'reject') {
          return {
            error: `Command \`${trimmed}\` was rejected by user.`,
            rejected: true,
          };
        }
        if (decision === 'always') {
          allowedShellCommands.add(trimmed);
        }
      }

      try {
        const isWindows = process.platform === 'win32';
        const shell = isWindows ? 'cmd.exe' : '/bin/sh';
        const shellArg = isWindows ? '/c' : '-c';

        const { stdout, stderr } = await execFileAsync(
          shell,
          [shellArg, trimmed],
          {
            cwd: workspaceDirectory,
            timeout: SHELL_TIMEOUT_MS,
            maxBuffer: 512 * 1024,
            encoding: 'utf8',
            env: {
              ...process.env,
              NODE_ENV: 'development',
              CI: '1',
            },
          },
        );

        return {
          success: true,
          command: trimmed,
          stdout: stdout.slice(0, 16_000),
          stderr: stderr.slice(0, 8_000),
        };
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string; message?: string };
        return {
          success: false,
          command: trimmed,
          error: e.message ?? String(err),
          stdout: (e.stdout ?? '').slice(0, 8_000),
          stderr: (e.stderr ?? '').slice(0, 8_000),
        };
      }
    },
  });

  return {
    readFile,
    writeFile,
    editFile,
    listFiles,
    grepWorkspace,
    gitStatus,
    gitDiff,
    runShellCommand,
  };
}
