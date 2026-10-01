/**
 * __tests__/services.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The external-service clients are thin HTTP wrappers, so the valuable tests
 * are the response mappings and the error translation. Every client takes an
 * injectable `fetchImpl`, so none of this touches the network.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { searchWithProvider, searchAuto } from '../main/services/search';
import { firecrawlScrape } from '../main/services/scrape';
import { context7Docs } from '../main/services/docs';
import { unsplashSearch } from '../main/services/images';
import { synthesizeSpeech, deepgramTranscribe } from '../main/services/speech';
import { ServiceHttpError } from '../main/services/http';
import { resolveSearchCandidates } from '../main/services/keys';
import {
  getService,
  envServiceKey,
  servicesByCategory,
} from '../main/services/registry';

// ─── Fake fetch helpers ───────────────────────────────────────────────────────

interface Call {
  url: string;
  init?: RequestInit;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
    headers: new Headers({ 'content-type': 'application/json' }),
  } as unknown as Response;
}

function errorResponse(status: number, payload: unknown): Response {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
    headers: new Headers({ 'content-type': 'application/json' }),
  } as unknown as Response;
}

function binaryResponse(bytes: Uint8Array, contentType: string): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes.buffer,
    headers: new Headers({ 'content-type': contentType }),
  } as unknown as Response;
}

function recorder(response: Response, calls: Call[]): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return response;
  }) as unknown as typeof fetch;
}

function header(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

// ─── search ───────────────────────────────────────────────────────────────────

describe('searchWithProvider', () => {
  it('maps Tavily results and its synthesized answer', async () => {
    const calls: Call[] = [];
    const fetchImpl = recorder(
      jsonResponse({
        answer: 'Messi plays for Inter Miami.',
        results: [
          {
            title: 'Messi',
            url: 'https://example.com/a',
            content: 'Forward',
            score: 0.9,
          },
          { title: 'no url', content: 'skipped' },
        ],
      }),
      calls,
    );

    const response = await searchWithProvider('tavily', {
      query: 'who is Messi',
      apiKey: 'tvly-key',
      fetchImpl,
    });

    expect(response.answer).toContain('Inter Miami');
    expect(response.results).toHaveLength(1);
    expect(response.results[0]).toMatchObject({
      title: 'Messi',
      url: 'https://example.com/a',
      provider: 'tavily',
    });
    expect(calls[0].url).toBe('https://api.tavily.com/search');
    expect(header(calls[0].init, 'authorization')).toBe('Bearer tvly-key');
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({
      query: 'who is Messi',
      max_results: 5,
    });
  });

  it('maps Serper organic results and the answer box', async () => {
    const calls: Call[] = [];
    const fetchImpl = recorder(
      jsonResponse({
        answerBox: { answer: '42' },
        organic: [
          {
            title: 'A',
            link: 'https://a.example',
            snippet: 'first',
            position: 1,
          },
          {
            title: 'B',
            link: 'https://b.example',
            snippet: 'second',
            position: 2,
          },
        ],
      }),
      calls,
    );

    const response = await searchWithProvider('serper', {
      query: 'meaning',
      apiKey: 'serper-key',
      fetchImpl,
    });

    expect(response.answer).toBe('42');
    expect(response.results.map((r) => r.url)).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
    expect(header(calls[0].init, 'x-api-key')).toBe('serper-key');
  });

  it('maps Exa results', async () => {
    const fetchImpl = recorder(
      jsonResponse({
        results: [
          {
            title: 'Paper',
            url: 'https://arxiv.org/abs/1',
            text: 'Abstract…',
            publishedDate: '2024-01-01',
          },
        ],
      }),
      [],
    );

    const response = await searchWithProvider('exa', {
      query: 'llm',
      apiKey: 'exa-key',
      fetchImpl,
    });
    expect(response.results[0]).toMatchObject({
      title: 'Paper',
      url: 'https://arxiv.org/abs/1',
      provider: 'exa',
      publishedDate: '2024-01-01',
    });
  });

  it('maps Firecrawl search results from the data.web envelope', async () => {
    const fetchImpl = recorder(
      jsonResponse({
        success: true,
        data: {
          web: [
            {
              title: 'Docs',
              url: 'https://docs.example',
              description: 'How to',
            },
          ],
        },
      }),
      [],
    );

    const response = await searchWithProvider('firecrawl', {
      query: 'docs',
      apiKey: 'fc-key',
      fetchImpl,
    });
    expect(response.results[0]).toMatchObject({
      url: 'https://docs.example',
      provider: 'firecrawl',
    });
  });

  it('translates a 401 into a key message', async () => {
    const fetchImpl = recorder(
      errorResponse(401, { detail: { error: 'Unauthorized' } }),
      [],
    );
    await expect(
      searchWithProvider('tavily', { query: 'x', apiKey: 'bad', fetchImpl }),
    ).rejects.toThrow(/rejected the API key/);
  });
});

// ─── searchAuto ───────────────────────────────────────────────────────────────

describe('searchAuto', () => {
  it('answers with the first candidate and reports no attempts', async () => {
    const calls: Call[] = [];
    const fetchImpl = recorder(
      jsonResponse({
        results: [{ title: 'hit', url: 'https://a.test/x', content: 'body' }],
      }),
      calls,
    );

    const response = await searchAuto(
      [
        { provider: 'tavily', apiKey: 'k1' },
        { provider: 'exa', apiKey: 'k2' },
      ],
      { query: 'q', fetchImpl },
    );

    expect(response.provider).toBe('tavily');
    expect(response.attempted).toEqual([]);
    expect(response.results).toHaveLength(1);
    // The second provider must not be called at all.
    expect(calls).toHaveLength(1);
  });

  it('falls through to the next provider when one is rate limited', async () => {
    const calls: Call[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes('tavily')) {
        return errorResponse(429, { error: 'rate limit' });
      }
      return jsonResponse({
        results: [{ title: 'exa hit', url: 'https://b.test/y', text: 'body' }],
      });
    }) as unknown as typeof fetch;

    const response = await searchAuto(
      [
        { provider: 'tavily', apiKey: 'k1' },
        { provider: 'exa', apiKey: 'k2' },
      ],
      { query: 'q', fetchImpl },
    );

    expect(response.provider).toBe('exa');
    expect(response.attempted).toEqual(['tavily']);
    expect(response.results[0].url).toBe('https://b.test/y');
    expect(calls).toHaveLength(2);
  });

  it('treats an empty result set as a soft failure', async () => {
    const fetchImpl = (async (url: string) => {
      if (url.includes('tavily')) return jsonResponse({ results: [] });
      return jsonResponse({
        organic: [
          { title: 'serper hit', link: 'https://c.test/z', snippet: 's' },
        ],
      });
    }) as unknown as typeof fetch;

    const response = await searchAuto(
      [
        { provider: 'tavily', apiKey: 'k1' },
        { provider: 'serper', apiKey: 'k2' },
      ],
      { query: 'q', fetchImpl },
    );

    expect(response.provider).toBe('serper');
    expect(response.attempted).toEqual(['tavily']);
    expect(response.results[0].title).toBe('serper hit');
  });

  it('reports the last error and every provider it tried', async () => {
    const calls: Call[] = [];
    const fetchImpl = recorder(errorResponse(401, { error: 'bad key' }), calls);

    await expect(
      searchAuto(
        [
          { provider: 'tavily', apiKey: 'k1' },
          { provider: 'exa', apiKey: 'k2' },
        ],
        { query: 'q', fetchImpl },
      ),
    ).rejects.toThrow(/tried tavily, exa/);
    // The message is the real provider failure, not a generic one.
    await expect(
      searchAuto([{ provider: 'tavily', apiKey: 'k1' }], {
        query: 'q',
        fetchImpl,
      }),
    ).rejects.toThrow(/rejected the API key/);
  });

  it('refuses to search when nothing is configured', async () => {
    await expect(searchAuto([], { query: 'q' })).rejects.toThrow(
      /No search provider is configured/,
    );
  });
});

describe('resolveSearchCandidates', () => {
  const ENV_NAMES = [
    'TAVILY_API_KEY',
    'EXA_API_KEY',
    'EXA_API_KEY_2',
    'SERPER_API_KEY',
    'FIRECRAWL_API_KEY',
  ];
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    saved.clear();
    for (const name of ENV_NAMES) {
      saved.set(name, process.env[name]);
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('returns nothing when no search key is set', () => {
    expect(resolveSearchCandidates()).toEqual([]);
  });

  it('orders configured providers by the shared preference order', () => {
    process.env.SERPER_API_KEY = 'serper-key';
    process.env.FIRECRAWL_API_KEY = 'firecrawl-key';
    process.env.TAVILY_API_KEY = 'tavily-key';

    expect(resolveSearchCandidates()).toEqual([
      { provider: 'tavily', apiKey: 'tavily-key' },
      { provider: 'serper', apiKey: 'serper-key' },
      { provider: 'firecrawl', apiKey: 'firecrawl-key' },
    ]);
  });

  it('uses the fallback env name for the second Exa key', () => {
    process.env.EXA_API_KEY_2 = 'exa-backup';
    expect(resolveSearchCandidates()).toEqual([
      { provider: 'exa', apiKey: 'exa-backup' },
    ]);
  });
});

// ─── scrape ───────────────────────────────────────────────────────────────────

describe('firecrawlScrape', () => {
  it('returns markdown and truncates past maxChars', async () => {
    const fetchImpl = recorder(
      jsonResponse({
        success: true,
        data: { markdown: 'abcdefghij', metadata: { title: 'Page' } },
      }),
      [],
    );

    const result = await firecrawlScrape({
      url: 'https://example.com',
      apiKey: 'key',
      maxChars: 4,
      fetchImpl,
    });
    expect(result.title).toBe('Page');
    expect(result.markdown).toBe('abcd');
    expect(result.truncated).toBe(true);
  });

  it('surfaces a failed scrape as an error', async () => {
    const fetchImpl = recorder(
      jsonResponse({ success: false, error: 'Blocked' }),
      [],
    );
    await expect(
      firecrawlScrape({ url: 'https://example.com', apiKey: 'key', fetchImpl }),
    ).rejects.toThrow(/Blocked/);
  });
});

// ─── docs ─────────────────────────────────────────────────────────────────────

describe('context7Docs', () => {
  it('maps code and info snippets and sends the library hints', async () => {
    const calls: Call[] = [];
    const fetchImpl = recorder(
      jsonResponse({
        codeSnippets: [
          {
            codeTitle: 'State',
            codeDescription: 'How to use state',
            codeLanguage: 'TypeScript',
            codeList: [
              { language: 'typescript', code: 'const [x] = useState()' },
            ],
          },
        ],
        infoSnippets: [
          { breadcrumb: 'Hooks', content: 'useState returns a tuple' },
        ],
      }),
      calls,
    );

    const result = await context7Docs({
      query: 'manage state',
      apiKey: 'c7-key',
      libraries: ['react'],
      fetchImpl,
    });

    expect(result.codeSnippets[0].code).toContain('useState');
    expect(result.infoSnippets[0].content).toContain('tuple');
    expect(calls[0].url).toContain('library=react');
    expect(calls[0].url).toContain('type=json');
    expect(header(calls[0].init, 'authorization')).toBe('Bearer c7-key');
  });
});

// ─── images ───────────────────────────────────────────────────────────────────

describe('unsplashSearch', () => {
  it('maps images and uses Client-ID auth', async () => {
    const calls: Call[] = [];
    const fetchImpl = recorder(
      jsonResponse({
        total: 100,
        results: [
          {
            id: 'abc',
            alt_description: 'A cat',
            urls: {
              regular: 'https://img/regular',
              thumb: 'https://img/thumb',
            },
            links: { html: 'https://unsplash.com/photos/abc' },
            user: {
              name: 'Jane',
              links: { html: 'https://unsplash.com/@jane' },
            },
            width: 100,
            height: 200,
          },
        ],
      }),
      calls,
    );

    const result = await unsplashSearch({
      query: 'cat',
      apiKey: 'acc',
      fetchImpl,
    });
    expect(result.total).toBe(100);
    expect(result.images[0]).toMatchObject({
      id: 'abc',
      url: 'https://img/regular',
      thumbUrl: 'https://img/thumb',
      author: 'Jane',
    });
    expect(header(calls[0].init, 'authorization')).toBe('Client-ID acc');
    expect(calls[0].url).toContain('per_page=6');
  });
});

// ─── speech ───────────────────────────────────────────────────────────────────

describe('synthesizeSpeech', () => {
  it('posts to ElevenLabs with the voice and returns audio bytes', async () => {
    const calls: Call[] = [];
    const fetchImpl = recorder(
      binaryResponse(new Uint8Array([1, 2, 3]), 'audio/mpeg'),
      calls,
    );

    const audio = await synthesizeSpeech({
      provider: 'elevenlabs',
      text: 'hello',
      apiKey: 'el-key',
      fetchImpl,
    });

    expect(audio.bytes.byteLength).toBe(3);
    expect(audio.contentType).toBe('audio/mpeg');
    expect(calls[0].url).toContain('/v1/text-to-speech/');
    expect(header(calls[0].init, 'xi-api-key')).toBe('el-key');
  });

  it('posts to Deepgram with Token auth', async () => {
    const calls: Call[] = [];
    const fetchImpl = recorder(
      binaryResponse(new Uint8Array([9]), 'audio/mpeg'),
      calls,
    );

    await synthesizeSpeech({
      provider: 'deepgram',
      text: 'hi',
      apiKey: 'dg',
      fetchImpl,
    });
    expect(calls[0].url).toContain('api.deepgram.com/v1/speak');
    expect(header(calls[0].init, 'authorization')).toBe('Token dg');
  });

  it('posts to Cartesia with its API version header', async () => {
    const calls: Call[] = [];
    const fetchImpl = recorder(
      binaryResponse(new Uint8Array([7]), 'audio/mpeg'),
      calls,
    );

    await synthesizeSpeech({
      provider: 'cartesia',
      text: 'hi',
      apiKey: 'ct',
      fetchImpl,
    });
    expect(calls[0].url).toBe('https://api.cartesia.ai/tts/bytes');
    expect(header(calls[0].init, 'cartesia-version')).toBe('2024-06-10');
  });
});

describe('deepgramTranscribe', () => {
  it('sends raw audio and extracts the transcript', async () => {
    const calls: Call[] = [];
    const fetchImpl = recorder(
      jsonResponse({
        results: {
          channels: [{ alternatives: [{ transcript: 'hello world' }] }],
        },
      }),
      calls,
    );

    const result = await deepgramTranscribe({
      apiKey: 'dg',
      audio: new Uint8Array([1, 2]),
      contentType: 'audio/mpeg',
      fetchImpl,
    });

    expect(result.text).toBe('hello world');
    expect(calls[0].url).toContain('api.deepgram.com/v1/listen');
    expect(header(calls[0].init, 'content-type')).toBe('audio/mpeg');
  });
});

// ─── registry ─────────────────────────────────────────────────────────────────

describe('service registry', () => {
  it('exposes descriptors by id and category', () => {
    expect(getService('tavily')?.category).toBe('search');
    expect(servicesByCategory('speech').map((s) => s.id)).toEqual([
      'elevenlabs',
      'deepgram',
      'cartesia',
    ]);
    expect(getService('nope')).toBeUndefined();
  });

  it('resolves env keys from the declared env names', () => {
    const prev = process.env.SERPER_API_KEY;
    process.env.SERPER_API_KEY = 'from-env';
    expect(envServiceKey(getService('serper')!)).toBe('from-env');
    if (prev === undefined) delete process.env.SERPER_API_KEY;
    else process.env.SERPER_API_KEY = prev;
  });

  it('ServiceHttpError carries the service name', () => {
    const err = new ServiceHttpError('Tavily', 'nope', 401);
    expect(err.service).toBe('Tavily');
    expect(err.status).toBe(401);
    expect(err).toBeInstanceOf(Error);
  });
});
