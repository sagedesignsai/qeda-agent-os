/**
 * ai/settings.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Persistent, encrypted settings storage using Electron's safeStorage API.
 *
 * All sensitive values (API keys) are encrypted on-disk via the OS keychain
 * before being written to a plain JSON file. Plain-text keys never touch disk.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pickDefaultProvider } from './registry';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NamedProviderSettings {
  /** Base64-encoded safeStorage cipher. */
  apiKey?: string;
  baseURL?: string;
}

export interface CustomProviderSettings {
  id: string;
  name: string;
  baseURL: string;
  /** Base64-encoded safeStorage cipher. */
  apiKey?: string;
}

export interface ProvidersMap {
  [providerId: string]: NamedProviderSettings;
  // custom is stored separately to avoid polluting the index signature
}

export interface AppSettings {
  activeProvider: string;
  activeModel: string;
  /**
   * Retry a failed turn on the next configured provider when the active one is
   * rate limited or unavailable. On by default.
   */
  fallbackEnabled?: boolean;
  /** Optional override for RAG embedding model. */
  embeddingProvider?: string;
  embeddingModel?: string;
  /** Brave Search API key (source discovery for deep research). Encrypted at rest. */
  braveApiKey?: string;
  /**
   * External-service API keys (Tavily, Firecrawl, Context7, Unsplash, speech…),
   * keyed by service id from services/registry.ts. Encrypted at rest; the
   * environment is used as a fallback at resolution time (see services/keys.ts).
   */
  serviceKeys?: Record<string, string>;
  /**
   * Set once the first-launch onboarding has been finished or skipped, so the
   * welcome flow is shown exactly once. Absent on a fresh install.
   */
  onboardingCompleted?: boolean;
  providers: ProvidersMap;
  customProviders?: CustomProviderSettings[];
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

/**
 * First-run defaults. Chosen from the environment so a checkout with only
 * `GROQ_API_KEY` (or OpenRouter, Gemini, …) starts on a free provider instead
 * of an unconfigured paid one.
 */
function defaultSettings(): AppSettings {
  const { provider, model } = pickDefaultProvider();
  return {
    activeProvider: provider,
    activeModel: model,
    fallbackEnabled: true,
    providers: {},
    customProviders: [],
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

let _cache: AppSettings | null = null;

function readRaw(): AppSettings {
  const defaults = defaultSettings();
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8');
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Read settings (cached). API keys are still encrypted at this point. */
export function getRawSettings(): AppSettings {
  if (!_cache) _cache = readRaw();
  return _cache;
}

/**
 * Read settings with all API keys decrypted.
 * Safe to call only in the main process.
 */
export function getSettings(): AppSettings {
  const raw = getRawSettings();
  if (!safeStorage.isEncryptionAvailable()) return raw;

  const decrypted: AppSettings = JSON.parse(JSON.stringify(raw));

  // Decrypt the Brave Search key.
  if (typeof decrypted.braveApiKey === 'string' && decrypted.braveApiKey) {
    try {
      decrypted.braveApiKey = safeStorage.decryptString(
        Buffer.from(decrypted.braveApiKey, 'base64'),
      );
    } catch {
      decrypted.braveApiKey = undefined;
    }
  }

  // Decrypt external-service keys.
  if (decrypted.serviceKeys) {
    for (const [id, value] of Object.entries(decrypted.serviceKeys)) {
      if (typeof value !== 'string' || !value) continue;
      try {
        decrypted.serviceKeys[id] = safeStorage.decryptString(Buffer.from(value, 'base64'));
      } catch {
        delete decrypted.serviceKeys[id];
      }
    }
  }

  // Decrypt named provider keys.
  for (const [key, val] of Object.entries(decrypted.providers)) {
    if (val && typeof val === 'object' && 'apiKey' in val && typeof val.apiKey === 'string') {
      try {
        val.apiKey = safeStorage.decryptString(Buffer.from(val.apiKey, 'base64'));
      } catch {
        val.apiKey = undefined;
      }
    }
  }

  // Decrypt custom provider keys.
  if (Array.isArray(decrypted.customProviders)) {
    decrypted.customProviders = decrypted.customProviders.map((c) => {
      if (!c.apiKey) return c;
      try {
        return { ...c, apiKey: safeStorage.decryptString(Buffer.from(c.apiKey, 'base64')) };
      } catch {
        return { ...c, apiKey: undefined };
      }
    });
  }

  return decrypted;
}

/**
 * Persist settings. Plain-text API keys are encrypted before writing to disk.
 */
export function saveSettings(settings: AppSettings): void {
  const toWrite: AppSettings = JSON.parse(JSON.stringify(settings));

  if (safeStorage.isEncryptionAvailable()) {
    if (typeof toWrite.braveApiKey === 'string' && toWrite.braveApiKey) {
      toWrite.braveApiKey = safeStorage.encryptString(toWrite.braveApiKey).toString('base64');
    }

    if (toWrite.serviceKeys) {
      for (const [id, value] of Object.entries(toWrite.serviceKeys)) {
        if (typeof value === 'string' && value) {
          toWrite.serviceKeys[id] = safeStorage.encryptString(value).toString('base64');
        }
      }
    }

    for (const val of Object.values(toWrite.providers)) {
      if (val && 'apiKey' in val && typeof val.apiKey === 'string' && val.apiKey) {
        val.apiKey = safeStorage.encryptString(val.apiKey).toString('base64');
      }
    }

    if (Array.isArray(toWrite.customProviders)) {
      toWrite.customProviders = toWrite.customProviders.map((c) => {
        if (!c.apiKey) return c;
        return { ...c, apiKey: safeStorage.encryptString(c.apiKey).toString('base64') };
      });
    }
  }

  fs.writeFileSync(settingsPath(), JSON.stringify(toWrite, null, 2), 'utf8');
  _cache = null;
}

export function setActiveModel(providerId: string, modelId: string): void {
  const s = getRawSettings();
  saveSettings({ ...s, activeProvider: providerId, activeModel: modelId });
}
