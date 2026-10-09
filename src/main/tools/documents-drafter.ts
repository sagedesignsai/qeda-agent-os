/**
 * tools/documents-drafter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The complete tool surface of the Document Drafter agent.
 *
 * This set is deliberately INCOMPLETE, and that incompleteness is the safety
 * boundary. There is intentionally no tool here that:
 *
 *   • exports a document to disk (PDF/HTML/DOCX write-out),
 *   • writes an arbitrary file,
 *   • runs a shell command,
 *   • deletes a document,
 *   • or completes / marks a task as done.
 *
 * Those five verbs are exactly what turns "drafts a document for a human to
 * review" into "sends an unreviewed legal document to a counterparty", so the
 * agent can only ever mutate rows inside the documents table and hand control
 * back to the user. Do NOT add them "for completeness" — a drafter that can
 * export and send has no human in the loop at all, which defeats the entire
 * purpose of the agent. Anything beyond in-app drafting is a user action in
 * the Document Studio UI.
 *
 * ONE DELIBERATE EXCEPTION TO "MUTATES ONLY DOCUMENTS TABLE"
 * ──────────────────────────────────────────────────────────
 * Two READ-ONLY tools reach the filesystem: `listProjectFiles` and
 * `readProjectFile`, from `./project-files.ts`. The drafter needs the matter's
 * existing material to ground a draft in something real, and no document-store
 * tool can supply it. They read only inside the folder the user configured on
 * the project, resolve the root from the project id (never from a model-authored
 * path), refuse absolute paths, `..` and symlink escapes, and cap their output —
 * so "reads the project folder" is not "can read the disk". They are classified
 * `read` in `policies/drafter.ts`, which is the same class the chat agent uses
 * for `readFile`/`listDir`; the containment, not the capability label, is what
 * keeps this scoped.
 *
 * Non-obvious constraints:
 *   • `data_json` is the whole `PdfDocument` body as a single JSON string. We
 *     never re-serialise it from scratch — we spread the parsed object and
 *     overwrite only `blocks`, so `settings`, `nodes`, `templateId` and any
 *     future top-level field survive a write untouched.
 *   • `data_json` may be corrupt (a half-written row, a hand-edited DB). We
 *     parse defensively: unparseable content degrades to `{ blocks: [] }` and
 *     is reported back to the model as a `warning` rather than thrown, because
 *     throwing mid-draft would strand the user's document.
 *   • Every block that reaches the DB gets an `id`, because `replaceBlock` and
 *     `getDocumentOutline` address blocks by id.
 *   • Tool output is kept SMALL on purpose (see `tasks.ts` `serializeTask`).
 *     Write tools return counts and ids; the only tools that return content are
 *     `readDocument` (trimmed) and `readProjectFile` (byte-capped), and both say
 *     so when they clip. A document body — or a source file — echoed back whole
 *     into the context window on every edit is how a drafting run burns its
 *     budget.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { tool } from 'ai';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { getDocument, saveDocument } from '../db/documents.js';
import type { PdfDocumentRecord } from '../db/documents.js';
import { projectFilesTools } from './project-files.js';
import type { PdfBlock } from '../../lib/pdf-studio/types.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * The provenance banner prepended to every AI-authored document. A legal
 * document that reads as human-final is the failure mode that actually hurts
 * someone, so this is not decoration — it is the agent stating, in the
 * artifact itself, that no human has checked the facts yet.
 */
const PROVENANCE_TEXT =
  'AI-generated draft — not reviewed by a human — verify all facts, figures, legal references and recipients before sending.';

const PROVENANCE_TITLE = 'Draft — not reviewed';

/** Per-block preview cap in `readDocument` output. */
const READ_BLOCK_PREVIEW_CAP = 400;

/** Total character budget for the whole `readDocument` payload. */
const READ_TOTAL_CAP = 6000;

/** Preview cap in `getDocumentOutline` — this tool is the cheap orientation call. */
const OUTLINE_PREVIEW_CAP = 80;

