/**
 * main/tools/correspondence-draft-subagent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Correspondence Copilot as a subagent (AI SDK 7, shared helper).
 *
 * The factory is INJECTED by the caller (the chat agent via tools/index.ts) to
 * avoid a static import cycle (agent ⇄ subagent tool). The helper supplies
 * streaming, cancellation, and toModelOutput; this file only owns input schema
 * + summary.
 */

import { z } from 'zod';
import type { ToolLoopAgent } from 'ai';
import { createSubagentTool, type SubagentSummary } from './subagent';

export interface CorrespondenceDraftSubagentOptions {
  /** Build the isolated Correspondence Copilot subagent for one delegation. */
  createAgent: (input: { task: string }) => ToolLoopAgent<any, any, any, any>;
}

export function createCorrespondenceDraftSubagentTool(opts: CorrespondenceDraftSubagentOptions) {
  return createSubagentTool({
    description:
      'Delegate message drafting, reply tracking, or escalation planning to the Correspondence Copilot subagent. ' +
      'The subagent reads the correspondence board, drafts messages with recipients and deadlines, ' +
      'and proposes escalation notes — returning a summary of what was drafted. ' +
      'Use for "draft a follow-up", "check on quiet bodies", or "prepare an escalation". ' +
      'For a single message read use listMessages directly.',
    inputSchema: z.object({
      task: z
        .string()
        .min(3)
        .max(4000)
        .describe('Self-contained correspondence task, e.g. "Draft a follow-up to Acme about the overdue invoice" or "Check which contacts haven\'t replied."'),
    }),
    createAgent: (input) => opts.createAgent(input),
    summarize: ({ task }: { task: string }, text) =>
      `Correspondence Copilot: ${task.slice(0, 120)}. Subagent said: ${text.slice(0, 800)}`,
  });
}

export type CorrespondenceDraftSubagentTool = ReturnType<typeof createCorrespondenceDraftSubagentTool>;
