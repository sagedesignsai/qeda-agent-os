/**
 * services/search.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified web-search client across the configured providers. Each provider is
 * mapped into one `SourceResult` shape so the agent tool and the UI renderer
 * do not care where a result came from — only the `provider` tag differs.
 *
 * Every adapter takes an injectable `fetchImpl`, so parsing is unit-testable
 * without network access. Missing keys are handled by the caller (services/keys
 * resolve before we get here), never by silently returning nothing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { braveWebSearch } from '../tools/brave-search.js';
import { requestJson } from './http.js';

export type SearchProvider =
  'tavily' | 'exa' | 'serper' | 'firecrawl' | 'brave';

export const SEARCH_PROVIDERS: SearchProvider[] = [
  'tavily',
  'exa',
  'serper',
  'firecrawl',
  'brave',
];

export interface SourceResult {
  title: string;
  url: string;
  snippet: string;
  provider: SearchProvider;
  publishedDate?: string;
  score?: number;
}

export interface SearchRequest {
  query: string;
  count?: number;
  apiKey: string;
  fetchImpl?: typeof fetch;
  includeDomains?: string[];
  excludeDomains?: string[];
  /** Ask providers that support it for a synthesized answer. */
  includeAnswer?: boolean;
  /** Country code hint (Serper / Tavily). */
  country?: string;
}

export interface SearchResponse {
  results: SourceResult[];
  /** Present when the provider produced a synthesized answer. */
  answer?: string;
}

function clampCount(count: number | undefined): number {
  const n = count ?? 5;
  return Math.min(Math.max(n, 1), 20);
}

function truncate(text: string | undefined | null, max = 400): string {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// ─── Tavily ───────────────────────────────────────────────────────────────────

interface TavilyResponse {
  answer?: string;
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    score?: number;
    published_date?: string;
  }>;
}

async function tavilySearch(req: SearchRequest): Promise<SearchResponse> {
  const data = await requestJson<TavilyResponse>({
    service: 'Tavily',
    url: 'https://api.tavily.com/search',
    method: 'POST',
    headers: { Authorization: `Bearer ${req.apiKey}` },
    body: {
      query: req.query,
      max_results: clampCount(req.count),
      search_depth: 'advanced',
      topic: 'general',
      include_answer: req.includeAnswer ?? false,
      ...(req.includeDomains?.length
        ? { include_domains: req.includeDomains }
        : {}),
      ...(req.excludeDomains?.length
        ? { exclude_domains: req.excludeDomains }
        : {}),
    },
    fetchImpl: req.fetchImpl,
  });

  return {
    results: (data.results ?? [])
      .filter((r) => typeof r.url === 'string' && r.url)
      .map((r) => ({
        title: r.title ?? r.url ?? '',
        url: r.url as string,
        snippet: truncate(r.content),
        provider: 'tavily' as const,
        ...(r.published_date ? { publishedDate: r.published_date } : {}),
        ...(typeof r.score === 'number' ? { score: r.score } : {}),
      })),
    ...(data.answer ? { answer: data.answer } : {}),
  };
}

// ─── Exa ──────────────────────────────────────────────────────────────────────

interface ExaResponse {
  results?: Array<{
    title?: string;
    url?: string;
    text?: string;
    summary?: string;
    publishedDate?: string;
    author?: string;
  }>;
}

async function exaSearch(req: SearchRequest): Promise<SearchResponse> {
  const data = await requestJson<ExaResponse>({
    service: 'Exa',
    url: 'https://api.exa.ai/search',
    method: 'POST',
    headers: { 'x-api-key': req.apiKey },
    body: {
      query: req.query,
      numResults: clampCount(req.count),
      type: 'auto',
      contents: { text: { maxCharacters: 1_200 } },
      ...(req.includeDomains?.length
        ? { includeDomains: req.includeDomains }
        : {}),
      ...(req.excludeDomains?.length
        ? { excludeDomains: req.excludeDomains }
        : {}),
    },
    fetchImpl: req.fetchImpl,
  });

  return {
    results: (data.results ?? [])
      .filter((r) => typeof r.url === 'string' && r.url)
      .map((r) => ({
        title: r.title ?? r.url ?? '',
        url: r.url as string,
        snippet: truncate(r.summary ?? r.text),
        provider: 'exa' as const,
        ...(r.publishedDate ? { publishedDate: r.publishedDate } : {}),
      })),
  };
}

