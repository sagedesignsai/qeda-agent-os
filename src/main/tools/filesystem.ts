/**
 * tools/filesystem.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AI SDK tool definitions for native file-system access.
 *
 * Exposed tools:
 *   readFile     – read a file's text content
 *   writeFile    – write/overwrite a file (requires approval)
 *   listDir      – list files and directories in a path
 *   deleteFile   – permanently delete a file (requires approval)
 *
 * All paths are resolved with path.resolve() before use. Write / delete
 * operations are flagged as requiring user approval in the agent definition.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { tool } from 'ai';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

// ─── Read File ────────────────────────────────────────────────────────────────

export const readFileTool = tool({
  description: 'Read the text content of a file at the given path.',
  inputSchema: z.object({
    filePath: z.string().describe('Absolute or relative path to the file.'),
    encoding: z
      .enum(['utf8', 'base64'])
      .default('utf8')
      .describe('Text encoding to use when reading.'),
  }),
  execute: async ({ filePath, encoding }) => {
    const resolved = path.resolve(filePath);
    try {
      const content = await fs.readFile(resolved, encoding as BufferEncoding);
      const stat = await fs.stat(resolved);
      return {
        success: true,
        path: resolved,
        content,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

// ─── Write File ───────────────────────────────────────────────────────────────

export const writeFileTool = tool({
  description:
    'Write content to a file. Creates the file (and parent directories) if it does not exist. REQUIRES USER APPROVAL.',
  inputSchema: z.object({
    filePath: z.string().describe('Absolute or relative path to the file.'),
    content: z.string().describe('Text content to write.'),
    createDirs: z
      .boolean()
      .default(true)
      .describe('Automatically create missing parent directories.'),
  }),
  execute: async ({ filePath, content, createDirs }) => {
    const resolved = path.resolve(filePath);
    try {
      if (createDirs) {
        await fs.mkdir(path.dirname(resolved), { recursive: true });
      }
      await fs.writeFile(resolved, content, 'utf8');
      return { success: true, path: resolved, bytesWritten: content.length };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

// ─── List Directory ───────────────────────────────────────────────────────────

export const listDirTool = tool({
  description: 'List the files and subdirectories inside a directory.',
  inputSchema: z.object({
    dirPath: z.string().describe('Absolute or relative path to the directory.'),
    recursive: z
      .boolean()
      .default(false)
      .describe('Recursively list all nested entries.'),
    maxDepth: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(3)
      .describe('Maximum depth when recursive = true.'),
  }),
  execute: async ({ dirPath, recursive, maxDepth }) => {
    const resolved = path.resolve(dirPath);

    async function walk(dir: string, depth: number): Promise<object[]> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return Promise.all(
        entries.map(async (e) => {
          const fullPath = path.join(dir, e.name);
          const base = {
            name: e.name,
            path: fullPath,
            type: e.isDirectory() ? 'directory' : 'file',
          };
          if (recursive && e.isDirectory() && depth < maxDepth) {
            return { ...base, children: await walk(fullPath, depth + 1) };
          }
          return base;
        }),
      );
    }

    try {
      const entries = await walk(resolved, 1);
      return { success: true, path: resolved, entries };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

// ─── Delete File ──────────────────────────────────────────────────────────────

export const deleteFileTool = tool({
  description:
    'Permanently delete a file from the filesystem. REQUIRES USER APPROVAL.',
  inputSchema: z.object({
    filePath: z.string().describe('Absolute or relative path to the file.'),
  }),
  execute: async ({ filePath }) => {
    const resolved = path.resolve(filePath);
    try {
      await fs.unlink(resolved);
      return { success: true, path: resolved };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

/** All FS tools exported as a single map for use in ToolLoopAgent. */
export const filesystemTools = {
  readFile: readFileTool,
  writeFile: writeFileTool,
  listDir: listDirTool,
  deleteFile: deleteFileTool,
};
