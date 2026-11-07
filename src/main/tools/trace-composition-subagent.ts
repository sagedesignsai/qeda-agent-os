/**
 * main/tools/trace-composition-subagent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Trace composition as a subagent (AI SDK 7, shared helper).
 *
 * The factory is INJECTED by the caller (the Trace Copilot agent) to avoid a
 * static import cycle (agent ⇄ subagent tool). The helper supplies streaming,
 * cancellation, and toModelOutput; this file only owns input schema + summary.
 */

import { z } from 'zod';
import type { ToolLoopAgent } from 'ai';
import { createSubagentTool, type SubagentSummary } from './subagent';

export interface TraceCompositionSubagentOptions {
  /** Build the isolated Trace subagent for one delegation. */
  createAgent: (projectId: string) => ToolLoopAgent<any, any, any, any>;
}

export interface TraceCompositionSummary extends SubagentSummary {
  projectId: string;
}

export function createTraceCompositionSubagentTool(opts: TraceCompositionSubagentOptions) {
  return createSubagentTool({
    description:
      'Delegate a full 2D vector composition (logo stinger, sponsor card, lower third…) to the Trace composition subagent. ' +
      'The subagent plans, builds elements + animation tracks, lints, and returns a summary with element ids. ' +
      'Use for complete compositions; for single-element tweaks use addElements/setTracks directly.',
    inputSchema: z.object({
      task: z
        .string()
        .min(3)
        .max(4000)
        .describe('Self-contained composition task, e.g. "Full-frame sponsor card: dark slate bg, center logo, two-column features with staggered fade-in."'),
      projectId: z.string().min(1).describe('Active Trace project id.'),
    }),
    createAgent: ({ projectId }: { projectId: string }) => opts.createAgent(projectId),
    summarize: ({ projectId, task }: { projectId: string; task: string }, text) =>
      `Composed for ${projectId}: ${task.slice(0, 120)}. Subagent said: ${text.slice(0, 800)}`,
  });
}

export type TraceCompositionSubagentTool = ReturnType<typeof createTraceCompositionSubagentTool>;
