/**
 * tools/workspace.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Agent tools over the knowledge workspace. These are what make Vellum a
 * documentation agent rather than a generic chat agent: the model can look up
 * pages, read them, create new ones and file research reports — all through
 * the same savePageBlocks choke point the editor uses, so FTS, backlinks,
 * tags and versions stay consistent no matter who writes.
 *
 * Research tools (startResearchRun / recordSource / recordEvidence /
 * completeResearchRun) give the model a structured, auditable trail: every
 * claim in a report can be traced back to a source and an evidence quote.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { tool } from 'ai';
import { z } from 'zod';
import {
  createNotebook,
  createPagesForNotebook,
  getNotebook,
  getPage,
  listPages,
  loadPageMarkdown,
  createPageWithBlocks,
  savePageBlocks,
  searchPages,
  listBacklinks,
  listOutgoingLinks,
  listPageTags,
  relatedPages,
  type Page,
} from '../db/workspace.js';
import {
  createResearchRun,
  getResearchRun,
  updateResearchRun,
  addResearchSource,
  addResearchEvidence,
  getRunCitations,
  type ResearchRunStatus,
} from '../db/research.js';
import { parseMarkdownToBlocks } from '../../lib/markdown-blocks.js';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function serializePage(page: Page, tags: string[]): string {
  return [
    `# ${page.title}`,
    `page_id: ${page.id}`,
    tags.length > 0 ? `tags: ${tags.join(', ')}` : '',
    '',
    loadPageMarkdown(page.id),
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function pageSummary(page: Page): {
  id: string;
  title: string;
  notebook_id: string;
  updated_at: number;
} {
  return {
    id: page.id,
    title: page.title,
    notebook_id: page.notebook_id,
    updated_at: page.updated_at,
  };
}

// ─── Page tools ───────────────────────────────────────────────────────────────

export const listPagesTool = tool({
  description:
    'List knowledge-base pages in the workspace. Optionally filter by notebook. Returns id, title, notebook and last-updated for each page.',
  inputSchema: z.object({
    notebookId: z
      .string()
      .optional()
      .describe('Restrict the listing to this notebook.'),
  }),
  execute: async ({ notebookId }) => {
    try {
      const pages = listPages(notebookId);
      return { success: true, pages: pages.map((p) => pageSummary(p)) };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const getPageTool = tool({
  description:
    'Read a knowledge-base page in full: title, tags, markdown body, backlinks and outgoing links. Use findPages first if you only know the topic.',
  inputSchema: z.object({
    pageId: z.string().describe('The page id (from findPages or listPages).'),
  }),
  execute: async ({ pageId }) => {
    try {
      const page = getPage(pageId);
      if (!page) return { success: false, error: `No page with id ${pageId}` };

      const backlinks = listBacklinks(pageId).map((p) => ({
        id: p.id,
        title: p.title,
      }));
      const outgoing = listOutgoingLinks(pageId).map((p) => ({
        id: p.id,
        title: p.title,
      }));
      return {
        success: true,
        page: serializePage(page, listPageTags(pageId)),
        backlinks,
        outgoing,
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const findPagesTool = tool({
  description:
    'Full-text search across all workspace pages (titles and bodies). Returns page ids, titles and matched snippets.',
  inputSchema: z.object({
    query: z.string().describe('Keywords to search for.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(8)
      .describe('Maximum number of hits.'),
  }),
  execute: async ({ query, limit }) => {
    try {
      const hits = searchPages(query, limit);
      return { success: true, hits };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const createNotebookTool = tool({
  description:
    'Create a new notebook — a container for a multi-page document, tutorial or paper. Returns a notebookId to pass to writePage/writeNotebook.',
  inputSchema: z.object({
    title: z.string().describe('Notebook title.'),
    description: z
      .string()
      .optional()
      .describe('One-line summary of what the notebook covers.'),
    icon: z
      .string()
      .optional()
      .describe('Icon keyword, e.g. "flask", "book", "gamepad".'),
  }),
  execute: async ({ title, description, icon }) => {
    try {
      const notebook = createNotebook(
        title,
        description ?? '',
        icon ?? 'notebook',
      );
      return { success: true, notebookId: notebook.id, title: notebook.title };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

/**
 * Batch page writer: builds a whole notebook (overview + nested sections) in
 * one call. Nesting is expressed by parent title or parent page id, and the
 * page bodies are ordinary markdown, so `[[Page Title]]` links cross-link the
 * generated pages through the same savePageBlocks choke point as the editor.
 */
