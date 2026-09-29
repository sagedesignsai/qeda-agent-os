/**
 * ai/registry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The provider registry — the single source of truth for every backend the app
 * can talk to through `@ai-sdk/openai-compatible`.
 *
 * Everything here is deliberately dependency-free (it imports nothing from the
 * app) so both `settings.ts` (for default selection) and `provider.ts` (for
 * model resolution) can use it without a circular import.
 *
 * Providers are ordered by preference: free/free-tier coding providers first,
 * paid and local last. `pickDefaultProvider` walks that order, so a machine
 * with `GROQ_API_KEY` (and nothing else) starts on Groq out of the box.
 *
 * `freeModels` are curated, well-known-good coding model ids used as
 * suggestions and as a fallback when the live `/models` lookup is unavailable.
 * The live list always wins — see `listProviderModels` in provider.ts.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ProviderConfig {
  /** Stable id used in settings, IPC and the UI. */
  id: string;
  /** Human-readable label. */
  name: string;
  /** OpenAI-compatible base URL. Omitted for the AI Gateway (own SDK). */
  baseURL?: string;
  /** Environment variable(s) checked for a key, in priority order. */
  apiKeyEnvs?: string[];
  /** Curated free/free-tier coding models, best first. */
  freeModels?: string[];
  /** Free-tier caveat surfaced in the Settings dialog. */
  note?: string;
}

/**
 * Priority order matters: `pickDefaultProvider` takes the first entry that has
 * both a key in the environment and a suggested model.
 */
export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'groq',
    name: 'Groq (free tier)',
    baseURL: 'https://api.groq.com/openai/v1',
    apiKeyEnvs: ['GROQ_API_KEY'],
    freeModels: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
    note: 'Free tier is rate-limited (requests + tokens per minute/day). Very fast.',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter (free models)',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKeyEnvs: ['OPENROUTER_API_KEY'],
    freeModels: [
      'qwen/qwen3.8-27b:free',
      'z-ai/glm-5.2:free',
      'nvidia/nemotron-3-super-120b-a12b:free',
      'cohere/north-mini-code:free',
    ],
    note: 'Models ending in :free cost nothing, capped at ~20 req/min and 200 req/day.',
  },
  {
    id: 'gemini',
    name: 'Google Gemini (free tier)',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    apiKeyEnvs: ['GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
    freeModels: [
      'gemini-3.8-flash',
      'gemini-3.1-flash-lite',
      'gemini-2.5-flash',
    ],
    note: 'Flash models are the free-tier workhorses; Pro tiers are billed.',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM (free credits)',
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKeyEnvs: ['NVIDIA_API_KEY', 'NVIDIA_NIM_API_KEY'],
    freeModels: ['moonshotai/kimi-k2.6', 'z-ai/glm-5.2', 'openai/gpt-oss-120b'],
    note: 'Hosted open-weight models with free credits and a low default rate limit.',
  },
  {
    id: 'cohere',
    name: 'Cohere (trial key)',
    baseURL: 'https://api.cohere.ai/compatibility/v1',
    apiKeyEnvs: ['COHERE_API_KEY'],
    // Model ids are not curated: they churn, so use the live lookup.
    freeModels: [],
    note: 'Trial keys are free but rate-limited and not licensed for production.',
  },
  {
    id: 'gateway',
    name: 'AI Gateway (multi-provider)',
    apiKeyEnvs: ['AI_GATEWAY_API_KEY'],
    freeModels: ['openai/gpt-4o-mini', 'anthropic/claude-haiku-4.5'],
    note: 'One key for many providers. Billed per token.',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    apiKeyEnvs: ['OPENAI_API_KEY'],
    freeModels: ['gpt-4o-mini'],
    note: 'Paid.',
  },
  {
    id: 'anthropic',
    name: 'Anthropic (OpenAI-compatible)',
    baseURL: 'https://api.anthropic.com/v1',
    apiKeyEnvs: ['ANTHROPIC_API_KEY'],
    freeModels: ['claude-haiku-4-5'],
    note: 'Paid.',
  },
  {
    id: 'ollama',
    name: 'Ollama (local, no key)',
    baseURL: 'http://localhost:11434/v1',
    freeModels: [],
    note: 'Fully local and free — needs an Ollama server running.',
  },
];

/** Look up a registry entry by id. */
export function getProvider(id: string): ProviderConfig | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}

/** First environment variable that is set for this provider, and its value. */
export function envApiKey(provider: ProviderConfig): string | undefined {
  for (const name of provider.apiKeyEnvs ?? []) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

/**
 * Choose the provider + model to use when the user has no saved settings.
 *
 * Prefers providers that are both configured in the environment and have a
 * curated free model, so a fresh checkout lands on something that actually
 * works rather than on a paid provider with no key.
 */
export function pickDefaultProvider(): { provider: string; model: string } {
  const keyed = PROVIDERS.filter((provider) => envApiKey(provider));

  const ready = keyed.find((provider) => provider.freeModels?.length);
  if (ready) {
    return { provider: ready.id, model: ready.freeModels![0] };
  }

  // A key exists but the catalog is unknown (e.g. Cohere) – the user has to
  // pick a model in Settings, but we still point them at the right provider.
  if (keyed.length > 0) {
    return { provider: keyed[0].id, model: '' };
  }

  // Nothing configured: default to a free provider so the error message the
  // user sees is "add a key", not "you owe money".
  const fallback = PROVIDERS.find((provider) => provider.freeModels?.length)!;
  return { provider: fallback.id, model: fallback.freeModels![0] };
}
