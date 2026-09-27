/**
 * ai/terminal-agent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Vellum TerminalAgent — a goal-driven shell agent that breaks a user
 * goal into shell commands, proposes each one for approval, executes approved
 * commands, streams output back as structured TerminalBlock events, and
 * synthesizes a final summary.
 *
 * Architecture
 * ────────────
 * The agent runs as a stateful loop in the main process, *separate* from the
 * chat ToolLoopAgent. It maintains a queue of pending blocks and an approval
 * map (blockId → resolve/reject). Each tool call becomes a TerminalBlock:
 *
 *   1. Agent calls runShell with a command
 *   2. We intercept → create a TerminalBlock with status=pending
 *   3. Emit terminal:block-proposed to renderer
 *   4. Wait for terminal:approve or terminal:reject IPC
 *   5. If approved: actually run the command → stream output → status=done
 *      If rejected: status=skipped, tell agent tool returned "SKIPPED"
 *   6. Loop continues until goal is achieved or step budget is exhausted
 *
 * The agent is given a stripped-down tool set (shell + read-only filesystem)
 * so it stays focused on terminal operations.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { generateText, tool, isStepCount, type LanguageModel } from 'ai';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { resolveModel } from './provider.js';
import { getSettings } from './settings.js';
import {
  appendBlock,
  getBlock,
  updateBlock,
  updateTerminalSession,
  getSessionBlocks,
  type TerminalBlock,
} from '../db/terminal.js';
import {
  getShellExecutable,
  buildExecutionEnv,
  setSessionEnvVar,
  parseExportCommand,
} from './shell-env.js';

// ─── System prompt ────────────────────────────────────────────────────────────

const TERMINAL_AGENT_INSTRUCTIONS = `
You are a terminal agent running inside the Qeda agent suite.

Your job is to achieve a user-provided goal by intelligently composing and running shell commands.

## Approach
1. **Think before acting.** Briefly reason about what the goal requires. Identify the smallest safe set of commands needed.
2. **Prefer read before write.** If the goal is diagnostic or exploratory, start with read-only commands (ls, cat, find, grep, ps, df, etc.) before running anything that modifies state.
3. **One command at a time.** Never chain multiple goals into a single tool call — use separate calls so each can be approved individually.
4. **Explain each command.** In your \`thought\` field, write 1–2 sentences explaining what the command does and why you are running it. This is shown to the user in the approval UI.
5. **Interpret output.** After each command finishes, read the output carefully. If it reveals new information, adjust your plan.
6. **Summarize at the end.** When you have achieved the goal (or determined it is not possible), write a clear, concise summary of what happened and what you found.

## Constraints
- You do NOT have access to the internet, clipboard, or the knowledge workspace. You are a pure shell agent.
- Never run commands that could damage the system without an extremely clear reason. Prefer dry runs (--dry-run, -n) when available.
- If a command fails, diagnose from the output and try an alternative approach rather than giving up immediately.
- Maximum 20 tool calls per goal.

## Output format
After all commands are done, write a markdown summary. Use bullet points for findings. If you fixed something, confirm it worked.
`.trim();

// ─── Approval gate ─────────────────────────────────────────────────────────────

type ApprovalResolve = (approved: boolean) => void;

/** One approval-gate map per active session. */
const approvalGates = new Map<string, Map<string, ApprovalResolve>>();

/** Register a pending approval. Returns a promise that resolves when the user
 *  approves (true) or rejects (false). */
function waitForApproval(sessionId: string, blockId: string): Promise<boolean> {
  let gates = approvalGates.get(sessionId);
  if (!gates) {
    gates = new Map();
    approvalGates.set(sessionId, gates);
  }
  return new Promise<boolean>((resolve) => {
    gates!.set(blockId, resolve);
  });
}

/** Called from the IPC handler when the user approves or rejects a block. */
export function resolveApproval(
  sessionId: string,
  blockId: string,
  approved: boolean,
): void {
  const resolve = approvalGates.get(sessionId)?.get(blockId);
  if (resolve) {
    approvalGates.get(sessionId)!.delete(blockId);
    resolve(approved);
  }
}