export const writeNotebookTool = tool({
  description:
    'Create a complete multi-page notebook in one call: an ordered list of pages with optional nesting. List a parent page BEFORE its children and nest with parentTitle/parentPageId. Bodies are markdown (headings, lists, code fences, [[Page Title]] links). Returns the created page ids. Use this to generate a full tutorial, guide or paper rather than one page at a time.',
  inputSchema: z.object({
    notebookId: z
      .string()
      .describe('The notebook to build the pages in (from createNotebook).'),
    pages: z
      .array(
        z.object({
          title: z.string().describe('Page title.'),
          markdown: z.string().describe('Full markdown body of the page.'),
          parentTitle: z
            .string()
            .optional()
            .describe(
              'Nest under the page with this title (must be listed earlier).',
            ),
          parentPageId: z
            .string()
            .optional()
            .describe('Nest under this existing page id.'),
        }),
      )
      .min(1)
      .max(40)
      .describe('Pages to create, parents before children.'),
    index: z
      .boolean()
      .default(true)
      .describe(
        'Index the new pages into the semantic (vector) store so they can be used as AI context.',
      ),
  }),
  execute: async ({ notebookId, pages, index }) => {
    try {
      const created = createPagesForNotebook(notebookId, pages);

      // Embedding is best-effort: an unconfigured embedding model must not fail
      // the generation the user just asked for.
      const indexedPageIds: string[] = [];
      if (index) {
        try {
          const { indexPageIntoRag } = await import('./workspace-rag.js');
          for (const item of created) {
            try {
              const page = getPage(item.pageId);
              if (page) {
                await indexPageIntoRag(page);
                indexedPageIds.push(item.pageId);
              }
            } catch {
              // Skip this page; the rest of the notebook still indexes.
            }
          }
        } catch {
          // The RAG module itself was unavailable – ignore.
        }
      }

      return {
        success: true,
        notebookId,
        pages: created,
        indexedPageIds,
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const writePageTool = tool({
  description:
    'Create a new page in a notebook, or overwrite an existing one. Body is markdown; headings, lists, todos, quotes, code fences and dividers become structured blocks. Use findPages/listPages to find page ids, or omit pageId to create.',
  inputSchema: z.object({
    notebookId: z
      .string()
      .describe('Notebook to create the page in (ignored when overwriting).'),
    title: z.string().describe('Page title.'),
    markdown: z.string().describe('Full markdown body of the page.'),
    pageId: z
      .string()
      .optional()
      .describe('Existing page id to overwrite instead of creating.'),
    parentPageId: z
      .string()
      .optional()
      .describe('Optional parent page id for nesting.'),
  }),
  execute: async ({ notebookId, title, markdown, pageId, parentPageId }) => {
    try {
      const blocks = parseMarkdownToBlocks(markdown);
      if (pageId) {
        const page = getPage(pageId);
        if (!page)
          return { success: false, error: `No page with id ${pageId}` };
        savePageBlocks(pageId, blocks, { title, versionOrigin: 'ai' });
        return { success: true, pageId, action: 'overwritten', title };
      }
      const notebook = getNotebook(notebookId);
      if (!notebook)
        return { success: false, error: `No notebook with id ${notebookId}` };
      const page = createPageWithBlocks(
        notebookId,
        title,
        blocks,
        parentPageId ?? null,
      );
      return { success: true, pageId: page.id, action: 'created', title };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const appendToPageTool = tool({
  description:
    'Append markdown content to the end of an existing page without touching its current blocks.',
  inputSchema: z.object({
    pageId: z.string().describe('The page to append to.'),
    markdown: z.string().describe('Markdown to append at the end of the page.'),
  }),
  execute: async ({ pageId, markdown }) => {
    try {
      const page = getPage(pageId);
      if (!page) return { success: false, error: `No page with id ${pageId}` };
      const existing = loadPageMarkdown(pageId);
      const merged = `${existing.trimEnd()}\n\n${markdown.trim()}\n`;
      savePageBlocks(pageId, parseMarkdownToBlocks(merged), {
        versionOrigin: 'ai',
      });
      return { success: true, pageId, title: page.title };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const relatedPagesTool = tool({
  description:
    'Find pages related to a page via shared tags, plus its backlinks and outgoing links. Useful to connect findings into the existing knowledge graph.',
  inputSchema: z.object({
    pageId: z.string().describe('The page to start from.'),
  }),
  execute: async ({ pageId }) => {
    try {
      const page = getPage(pageId);
      if (!page) return { success: false, error: `No page with id ${pageId}` };
      return {
        success: true,
        related: relatedPages(pageId).map((p) => pageSummary(p)),
        backlinks: listBacklinks(pageId).map((p) => pageSummary(p)),
        outgoing: listOutgoingLinks(pageId).map((p) => pageSummary(p)),
        tags: listPageTags(pageId),
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

// ─── Research tools ───────────────────────────────────────────────────────────

export const startResearchRunTool = tool({
  description:
    'Start a deep-research run: an auditable investigation record for one question. Returns a runId you must pass to recordSource, recordEvidence and completeResearchRun.',
  inputSchema: z.object({
    question: z.string().describe('The research question, stated precisely.'),
    pageId: z.string().optional().describe('Attach the run to this page.'),
    notebookId: z
      .string()
      .optional()
      .describe('Attach the run to this notebook.'),
    sessionId: z
      .string()
      .optional()
      .describe('Chat session that initiated the run.'),
  }),
  execute: async ({ question, pageId, notebookId, sessionId }) => {
    try {
      const run = createResearchRun({
        question,
        pageId: pageId ?? null,
        notebookId: notebookId ?? null,
        sessionId: sessionId ?? null,
      });
      return { success: true, runId: run.id };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const recordSourceTool = tool({
  description:
    'Record a source discovered during a research run (a URL from webSearch, a workspace page, or a local file). Duplicate URLs are deduped automatically.',
  inputSchema: z.object({
    runId: z.string().describe('The research run id.'),
    url: z.string().optional().describe('Source URL (web sources).'),
    pageId: z.string().optional().describe('Workspace page id (kind: page).'),
    title: z.string().optional().describe('Human-readable source title.'),
    kind: z
      .enum(['web', 'page', 'file'])
      .default('web')
      .describe('Source kind.'),
    snippet: z
      .string()
      .optional()
      .describe('Short excerpt or summary of the source.'),
  }),
  execute: async ({ runId, url, pageId, title, kind, snippet }) => {
    try {
      const run = getResearchRun(runId);
      if (!run)
        return { success: false, error: `No research run with id ${runId}` };
      const source = addResearchSource({
        runId,
        url: url ?? null,
        pageId: pageId ?? null,
        title: title ?? '',
        kind,
        snippet: snippet ?? '',
      });
      return { success: true, sourceId: source.id };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const recordEvidenceTool = tool({
  description:
    'Attach an evidence quote from a source to a research run. Quote exactly what the source says; add a short note on why it matters. Every claim in the final report should trace back to recorded evidence.',
  inputSchema: z.object({
    runId: z.string().describe('The research run id.'),
    sourceId: z
      .string()
      .describe('The source the quote came from (from recordSource).'),
    quote: z.string().describe('The exact quote from the source.'),
    note: z
      .string()
      .optional()
      .describe('Why this evidence matters for the question.'),
  }),
  execute: async ({ runId, sourceId, quote, note }) => {
    try {
      const run = getResearchRun(runId);
      if (!run)
        return { success: false, error: `No research run with id ${runId}` };
      const evidence = addResearchEvidence({
        runId,
        sourceId,
        quote,
        note: note ?? '',
      });
      return { success: true, evidenceId: evidence.id };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const completeResearchRunTool = tool({
  description:
    'Finish a research run: store the final synthesized report (markdown) and mark it completed or failed. Returns the numbered citation list for the report.',
  inputSchema: z.object({
    runId: z.string().describe('The research run id.'),
    report: z.string().describe('The final synthesized markdown report.'),
    status: z
      .enum(['completed', 'failed', 'cancelled'])
      .default('completed')
      .describe('Final status of the run.'),
  }),
  execute: async ({ runId, report, status }) => {
    try {
      const run = getResearchRun(runId);
      if (!run)
        return { success: false, error: `No research run with id ${runId}` };
      updateResearchRun(runId, { report, status: status as ResearchRunStatus });
      return {
        success: true,
        runId,
        status,
        citations: getRunCitations(runId),
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const workspaceTools = {
  listPages: listPagesTool,
  getPage: getPageTool,
  findPages: findPagesTool,
  createNotebook: createNotebookTool,
  writeNotebook: writeNotebookTool,
  writePage: writePageTool,
  appendToPage: appendToPageTool,
  relatedPages: relatedPagesTool,
  startResearchRun: startResearchRunTool,
  recordSource: recordSourceTool,
  recordEvidence: recordEvidenceTool,
  completeResearchRun: completeResearchRunTool,
};
