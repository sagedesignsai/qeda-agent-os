/**
 * main/tools/subagent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared streaming subagent tool helper (AI SDK 7 pattern).
 *
 * Encapsulates the boilerplate from 06-subagents.mdx:
 *  - fresh subagent per delegation (factory called per execute)
 *  - abortSignal propagation
 *  - async generator + readUIMessageStream/toUIMessageStream preliminary yields
 *  - toModelOutput summary (parent sees only summary text)
 *
 * Domain tools supply: description, inputSchema, factory, summarize.
 */

import { readUIMessageStream, toUIMessageStream, tool } from 'ai';
import { z } from 'zod';
import type { ToolLoopAgent } from 'ai';

export interface SubagentSummary {
  success: boolean;
  summary: string;
  text?: string;
}

export interface CreateSubagentToolOptions<I extends z.ZodType = z.ZodType, S extends SubagentSummary = SubagentSummary> {
  description: string;
  inputSchema: I;
  /** Build a fresh subagent per delegation (snapshots live state). */
  createAgent: (input: z.infer<I>) => ToolLoopAgent<any, any, any, any>;
  /** Turn the subagent's final text + domain diff into the summary text. */
  summarize: (input: z.infer<I>, text: string) => string;
  /** Optional before/after diff counters for the summary. */
  metrics?: {
    before: () => unknown;
    after: () => unknown;
    diff: (before: unknown, after: unknown) => string;
  };
}

export function createSubagentTool<I extends z.ZodType, S extends SubagentSummary>(
  opts: CreateSubagentToolOptions<I, S>,
) {
  return tool({
    description: opts.description,
    inputSchema: opts.inputSchema,
    execute: async function* (input, { abortSignal }) {
      const before = opts.metrics?.before?.();
      let beforeMetrics: unknown = before;

      const subagent = opts.createAgent(input as z.infer<I>) as unknown as {
        stream: (args: { prompt: string; abortSignal?: AbortSignal }) => Promise<{ stream: unknown; text: unknown }>;
      };

      try {
        const result = (await subagent.stream({
          prompt: (input as { task?: string }).task ?? JSON.stringify(input),
          abortSignal,
        })) as { stream: unknown; text: unknown };

        for await (const message of readUIMessageStream({
          stream: toUIMessageStream({ stream: result.stream as never }),
        })) {
          yield message;
        }

        const text = (await (result.text as Promise<string>))?.trim() ?? 'Subagent completed.';
        const afterMetrics = opts.metrics?.after?.() ?? null;
        const diffText =
          opts.metrics && beforeMetrics !== undefined
            ? opts.metrics.diff(beforeMetrics as never, afterMetrics as never)
            : '';

        const summary = opts.summarize(input as z.infer<I>, text) + (diffText ? ` ${diffText}` : '');
        return {
          success: true,
          summary,
          text,
        } as S;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          summary: `Subagent failed: ${message}`,
        } as S;
      }
    },
    toModelOutput: ({ output }) => {
      const s = output as unknown as SubagentSummary | undefined;
      if (!s || typeof s !== 'object' || !('summary' in s)) {
        return { type: 'text' as const, value: 'Subagent completed.' };
      }
      return { type: 'text' as const, value: s.summary };
    },
  });
}

export type SubagentTool = ReturnType<typeof createSubagentTool>;
