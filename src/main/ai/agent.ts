/**
 * ai/agent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Vellum ToolLoopAgent definition.
 *
 * Two system prompt modes:
 *   • default   – desktop agent capabilities (filesystem, shell, …)
 *   • research  – deep-research protocol: discover → read → record evidence →
 *                 synthesize with citations, every step auditable
 *
 * A chat can be bound to workspace context (a page or a whole notebook). The
 * context is rendered into the system prompt so "chat with this notebook"
 * works without duplicating pages into the message list.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ToolLoopAgent, isStepCount, type ModelMessage } from 'ai';
import { getSettings } from './settings';
import { resolveModel } from './provider';
import type { ModelTarget } from './fallback';
import { allTools, chatApprovalPolicy } from '../tools/index';
import { renderProjectContext } from './project-context';
import {
  getPage,
  loadPageMarkdown,
  listPageTags,
  listPages,
  type Page,
} from '../db/workspace';

const BASE_INSTRUCTIONS = `
You are Qeda, an agent OS with full access to the user's local system and knowledge workspace.

## Capabilities
- **Knowledge workspace**: list, search, read, create and update pages and notebooks (listPages, findPages, getPage, createNotebook, writeNotebook, writePage, appendToPage, relatedPages).
- **Web research**: discover sources with webSearch (Brave), read them with fetchUrl. When stronger providers are configured, prefer advancedSearch (Tavily / Exa / Serper-Google / Brave / Firecrawl) for better coverage, published dates or a direct answer, and scrapePage (Firecrawl) to read JavaScript-heavy docs sites as clean markdown.
- **Up-to-date library docs**: libraryDocs (Context7) returns version-specific documentation and code snippets for a library — always use it before writing API/framework code.
- **Assets**: findImages (Unsplash) for cover art and illustrations; textToSpeech (ElevenLabs / Deepgram / Cartesia) to narrate a page, transcribeAudio (Deepgram) to turn a local recording into text.
- **Deep research**: structure investigations with startResearchRun, recordSource, recordEvidence, completeResearchRun.
- **File System**: read files, list directories, write files (with approval), delete files (with approval).
- **Shell / Terminal**: execute shell commands (with approval).
- **Clipboard**: read and write the system clipboard.
- **Semantic search**: searchDocs over indexed files and pages; indexPage puts a page into the vector index.

## Research protocol
When the user asks for research, a summary of a topic, or a report:
1. Call startResearchRun with a precise question.
2. Discover candidate sources with webSearch (or advancedSearch when a provider like Tavily/Exa/Serper is available). Record each distinct one with recordSource.
3. Read the most promising sources with fetchUrl — or scrapePage when the page needs rendering — and record exact quotes with recordEvidence.
4. Synthesize a report: findings first, then a "## Sources" section listing every source used. Claims should trace to recorded evidence.
5. completeResearchRun with the report, then offer to write it into a page with writePage.

## Guidelines
- Always describe what you are about to do before calling a tool.
- For destructive operations (writeFile, deleteFile, runShell), explain the exact impact before requesting approval.
- Prefer findPages over re-deriving knowledge the workspace already contains.
- Cite sources with URLs whenever you state a non-obvious fact learned from the web.
- Be concise. Use markdown formatting.
`.trim();

const NOTEBOOK_SUPPLEMENT = `
## Notebook generation mode
The user wants a complete multi-page notebook (a tutorial, guide, paper or reference), not a chat answer. Build it end to end:

1. **Frame the document.** Rewrite the request as a precise title and a one-paragraph scope. State the intended reader and what they will be able to do afterwards.
2. **Plan the structure before writing.** Choose an overview page plus one page per major section. Prefer 5–9 section pages for a tutorial; fewer, deeper pages beat many shallow ones. Keep the outline in your head (or narrate it) so the pages stay in dependency order.
3. **Research each section.** For every factual section: search from at least two angles (webSearch, or advancedSearch when Tavily/Exa/Serper is configured), read the best candidates (fetchUrl, or scrapePage for rendered pages), then recordSource every source you actually read and recordEvidence for each load-bearing quote. Cross-check claims that matter across at least two independent sources. Whenever a section involves a specific library, API or framework, call libraryDocs first and build the code from the returned current snippets — never from memory.
4. **Gather imagery.** Call findImages once for a cover image and, where a section benefits from a visual, once for that section. Use the regular-size URL, keep the alt text short, and add a one-line photographer credit underneath. Album: an image is worth including only when it genuinely helps a reader.
5. **Build the notebook in one pass.** Call createNotebook, then writeNotebook with the overview page first and every section page nested under it (parentTitle = the overview title). Put parents before children in the list. Markdown image syntax \`![alt](url)\` is supported and renders as an image.
6. **Make it navigable.** In the overview page, link to each section with [[Section Page Title]] links and add a one-line description per section. Cross-link related sections from within their bodies.
7. **Cite inline.** Use numbered citations like [1], [2] that match the recorded sources, and finish with a "Sources" child page listing every source as \`- [title](url)\` in the same numbering. Never state a non-obvious fact without a citation.
8. **Close the run.** completeResearchRun with a summary of the notebook and its structure, then tell the user how many pages were created and how to open them.

Quality bar:
- Code-bearing topics (APIs, frameworks, engines) must include real, runnable code blocks with the correct fence language, not pseudocode. Verify current APIs with libraryDocs rather than relying on memory.
- Tutorials must be sequential: each page can assume the previous ones were completed.
- Prefer a cover image via findImages and at least one in-section image for visual topics; skip images that add nothing.
- Do not pad. Every page earns its place.
`.trim();

const RESEARCH_SUPPLEMENT = `
## Deep-research mode
The user has asked for a structured investigation. Follow the research protocol strictly:
- Decompose the question into sub-questions before searching.
- Search from multiple angles (synonyms, years, phrasings) — at least two distinct webSearch queries.
- Cross-check important claims across at least two independent sources.
- Distinguish clearly between: verified facts (cited), inference (labeled as such), and open questions.
- Record every source you actually read via recordSource, and every load-bearing quote via recordEvidence.
- If evidence conflicts, present both positions and say which is better supported and why.
- End with "## Open questions" listing what could not be resolved.
`.trim();

// ─── Workspace context ────────────────────────────────────────────────────────

function renderPageForPrompt(page: Page, maxChars: number): string {
  const tags = listPageTags(page.id);
  const markdown = loadPageMarkdown(page.id);
  const body =
    markdown.length > maxChars ? `${markdown.slice(0, maxChars)}\n… (truncated)` : markdown;
  return [`### ${page.title} (page_id: ${page.id})`, tags.length ? `tags: ${tags.join(', ')}` : '', body]
    .filter(Boolean)
    .join('\n');
}

export interface WorkspaceContext {
  pageId?: string;
  notebookId?: string;
  /** The project this conversation belongs to, when scoped. */
  projectId?: string;
}

