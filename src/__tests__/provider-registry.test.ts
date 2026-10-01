import {
  PROVIDERS,
  envApiKey,
  getProvider,
  pickDefaultProvider,
} from '../main/ai/registry';

/** Every env var the registry can read, so tests start from a clean slate. */
const ALL_ENV_VARS = PROVIDERS.flatMap((provider) => provider.apiKeyEnvs ?? []);

const saved = new Map<string, string | undefined>();

beforeEach(() => {
  saved.clear();
  for (const name of ALL_ENV_VARS) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
});

afterAll(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('provider registry', () => {
  it('lists OpenAI-compatible base URLs for every non-gateway provider', () => {
    for (const provider of PROVIDERS) {
      if (provider.id === 'gateway') continue;
      expect(provider.baseURL).toBeDefined();
      expect(provider.baseURL).toMatch(/^https?:\/\//);
    }
  });

  it('puts free/free-tier providers before paid ones', () => {
    const order = PROVIDERS.map((p) => p.id);
    const paid = ['openai', 'anthropic'];

    for (const id of ['groq', 'openrouter', 'gemini', 'nvidia']) {
      expect(order.indexOf(id)).toBeLessThan(order.indexOf(paid[0]));
    }
  });

  it('resolves a provider by id', () => {
    expect(getProvider('groq')?.baseURL).toBe('https://api.groq.com/openai/v1');
    expect(getProvider('openrouter')?.baseURL).toBe(
      'https://openrouter.ai/api/v1',
    );
    expect(getProvider('nope')).toBeUndefined();
  });

  it('registers OpenCode Zen with no curated free models', () => {
    const zen = getProvider('opencode');
    expect(zen?.baseURL).toBe('https://opencode.ai/zen/v1');
    expect(zen?.apiKeyEnvs).toEqual(['OPENCODE_ZEN_API_KEY']);
    // Zen rejects its `-free` models outside the OpenCode client (HTTP 403
    // FreeTierError), so curating them would make the picker and
    // `pickDefaultProvider` recommend a model that cannot run.
    expect(zen?.freeModels).toEqual([]);
  });
});

describe('pickDefaultProvider', () => {
  it('falls back to a free provider when nothing is configured', () => {
    const { provider, model } = pickDefaultProvider();
    expect(provider).toBe('groq');
    expect(model).toBe('openai/gpt-oss-120b');
  });

  it('picks the highest-priority provider that has a key', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GROQ_API_KEY = 'test-key';

    // groq is listed before gemini, so it wins.
    expect(pickDefaultProvider()).toEqual({
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
    });
  });

  it('uses OpenRouter when only its key is present', () => {
    process.env.OPENROUTER_API_KEY = 'test-key';

    expect(pickDefaultProvider()).toEqual({
      provider: 'openrouter',
      model: 'qwen/qwen3.8-27b:free',
    });
  });

  it('honours alternate env var names', () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';
    expect(pickDefaultProvider().provider).toBe('gemini');

    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    process.env.NVIDIA_NIM_API_KEY = 'test-key';
    expect(pickDefaultProvider().provider).toBe('nvidia');
  });

  it('selects a provider with an unknown catalog but leaves the model unset', () => {
    process.env.COHERE_API_KEY = 'test-key';

    // Cohere has no curated models, so the user must choose one in Settings.
    expect(pickDefaultProvider()).toEqual({ provider: 'cohere', model: '' });
  });

  it('ignores blank or whitespace-only keys', () => {
    process.env.GROQ_API_KEY = '   ';
    expect(envApiKey(getProvider('groq')!)).toBeUndefined();
    expect(pickDefaultProvider().provider).toBe('groq');

    process.env.GROQ_API_KEY = 'real-key';
    expect(envApiKey(getProvider('groq')!)).toBe('real-key');
  });

  it('never auto-selects a provider whose catalog has no curated model', () => {
    process.env.GROQ_API_KEY = 'test-key';
    process.env.OPENCODE_ZEN_API_KEY = 'test-key';

    // Groq has a curated free model, so it wins even though Zen is also keyed.
    expect(pickDefaultProvider()).toEqual({
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
    });

    // With only Zen keyed the provider is still selected — but without a model,
    // because none of Zen's models can be recommended for free use and the user
    // must choose one from the live list.
    delete process.env.GROQ_API_KEY;
    expect(pickDefaultProvider()).toEqual({ provider: 'opencode', model: '' });
  });
});
