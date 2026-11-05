/**
 * ai/settings.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Persistent, encrypted settings storage using Electron's safeStorage API.
 *
 * Simplified for SoundLab — only AI-relevant fields (provider, model, keys).
 * No Builder, MCP, E2B, projects, or computer-use settings.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pickDefaultProvider } from './registry.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NamedProviderSettings {
  apiKey?: string;
  apiKeySource?: 'settings' | 'environment';
  baseURL?: string;
}

export interface CustomProviderSettings {
  id: string;
  name: string;
  baseURL: string;
  apiKey?: string;
}

export interface ProvidersMap {
  [providerId: string]: NamedProviderSettings;
}

export interface AppSettings {
  activeProvider: string;
  activeModel: string;
  fallbackEnabled?: boolean;
  providers: ProvidersMap;
  customProviders?: CustomProviderSettings[];
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

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

  // Decrypt provider API keys.
  for (const val of Object.values(decrypted.providers)) {
    if (
      val &&
      typeof val === 'object' &&
      'apiKey' in val &&
      typeof val.apiKey === 'string'
    ) {
      try {
        val.apiKey = safeStorage.decryptString(
          Buffer.from(val.apiKey, 'base64'),
        );
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
        return {
          ...c,
          apiKey: safeStorage.decryptString(Buffer.from(c.apiKey, 'base64')),
        };
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
    for (const val of Object.values(toWrite.providers)) {
      if (
        val &&
        'apiKey' in val &&
        typeof val.apiKey === 'string' &&
        val.apiKey
      ) {
        val.apiKey = safeStorage.encryptString(val.apiKey).toString('base64');
      }
    }

    if (Array.isArray(toWrite.customProviders)) {
      toWrite.customProviders = toWrite.customProviders.map((c) => {
        if (!c.apiKey) return c;
        return {
          ...c,
          apiKey: safeStorage.encryptString(c.apiKey).toString('base64'),
        };
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
