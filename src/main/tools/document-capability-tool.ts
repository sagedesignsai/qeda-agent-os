/**
 * main/tools/document-capability-tool.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * getDocumentCapability — the queryable capability surface over the Document
 * system (Motion/Trace pattern). Read-only, classified `read` in the drafter
 * policy. Derived from the PdfBlock union; never hand-written prose.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { discoverDocumentCapability } from '../ai/document-capability';

export function createDocumentCapabilityTool() {
  return tool({
    description:
      'Ask what the Document system can do before drafting. Returns grounded guidance: ' +
      'recommended composition patterns (proposal, memo, letter, invoice…), the block types that express them ' +
      'with their key props, and design practices. Call this FIRST for any non-trivial draft ' +
      '("How do I structure an invoice?", "Which blocks express a proposal?") to ground output in real system capabilities.',
    inputSchema: z.object({
      query: z.string().min(3).max(500).describe('What you want to draft or know, e.g. "How do I structure an invoice with line items?"'),
    }),
    execute: async ({ query }) => discoverDocumentCapability(query),
  });
}

export type DocumentCapabilityTool = ReturnType<typeof createDocumentCapabilityTool>;