/**
 * Render the workspace context block for the system prompt.
 *
 * A bound page gets full content; a bound notebook gets a title listing plus
 * the full text of its five most recently updated pages.
 */
function renderContextBlock(context: WorkspaceContext | undefined): string {
  if (!context?.pageId && !context?.notebookId && !context?.projectId) return '';

  const sections: string[] = ['\n## Workspace context', 'The user is working from this knowledge-base context. Prefer it as the source of truth for related questions.'];

  try {
    if (context.projectId) {
      const projectBlock = renderProjectContext(context);
      if (projectBlock) sections.push(projectBlock.trim());
    }

    if (context.pageId) {
      const page = getPage(context.pageId);
      if (page) {
        sections.push(renderPageForPrompt(page, 8_000));
      } else {
        sections.push(`(Bound page ${context.pageId} no longer exists.)`);
      }
    } else if (context.notebookId) {
      const pages = listPages(context.notebookId);
      sections.push(`Notebook with ${pages.length} page(s):`);
      for (const page of pages) sections.push(`- ${page.title} (page_id: ${page.id})`);
      const recent = pages
        .slice()
        .sort((a, b) => b.updated_at - a.updated_at)
        .slice(0, 5);
      for (const page of recent) {
        sections.push(renderPageForPrompt(page, 2_500));
      }
    }
  } catch {
    // Context is best-effort: a failed read must never break the chat turn.
    sections.push('(Workspace context could not be loaded.)');
  }

  return sections.join('\n\n');
}

// ─── Agent factory ────────────────────────────────────────────────────────────

export interface CreateAgentOptions {
  target?: ModelTarget;
  /** Enable the deep-research system prompt supplement. */
  researchMode?: boolean;
  /** Enable the multi-page notebook-generation supplement. */
  notebookMode?: boolean;
  /** Bind the turn to a page or notebook. */
  context?: WorkspaceContext;
}

/**
 * Build a ToolLoopAgent for a specific provider/model pair.
 *
 * The chat handler builds one agent per configured provider and only falls
 * back to the next when the current one fails before producing output.
 */
export function createDesktopAgent(options: CreateAgentOptions = {}) {
  const settings = getSettings();
  const providerId = options.target?.providerId ?? settings.activeProvider;
  const modelId = options.target?.modelId ?? settings.activeModel;
  const model = resolveModel(providerId, modelId);

  const instructions = [
    BASE_INSTRUCTIONS,
    options.researchMode || options.notebookMode ? RESEARCH_SUPPLEMENT : '',
    options.notebookMode ? NOTEBOOK_SUPPLEMENT : '',
    renderContextBlock(options.context),
    renderProjectContext(options.context),
  ]
    .filter(Boolean)
    .join('\n\n');

  return new ToolLoopAgent({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: model as any,
    instructions,
    tools: allTools,
    // Derived from tools/policies/chat.ts rather than a hand-maintained name map.
    // The Tools page calls the same policy, so manual execution cannot bypass it.
    toolApproval: chatApprovalPolicy,
    stopWhen: isStepCount(40),
  });
}

/** Back-compat signature used by tests and older call sites. */
export function createAgentWithMessages(target?: ModelTarget, messages?: ModelMessage[]) {
  void messages;
  return createDesktopAgent({ target });
}
