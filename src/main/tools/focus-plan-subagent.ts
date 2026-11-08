/**
 * main/tools/focus-plan-subagent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Focus Copilot as a subagent (AI SDK 7, shared helper).
 *
 * The factory is INJECTED by the caller (the chat agent via tools/index.ts) to
 * avoid a static import cycle (agent ⇄ subagent tool). The helper supplies
 * streaming, cancellation, and toModelOutput; this file only owns input schema
 * + summary.
 */

import { z } from 'zod';
import type { ToolLoopAgent } from 'ai';
import { createSubagentTool, type SubagentSummary } from './subagent';

export interface FocusPlanSubagentOptions {
  /** Build the isolated Focus Copilot subagent for one delegation. */
  createAgent: (input: { task: string; projectId?: string }) => ToolLoopAgent<any, any, any, any>;
}

export interface FocusPlanSummary extends SubagentSummary {
  projectId?: string;
}

export function createFocusPlanSubagentTool(opts: FocusPlanSubagentOptions) {
  return createSubagentTool({
    description:
      'Delegate task planning, scheduling, and work breakdown to the Focus Copilot subagent. ' +
      'The subagent reads the task board, researches context, creates or breaks down tasks, ' +
      'and schedules time blocks — returning a summary of what was planned. ' +
      'Use for "plan my day", "break this down", "schedule these tasks", or any request ' +
      'that involves multiple task or scheduling steps. For a single task creation use ' +
      'createTask directly.',
    inputSchema: z.object({
      task: z
        .string()
        .min(3)
        .max(4000)
        .describe('Self-contained planning task, e.g. "Plan my day around the login bug fix and the invoice draft." or "Break down task-123 into smaller steps."'),
      projectId: z.string().optional().describe('Optional project id to scope tasks to.'),
    }),
    createAgent: (input) => opts.createAgent(input),
    summarize: ({ task, projectId }: { task: string; projectId?: string }, text) =>
      `Focus Copilot${projectId ? ` for ${projectId}` : ''}: ${task.slice(0, 120)}. Subagent said: ${text.slice(0, 800)}`,
  });
}

export type FocusPlanSubagentTool = ReturnType<typeof createFocusPlanSubagentTool>;
