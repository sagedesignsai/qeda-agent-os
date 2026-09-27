/**
 * ai/fallback.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Cross-provider fallback for rate-limited / unavailable providers.
 *
 * Free tiers (Groq, OpenRouter's `:free`, NVIDIA NIM) fail fast with HTTP 429
 * once their per-minute or per-day budget is gone. Rather than surfacing that
 * to the user, a turn can be retried on the next *configured* provider.
 *
 * This module is deliberately dependency-free (it only imports the plain data
 * registry) so the selection and error-classification logic stays unit
 * testable without booting Electron or the ESM-only AI SDK packages.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { PROVIDERS, getProvider } from './registry';

/** A provider + model pair a turn can be attempted with. */
export interface ModelTarget {
  providerId: string;
  modelId: string;
}

export interface BuildModelChainOptions {
  /** The user's current selection, always attempted first. */
  activeProvider: string;
  activeModel: string;
  /** Whether a usable credential exists for a provider. */
  isConfigured: (providerId: string) => boolean;
  /** Cap on providers tried per turn (including the primary). */
  maxAttempts?: number;
}

/** Providers tried per turn, primary first. */
export const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * The settings-level gate in front of `buildModelChain`.
 *
 * Returns an empty list when there is nothing usable to run, so the caller can
 * raise an actionable error instead of inventing a provider the user did not
 * pick. Also honours the user's opt-out of fallback entirely.
 */
export function resolveChain({
  activeProvider,
  activeModel,
  fallbackEnabled,
  isConfigured,
  maxAttempts,
}: BuildModelChainOptions & { fallbackEnabled: boolean }): ModelTarget[] {
  if (!activeModel.trim()) return [];

  if (!fallbackEnabled) {
    return [{ providerId: activeProvider, modelId: activeModel.trim() }];
  }

  return buildModelChain({
    activeProvider,
    activeModel,
    isConfigured,
    maxAttempts,
  });
}

/**
 * Build the ordered list of targets to try for a single turn.
 *
 * The user's selection always comes first so an explicit choice is never
 * silently second-guessed. Fallback entries are other configured providers in
 * registry order (free tiers first) that have a curated default model — a
 * provider whose catalog we do not know cannot be used without an extra
 * round-trip, which is too slow for an error path.
 */
export function buildModelChain({
  activeProvider,
  activeModel,
  isConfigured,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
}: BuildModelChainOptions): ModelTarget[] {
  const chain: ModelTarget[] = [];
  const used = new Set<string>();

  if (activeProvider && activeModel.trim()) {
    chain.push({ providerId: activeProvider, modelId: activeModel.trim() });
    used.add(activeProvider);
  }

  for (const provider of PROVIDERS) {
    if (chain.length >= maxAttempts) break;
    if (used.has(provider.id)) continue;
    if (!provider.freeModels?.length) continue;
    if (!isConfigured(provider.id)) continue;

    chain.push({ providerId: provider.id, modelId: provider.freeModels[0] });
    used.add(provider.id);
  }

  return chain;
}

/**
 * `fullStream` chunk types that the renderer turns into visible content.
 *
 * Keep in sync with the reducer in src/hooks/use-agent-chat.ts.
 *
 * Lifecycle chunks (`start`, `start-step`, `finish-step`, `finish`, …) are
 * deliberately NOT included. The SDK emits `start` *before* a provider error –
 * a 429 stream looks like `["start", "error"]` – so counting `start` as output
 * would mark every failed attempt as committed and block fallback entirely.
 */
const OUTPUT_CHUNK_TYPES = new Set([
  'text-delta',
  'reasoning-delta',
  'tool-input-start',
  'tool-call',
  'tool-approval-request',
  'tool-result',
  'tool-error',
  'tool-output-denied',
]);

/** True when this chunk has already produced something the user can see. */
export function isOutputChunk(type: unknown): boolean {
  return typeof type === 'string' && OUTPUT_CHUNK_TYPES.has(type);
}


/**
 * Check for AI SDK marker symbols across versions and module loaders.
 * (Identical to AISDKError.hasMarker in @ai-sdk/provider).
 */
function hasAiErrorMarker(error: unknown, marker: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const sym = Symbol.for(marker);
  return sym in error && (error as Record<symbol, unknown>)[sym] === true;
}

export const isAiApICallError = (err: unknown): boolean =>
  hasAiErrorMarker(err, 'vercel.ai.error.AI_APICallError') ||
  (err as { name?: string })?.name === 'AI_APICallError' ||
  (err as { name?: string })?.name === 'APICallError';

export const isAiRetryError = (err: unknown): boolean =>
  hasAiErrorMarker(err, 'vercel.ai.error.AI_RetryError') ||
  (err as { name?: string })?.name === 'AI_RetryError' ||
  (err as { name?: string })?.name === 'RetryError';

