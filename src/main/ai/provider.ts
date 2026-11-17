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
 *
 * Chat and embeddings resolve through the SAME construction path, deliberately.
 * They used to share only `resolveModel`, which returned a `LanguageModel` for
 * both — so `tools/rag.ts` handed `embed()` a chat model and every RAG tool
 * failed at runtime even when correctly configured. The two now differ only in
 * which factory method they call: `provider(modelId)` vs
 * `provider.embeddingModel(modelId)`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createGateway } from '@ai-sdk/gateway';
import { createCohere } from '@ai-sdk/cohere';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { wrapLanguageModel, type EmbeddingModel, type LanguageModel } from 'ai';
import { getSettings, type AppSettings } from './settings';
import {
  PROVIDERS,
  chooseProviderApiKey,
  getProvider,
  envApiKey,
  type ProviderConfig,
} from './registry';
import { resolveChain, type ModelTarget } from './fallback';
import { listOllamaModels } from './ollama';

export { PROVIDERS, type ProviderConfig };

/** True when this provider needs an API key (i.e. it is not local). */
function requiresApiKey(provider: ProviderConfig): boolean {
  return (provider.apiKeyEnvs?.length ?? 0) > 0;
}

/** Validate the provider id, naming the alternatives rather than failing bare. */
function requireProvider(providerId: string): ProviderConfig {
  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error(
      `Unknown provider "${providerId}". Known providers: ${PROVIDERS.map((p) => p.id).join(', ')}.`,
    );
  }
  return provider;
}

/**
 * Resolve the API key, or explain which variable would fix it.
 *
 * Settings win over the environment so an explicit key in the UI is honoured.
 * Returns undefined for keyless providers such as a local Ollama.
 */
function requireApiKey(
  providerId: string,
  provider: ProviderConfig,
  settings: AppSettings,
): string | undefined {
  const apiKey = resolveApiKey(providerId, settings);
  if (!apiKey && requiresApiKey(provider)) {
    const env = provider.apiKeyEnvs?.[0] ?? 'API key';
    throw new Error(
      `No API key for "${provider.name}". Add one in Settings or set ${env}.`,
    );
  }
  return apiKey;
}

/**
 * Build the OpenAI-compatible provider handle for an id.
 *
 * Shared by chat and embeddings so the two cannot drift again: the only thing
 * that should differ between them is which factory method is called on the
 * result, not how the base URL and credentials were assembled.
 */
function openAICompatible(
  providerId: string,
  settings: AppSettings,
  apiKey: string | undefined,
) {
  const baseURL = resolveBaseURL(providerId, settings);
  if (!baseURL) {
    throw new Error(`Provider "${providerId}" has no base URL configured.`);
  }
  return createOpenAICompatible({
    name: providerId,
    baseURL,
    // apiKey is optional so a local Ollama server works without one.
    ...(apiKey ? { apiKey } : {}),
    includeUsage: true,
  });
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
  if (providerId === 'chatgpt') {
    return settings.chatgptAuth?.accessToken;
  }
  const provider = getProvider(providerId);
  const providerSettings = settings.providers?.[providerId];
  const fromEnvironment = provider ? envApiKey(provider) : undefined;
  return chooseProviderApiKey(
    providerSettings?.apiKeySource,
    providerSettings?.apiKey,
    fromEnvironment,
  );
}

