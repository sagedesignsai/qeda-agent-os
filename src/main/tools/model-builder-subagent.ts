/**
 * main/tools/model-builder-subagent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Model Builder as a subagent (AI SDK 7 pattern).
 *
 * The Model Builder `ToolLoopAgent` is exposed to a parent agent (Motion
 * Copilot, Desktop Agent) as a single `buildModel` tool. The parent delegates
 * context-heavy 3D construction to an isolated subagent; only a concise
 * summary returns to the parent context (see `toModelOutput` rationale in
 * node_modules/ai/docs/03-agents/06-subagents.mdx).
 *
 * Key rules from the SDK docs, honoured here:
 *  - Fresh subagent per delegation (doc snapshot at construction).
 *  - `abortSignal` propagates to the subagent for cancellation.
 *  - Subagents cannot use `toolApproval` — Model Builder tools are
 *    approval-free (destructive ops are handled via plan tokens upstream).
 *  - Instructions demand a final summary so the parent gets useful signal.
 */
import { readUIMessageStream, toUIMessageStream, tool } from 'ai';
import { z } from 'zod';
import { createModelBuilderAgent } from '../ai/model-builder-agent';
import type { ModelTarget } from '../ai/fallback';
import type { MotionToolContext } from './motion';

export interface ModelBuilderSubagentOptions {
  getDocument: MotionToolContext['getDocument'];
  apply: MotionToolContext['apply'];
  /** Optional model target for the subagent; defaults to activeProvider/Model. */
  target?: ModelTarget;
}

export interface ModelBuilderSubagentSummary {
  success: boolean;
  summary: string;
  nodesAdded: number;
  assetsAdded: number;
  revision: number;
  text?: string;
}

const buildModelInputSchema = z.object({
  task: z
    .string()
    .min(3)
    .max(4000)
    .describe('Self-contained modeling task, e.g. "Build a low-poly chair: seat, back, 4 legs, wood material". Include scene context the subagent needs.'),
  style: z
    .enum(['lowpoly', 'pbr', 'stylized'])
    .optional()
    .describe('Preferred material style if Blender generation is used.'),
});

export function createModelBuilderSubagentTool(opts: ModelBuilderSubagentOptions) {
  return tool({
    description:
      'Delegate a complex 3D modeling task to the Model Builder subagent. ' +
      'The subagent autonomously plans and builds geometry/materials/lighting and returns a summary. ' +
      'Use for hero assets or multi-part models; for simple node tweaks use motion.scene.director directly.',
    inputSchema: buildModelInputSchema,
    // Streaming subagent per SDK docs 06-subagents.mdx: generator yields
    // accumulated UIMessages as preliminary results so the UI shows progress.
    execute: async function* ({ task }, { abortSignal }) {
      const before = opts.getDocument();
      const beforeNodes = before.scenes.reduce((s, sc) => s + sc.nodes.length, 0);
      const beforeAssets = before.assets.length;
      const beforeRevision = before.revision;

      // Construct per-call: instructions snapshot the live document.
      const subagent = createModelBuilderAgent({
        getDocument: opts.getDocument,
        apply: opts.apply,
        target: opts.target,
      });

      try {
        const result = await subagent.stream({
          prompt: task,
          abortSignal,
        });

        for await (const message of readUIMessageStream({
          stream: toUIMessageStream({ stream: result.stream as never }),
        })) {
          yield message;
        }

        const text = (await result.text)?.trim() ?? 'Model build complete.';
        const after = opts.getDocument();
        const afterNodes = after.scenes.reduce((s, sc) => s + sc.nodes.length, 0);
        const afterAssets = after.assets.length;

        const summary: ModelBuilderSubagentSummary = {
          success: true,
          summary:
            `Built task: ${task.slice(0, 120)}.` +
            ` Nodes ${beforeNodes}→${afterNodes}, assets ${beforeAssets}→${afterAssets}, revision ${beforeRevision}→${after.revision}.` +
            ` Subagent said: ${text.slice(0, 800)}`,
          nodesAdded: afterNodes - beforeNodes,
          assetsAdded: afterAssets - beforeAssets,
          revision: after.revision,
          text,
        };
        return summary;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          summary: `Model Builder subagent failed: ${message}`,
          nodesAdded: 0,
          assetsAdded: 0,
          revision: beforeRevision,
        } as ModelBuilderSubagentSummary;
      }
    },
    // Keep the parent context clean: the model sees only the summary.
    // Preliminary (streamed) messages are replaced by the final summary.
    toModelOutput: ({ output }) => {
      const s = output as unknown as ModelBuilderSubagentSummary | undefined;
      if (!s || typeof s !== 'object' || !('summary' in s)) {
        return { type: 'text' as const, value: 'Model Builder subagent completed.' };
      }
      return { type: 'text' as const, value: s.summary };
    },
  });
}

export type ModelBuilderSubagentTool = ReturnType<typeof createModelBuilderSubagentTool>;
