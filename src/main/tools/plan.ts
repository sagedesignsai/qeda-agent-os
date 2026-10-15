/**
 * main/tools/plan.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The two planning tools injected into every agent surface.
 *
 *   createPlan   – called once (or on re-plan) to declare the full task list.
 *   updatePlanItem – called after each task completes to advance its status.
 *
 * Both tools are intentionally lightweight: they mutate the PlanManager and
 * return a brief confirmation string the model can include in its next reasoning
 * step. They have no `execute` side effects beyond the plan state.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { tool } from 'ai';
import { z } from 'zod';
import type { PlanManager } from '../ai/plan-manager.js';

const PlanItemStatusSchema = z.enum([
  'pending',
  'in-progress',
  'done',
  'failed',
]);

/**
 * Build the two planning tools, bound to the given PlanManager instance.
 * Returns a plain object so it can be spread directly into a ToolLoopAgent's
 * `tools` map alongside the surface's existing tools.
 */
export function createPlanTools(manager: PlanManager) {
  return {
    createPlan: tool({
      description: `
Declare the full list of tasks you intend to complete before responding.
Call this FIRST, before using any other tool. If your understanding of the
scope changes mid-run, call createPlan again with a revised list — the UI
will animate the plan replacement.

Each item should be a concrete, one-line action starting with a verb
(e.g. "Read package.json", "Scaffold src/index.ts", "Run npm install").
`.trim(),
      inputSchema: z.object({
        items: z
          .array(
            z.object({
              id: z
                .string()
                .describe(
                  'Short stable id, e.g. "task-1". Must be unique within the plan.',
                ),
              title: z
                .string()
                .describe(
                  'One-line task description starting with a verb. Max ~80 chars.',
                ),
            }),
          )
          .min(1)
          .describe('Ordered list of tasks you will complete.'),
      }),
      execute: async ({ items }) => {
        const plan = manager.createPlan(items);
        return `Plan created (v${plan.version}): ${plan.items.length} task(s) — ${plan.items.map((i) => i.id).join(', ')}.`;
      },
    }),

    updatePlanItem: tool({
      description: `
Update the status of a single plan item. Call this before starting each task
(set to "in-progress") and immediately after completing or failing it
("done" / "failed"). Keep the plan current so the user can track progress.
`.trim(),
      inputSchema: z.object({
        id: z.string().describe('The item id, exactly as used in createPlan.'),
        status: PlanItemStatusSchema.describe(
          '"in-progress" when you start a task, "done" on success, "failed" if you cannot complete it.',
        ),
      }),
      execute: async ({ id, status }) => {
        manager.updateItem(id, status);
        return `Plan item "${id}" → ${status}.`;
      },
    }),
  };
}
