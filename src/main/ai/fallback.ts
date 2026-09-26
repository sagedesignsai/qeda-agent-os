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

/** HTTP statuses worth retrying elsewhere. */
function isRetryableStatus(status: number): boolean {
  return (
    status === 408 || // request timeout
    status === 409 || // conflict
    status === 425 || // too early
    status === 429 || // rate limited – the main case
    status >= 500 // upstream failure
  );
}

const RETRYABLE_MESSAGE =
  /rate.?limit|too many requests|quota|overloaded|capacity|temporarily unavailable|service unavailable|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|fetch failed|socket hang up|network error/i;

/**
 * Decide whether an error means "this provider cannot serve us right now, but
 * another one might".
 *
 * Walks the wrapper chain: the SDK's `RetryError` keeps the underlying failure
 * in `lastError`, and anything can carry a `cause`. A bad request, an invalid
 * key or a malformed tool call must NOT trigger fallback — retrying those on a
 * different provider just burns another provider's quota and hides the bug.
 */
export function isRetryableProviderError(error: unknown, depth = 0): boolean {
  if (!error || depth > 4) return false;

  const candidate = error as {
    statusCode?: unknown;
    status?: unknown;
    isRetryable?: unknown;
    lastError?: unknown;
    cause?: unknown;
    message?: unknown;
  };

  if (typeof candidate.statusCode === 'number') {
    return isRetryableStatus(candidate.statusCode);
  }
  if (typeof candidate.status === 'number') {
    return isRetryableStatus(candidate.status);
  }

  // Unwrap SDK error wrappers before falling back to message sniffing, so a
  // wrapped 401 is not mistaken for a transient network problem.
  if (candidate.lastError !== undefined) {
    return isRetryableProviderError(candidate.lastError, depth + 1);
  }
  if (candidate.cause !== undefined) {
    return isRetryableProviderError(candidate.cause, depth + 1);
  }

  if (typeof candidate.isRetryable === 'boolean') return candidate.isRetryable;

  const message =
    typeof candidate.message === 'string' ? candidate.message : String(error);
  return RETRYABLE_MESSAGE.test(message);
}

/** Short, user-facing explanation of why a fallback happened. */
export function describeFallbackReason(error: unknown): string {
  const candidate = error as { statusCode?: unknown; message?: unknown };
  if (candidate?.statusCode === 429) return 'rate limit reached';
  if (typeof candidate?.statusCode === 'number' && candidate.statusCode >= 500) {
    return `provider error (HTTP ${candidate.statusCode})`;
  }
  if (typeof candidate?.message === 'string') {
    return candidate.message.split('\n')[0].slice(0, 160);
  }
  return 'provider unavailable';
}

/** Human-readable label for a target, used in UI messages. */
export function describeTarget(target: ModelTarget): string {
  return `${getProvider(target.providerId)?.name ?? target.providerId} · ${target.modelId}`;
}