/** Cleanup the gate map when a session ends. */
function cleanupApprovalGates(sessionId: string): void {
  approvalGates.delete(sessionId);
}

// ─── Active process tracking & cancellation ───────────────────────────────────

const activeProcesses = new Map<string, ChildProcess>();
const sessionActiveBlocks = new Map<string, Set<string>>();

/**
 * Terminate a running command process (SIGINT first, then SIGKILL if needed).
 * Returns true if an active process was found and signaled.
 */
export function stopCommand(blockId: string): boolean {
  const child = activeProcesses.get(blockId);
  if (!child || !child.pid) return false;
  try {
    if (process.platform !== 'win32') {
      try {
        process.kill(-child.pid, 'SIGINT');
      } catch {
        child.kill('SIGINT');
      }
    } else {
      child.kill('SIGINT');
    }

    // Fallback force-kill if process tree refuses to exit gracefully
    setTimeout(() => {
      if (activeProcesses.has(blockId) && child.pid) {
        try {
          if (process.platform !== 'win32') {
            process.kill(-child.pid, 'SIGKILL');
          } else {
            child.kill('SIGKILL');
          }
        } catch {}
      }
    }, 2500);
    return true;
  } catch {
    return false;
  }
}

/**
 * Terminate all active processes belonging to a given session.
 */
export function stopSessionProcesses(sessionId: string): void {
  const blocks = sessionActiveBlocks.get(sessionId);
  if (blocks) {
    for (const blockId of Array.from(blocks)) {
      stopCommand(blockId);
    }
    sessionActiveBlocks.delete(sessionId);
  }
}

// ─── Command execution ────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 60_000;

function runCommand(
  command: string,
  cwd?: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onChunk?: (chunk: string) => void,
  blockId?: string,
  sessionId?: string,
): Promise<{
  output: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  finalCwd?: string;
}> {
  return new Promise((resolve) => {
    const chunks: string[] = [];
    let timedOut = false;
    let reportedCwd: string | undefined;
    // Wall-clock timing starts before spawn so the number reflects what the
    // user actually waited, matching how Warp reports block duration.
    const startedAt = Date.now();

    const isUnix = process.platform !== 'win32';
    const shellBin = getShellExecutable();
    const env = buildExecutionEnv(sessionId, cwd);

    // Transparent FD3 probe: wrap command in a block that probes final working directory to fd 3
    const wrappedCommand = isUnix
      ? `__c=0\n{\n${command}\n}\n__c=$?\npwd >&3 2>/dev/null\nexit $__c`
      : command;

    const stdio: Array<'ignore' | 'pipe'> = isUnix
      ? ['ignore', 'pipe', 'pipe', 'pipe']
      : ['ignore', 'pipe', 'pipe'];

    const child = spawn(shellBin, ['-c', wrappedCommand], {
      cwd,
      env,
      stdio,
      detached: isUnix,
    });

    if (blockId) {
      activeProcesses.set(blockId, child);
      if (sessionId) {
        let set = sessionActiveBlocks.get(sessionId);
        if (!set) {
          set = new Set();
          sessionActiveBlocks.set(sessionId, set);
        }
        set.add(blockId);
      }
    }

    const handleChunk = (d: Buffer) => {
      const str = d.toString();
      chunks.push(str);
      onChunk?.(str);
    };

    child.stdout?.on('data', handleChunk);
    child.stderr?.on('data', handleChunk);

    if (isUnix && child.stdio[3]) {
      const cwdChunks: string[] = [];
      child.stdio[3].on('data', (d: Buffer) => {
        cwdChunks.push(d.toString());
      });
      child.stdio[3].on('end', () => {
        const full = cwdChunks.join('').trim();
        if (full) {
          const lines = full.split('\n');
          reportedCwd = lines[lines.length - 1]?.trim();
        }
      });
    }

    let timer: NodeJS.Timeout | null = null;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        if (isUnix && child.pid) {
          try {
            process.kill(-child.pid, 'SIGTERM');
          } catch {
            child.kill('SIGTERM');
          }
        } else {
          child.kill('SIGTERM');
        }
      }, timeoutMs);
    }

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (blockId) {
        activeProcesses.delete(blockId);
        if (sessionId) {
          sessionActiveBlocks.get(sessionId)?.delete(blockId);
        }
      }
    };

    child.on('close', (code, signal) => {
      cleanup();
      resolve({
        output: chunks.join(''),
        exitCode: code !== null ? code : signal === 'SIGINT' ? 130 : null,
        timedOut,
        durationMs: Date.now() - startedAt,
        finalCwd: reportedCwd || cwd,
      });
    });

    child.on('error', (err) => {
      cleanup();
      resolve({
        output: err.message,
        exitCode: null,
        timedOut: false,
        durationMs: Date.now() - startedAt,
        finalCwd: cwd,
      });
    });
  });
}

