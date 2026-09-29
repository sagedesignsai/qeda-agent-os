/**
 * tools/brave-search.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Brave Search API client for source discovery in research runs.
 *
 * Kept as a thin, dependency-free module with an injectable fetch so it can be
 * unit-tested without network access. The API key comes from Settings
 * (encrypted store) or BRAVE_API_KEY from the environment — resolved lazily by
 * the caller, never hardcoded here.
 *
 * Endpoint:  GET https://api.search.brave.com/res/v1/web/search
 * Auth:      X-Subscription-Token header
 * ─────────────────────────────────────────────────────────────────────────────
 */

const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
  /** ISO date string, when Brave exposes one. */
  age?: string;
}

export interface BraveSearchOptions {
  query: string;
  count?: number;
  offset?: number;
  country?: string;
  searchLang?: string;
  fetchImpl?: typeof fetch;
  apiKey: string;
}

export class BraveSearchError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'BraveSearchError';
    this.status = status;
  }
}

interface BraveWebResponse {
  web?: {
    results?: Array<{
      title?: string;
      url?: string;
      description?: string;
      age?: string;
    }>;
  };
  query?: { original?: string };
  type?: string;
}

/** Deterministic snippet stripping: tags, entities, collapsed whitespace. */
function cleanSnippet(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Run one web search. Throws `BraveSearchError` on HTTP/network failure with a
 * message that is safe to show to the user (429 = quota exhausted, 401 = bad key).
 */
export async function braveWebSearch(
  options: BraveSearchOptions,
): Promise<WebResult[]> {
  const {
    query,
    count = 5,
    offset = 0,
    country,
    searchLang,
    apiKey,
    fetchImpl = fetch,
  } = options;

  if (!query.trim()) return [];
  if (!apiKey) {
    throw new BraveSearchError(
      'No Brave Search API key configured. Add one in Settings or set BRAVE_API_KEY.',
      401,
    );
  }

  const params = new URLSearchParams({
    q: query,
    count: String(Math.min(Math.max(count, 1), 20)),
  });
  if (offset > 0) params.set('offset', String(offset));
  if (country) params.set('country', country);
  if (searchLang) params.set('search_lang', searchLang);

  let response: Response;
  try {
    response = await fetchImpl(`${BRAVE_SEARCH_URL}?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new BraveSearchError(
      `Brave Search request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    const detail =
      response.status === 429
        ? 'Brave Search quota exhausted (HTTP 429). Free tier allows 1 query/second.'
        : response.status === 401 || response.status === 403
          ? 'Brave Search rejected the API key (HTTP 401/403).'
          : `Brave Search returned HTTP ${response.status}.`;
    throw new BraveSearchError(detail, response.status);
  }

  let payload: BraveWebResponse;
  try {
    payload = (await response.json()) as BraveWebResponse;
  } catch {
    throw new BraveSearchError('Brave Search returned invalid JSON.');
  }

  const results = payload.web?.results ?? [];
  return results
    .filter((r) => typeof r.url === 'string' && r.url.length > 0)
    .map((r) => ({
      title: cleanSnippet(r.title ?? ''),
      url: r.url as string,
      snippet: cleanSnippet(r.description ?? ''),
      ...(r.age ? { age: r.age } : {}),
    }));
}
