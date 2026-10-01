/**
 * services/keys.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Resolves an external-service API key for the main process.
 *
 * Precedence matches the rest of the app: a key saved in the encrypted Settings
 * store wins over one supplied by the environment (which is loaded from
 * `.env.local` at startup). Never log or return these values to the renderer —
 * the renderer only ever learns whether a key exists.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getSettings } from '../ai/settings';
import {
  SERVICES,
  getService,
  envServiceKey,
  type ServiceCategory,
  type ServiceConfig,
} from './registry';
import {
  AUTO_SEARCH_ORDER,
  type SearchCandidate,
  type SearchProvider,
} from './search.js';

/**
 * The key a service has in the encrypted Settings store, or ''.
 *
 * Note the absence of a legacy-field escape hatch here: Brave Search used to
 * have a dedicated `braveApiKey` settings field alongside the `serviceKeys` map,
 * which meant the two could disagree. Brave has since been removed, and the
 * general rule is simply "the map, or nothing".
 */
function settingsServiceKey(id: string): string {
  const fromMap = getSettings().serviceKeys?.[id];
  return fromMap && fromMap.trim() ? fromMap.trim() : '';
}

export interface ServiceStatus {
  id: string;
  name: string;
  category: ServiceCategory;
  /** True when a key is available (or the service is keyless). */
  configured: boolean;
  /** Where the key came from. */
  source: 'settings' | 'environment' | null;
  note: string;
  docsUrl: string;
}

/** Resolve the key for a service: encrypted Settings first, then environment. */
export function resolveServiceKey(id: string): string {
  const fromSettings = settingsServiceKey(id);
  if (fromSettings) return fromSettings;
  const service = getService(id);
  if (service) {
    const fromEnv = envServiceKey(service);
    if (fromEnv) return fromEnv;
  }
  return '';
}

/** Status of every registered service, for the Settings UI. */
export function listServiceStatuses(): ServiceStatus[] {
  return SERVICES.map((service) => {
    const hasSettings = Boolean(settingsServiceKey(service.id));
    const hasEnv = Boolean(envServiceKey(service));
    return {
      id: service.id,
      name: service.name,
      category: service.category,
      configured: hasSettings || hasEnv || Boolean(service.keyless),
      source: hasSettings ? 'settings' : hasEnv ? 'environment' : null,
      note: service.note,
      docsUrl: service.docsUrl,
    };
  });
}

/** A service descriptor plus its resolved key, for tool execution. */
export interface ResolvedService {
  service: ServiceConfig;
  apiKey: string;
}

/**
 * Resolve a service or return an error message. Tools use this so a missing
 * key surfaces as a clear, actionable message instead of an HTTP 401.
 */
export function resolveService(
  id: string,
): { ok: true; value: ResolvedService } | { ok: false; error: string } {
  const service = getService(id);
  if (!service) return { ok: false, error: `Unknown service: ${id}` };
  const apiKey = resolveServiceKey(id);
  if (!apiKey && !service.keyless) {
    return {
      ok: false,
      error: `${service.name} is not configured. Add its API key in Settings (${service.docsUrl}) or set ${service.apiKeyEnvs[0]}.`,
    };
  }
  return { ok: true, value: { service, apiKey } };
}

/**
 * Every search provider that currently has a usable key, in preference order.
 *
 * This is what lets a caller say "search the web" without naming a provider.
 * The returned list is empty when the user has configured none, which the
 * caller must report as an actionable setup message rather than as an error
 * from a provider that was never called.
 */
export function resolveSearchCandidates(
  order: SearchProvider[] = AUTO_SEARCH_ORDER,
): SearchCandidate[] {
  const candidates: SearchCandidate[] = [];
  for (const provider of order) {
    const apiKey = resolveServiceKey(provider);
    if (apiKey) candidates.push({ provider, apiKey });
  }
  return candidates;
}