// ─── Event emitter type (injected from handler) ───────────────────────────────

export interface TerminalAgentEmitter {
  /** A block has been proposed; renderer should show approval UI. */
  onBlockProposed(block: TerminalBlock): void;
  /** A block's status/output changed. */
  onBlockUpdated(patch: Partial<TerminalBlock> & { id: string }): void;
  /** The agent finished the entire goal. */
  onDone(sessionId: string, summary: string): void;
  /** Unrecoverable error. */
  onError(sessionId: string, error: string): void;
  /** Working directory changed (e.g. from direct cd command). */
  onCwdChanged?(newCwd: string): void;
}

// ─── Direct execution (Warp-style) ───────────────────────────────────────────

/**
 * Run a command the *user* typed and turn it into a completed block.
 *
 * This is deliberately not routed through the agent or the approval gate: the
 * user authored the command, so consent is already given — exactly how Warp
 * treats commands you type yourself. Approval exists only for commands the
 * *agent* proposes, which the user has not seen yet.
 *
 * Direct commands default to timeoutMs = 0 (no timeout) so long-running
 * processes (like next dev, vite, or docker compose) run continuously until
 * explicitly stopped via SIGINT / Ctrl+C.
 */
export async function executeDirectCommand({
  sessionId,
  command,
  emitter,
  cwd,
  timeoutMs = 0,
}: {
  sessionId: string;
  command: string;
  emitter: TerminalAgentEmitter;
  cwd?: string;
  timeoutMs?: number;
}): Promise<void> {
  const exportVars = parseExportCommand(command);
  if (exportVars) {
    for (const [k, v] of Object.entries(exportVars)) {
      setSessionEnvVar(sessionId, k, v);
    }
  }

  const thought = exportVars ? 'Environment variable updated' : '';
  const block = appendBlock({ sessionId, command, agentThought: thought });
  emitter.onBlockProposed(block);

  updateBlock(block.id, { status: 'running' });
  emitter.onBlockUpdated({ id: block.id, status: 'running' });

  let accumulatedOutput = '';
  let lastEmitTime = 0;
  let emitTimer: NodeJS.Timeout | null = null;

  const flushOutput = () => {
    if (emitTimer) {
      clearTimeout(emitTimer);
      emitTimer = null;
    }
    lastEmitTime = Date.now();
    updateBlock(block.id, { output: accumulatedOutput });
    emitter.onBlockUpdated({ id: block.id, output: accumulatedOutput });
  };

  const onChunk = (chunk: string) => {
    accumulatedOutput += chunk;
    const now = Date.now();
    if (now - lastEmitTime > 100) {
      flushOutput();
    } else if (!emitTimer) {
      emitTimer = setTimeout(flushOutput, 100);
    }
  };

  const { output, exitCode, timedOut, durationMs, finalCwd } = await runCommand(
    command,
    cwd,
    timeoutMs,
    onChunk,
    block.id,
    sessionId,
  );

  if (emitTimer) clearTimeout(emitTimer);

  // 0 is normal success; 130 is SIGINT (user Ctrl+C) which is a clean stop
  const finalStatus: TerminalBlock['status'] =
    timedOut ? 'error' : exitCode === 0 || exitCode === 130 ? 'done' : 'error';
  const finalOutput = timedOut ? `${output}\n[Command timed out]` : output;

  updateBlock(block.id, {
    status: finalStatus,
    output: finalOutput,
    exit_code: exitCode,
    duration_ms: durationMs,
  });
  emitter.onBlockUpdated({
    id: block.id,
    status: finalStatus,
    output: finalOutput,
    exit_code: exitCode,
    duration_ms: durationMs,
  });

  // Track resulting working directory from FD3 probe
  if (finalCwd && finalCwd !== cwd) {
    try {
      updateTerminalSession(sessionId, { cwd: finalCwd });
      emitter.onCwdChanged?.(finalCwd);
    } catch {}
  }

  // Notify finish so session status is updated from 'running' to 'done' or 'error'
  if (finalStatus === 'done') {
    emitter.onDone(sessionId, finalOutput);
  } else {
    emitter.onError(sessionId, finalOutput);
  }
}

