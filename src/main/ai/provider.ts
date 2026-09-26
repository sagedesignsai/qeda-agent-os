/**
 * ai/provider.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Model provider factory built on the AI Gateway (@ai-sdk/gateway) for
 * multi-provider access and the OpenAI-compatible adapter
 * (@ai-sdk/openai-compatible) for everything else.
 *
 * Provider definitions live in registry.ts. Credentials are read from
 * Electron's encrypted store first (see ai/settings.ts), then from the
 * environment, so a `.env.local` alone is enough to get running.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createGateway } from '@ai-sdk/gateway';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { getSettings, type AppSettings } from './settings';
import { PROVIDERS, getProvider, envApiKey, type ProviderConfig } from './registry';
import { resolveChain, type ModelTarget } from './fallback';

export { PROVIDERS, type ProviderConfig };

/** True when this provider needs an API key (i.e. it is not local). */
function requiresApiKey(provider: ProviderConfig): boolean {
  return (provider.apiKeyEnvs?.length ?? 0) > 0;
}

/**
 * Resolve the API key for a provider.
 * Settings win over the environment so an explicit key in the UI is honoured.
 * Returns undefined for keyless providers such as a local Ollama.
 */
export function resolveApiKey(
  providerId: string,
  settings: AppSettings = getSettings(),
): string | undefined {
  const fromSettings = settings.providers?.[providerId]?.apiKey;
  if (fromSettings && fromSettings.trim()) return fromSettings.trim();

  const provider = getProvider(providerId);
  return provider ? envApiKey(provider) : undefined;
}

/** Resolve the base URL, allowing a per-provider override from Settings. */
function resolveBaseURL(providerId: string, settings: AppSettings): string | undefined {
  const fromSettings = settings.providers?.[providerId]?.baseURL;
  if (fromSettings && fromSettings.trim()) return fromSettings.trim();
  return getProvider(providerId)?.baseURL;
}

/**
 * Resolve a LanguageModel for the given provider + model id.
 *
 * @param providerId – a registry id such as "groq" or "openrouter"
 * @param modelId    – provider-specific model id, e.g. "qwen/qwen3.8-27b:free"
 */
export function resolveModel(providerId: string, modelId: string): LanguageModel {
  const settings = getSettings();
  const provider = getProvider(providerId);

  if (!provider) {
    throw new Error(
      `Unknown provider "${providerId}". Known providers: ${PROVIDERS.map((p) => p.id).join(', ')}.`,
    );
  }
  if (!modelId) {
    throw new Error(
      `No model selected for provider "${providerId}". Pick one in Settings.`,
    );
  }

  const apiKey = resolveApiKey(providerId, settings);
  if (!apiKey && requiresApiKey(provider)) {
    const env = provider.apiKeyEnvs?.[0] ?? 'API key';
    throw new Error(
      `No API key for "${provider.name}". Add one in Settings or set ${env}.`,
    );
  }

  // ── AI Gateway ──────────────────────────────────────────────────────────────
  if (providerId === 'gateway') {
    const gateway = createGateway({ apiKey });
    return gateway(modelId) as unknown as LanguageModel;
  }

  // ── OpenAI-compatible (every other provider) ────────────────────────────────
  const baseURL = resolveBaseURL(providerId, settings);
  if (!baseURL) {
    throw new Error(`Provider "${providerId}" has no base URL configured.`);
  }

  const compat = createOpenAICompatible({
    name: providerId,
    baseURL,
    // apiKey is optional so a local Ollama server works without one.
    ...(apiKey ? { apiKey } : {}),
    includeUsage: true,
  });

  return compat(modelId) as unknown as LanguageModel;
}

/**
 * Resolve the ordered list of provider/model pairs a turn may use.
 *
 * Returns an empty list when no model is selected, so the caller can surface an
 * actionable error rather than silently running on a provider the user did not
 * choose.
 */
export function resolveModelChain(
  settings: AppSettings = getSettings(),
): ModelTarget[] {
  return resolveChain({
    activeProvider: settings.activeProvider,
    activeModel: settings.activeModel ?? '',
    // Fallback is on unless the user explicitly turned it off.
    fallbackEnabled: settings.fallbackEnabled !== false,
    isConfigured: (providerId) => {
      if (providerId === settings.activeProvider) return true;
      const provider = getProvider(providerId);
      if (!provider) return false;
      // Keyless providers (a local Ollama) count as configured.
      if (!provider.apiKeyEnvs?.length) return true;
      return Boolean(resolveApiKey(providerId, settings));
    },
  });
}

export interface ProviderModelList {
  models: string[];
  /** Present when the live lookup failed; `models` then holds suggestions. */
  error?: string;
}

/**
 * List the models a provider actually serves by calling its OpenAI-compatible
 * `/models` endpoint.
 *
 * Model catalogs change constantly, so the live list is authoritative and the
 * curated `freeModels` are only a fallback. Free models are sorted first.
 */
export async function listProviderModels(providerId: string): Promise<ProviderModelList> {
  const provider = getProvider(providerId);
  const suggestions = provider?.freeModels ?? [];

  if (!provider) {
    return { models: suggestions, error: `Unknown provider: ${providerId}` };
  }

  const baseURL = resolveBaseURL(providerId, getSettings());
  if (!baseURL) {
    return { models: suggestions, error: 'Provider has no base URL.' };
  }

  const apiKey = resolveApiKey(providerId);
  if (!apiKey && requiresApiKey(provider)) {
    return { models: suggestions, error: 'No API key configured.' };
  }

  try {
    const response = await fetch(`${baseURL.replace(/\/$/, '')}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return {
        models: suggestions,
        error: `Provider returned HTTP ${response.status}.`,
      };
    }

    const payload = (await response.json()) as {
      data?: Array<{ id?: string }>;
    };
    // Gemini's OpenAI-compatible endpoint expects the bare model name
    // ("gemini-2.5-flash") while its /models listing prefixes it
    // ("models/gemini-2.5-flash"), so normalise before surfacing.
    const normalise = (id: string) =>
      providerId === 'gemini' ? id.replace(/^models\//, '') : id;

    const ids = (payload.data ?? [])
      .map((entry) => entry.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .map(normalise);

    if (ids.length === 0) {
      return { models: suggestions, error: 'Provider returned no models.' };
    }

    // Surface the curated free models first, then everything else.
    const free = ids.filter((id) => suggestions.includes(id) || id.endsWith(':free'));
    const rest = ids.filter((id) => !free.includes(id)).sort();

    return { models: [...new Set([...free, ...rest])] };
  } catch (error) {
    return {
      models: suggestions,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
