/**
 * lib/notebook-prompt.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure builder for the chat prompt that drives notebook generation. Kept free
 * of React/Electron so it is trivially unit-testable and reusable from any
 * entry point (dialog, palette, tests).
 *
 * The prompt names the agent tools explicitly and mirrors the notebook
 * protocol in the system prompt (src/main/ai/agent.ts), so the free-form and
 * structured paths converge on the same output shape: an overview page,
 * nested section pages, inline citations and a Sources page.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type NotebookDepth = 'quick' | 'standard' | 'deep';

/** Scope paragraph per depth, injected into the prompt. */
export const DEPTH_SCOPE: Record<NotebookDepth, string> = {
  quick:
    'Scope: a concise overview plus 3–4 section pages. Prioritise breadth and the fastest path to a working result.',
  standard:
    'Scope: an overview plus 5–7 section pages with practical, copy-pasteable examples.',
  deep: 'Scope: an overview plus 8–12 section pages. Research each section thoroughly, cover advanced and edge cases, and cross-check important claims across multiple independent sources.',
};

export interface BuildNotebookPromptOptions {
  topic: string;
  depth?: NotebookDepth;
  audience?: string;
}

/** Compose the chat prompt that drives notebook generation. */
export function buildNotebookPrompt({
  topic,
  depth = 'standard',
  audience,
}: BuildNotebookPromptOptions): string {
  const scope = DEPTH_SCOPE[depth] ?? DEPTH_SCOPE.standard;
  return [
    'Generate a complete Vellum notebook.',
    '',
    `Topic: ${topic.trim()}`,
    audience?.trim() ? `Intended reader: ${audience.trim()}` : '',
    scope,
    '',
    'Follow the notebook-generation protocol exactly:',
    '1. Start a deep-research run (startResearchRun) for this topic.',
    '2. Plan an overview page plus one page per major section, nested under the overview.',
    '3. Research every factual section: search from multiple angles (webSearch, or advancedSearch when a provider is configured), read the best sources (fetchUrl, or scrapePage for rendered pages), and record each source you read with recordSource plus its load-bearing quotes with recordEvidence. Cross-check claims that matter.',
    '4. For EVERY section that involves a specific library, API, framework or engine, call libraryDocs (Context7) with the library name before writing that section, and build the code from the current snippets it returns — never from memory. Name the version you targeted.',
    '5. Add imagery: call findImages once for a cover image and, where a section benefits from a visual, once for that section. Embed the chosen images in the markdown as ![short alt text](image url); use the regular-size URL and include the photographer credit as a caption line.',
    '6. Create the notebook with createNotebook, then build all pages in a single writeNotebook call — overview first, section pages nested under it.',
    '7. Cite sources inline as [1], [2]… matching the recorded sources, and finish with a "Sources" child page listing every source as `- [title](url)` in the same numbering.',
    '8. Link the overview to each section with [[Section Title]] links and cross-link related sections.',
    '9. Close the run with completeResearchRun and tell me how many pages were created.',
    '',
    'Include real, runnable code blocks (with the correct fence language) wherever the topic involves code — markdown image syntax ![alt](url) is supported and renders as an image. Do not pad.',
  ]
    .filter((line) => line !== '')
    .join('\n');
}