// ─── Agent tool set ───────────────────────────────────────────────────────────

/**
 * Build the terminal-specific tool set with the approval gate wired in.
 * Each tool call goes through the block → propose → approval → execute cycle.
 */
function buildTerminalTools(
  sessionId: string,
  emitter: TerminalAgentEmitter,
) {
  const runShell = tool({
    description:
      'Run a shell command. Each call will be shown to the user for approval before executing. Use the `thought` field to explain WHY you are running this command.',
    inputSchema: z.object({
      command: z.string().describe('The shell command to run (passed to sh -c).'),
      cwd: z.string().optional().describe('Working directory. Defaults to home.'),
      thought: z
        .string()
        .describe('1–2 sentences explaining what this command does and why.'),
      timeoutMs: z
        .number()
        .int()
        .min(1000)
        .max(120_000)
        .default(DEFAULT_TIMEOUT_MS)
        .optional()
        .describe('Timeout in milliseconds.'),
    }),
    execute: async ({ command, cwd, thought, timeoutMs }) => {
      // 1. Persist a pending block
      const block = appendBlock({
        sessionId,
        command,
        agentThought: thought,
      });

      // 2. Notify renderer to show the approval card
      emitter.onBlockProposed(block);

      // 3. Wait for user decision
      const approved = await waitForApproval(sessionId, block.id);

      if (!approved) {
        updateBlock(block.id, { status: 'skipped' });
        emitter.onBlockUpdated({ id: block.id, status: 'skipped' });
        return { skipped: true, output: 'Command was rejected by the user.' };
      }

      // 4. Mark running
      updateBlock(block.id, { status: 'running' });
      emitter.onBlockUpdated({ id: block.id, status: 'running' });

      // 5. Execute with live output streaming
      let accumulatedOutput = '';
      let lastEmitTime = 0;
      let emitTimer: NodeJS.Timeout | null = null;

      const flushOutput = () => {
        if (emitTimer) {
          clearTimeout(emitTimer);
          emitTimer = null;
        }
        lastEmitTime = Date.now();
        updateBlock(block.id, { output: accumulatedOutput });
        emitter.onBlockUpdated({ id: block.id, output: accumulatedOutput });
      };

      const onChunk = (chunk: string) => {
        accumulatedOutput += chunk;
        const now = Date.now();
        if (now - lastEmitTime > 100) {
          flushOutput();
        } else if (!emitTimer) {
          emitTimer = setTimeout(flushOutput, 100);
        }
      };

      const { output, exitCode, timedOut, durationMs } = await runCommand(
        command,
        cwd,
        timeoutMs ?? DEFAULT_TIMEOUT_MS,
        onChunk,
        block.id,
      );

      if (emitTimer) clearTimeout(emitTimer);

      const finalStatus: TerminalBlock['status'] =
        timedOut ? 'error' : exitCode === 0 ? 'done' : 'error';
      const finalOutput = timedOut
        ? `${output}\n[Command timed out]`
        : output;

      updateBlock(block.id, {
        status: finalStatus,
        output: finalOutput,
        exit_code: exitCode,
        duration_ms: durationMs,
      });
      emitter.onBlockUpdated({
        id: block.id,
        status: finalStatus,
        output: finalOutput,
        exit_code: exitCode,
        duration_ms: durationMs,
      });

      return {
        skipped: false,
        exitCode,
        output: finalOutput,
        success: exitCode === 0,
        durationMs,
      };
    },
  });

  const readFileTool = tool({
    description: 'Read the contents of a file. Does not require approval.',
    inputSchema: z.object({
      path: z.string().describe('Absolute or relative file path.'),
      maxBytes: z
        .number()
        .int()
        .max(200_000)
        .default(50_000)
        .optional()
        .describe('Maximum bytes to read (default 50 000).'),
    }),
    execute: async ({ path, maxBytes = 50_000 }) => {
      try {
        const buf = await readFile(path);
        const content = buf.toString('utf8').slice(0, maxBytes);
        return { content, truncated: buf.byteLength > maxBytes };
      } catch (err: unknown) {
        return { error: (err as Error).message };
      }
    },
  });

  const listDirTool = tool({
    description: 'List files and directories at a path. Does not require approval.',
    inputSchema: z.object({
      path: z.string().describe('Directory path to list.'),
    }),
    execute: async ({ path }) => {
      try {
        const entries = await readdir(path, { withFileTypes: true });
        const items = await Promise.all(
          entries.slice(0, 200).map(async (e) => {
            try {
              const s = await stat(`${path}/${e.name}`);
              return {
                name: e.name,
                type: e.isDirectory() ? 'dir' : 'file',
                size: s.size,
              };
            } catch {
              return { name: e.name, type: e.isDirectory() ? 'dir' : 'file', size: 0 };
            }
          }),
        );
        return { items, truncated: entries.length > 200 };
      } catch (err: unknown) {
        return { error: (err as Error).message };
      }
    },
  });

  return { runShell, readFile: readFileTool, listDir: listDirTool };
}

