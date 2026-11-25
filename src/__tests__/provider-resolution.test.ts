jest.mock('../main/ai/settings', () => ({
  getSettings: jest.fn(),
}));

import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { getSettings } from '../main/ai/settings';
import { listProviderModels, resolveModel } from '../main/ai/provider';
import type { AppSettings } from '../main/ai/settings';

describe('provider model resolution', () => {
  it('uses Anthropic Messages API provider instead of the OpenAI-compatible adapter', () => {
    const model = { modelId: 'claude-test' };
    const anthropicModel = jest.fn(() => model);
    (createAnthropic as jest.Mock).mockReturnValue(anthropicModel);
    (getSettings as jest.Mock).mockReturnValue({
      activeProvider: 'anthropic',
      activeModel: 'claude-test',
      providers: { anthropic: { apiKey: 'test-key' } },
    } satisfies AppSettings);

    expect(resolveModel('anthropic', 'claude-test')).toBe(model);
    expect(createAnthropic).toHaveBeenCalledWith({ apiKey: 'test-key' });
    expect(anthropicModel).toHaveBeenCalledWith('claude-test');
    expect(createOpenAICompatible).not.toHaveBeenCalled();
  });

  it('uses OLLAMA_BASE_URL when listing locally installed models', async () => {
    const previousUrl = process.env.OLLAMA_BASE_URL;
    process.env.OLLAMA_BASE_URL = 'http://ollama.example:11434/v1';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: 'llama3.2:latest' }] }),
    });
    const previousFetch = global.fetch;
    global.fetch = fetchMock as typeof fetch;
    (getSettings as jest.Mock).mockReturnValue({
      activeProvider: 'groq',
      activeModel: 'test-model',
      providers: {},
    } satisfies AppSettings);

    try {
      await expect(listProviderModels('ollama')).resolves.toEqual({
        models: ['llama3.2:latest'],
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'http://ollama.example:11434/api/tags',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    } finally {
      global.fetch = previousFetch;
      if (previousUrl === undefined) delete process.env.OLLAMA_BASE_URL;
      else process.env.OLLAMA_BASE_URL = previousUrl;
    }
  });
});
