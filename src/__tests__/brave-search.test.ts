import { braveWebSearch, BraveSearchError } from '../main/tools/brave-search';

function okResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as unknown as Response;
}

const stubFetch = (body: string) => async () =>
  ({
    ok: true,
    status: 200,
    text: async () => body,
    headers: new Headers({ 'content-type': 'text/html' }),
  }) as unknown as Response;

describe('braveWebSearch', () => {
  it('maps web results and cleans snippets', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return okResponse({
        web: {
          results: [
            {
              title: 'Example <b>Page</b>',
              url: 'https://example.com',
              description: 'A &quot;quoted&quot; snippet',
            },
            { title: 'No URL', url: undefined, description: 'skipped' },
          ],
        },
      });
    }) as unknown as typeof fetch;

    const results = await braveWebSearch({
      query: 'test',
      apiKey: 'key',
      fetchImpl,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      title: 'Example Page',
      url: 'https://example.com',
      snippet: 'A "quoted" snippet',
    });

    expect(calls[0].url).toContain('q=test');
    expect(calls[0].url).toContain('count=5');
    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get('x-subscription-token')).toBe('key');
  });

  it('throws a helpful error without a key', async () => {
    const fetchStub = (async () => {
      throw new Error('should not be called');
    }) as unknown as typeof fetch;
    await expect(
      braveWebSearch({ query: 'x', apiKey: '', fetchImpl: fetchStub }),
    ).rejects.toThrow(BraveSearchError);
  });

  it('translates HTTP 429 into a quota message', async () => {
    const fetchImpl = (async () =>
      ({ ok: false, status: 429, json: async () => ({}) }) as unknown as Response) as typeof fetch;

    await expect(
      braveWebSearch({ query: 'x', apiKey: 'key', fetchImpl }),
    ).rejects.toThrow(/quota exhausted/);
  });

  it('translates network failures into BraveSearchError', async () => {
    const fetchImpl = (async () => {
      throw new Error('socket hang up');
    }) as unknown as typeof fetch;

    await expect(
      braveWebSearch({ query: 'x', apiKey: 'key', fetchImpl }),
    ).rejects.toThrow(/socket hang up/);
  });

  it('clamps count into the API range', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      return okResponse({ web: { results: [] } });
    }) as unknown as typeof fetch;

    await braveWebSearch({ query: 'x', apiKey: 'key', count: 500, fetchImpl });
    expect(calls[0]).toContain('count=20');
  });
});

describe('htmlToText (pure module)', () => {
  it('strips scripts, tags and collapses whitespace', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { htmlToText } = require('../main/tools/html-text') as {
      htmlToText: (html: string) => string;
    };
    const html = [
      '<html><head><script>alert(1)</script><style>p{}</style></head>',
      '<body><h1>Title</h1><p>Hello &amp; welcome.</p><ul><li>One</li><li>Two</li></ul></body></html>',
    ].join('');
    const text = htmlToText(html);
    expect(text).not.toContain('<');
    expect(text).not.toContain('alert');
    expect(text).toContain('Title');
    expect(text).toContain('Hello & welcome.');
    expect(text).toContain('One');
  });
});