// ─── Agent runner ─────────────────────────────────────────────────────────────

export interface RunGoalOptions {
  sessionId: string;
  goal: string;
  emitter: TerminalAgentEmitter;
}

/**
 * Run a goal asynchronously. Returns immediately; progress is communicated
 * via the emitter. The caller is responsible for persisting the goal on the
 * session row before calling this.
 */
export async function runGoal({
  sessionId,
  goal,
  emitter,
}: RunGoalOptions): Promise<void> {
  const settings = getSettings();
  const model = resolveModel(
    settings.activeProvider,
    settings.activeModel,
  ) as LanguageModel;

  updateTerminalSession(sessionId, { status: 'running' });

  try {
    const tools = buildTerminalTools(sessionId, emitter);

    const result = await generateText({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      model: model as any,
      system: TERMINAL_AGENT_INSTRUCTIONS,
      prompt: goal,
      tools,
      stopWhen: isStepCount(20),
    });

    // Final text is the agent's summary
    const summary = result.text?.trim() ?? 'Goal completed.';

    updateTerminalSession(sessionId, {
      status: 'done',
      title: goal.length > 60 ? `${goal.slice(0, 57)}…` : goal,
    });

    emitter.onDone(sessionId, summary);
  } catch (err: unknown) {
    const message = (err as Error)?.message ?? 'Unknown error';
    updateTerminalSession(sessionId, { status: 'error' });
    emitter.onError(sessionId, message);
  } finally {
    cleanupApprovalGates(sessionId);
  }
}

// ─── Block explanation & fixing ───────────────────────────────────────────────