/** Upper bound on how many blocks one write tool call may introduce. */
const MAX_BLOCKS_PER_WRITE = 200;

// ─── Schema ───────────────────────────────────────────────────────────────────

const BLOCK_TYPES = [
  'heading',
  'paragraph',
  'columns',
  'table',
  'callout',
  'metrics',
  'divider',
  'page-break',
  'signature',
  'image',
] as const;

/**
 * Blocks are a wide discriminated union in `pdf-studio/types.ts`; mirroring all
 * ten variants in a zod schema would bloat the model's JSON schema and reject
 * legitimate calls on a stray optional field. We validate the two fields the
 * tool layer itself depends on (`type`, `id`) and pass the rest through
 * untouched — `PdfBlock` typing is a compile-time guarantee, not a runtime one.
 */
const blockSchema = z.looseObject({
  type: z
    .enum(BLOCK_TYPES)
    .describe(
      'Block type. heading: {level 1-4, text}. paragraph: {content}. callout: {variant, text}. table: {columns, rows}. signature: {signeeName, role, company}. divider / page-break: {}.',
    ),
  id: z
    .string()
    .optional()
    .describe(
      'Existing block id, when overwriting a known block. Generated if omitted.',
    ),
});

const blocksSchema = z
  .array(blockSchema)
  .min(1)
  .max(MAX_BLOCKS_PER_WRITE)
  .describe('Ordered list of blocks to add to the document.');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** The editable top-level shape of `data_json`, plus what we know about it. */
interface DocumentBody {
  /** Every parsed top-level field, preserved verbatim for the next write. */
  data: Record<string, unknown>;
  blocks: PdfBlock[];
  /** Set when `data_json` was unusable — surfaced to the model, never thrown. */
  warning?: string;
}

/**
 * Parse `data_json` without ever throwing. A document whose body is corrupt is
 * still a document the user owns, so we report the damage and carry on with an
 * empty block list rather than refusing to look at it.
 */
function parseDocumentBody(record: PdfDocumentRecord): DocumentBody {
  let parsed: unknown;
  try {
    parsed = JSON.parse(record.data_json);
  } catch {
    return {
      data: {},
      blocks: [],
      warning:
        'Stored document body could not be parsed as JSON and was treated as empty. Any write will replace it with a fresh block list.',
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      data: {},
      blocks: [],
      warning:
        'Stored document body was not a JSON object and was treated as empty. Any write will replace it with a fresh block list.',
    };
  }

  const data = parsed as Record<string, unknown>;
  const rawBlocks = data.blocks;
  if (!Array.isArray(rawBlocks)) {
    return {
      data,
      blocks: [],
      warning: 'Document body had no blocks array; treated as empty.',
    };
  }

  // Drop entries that are not object-shaped so downstream `.type` reads on a
  // primitive can never become a crash inside `previewOf`.
  const blocks = rawBlocks.filter(
    (b): b is PdfBlock => !!b && typeof b === 'object' && !Array.isArray(b),
  );

  const dropped = rawBlocks.length - blocks.length;
  return {
    data,
    blocks,
    ...(dropped > 0
      ? { warning: `${dropped} malformed block entries were ignored.` }
      : {}),
  };
}

/** Ensure every block has a stable id — `replaceBlock` addresses blocks by id. */
function withIds(blocks: PdfBlock[]): PdfBlock[] {
  return blocks.map((b) => (b.id ? b : { ...b, id: nanoid() }));
}

/** Best-effort human-readable text for a block, whatever its type. */
function blockText(block: PdfBlock): string {
  switch (block.type) {
    case 'heading':
      return block.text ?? '';
    case 'paragraph':
      return block.content ?? '';
    case 'callout':
      return [block.title, block.text].filter(Boolean).join(': ');
    case 'signature':
      return [block.signeeName, block.role, block.company]
        .filter(Boolean)
        .join(', ');
    case 'image':
      return block.caption ?? block.src ?? '';
    case 'table':
      return (block.columns ?? [])
        .map((c) => c.header)
        .filter(Boolean)
        .join(' | ');
    case 'metrics':
      return (block.items ?? [])
        .map((i) => `${i.label}: ${i.value}`)
        .join(', ');
    case 'columns':
      return (block.columns ?? [])
        .map((c) => c.title ?? `${(c.blocks ?? []).length} blocks`)
        .join(' | ');
    default:
      return '';
  }
}

