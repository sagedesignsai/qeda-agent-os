import {
  buildModelChain,
  describeFallbackReason,
  isOutputChunk,
  isRetryableProviderError,
  resolveChain,
} from '../main/ai/fallback';

const allConfigured = () => true;
const noneConfigured = () => false;

describe('buildModelChain', () => {
  it('always tries the user selection first', () => {
    const chain = buildModelChain({
      activeProvider: 'openrouter',
      activeModel: 'qwen/qwen3.8-27b:free',
      isConfigured: allConfigured,
    });

    expect(chain[0]).toEqual({
      providerId: 'openrouter',
      modelId: 'qwen/qwen3.8-27b:free',
    });
  });

  it('never repeats the active provider as a fallback', () => {
    const chain = buildModelChain({
      activeProvider: 'groq',
      activeModel: 'openai/gpt-oss-120b',
      isConfigured: allConfigured,
    });

    expect(chain.filter((t) => t.providerId === 'groq')).toHaveLength(1);
  });

  it('only includes configured providers', () => {
    const chain = buildModelChain({
      activeProvider: 'openrouter',
      activeModel: 'qwen/qwen3.8-27b:free',
      isConfigured: (id) => id === 'groq',
    });

    expect(chain.map((t) => t.providerId)).toEqual(['openrouter', 'groq']);
  });

  it('skips providers with no curated default model', () => {
    // Cohere has keys but no curated model, so it cannot be offered as a
    // fallback without an extra /models round-trip. It is still allowed as the
    // primary when the user picked it and supplied a model id.
    const chain = buildModelChain({
      activeProvider: 'cohere',
      activeModel: 'command-a',
      isConfigured: allConfigured,
    });

    expect(chain[0].providerId).toBe('cohere');
    expect(chain.slice(1).map((t) => t.providerId)).not.toContain('cohere');
  });

  it('uses each fallback provider\'s curated free model', () => {
    const chain = buildModelChain({
      activeProvider: 'cohere',
      activeModel: 'command-a',
      isConfigured: (id) => id === 'groq',
    });

    expect(chain[1]).toEqual({
      providerId: 'groq',
      modelId: 'openai/gpt-oss-120b',
    });
  });

  it('caps the number of attempts', () => {
    const chain = buildModelChain({
      activeProvider: 'openrouter',
      activeModel: 'qwen/qwen3.8-27b:free',
      isConfigured: allConfigured,
      maxAttempts: 2,
    });

    expect(chain).toHaveLength(2);
  });

  it('returns nothing when no provider is configured', () => {
    const chain = buildModelChain({
      activeProvider: 'groq',
      activeModel: 'openai/gpt-oss-120b',
      isConfigured: noneConfigured,
      maxAttempts: 3,
    });

    // The primary is still included; it is the user's explicit choice.
    expect(chain).toEqual([
      { providerId: 'groq', modelId: 'openai/gpt-oss-120b' },
    ]);
  });
});

describe('resolveChain', () => {
  it('refuses to run without a selected model', () => {
    expect(
      resolveChain({
        activeProvider: 'cohere',
        activeModel: '',
        fallbackEnabled: true,
        isConfigured: allConfigured,
      }),
    ).toEqual([]);
  });

  it('returns only the primary when fallback is disabled', () => {
    const chain = resolveChain({
      activeProvider: 'openrouter',
      activeModel: 'qwen/qwen3.8-27b:free',
      fallbackEnabled: false,
      isConfigured: allConfigured,
    });

    expect(chain).toEqual([
      { providerId: 'openrouter', modelId: 'qwen/qwen3.8-27b:free' },
    ]);
  });

  it('trims the selected model id', () => {
    const chain = resolveChain({
      activeProvider: 'groq',
      activeModel: '  openai/gpt-oss-120b  ',
      fallbackEnabled: false,
      isConfigured: allConfigured,
    });

    expect(chain[0].modelId).toBe('openai/gpt-oss-120b');
  });
});

describe('isRetryableProviderError', () => {
  it('retries on rate limits and upstream failures', () => {
    expect(isRetryableProviderError({ statusCode: 429 })).toBe(true);
    expect(isRetryableProviderError({ statusCode: 503 })).toBe(true);
    expect(isRetryableProviderError({ statusCode: 500 })).toBe(true);
  });

  it('does not retry client errors that another provider cannot fix', () => {
    expect(isRetryableProviderError({ statusCode: 400 })).toBe(false);
    expect(isRetryableProviderError({ statusCode: 401 })).toBe(false);
    expect(isRetryableProviderError({ statusCode: 404 })).toBe(false);
    expect(isRetryableProviderError(new Error('Invalid tool call'))).toBe(false);
    expect(isRetryableProviderError(new Error('No API key for provider'))).toBe(
      false,
    );
  });

  it('unwraps the SDK RetryError to find the real cause', () => {
    expect(
      isRetryableProviderError({ lastError: { statusCode: 429 } }),
    ).toBe(true);
    // A wrapped auth failure must stay non-retryable.
    expect(
      isRetryableProviderError({ lastError: { statusCode: 401 } }),
    ).toBe(false);
  });

  it('unwraps `cause` chains', () => {
    expect(isRetryableProviderError({ cause: { status: 503 } })).toBe(true);
  });

  it('trusts an explicit isRetryable flag', () => {
    expect(isRetryableProviderError({ isRetryable: true })).toBe(true);
  });

  it('sniffs transient network messages', () => {
    expect(isRetryableProviderError(new Error('fetch failed'))).toBe(true);
    expect(isRetryableProviderError(new Error('Rate limit exceeded'))).toBe(
      true,
    );
    expect(isRetryableProviderError(new Error('socket hang up'))).toBe(true);
  });

  it('handles junk without throwing', () => {
    expect(isRetryableProviderError(undefined)).toBe(false);
    expect(isRetryableProviderError(null)).toBe(false);
    expect(isRetryableProviderError('429')).toBe(false);
    // Bounded unwrapping: a self-referential chain must not recurse forever.
    const loop: { cause?: unknown } = {};
    loop.cause = loop;
    expect(isRetryableProviderError(loop)).toBe(false);
  });
});

describe('isOutputChunk', () => {
  it('counts chunks the renderer actually shows', () => {
    expect(isOutputChunk('text-delta')).toBe(true);
    expect(isOutputChunk('reasoning-delta')).toBe(true);
    expect(isOutputChunk('tool-call')).toBe(true);
    expect(isOutputChunk('tool-result')).toBe(true);
  });

  it('ignores lifecycle chunks emitted before a provider error', () => {
    // The SDK emits `start` before failing, so treating it as output would
    // make every failed attempt look committed and disable fallback.
    expect(isOutputChunk('start')).toBe(false);
    expect(isOutputChunk('start-step')).toBe(false);
    expect(isOutputChunk('finish-step')).toBe(false);
    expect(isOutputChunk('finish')).toBe(false);
    expect(isOutputChunk(undefined)).toBe(false);
  });
});

describe('describeFallbackReason', () => {
  it('names the common cases', () => {
    expect(describeFallbackReason({ statusCode: 429 })).toBe(
      'rate limit reached',
    );
    expect(describeFallbackReason({ statusCode: 502 })).toBe(
      'provider error (HTTP 502)',
    );
    expect(describeFallbackReason(new Error('fetch failed'))).toBe(
      'fetch failed',
    );
    expect(describeFallbackReason(undefined)).toBe('provider unavailable');
  });
});