/** Resolve the base URL, allowing a per-provider override from Settings. */
function resolveBaseURL(
  providerId: string,
  settings: AppSettings,
): string | undefined {
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
export function resolveModel(
  providerId: string,
  modelId: string,
): LanguageModel {
  const settings = getSettings();
  const provider = requireProvider(providerId);

  if (!modelId) {
    throw new Error(
      `No model selected for provider "${providerId}". Pick one in Settings.`,
    );
  }

  const apiKey = requireApiKey(providerId, provider, settings);

  // ── AI Gateway ──────────────────────────────────────────────────────────────
  if (providerId === 'gateway') {
    const gateway = createGateway({ apiKey });
    return gateway(modelId) as unknown as LanguageModel;
  }

  // ── Cohere (dedicated provider for proper API format) ───────────────────────
  if (providerId === 'cohere') {
    const cohere = createCohere({ apiKey });
    return cohere(modelId) as unknown as LanguageModel;
  }

  // ── OpenAI-compatible (every other provider) ────────────────────────────────
  const compatibleModel = openAICompatible(
    providerId,
    settings,
    apiKey,
  )(modelId) as unknown as LanguageModel;

  // `prepareModelMessages` sanitizes the renderer's prior conversation, but a
  // ToolLoopAgent also feeds its own assistant responses back into the model
  // between tool steps. Reasoning models can add reasoning parts to those
  // internal messages, and the OpenAI-compatible adapter serializes them as
  // `reasoning_content`. Strict endpoints (notably Groq) reject that field with
  // HTTP 400. Strip it at the provider boundary so every internal iteration is
  // covered, not just the first request in a turn.
  return wrapLanguageModel({
    model: compatibleModel as any,
    middleware: {
      specificationVersion: 'v4',
      transformParams: async ({ params }) => ({
        ...params,
        prompt: params.prompt.map((message) => {
          if (message.role !== 'assistant') return message;
          const content = message.content.filter(
            (part) =>
              part.type !== 'reasoning' && part.type !== 'reasoning-file',
          );
          return {
            ...message,
            content:
              content.length > 0
                ? content
                : [{ type: 'text' as const, text: '' }],
          };
        }),
      }),
    },
  }) as unknown as LanguageModel;
}

/**
 * Resolve an EmbeddingModel for the given provider + model id.
 *
 * This is the one thing `tools/rag.ts` needs and could not previously get: it
 * used to call `resolveModel`, which hands back a chat model. `embed()` and
 * `embedMany()` call `doEmbed` on what they are given, and a chat model has no
 * such method — so every RAG tool threw a TypeError instead of indexing
 * anything, no matter how correct the configuration was.
 */
export function resolveEmbeddingModel(
  providerId: string,
  modelId: string,
): EmbeddingModel {
  const settings = getSettings();
  const provider = requireProvider(providerId);

  if (!modelId) {
    throw new Error(
      `No embedding model selected for provider "${providerId}". ` +
        'Pick one in Settings → Embeddings.',
    );
  }

  const apiKey = requireApiKey(providerId, provider, settings);

  if (providerId === 'gateway') {
    const gateway = createGateway({ apiKey });
    // The gateway's embedding factory is typed to its own model id union; the
    // cast is the same one resolveModel already makes for chat.
    return gateway.embeddingModel(modelId) as unknown as EmbeddingModel;
  }

  // ── Cohere (dedicated provider for proper API format) ───────────────────────
  if (providerId === 'cohere') {
    const cohere = createCohere({ apiKey });
    return cohere.embeddingModel(modelId) as unknown as EmbeddingModel;
  }

  // `.embeddingModel(...)` is the whole point of this function: calling the
  // provider as a function would hand back a chat model again.
  return openAICompatible(providerId, settings, apiKey).embeddingModel(
    modelId,
  ) as EmbeddingModel;
}

/**
 * Resolve the ordered list of provider/model pairs a turn may use.
 *
 * Returns an empty list when no model is selected, so the caller can surface an
 * actionable error rather than silently running on a provider the user did not
 * choose.
 *
 * For Ollama, dynamically fetches installed models so they can be included in
 * the fallback chain.
 */
export async function resolveModelChain(
  settings: AppSettings = getSettings(),
): Promise<ModelTarget[]> {
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
    // For Ollama, get installed models dynamically
    getInstalledModels: async (providerId) => {
      if (providerId !== 'ollama') return [];
      const baseURL = resolveBaseURL(providerId, settings);
      if (!baseURL) return [];
      const ollamaBase = baseURL.replace(/\/v1\/?$/, '');
      const result = await listOllamaModels(ollamaBase);
      return result.models || [];
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
 *
 * Ollama responses use `models` array format instead of the standard OpenAI
 * `data` array format, so we handle both. Ollama also supports its native
 * `/api/tags` endpoint which is more reliable.
 */
export async function listProviderModels(
  providerId: string,
): Promise<ProviderModelList> {
  const provider = getProvider(providerId);
  const suggestions = provider?.freeModels ?? [];

  if (!provider) {
    return { models: suggestions, error: `Unknown provider: ${providerId}` };
  }

  // Offline provider: no /models endpoint — return downloaded language models
  // that have chat templates (required by @browser-ai/transformers-js).
  if (providerId === 'offline') {
    const settings = getSettings();
    const allDownloaded = settings.downloadedOfflineModels ?? [];
    // Filter to language models with chat templates only
    const { OFFLINE_MODELS } = require('../../lib/offline-ai/models');
    const chatModelIds = OFFLINE_MODELS
      .filter(
        (m: { category: string; hasChatTemplate?: boolean }) =>
          m.category === 'language' && m.hasChatTemplate === true,
      )
      .map((m: { id: string }) => m.id);
    const downloaded = allDownloaded.filter((id: string) =>
      chatModelIds.includes(id),
    );
    if (downloaded.length === 0) {
      return {
        models: [],
        error:
          'No offline models downloaded. Download models in Settings → Offline Models first.',
      };
    }
    return { models: downloaded };
  }

  // Ollama: Use native API endpoint (/api/tags) for more reliable model listing
  if (providerId === 'ollama') {
    const baseURL = resolveBaseURL(providerId, getSettings());
    if (!baseURL) {
      return { models: suggestions, error: 'Ollama base URL not configured.' };
    }

    // Strip the /v1 suffix if present, since /api/tags is a direct Ollama endpoint
    const ollamaBase = baseURL.replace(/\/v1\/?$/, '');
    const result = await listOllamaModels(ollamaBase);

    if (result.error) {
      return {
        models: suggestions,
        error: result.error,
      };
    }

    if (result.models.length === 0) {
      return {
        models: [],
        error:
          'No models installed. Download one with: ollama pull qwen3.5:0.8b',
      };
    }

    return { models: result.models };
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
      models?: Array<{ name?: string; model?: string }>;
    };

    // Extract model IDs: handle both OpenAI format (data array) and Ollama format (models array)
    let ids: string[] = [];

    if (Array.isArray(payload.models)) {
      // Ollama format: models have 'name' or 'model' field
      ids = payload.models
        .map((entry) => entry.name || entry.model)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
    } else if (Array.isArray(payload.data)) {
      // OpenAI-compatible format
      ids = payload.data
        .map((entry) => entry.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
    }

    // Normalise model IDs for specific providers
    const normalise = (id: string) => {
      if (providerId === 'gemini') {
        // Gemini prefixes models with "models/" in the listing
        return id.replace(/^models\//, '');
      }
      // Keep model names as-is (including tags like "qwen3.5:0.8b")
      return id;
    };

    const normalisedIds = ids.map(normalise);

    if (normalisedIds.length === 0) {
      if (providerId === 'ollama') {
        return {
          models: [],
          error: 'No models found in Ollama. Pull a model with "ollama pull <model-name>".',
        };
      }
      return { models: suggestions, error: 'Provider returned no models.' };
    }

    // Surface the curated free models first, then everything else (reverse for newest-first)
    const free = normalisedIds.filter(
      (id) => suggestions.includes(id) || id.endsWith(':free'),
    );
    const rest = normalisedIds
      .filter((id) => !free.includes(id))
      .sort()
      .reverse();

    return { models: [...new Set([...free, ...rest])] };
  } catch (error) {
    let message = error instanceof Error ? error.message : String(error);

    if (message.includes('ECONNREFUSED') || message.includes('Failed to fetch')) {
      return {
        models: suggestions,
        error: `Cannot connect to provider at ${baseURL}.`,
      };
    }

    if (message.includes('timeout')) {
      return {
        models: suggestions,
        error: 'Provider server is not responding (timeout).',
      };
    }

    return {
      models: suggestions,
      error: message,
    };
  }
}