// ─── Serper (Google) ──────────────────────────────────────────────────────────

interface SerperResponse {
  answerBox?: { answer?: string; snippet?: string };
  knowledgeGraph?: { description?: string };
  organic?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
    date?: string;
    position?: number;
  }>;
}

async function serperSearch(req: SearchRequest): Promise<SearchResponse> {
  const data = await requestJson<SerperResponse>({
    service: 'Serper',
    url: 'https://google.serper.dev/search',
    method: 'POST',
    headers: { 'X-API-KEY': req.apiKey },
    body: {
      q: req.query,
      num: clampCount(req.count),
      ...(req.country ? { gl: req.country.toLowerCase() } : {}),
    },
    fetchImpl: req.fetchImpl,
  });

  const answer =
    data.answerBox?.answer ??
    data.answerBox?.snippet ??
    data.knowledgeGraph?.description;
  return {
    results: (data.organic ?? [])
      .filter((r) => typeof r.link === 'string' && r.link)
      .map((r) => ({
        title: r.title ?? r.link ?? '',
        url: r.link as string,
        snippet: truncate(r.snippet),
        provider: 'serper' as const,
        ...(r.date ? { publishedDate: r.date } : {}),
        ...(typeof r.position === 'number'
          ? { score: 1 / (r.position + 1) }
          : {}),
      })),
    ...(answer ? { answer } : {}),
  };
}

// ─── Firecrawl search ─────────────────────────────────────────────────────────

interface FirecrawlSearchResponse {
  success?: boolean;
  data?: { web?: FirecrawlWebResult[] } | FirecrawlWebResult[];
}

interface FirecrawlWebResult {
  title?: string;
  description?: string;
  url?: string;
  markdown?: string;
}

async function firecrawlSearch(req: SearchRequest): Promise<SearchResponse> {
  const data = await requestJson<FirecrawlSearchResponse>({
    service: 'Firecrawl',
    url: 'https://api.firecrawl.dev/v2/search',
    method: 'POST',
    headers: { Authorization: `Bearer ${req.apiKey}` },
    body: {
      query: req.query,
      limit: clampCount(req.count),
      sources: ['web'],
    },
    fetchImpl: req.fetchImpl,
  });

  const web = Array.isArray(data.data) ? data.data : (data.data?.web ?? []);
  return {
    results: web
      .filter((r) => typeof r.url === 'string' && r.url)
      .map((r) => ({
        title: r.title ?? r.url ?? '',
        url: r.url as string,
        snippet: truncate(r.description ?? r.markdown),
        provider: 'firecrawl' as const,
      })),
  };
}

// ─── Brave (existing client) ──────────────────────────────────────────────────

async function braveSearch(req: SearchRequest): Promise<SearchResponse> {
  const results = await braveWebSearch({
    query: req.query,
    count: clampCount(req.count),
    apiKey: req.apiKey,
    ...(req.fetchImpl ? { fetchImpl: req.fetchImpl } : {}),
  });
  return {
    results: results.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      provider: 'brave' as const,
      ...(r.age ? { publishedDate: r.age } : {}),
    })),
  };
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

/** Run one search against the named provider. Throws `ServiceHttpError` on failure. */
export async function searchWithProvider(
  provider: SearchProvider,
  req: SearchRequest,
): Promise<SearchResponse> {
  switch (provider) {
    case 'tavily':
      return tavilySearch(req);
    case 'exa':
      return exaSearch(req);
    case 'serper':
      return serperSearch(req);
    case 'firecrawl':
      return firecrawlSearch(req);
    case 'brave':
      return braveSearch(req);
  }
}