/**
 * Build transcript context for a block: the commands that ran *before* it.
 *
 * Ordering matters. An earlier implementation took `.slice(-5)` of every block
 * in the session, so explaining block 1 of 10 would hand the model blocks 6–10 —
 * later events it should not be reasoning from. Context must walk backwards
 * from the target.
 */
function precedingContext(block: TerminalBlock, limit = 5): string {
  return getSessionBlocks(block.session_id)
    .filter((b) => b.position < block.position)
    .slice(-limit)
    .map((b) => `$ ${b.command}\n${b.output}`)
    .join('\n---\n');
}

/**
 * Ask the model to explain the output of a finished terminal block in plain
 * language. This is a single non-streaming generateText call — no tool loop.
 */
export async function explainBlock(blockId: string): Promise<string> {
  const settings = getSettings();
  const model = resolveModel(settings.activeProvider, settings.activeModel);

  const block = getBlock(blockId);
  if (!block) return 'Block not found.';

  const context = precedingContext(block);
  const promptSections = [
    context ? `Recent terminal context:\n${context}` : '',
    `Explain this output:\n$ ${block.command}\n${block.output}`,
  ].filter(Boolean);

  const result = await generateText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: model as any,
    system:
      'You are a terminal expert. Explain shell command output in plain language. Be concise (2–4 sentences). Focus on what the output means, not the command syntax.',
    prompt: promptSections.join('\n\n'),
    stopWhen: isStepCount(1),
  });

  const explanation = result.text?.trim() ?? '';

  // Persist the explanation
  updateBlock(blockId, { explanation });

  return explanation;
}

/**
 * Ask the model to diagnose a failed command and propose a replacement.
 *
 * Returns `{ diagnosis, command }` where `command` is a single runnable line —
 * or empty when the failure is not something a command can fix (a permissions
 * problem, a missing tool, a typo in the user's intent). The renderer puts that
 * command into the input bar rather than running it, so the user still reviews
 * it before anything executes. Warp does the same, and it keeps the "nothing
 * runs unseen" invariant intact.
 */
export async function suggestFix(
  blockId: string,
): Promise<{ diagnosis: string; command: string }> {
  const settings = getSettings();
  const model = resolveModel(settings.activeProvider, settings.activeModel);

  const block = getBlock(blockId);
  if (!block) return { diagnosis: 'Block not found.', command: '' };

  const context = precedingContext(block);

  const result = await generateText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: model as any,
    system: [
      'You are a shell debugging expert. A command failed; diagnose why and propose a fix.',
      '',
      'Respond with ONLY a JSON object, no prose and no code fences:',
      '{"diagnosis": "<one or two sentences on the cause>", "command": "<a single replacement shell command>"}',
      '',
      'Rules for "command":',
      '- It must be a single line, runnable as-is via sh -c.',
      '- Do not include a leading $, nor any commentary inside the string.',
      '- If the failure cannot be fixed by running a command (for example the',
      '  cause is a permission the user lacks, a missing system package, or the',
      '  original command simply did the wrong thing), return an empty string.',
    ].join('\n'),
    prompt: [
      context ? `Earlier commands in this session:\n${context}` : '',
      'The failed command:',
      `$ ${block.command}`,
      '',
      `Exit code: ${block.exit_code ?? 'unknown'}`,
      'Output:',
      block.output || '(no output)',
    ]
      .filter(Boolean)
      .join('\n'),
    stopWhen: isStepCount(1),
  });

  const raw = result.text?.trim() ?? '';

  // The model may still wrap the JSON in fences despite instructions.
  const unfenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');

  try {
    const parsed = JSON.parse(unfenced) as {
      diagnosis?: string;
      command?: string;
    };
    return {
      diagnosis: parsed.diagnosis?.trim() || 'No diagnosis available.',
      command: (parsed.command ?? '').trim(),
    };
  } catch {
    // Unparseable output is still useful as an explanation, but there is no
    // safe command to offer — never guess at something that will be executed.
    return { diagnosis: raw || 'Could not analyse this failure.', command: '' };
  }
}