/** Collapse whitespace and clip to `cap`, marking the clip. */
function clip(text: string, cap: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= cap) return flat;
  return `${flat.slice(0, cap)}…`;
}

/**
 * Persist a mutated block list back onto an existing row, preserving every
 * other top-level field of `data_json` (settings, nodes, templateId, …) and the
 * row's own title / description / template / project.
 */
function writeBlocks(
  record: PdfDocumentRecord,
  data: Record<string, unknown>,
  blocks: PdfBlock[],
): void {
  saveDocument({
    id: record.id,
    projectId: record.project_id,
    title: record.title,
    description: record.description,
    templateId: record.template_id,
    dataJson: JSON.stringify({ ...data, blocks }),
  });
}

/** Shared preamble for the three mutating tools: load or fail. */
function requireDocument(documentId: string): {
  record: PdfDocumentRecord;
  body: DocumentBody;
} | null {
  const record = getDocument(documentId);
  if (!record) return null;
  return { record, body: parseDocumentBody(record) };
}

// ─── Tools ────────────────────────────────────────────────────────────────────

/**
 * Start a new document row.
 *
 * The document is always filed under the caller's `projectId` when one is
 * supplied — the agent is running inside a client's matter, and drafts that
 * drift out of that project stop being that client's work as far as the UI is
 * concerned.
 *
 * A provenance callout is prepended at index 0 unless the caller opts out with
 * `skipProvenance: true`. It exists so that any document this agent produces is
 * self-identifying as unreviewed.
 */