export const isAiStreamProviderError = (err: unknown): boolean =>
  hasAiErrorMarker(err, 'vercel.ai.error.AI_StreamProviderError') ||
  (err as { name?: string })?.name === 'AI_StreamProviderError' ||
  (err as { name?: string })?.name === 'StreamProviderError';

export const isAiNoSuchModelError = (err: unknown): boolean =>
  hasAiErrorMarker(err, 'vercel.ai.error.AI_NoSuchModelError') ||
  (err as { name?: string })?.name === 'AI_NoSuchModelError' ||
  (err as { name?: string })?.name === 'NoSuchModelError';

export const isAiNoSuchProviderError = (err: unknown): boolean =>
  hasAiErrorMarker(err, 'vercel.ai.error.AI_NoSuchProviderError') ||
  (err as { name?: string })?.name === 'AI_NoSuchProviderError' ||
  (err as { name?: string })?.name === 'NoSuchProviderError';

export const isAiEmptyResponseBodyError = (err: unknown): boolean =>
  hasAiErrorMarker(err, 'vercel.ai.error.AI_EmptyResponseBodyError') ||
  (err as { name?: string })?.name === 'AI_EmptyResponseBodyError' ||
  (err as { name?: string })?.name === 'EmptyResponseBodyError';

export const isAiJsonParseError = (err: unknown): boolean =>
  hasAiErrorMarker(err, 'vercel.ai.error.AI_JSONParseError') ||
  (err as { name?: string })?.name === 'AI_JSONParseError' ||
  (err as { name?: string })?.name === 'JSONParseError';

export const isAiUnsupportedFunctionalityError = (err: unknown): boolean =>
  hasAiErrorMarker(err, 'vercel.ai.error.AI_UnsupportedFunctionalityError') ||
  (err as { name?: string })?.name === 'AI_UnsupportedFunctionalityError' ||
  (err as { name?: string })?.name === 'UnsupportedFunctionalityError';

export const isAiLoadApiKeyError = (err: unknown): boolean =>
  hasAiErrorMarker(err, 'vercel.ai.error.AI_LoadAPIKeyError') ||
  (err as { name?: string })?.name === 'AI_LoadAPIKeyError' ||
  (err as { name?: string })?.name === 'LoadAPIKeyError';

export const isAiNonRetryableClientError = (err: unknown): boolean =>
  hasAiErrorMarker(err, 'vercel.ai.error.AI_MessageConversionError') ||
  hasAiErrorMarker(err, 'vercel.ai.error.AI_InvalidArgumentError') ||
  hasAiErrorMarker(err, 'vercel.ai.error.AI_InvalidPromptError') ||
  hasAiErrorMarker(err, 'vercel.ai.error.AI_InvalidToolInputError') ||
  hasAiErrorMarker(err, 'vercel.ai.error.AI_NoSuchToolError') ||
  hasAiErrorMarker(err, 'vercel.ai.error.AI_InvalidStreamPartError') ||
  (err as { name?: string })?.name === 'MessageConversionError' ||
  (err as { name?: string })?.name === 'InvalidArgumentError' ||
  (err as { name?: string })?.name === 'InvalidPromptError';

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const c = err as { name?: unknown; message?: unknown; reason?: unknown };
  if (c.name === 'AbortError') return true;
  if (c.reason === 'abort') return true;
  if (typeof c.message === 'string' && /^AbortError/i.test(c.message)) return true;
  return false;
}

/** HTTP statuses indicating a provider/model problem worth retrying on the next target. */
function isRetryableProviderStatus(status: number): boolean {
  return (
    status === 400 || // Bad Request: provider schema/parameter rejection (e.g. reasoning_content, context limit)
    status === 401 || // Unauthorized: invalid or expired API key on this provider
    status === 402 || // Payment Required: insufficient credits on this provider
    status === 403 || // Forbidden: quota exceeded or region blocked on this provider
    status === 404 || // Not Found: model decommissioned or unsupported on this provider
    status === 408 || // Request Timeout
    status === 409 || // Conflict
    status === 425 || // Too Early
    status === 429 || // Rate Limited
    status >= 500 // Upstream provider failure (500, 502, 503, 504)
  );
}

const RETRYABLE_MESSAGE =
  /rate.?limit|too many requests|quota|overloaded|capacity|temporarily unavailable|service unavailable|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|fetch failed|socket hang up|network error|bad gateway|gateway timeout|unsupported|decommissioned|not supported/i;

/**
 * Decide whether an error means "this provider cannot serve us right now, but
 * another one might".
 *
 * Walks the wrapper chain (AI SDK RetryError and cause properties).
 * Returns true for provider-side failures (rate limits, outages, 4xx/5xx responses,
 * missing models, streaming errors), while protecting against retrying user aborts
 * or purely client-side programming errors.
 */
