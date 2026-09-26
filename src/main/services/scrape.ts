/**
 * services/scrape.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Firecrawl scrape client: turn a JavaScript-heavy page into clean markdown
 * that the model can actually read. Unlike tools/web.ts `fetchUrl` (a plain
 * HTTP text extractor), Firecrawl renders the page first, so docs sites and
 * SPAs come back complete.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { requestJson, ServiceHttpError } from './http.js';

export interface ScrapeRequest {
  url: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  /** Cap on returned markdown characters. */
  maxChars?: number;
}

export interface ScrapeResult {
  url: string;
  title: string;
  markdown: string;
  truncated: boolean;
}

interface FirecrawlScrapeResponse {
  success?: boolean;
  error?: string;
  data?: {
    markdown?: string;
    metadata?: { title?: string; sourceURL?: string; statusCode?: number; error?: string };
  };
}

export const FIRECRAWL_SCRAPE_URL = 'https://api.firecrawl.dev/v2/scrape';

export async function firecrawlScrape(req: ScrapeRequest): Promise<ScrapeResult> {
  const maxChars = req.maxChars ?? 24_000;

  const data = await requestJson<FirecrawlScrapeResponse>({
    service: 'Firecrawl',
    url: FIRECRAWL_SCRAPE_URL,
    method: 'POST',
    headers: { Authorization: `Bearer ${req.apiKey}` },
    body: {
      url: req.url,
      formats: ['markdown'],
      onlyMainContent: true,
      blockAds: true,
    },
    fetchImpl: req.fetchImpl,
    timeoutMs: 60_000,
  });

  if (data.success === false) {
    throw new ServiceHttpError('Firecrawl', data.error ?? `Failed to scrape ${req.url}`);
  }

  const markdown = data.data?.markdown ?? '';
  const truncated = markdown.length > maxChars;
  return {
    url: req.url,
    title: data.data?.metadata?.title ?? new URL(req.url).hostname,
    markdown: truncated ? markdown.slice(0, maxChars) : markdown,
    truncated,
  };
}
