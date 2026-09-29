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
  const fromSettings = getSettings().serviceKeys?.[id];
  if (fromSettings && fromSettings.trim()) return fromSettings.trim();
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
    const fromSettings = getSettings().serviceKeys?.[service.id];
    const hasSettings = Boolean(fromSettings && fromSettings.trim());
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
