/**
 * main/tools/studio-edit-subagent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Studio Copilot as a subagent (AI SDK 7, shared helper).
 *
 * The factory is INJECTED by the caller (the chat agent via tools/index.ts) to
 * avoid a static import cycle (agent ⇄ subagent tool). The helper supplies
 * streaming, cancellation, and toModelOutput; this file only owns input schema
 * + summary.
 */

import { z } from 'zod';
import type { ToolLoopAgent } from 'ai';
import { createSubagentTool, type SubagentSummary } from './subagent';

export interface StudioEditSubagentOptions {
  /** Build the isolated Studio Copilot subagent for one delegation. */
  createAgent: (input: { task: string; takeId?: string }) => ToolLoopAgent<any, any, any, any>;
}

export interface StudioEditSummary extends SubagentSummary {
  takeId?: string;
}

export function createStudioEditSubagentTool(opts: StudioEditSubagentOptions) {
  return createSubagentTool({
    description:
      'Delegate video editing, demo recording, or marketing kit generation to the Studio Copilot subagent. ' +
      'The subagent inspects telemetry, adds kinetic zooms, cuts dead air, sets captions, ' +
      'updates styling, and can even record a demo autonomously — returning a summary of ' +
      'what was edited. Use for "edit this take", "add zooms", "make a demo", or "generate ' +
      'a social kit". For a single zoom or caption use addKineticZoom/setCaptions directly.',
    inputSchema: z.object({
      task: z
        .string()
        .min(3)
        .max(4000)
        .describe('Self-contained editing task, e.g. "Add kinetic zooms to the login demo take" or "Record a demo of the settings page."'),
      takeId: z.string().optional().describe('Existing Studio take id to edit; omit to use the latest take or to record a new demo.'),
    }),
    createAgent: (input) => opts.createAgent(input),
    summarize: ({ task, takeId }: { task: string; takeId?: string }, text) =>
      `Studio Copilot${takeId ? ` for take ${takeId}` : ''}: ${task.slice(0, 120)}. Subagent said: ${text.slice(0, 800)}`,
  });
}

export type StudioEditSubagentTool = ReturnType<typeof createStudioEditSubagentTool>;
