/**
 * tools/web.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Web research tool definitions for the Vellum agent.
 *
 *   webSearch – discover sources via the Brave Search API
 *   fetchUrl  – read a page's text content (HTML → readable text)
 *
 * fetchUrl is deliberately a text extractor, not a renderer: it strips
 * scripts/styles/tags and collapses whitespace so an LLM can consume the page.
 * Both tools are read-only, so they never appear in the approval policy.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { tool } from 'ai';
import { z } from 'zod';
import { braveWebSearch, BraveSearchError } from './brave-search.js';
import { htmlToText, extractTitle } from './html-text.js';
import { getSettings } from '../ai/settings.js';
import { envApiKey } from '../ai/registry.js';

/** Resolve the Brave key: encrypted Settings store first, then environment. */
function resolveBraveKey(): string {
  const fromSettings = getSettings().braveApiKey;
  if (fromSettings && fromSettings.trim()) return fromSettings.trim();
  const fromEnv = process.env.BRAVE_API_KEY;
  return fromEnv?.trim() ?? '';
}

// ─── webSearch ────────────────────────────────────────────────────────────────

export const webSearchTool = tool({
  description:
    'Search the public web for sources. Returns a list of results with title, URL and snippet. Use it to discover candidate sources before reading them with fetchUrl.',
  inputSchema: z.object({
    query: z.string().describe('The search query. Be specific; add the current year for recent topics.'),
    count: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5)
      .describe('How many results to return.'),
  }),
  execute: async ({ query, count }) => {
    try {
      const results = await braveWebSearch({
        query,
        count,
        apiKey: resolveBraveKey(),
      });
      return { success: true, query, results };
    } catch (err) {
      const message =
        err instanceof BraveSearchError
          ? err.message
          : `Web search failed: ${err instanceof Error ? err.message : String(err)}`;
      return { success: false, error: message };
    }
  },
});

// ─── fetchUrl ─────────────────────────────────────────────────────────────────

/** HTML → plain text conversion lives in the pure ./html-text.ts module. */
export { htmlToText } from './html-text.js';

const MAX_FETCH_CHARS = 24_000;

function truncate(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max), truncated: true };
}

export const fetchUrlTool = tool({
  description:
    'Fetch a web page and return its readable text content. Use after webSearch to read a specific source. Reaches only http(s) URLs.',
  inputSchema: z.object({
    url: z.string().url().describe('The http(s) URL to fetch.'),
    maxChars: z
      .number()
      .int()
      .min(1_000)
      .max(50_000)
      .default(24_000)
      .describe('Maximum characters of text to return.'),
  }),
  execute: async ({ url, maxChars }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { success: false, error: `Unsupported protocol: ${parsed.protocol}` };
      }

      const response = await fetch(parsed, {
        headers: {
          // Some sites 404 plain fetches without a UA.
          'User-Agent': 'Mozilla/5.0 (compatible; VellumResearchBot/1.0)',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status} fetching ${url}` };
      }

      const contentType = response.headers.get('content-type') ?? '';
      const raw = await response.text();
      const text = contentType.includes('html') ? htmlToText(raw) : raw;
      const limited = truncate(text, maxChars);

      return {
        success: true,
        url,
        title: extractTitle(raw) ?? parsed.hostname,
        contentType,
        text: limited.text,
        truncated: limited.truncated,
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to fetch ${url}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
});

export const webTools = {
  webSearch: webSearchTool,
  fetchUrl: fetchUrlTool,
};