export const createDocument = tool({
  description:
    'Create a new document for drafting. Optionally supply the opening blocks. Returns the new documentId — use it with appendBlocks / insertBlocksAt / replaceBlock to build up the body. A provenance notice is prepended automatically unless skipProvenance is true.',
  inputSchema: z.object({
    title: z.string().min(1).describe('Document title.'),
    description: z
      .string()
      .optional()
      .describe('One-line summary of what this document covers.'),
    projectId: z
      .string()
      .optional()
      .describe(
        'Project (client matter) to file the draft under. Omit to file it at top level.',
      ),
    blocks: z
      .array(blockSchema)
      .max(MAX_BLOCKS_PER_WRITE)
      .optional()
      .describe('Optional opening blocks, in order.'),
    skipProvenance: z
      .boolean()
      .optional()
      .describe(
        'Set true to omit the "AI-generated draft — not reviewed" callout. Only for a document the user is explicitly re-authoring in their own words.',
      ),
  }),
  execute: async ({
    title,
    description,
    projectId,
    blocks,
    skipProvenance,
  }) => {
    try {
      const provenance: PdfBlock = {
        id: nanoid(),
        type: 'callout',
        variant: 'warning',
        title: PROVENANCE_TITLE,
        text: PROVENANCE_TEXT,
      };

      const supplied = withIds((blocks ?? []) as PdfBlock[]);
      const body = skipProvenance ? supplied : [provenance, ...supplied];

      const documentId = nanoid();

      saveDocument({
        id: documentId,
        projectId: projectId ?? null,
        title,
        description: description ?? '',
        templateId: '',
        dataJson: JSON.stringify({ blocks: body }),
      });

      return {
        success: true,
        documentId,
        title,
        blockCount: body.length,
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

/**
 * Read a document's body so the agent can revise it.
 *
 * This is the only tool that returns content, and it returns it TRIMMED: each
 * block is reduced to its id, type and a short text preview, with a total
 * character budget. A full NDA pasted into a context window three times in one
 * revision loop costs more than it informs — the model needs to know what the
 * document says and which ids to address, not a byte-exact copy.
 */
export const readDocument = tool({
  description:
    'Read a document: title, description and a trimmed preview of every block (id, type, text). Use getDocumentOutline first if you only need the shape of the document — this is the expensive call.',
  inputSchema: z.object({
    documentId: z.string().describe('The document to read.'),
  }),
  execute: async ({ documentId }) => {
    try {
      const found = requireDocument(documentId);
      if (!found)
        return { success: false, error: `No document with id ${documentId}` };

      const { record, body } = found;
      const out: Array<{ id: string; type: string; preview: string }> = [];
      let budget = READ_TOTAL_CAP;
      let clippedAt = -1;

      for (const block of body.blocks) {
        if (budget <= 0) {
          clippedAt = out.length;
          break;
        }
        const preview = clip(
          blockText(block),
          Math.min(READ_BLOCK_PREVIEW_CAP, budget),
        );
        out.push({ id: block.id, type: block.type, preview });
        budget -= preview.length;
      }

      return {
        success: true,
        documentId,
        title: record.title,
        description: record.description,
        blockCount: body.blocks.length,
        blocks: out,
        truncated: clippedAt >= 0,
        note:
          clippedAt >= 0
            ? `Preview truncated: first ${clippedAt} of ${body.blocks.length} blocks shown. Read the document in the Document Studio UI for the remainder.`
            : `Blocks are summarised, not verbatim: previews are capped at ${READ_BLOCK_PREVIEW_CAP} characters per block and ${READ_TOTAL_CAP} characters total.`,
        ...(body.warning ? { warning: body.warning } : {}),
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

/**
 * Cheap structural summary: one line per block, no content beyond a short
 * preview. This is the orientation call — the model should reach for it before
 * `readDocument` to decide whether reading the body is worth the tokens.
 */
export const getDocumentOutline = tool({
  description:
    'Compact structural summary of a document: index, block id, type and a short preview for each block. Use this to orient before the costlier readDocument.',
  inputSchema: z.object({
    documentId: z.string().describe('The document to summarise.'),
  }),
  execute: async ({ documentId }) => {
    try {
      const found = requireDocument(documentId);
      if (!found)
        return { success: false, error: `No document with id ${documentId}` };

      const { record, body } = found;

      return {
        success: true,
        documentId,
        title: record.title,
        outline: body.blocks.map((block, index) => ({
          index,
          blockId: block.id,
          type: block.type,
          preview: clip(blockText(block), OUTLINE_PREVIEW_CAP),
        })),
        totalBlocks: body.blocks.length,
        ...(body.warning ? { warning: body.warning } : {}),
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

/** Add blocks to the end of the document. Additive — never overwrites. */
export const appendBlocks = tool({
  description:
    'Append blocks to the end of a document. Returns the number added and the new total.',
  inputSchema: z.object({
    documentId: z.string().describe('The document to append to.'),
    blocks: blocksSchema,
  }),
  execute: async ({ documentId, blocks }) => {
    try {
      const found = requireDocument(documentId);
      if (!found)
        return { success: false, error: `No document with id ${documentId}` };

      const { record, body } = found;
      const next = [...body.blocks, ...withIds(blocks as PdfBlock[])];
      writeBlocks(record, body.data, next);

      return {
        success: true,
        documentId,
        added: blocks.length,
        totalBlocks: next.length,
        ...(body.warning ? { warning: body.warning } : {}),
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

/**
 * Splice blocks into the middle of the document.
 *
 * The index is clamped rather than rejected at the extremes: an off-by-a-little
 * index is a model arithmetic slip, not a destructive request, and refusing it
 * would waste a round trip on a reversible problem. The returned `insertedAt`
 * is the clamped position that was actually used, so the model can see the
 * correction instead of silently getting a different placement.
 */
export const insertBlocksAt = tool({
  description:
    'Insert blocks at a specific position in a document (0 = before the first block). The index is clamped to the document bounds; the clamped position is returned as insertedAt.',
  inputSchema: z.object({
    documentId: z.string().describe('The document to insert into.'),
    index: z
      .number()
      .int()
      .min(0)
      .describe(
        'Zero-based position to insert at. Clamped to [0, blockCount].',
      ),
    blocks: blocksSchema,
  }),
  execute: async ({ documentId, index, blocks }) => {
    try {
      if (!Number.isInteger(index) || index < 0) {
        return { success: false, error: 'index must be an integer >= 0' };
      }

      const found = requireDocument(documentId);
      if (!found)
        return { success: false, error: `No document with id ${documentId}` };

      const { record, body } = found;
      const insertedAt = Math.min(index, body.blocks.length);
      const next = [...body.blocks];
      next.splice(insertedAt, 0, ...withIds(blocks as PdfBlock[]));
      writeBlocks(record, body.data, next);

      return {
        success: true,
        documentId,
        insertedAt,
        inserted: blocks.length,
        totalBlocks: next.length,
        ...(body.warning ? { warning: body.warning } : {}),
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

/**
 * Overwrite exactly one block, matched by `blockId`.
 *
 * This is the destructive tool in the set. The others are additive — append
 * and insert can be undone by a human reading the outline — but this one
 * silently replaces existing prose with no record of what was there, which is
 * why it is the one classified `destructive` when the agent's tool policy is
 * declared (see `tools/policies/*.ts` and `tools/capability.ts`). It is scoped
 * to a single named block precisely to keep the blast radius that small: there
 * is no "replace everything" variant.
 *
 * A missing block id is a `{ success: false }` result, not a throw — the model
 * should get a chance to re-read the outline and correct its id rather than see
 * the whole run fail.
 */
export const replaceBlock = tool({
  description:
    'Overwrite ONE existing block, matched by its blockId (from getDocumentOutline or readDocument). Everything else in the document is untouched. Prefer appendBlocks/insertBlocksAt where possible.',
  inputSchema: z.object({
    documentId: z.string().describe('The document containing the block.'),
    blockId: z.string().describe('Id of the block to overwrite.'),
    block: blockSchema.describe(
      'The replacement block. Its id is set to blockId.',
    ),
  }),
  execute: async ({ documentId, blockId, block }) => {
    try {
      const found = requireDocument(documentId);
      if (!found)
        return { success: false, error: `No document with id ${documentId}` };

      const { record, body } = found;
      const index = body.blocks.findIndex((b) => b.id === blockId);
      if (index < 0) {
        return { success: false, error: `No block with id ${blockId}` };
      }

      // The blockId is authoritative: a replacement that carried a different id
      // would break the model's own later references to this block.
      const next = [...body.blocks];
      next[index] = { ...(block as PdfBlock), id: blockId };
      writeBlocks(record, body.data, next);

      return {
        success: true,
        documentId,
        blockId,
        replacedAt: index,
        totalBlocks: next.length,
        ...(body.warning ? { warning: body.warning } : {}),
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

/**
 * The drafter's full tool set. This object is the agent's whole capability —
 * `Object.keys(documentDrafterTools)` is the complete list of things the
 * Document Drafter can do to the machine.
 *
 * Six document tools, plus the two project-file reads spread in from
 * `./project-files.ts`. Those two are the drafter's ONLY reach outside the
 * document store, and they are reads confined to the project folder the user
 * already configured: names only for `listProjectFiles`, a byte-capped prefix
 * for `readProjectFile`, no shell, no write, no arbitrary path. Spreading a
 * group here rather than inlining two imports keeps the "what can this agent
 * touch" answer in one object — but note it also means `allTools` (chat) picks
 * these two up, since it spreads every registered group.
 */
export const documentDrafterTools = {
  createDocument,
  readDocument,
  getDocumentOutline,
  appendBlocks,
  insertBlocksAt,
  replaceBlock,
  ...projectFilesTools,
};
