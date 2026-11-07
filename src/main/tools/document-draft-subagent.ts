/**
 * main/tools/document-draft-subagent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Document drafting as a subagent (AI SDK 7, shared helper).
 * Factory injected by the caller to avoid an import cycle.
 */

import { z } from 'zod';
import type { ToolLoopAgent } from 'ai';
import { createSubagentTool, type SubagentSummary } from './subagent';

export interface DocumentDraftSubagentOptions {
  /** Build the isolated drafter subagent for one delegation. */
  createAgent: (input: { task: string; documentId?: string }) => ToolLoopAgent<any, any, any, any>;
}

export interface DocumentDraftSummary extends SubagentSummary {
  documentId?: string;
}

export function createDocumentDraftSubagentTool(opts: DocumentDraftSubagentOptions) {
  return createSubagentTool({
    description:
      'Delegate a complete document draft (proposal, memo, invoice…) to the drafting subagent. ' +
      'The subagent discovers capabilities, plans, and writes blocks, returning a summary with open placeholders. ' +
      'Use for full drafts; for single-block edits use appendBlocks/replaceBlock directly.',
    inputSchema: z.object({
      task: z
        .string()
        .min(3)
        .max(4000)
        .describe('Self-contained drafting task, e.g. "Draft an invoice for Acme: 3 line items, total, payment terms." Include parties, figures, dates.'),
      documentId: z.string().optional().describe('Existing document to revise; omit to create a new one.'),
    }),
    createAgent: ({ task, documentId }: { task: string; documentId?: string }) => opts.createAgent({ task, documentId }),
    summarize: ({ task, documentId }: { task: string; documentId?: string }, text) =>
      `Drafted in ${documentId ?? 'new document'}: ${task.slice(0, 120)}. Subagent said: ${text.slice(0, 800)}`,
  });
}

export type DocumentDraftSubagentTool = ReturnType<typeof createDocumentDraftSubagentTool>;
