/**
 * tools/shell.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AI SDK tool for spawning shell commands.
 *
 * • Streams stdout/stderr together into a single output string.
 * • Enforces a configurable timeout (default 30 s).
 * • ALWAYS requires user approval (set in the agent definition via toolApproval).
 *
 * Safety note: This tool is powerful by design – it gives the agent access to
 * the user's shell. Approval is required for every invocation, and the user
 * can reject any command before it runs.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { tool } from 'ai';
import { spawn } from 'node:child_process';
import { z } from 'zod';

/** Maximum allowed execution time in milliseconds. */
const DEFAULT_TIMEOUT_MS = 30_000;

export const runShellTool = tool({
  description:
    'Execute a shell command and return its combined stdout/stderr output. REQUIRES USER APPROVAL.',
  inputSchema: z.object({
    command: z
      .string()
      .describe('The shell command to execute (passed to /bin/sh -c on Unix).'),
    cwd: z
      .string()
      .optional()
      .describe('Working directory for the command. Defaults to home dir.'),
    timeoutMs: z
      .number()
      .int()
      .min(1000)
      .max(300_000)
      .default(DEFAULT_TIMEOUT_MS)
      .describe('Maximum execution time in milliseconds.'),
  }),
  execute: ({ command, cwd, timeoutMs = DEFAULT_TIMEOUT_MS }) =>
    new Promise<{
      success: boolean;
      exitCode: number | null;
      output: string;
      error?: string;
    }>((resolve) => {
      const chunks: string[] = [];
      let timedOut = false;

      const child = spawn('sh', ['-c', command], {
        cwd,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.stdout.on('data', (d: Buffer) => chunks.push(d.toString()));
      child.stderr.on('data', (d: Buffer) => chunks.push(d.toString()));

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, timeoutMs);

      child.on('close', (code) => {
        clearTimeout(timer);
        const output = chunks.join('');
        if (timedOut) {
          resolve({
            success: false,
            exitCode: null,
            output,
            error: `Command timed out after ${timeoutMs}ms`,
          });
        } else {
          resolve({ success: code === 0, exitCode: code, output });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ success: false, exitCode: null, output: chunks.join(''), error: err.message });
      });
    }),
});

export const shellTools = {
  runShell: runShellTool,
};