export function isRetryableProviderError(error: unknown, depth = 0): boolean {
  if (!error || depth > 4) return false;

  // Never retry aborted turns.
  if (isAbortError(error)) return false;

  // Pure client code errors (local message formatting, missing arguments) will fail identically everywhere.
  if (isAiNonRetryableClientError(error)) return false;

  // Typed AI SDK error classes representing provider-side or catalog problems:
  if (
    isAiNoSuchModelError(error) ||
    isAiNoSuchProviderError(error) ||
    isAiUnsupportedFunctionalityError(error) ||
    isAiEmptyResponseBodyError(error) ||
    isAiJsonParseError(error) ||
    isAiLoadApiKeyError(error)
  ) {
    return true;
  }

  const candidate = error as {
    statusCode?: unknown;
    status?: unknown;
    isRetryable?: unknown;
    lastError?: unknown;
    errors?: unknown[];
    cause?: unknown;
    message?: unknown;
    reason?: unknown;
  };

  // If a provider HTTP status code is present, check if it warrants falling back.
  if (typeof candidate.statusCode === 'number') {
    return isRetryableProviderStatus(candidate.statusCode);
  }
  if (typeof candidate.status === 'number') {
    return isRetryableProviderStatus(candidate.status);
  }

  // Unwrap AI SDK RetryError to examine the underlying provider failure.
  if (candidate.lastError !== undefined) {
    return isRetryableProviderError(candidate.lastError, depth + 1);
  }
  if (Array.isArray(candidate.errors) && candidate.errors.length > 0) {
    return isRetryableProviderError(
      candidate.errors[candidate.errors.length - 1],
      depth + 1,
    );
  }

  // Unwrap cause chains.
  if (candidate.cause !== undefined) {
    return isRetryableProviderError(candidate.cause, depth + 1);
  }

  // If the SDK explicitly flagged the error as retryable.
  if (typeof candidate.isRetryable === 'boolean' && candidate.isRetryable) {
    return true;
  }

  // An APICallError or StreamProviderError without explicit numeric status is still a provider API failure.
  if (isAiApICallError(error) || isAiStreamProviderError(error)) {
    return true;
  }

  const message =
    typeof candidate.message === 'string' ? candidate.message : String(error);
  return RETRYABLE_MESSAGE.test(message);
}

/** Short, user-facing explanation of why a fallback happened. */
export function describeFallbackReason(error: unknown, depth = 0): string {
  if (!error || depth > 4) return 'provider unavailable';

  const candidate = error as {
    statusCode?: unknown;
    status?: unknown;
    lastError?: unknown;
    cause?: unknown;
    message?: unknown;
  };

  // Unwrap RetryError or cause to find the root provider failure.
  if (candidate.lastError !== undefined) {
    return describeFallbackReason(candidate.lastError, depth + 1);
  }

  const statusCode =
    typeof candidate.statusCode === 'number'
      ? candidate.statusCode
      : typeof candidate.status === 'number'
        ? candidate.status
        : undefined;

  if (statusCode === 429) return 'rate limit reached';
  if (statusCode === 401) return 'invalid or expired API key (HTTP 401)';
  if (statusCode === 402) return 'insufficient credits (HTTP 402)';
  if (statusCode === 403) return 'access forbidden or quota exceeded (HTTP 403)';
  if (statusCode === 404) return 'model not found or decommissioned (HTTP 404)';
  if (statusCode === 400) return 'request rejected by provider (HTTP 400)';
  if (statusCode !== undefined && statusCode >= 500) {
    return `provider error (HTTP ${statusCode})`;
  }

  if (isAiNoSuchModelError(error)) return 'model not found on provider';
  if (isAiUnsupportedFunctionalityError(error)) return 'unsupported model functionality';
  if (isAiEmptyResponseBodyError(error)) return 'empty response from provider';
  if (isAiJsonParseError(error)) return 'malformed response from provider';

  if (candidate.cause !== undefined) {
    const fromCause = describeFallbackReason(candidate.cause, depth + 1);
    if (fromCause !== 'provider unavailable') return fromCause;
  }

  if (typeof candidate.message === 'string' && candidate.message.trim()) {
    const firstLine = candidate.message.split('\n')[0].trim();
    if (/rate.?limit/i.test(firstLine)) return 'rate limit reached';
    if (/fetch failed|ECONN|socket hang up/i.test(firstLine)) return 'network connection failed';
    return firstLine.slice(0, 160);
  }

  return 'provider unavailable';
}

/** Human-readable label for a target, used in UI messages. */
export function describeTarget(target: ModelTarget): string {
  return `${getProvider(target.providerId)?.name ?? target.providerId} · ${target.modelId}`;
}
