/**
 * services/docs.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Context7 client: version-specific, up-to-date library documentation and code
 * snippets. This is what keeps generated notebooks (Jules API, Godot, …) from
 * citing stale or hallucinated APIs — the agent asks for the real docs.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { requestJson } from './http.js';

export interface DocsRequest {
  query: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  /** Fuzzy or exact library hints (e.g. "next.js", "/vercel/next.js"). Max 4. */
  libraries?: string[];
  /** Optional programming language preference. */
  language?: string;
  /** Optional version constraint (e.g. "15.2", "v4"). */
  version?: string;
}

export interface DocsCodeSnippet {
  title: string;
  description: string;
  language: string;
  /** The snippet in its primary language. */
  code: string;
  /** Source page or repo path when available. */
  source?: string;
}

export interface DocsInfoSnippet {
  breadcrumb: string;
  content: string;
  pageId?: string;
}

export interface DocsResult {
  codeSnippets: DocsCodeSnippet[];
  infoSnippets: DocsInfoSnippet[];
}

interface Context7Response {
  codeSnippets?: Array<{
    codeTitle?: string;
    codeDescription?: string;
    codeLanguage?: string;
    codeList?: Array<{ language?: string; code?: string }>;
    sourceFile?: string;
    pageTitle?: string;
  }>;
  infoSnippets?: Array<{ breadcrumb?: string; content?: string; pageId?: string }>;
}

const CONTEXT7_SEARCH_URL = 'https://context7.com/api/v3/search';

export async function context7Docs(req: DocsRequest): Promise<DocsResult> {
  const params = new URLSearchParams({ query: req.query, type: 'json' });
  for (const library of (req.libraries ?? []).slice(0, 4)) {
    params.append('library', library);
  }
  if (req.language) params.set('language', req.language);
  if (req.version) params.set('version', req.version);

  const data = await requestJson<Context7Response>({
    service: 'Context7',
    url: `${CONTEXT7_SEARCH_URL}?${params.toString()}`,
    headers: { Authorization: `Bearer ${req.apiKey}` },
    fetchImpl: req.fetchImpl,
  });

  const codeSnippets: DocsCodeSnippet[] = (data.codeSnippets ?? []).map((snippet) => {
    const primary = snippet.codeList?.[0];
    return {
      title: snippet.codeTitle ?? snippet.pageTitle ?? 'Snippet',
      description: snippet.codeDescription ?? '',
      language: snippet.codeLanguage ?? primary?.language ?? 'text',
      code: primary?.code ?? '',
      ...(snippet.sourceFile ? { source: snippet.sourceFile } : {}),
    };
  });

  const infoSnippets: DocsInfoSnippet[] = (data.infoSnippets ?? []).map((snippet) => ({
    breadcrumb: snippet.breadcrumb ?? '',
    content: snippet.content ?? '',
    ...(snippet.pageId ? { pageId: snippet.pageId } : {}),
  }));

  return { codeSnippets, infoSnippets };
}
