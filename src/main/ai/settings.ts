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
import { getProject, pickDefaultActiveProject } from '../db/projects.js';
import {
  DEFAULT_BUILDER_MAX_STEPS,
  type BuilderEngine,
  type McpServerSettings,
} from '../../lib/builder-engine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NamedProviderSettings {
  /** Base64-encoded safeStorage cipher. */
  apiKey?: string;
  /** Explicit credential source. Missing preserves the legacy saved-key-first behavior. */
  apiKeySource?: 'settings' | 'environment';
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
  /**
   * Which agent runtime powers Builder coding turns.
   * Defaults to 'local'.
   */
  builderEngine?: BuilderEngine;
  /**
   * Maximum model/tool steps in one Local Builder turn. The default is high
   * enough for install → test → fix loops; the Settings UI clamps it to a
   * supported range.
   */
  builderMaxSteps?: number;
  /**
   * Configured Model Context Protocol (MCP) servers available to the Local Builder agent.
   */
  mcpServers?: McpServerSettings[];
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
  /**
   * The project the user was last working in, restored on launch.
   *
   * This is a GLOBAL DEFAULT, not a per-surface scope. A surface that carries
   * an explicit `?project=<id>` still wins for that surface only; this is what
   * applies when nothing is scoped.
   *
   * It lives here rather than in the renderer because the main process needs it
   * independently: the chat and copilot agents are handed a project id, and when
   * the renderer sends none (a fresh launch is always unscoped) the repo tools
   * would otherwise have no project to resolve `repo_path` from. Keeping it in
   * settings.json means main can answer "what is the current project" on its own.
   *
   * Not a column on `projects`: "which project is selected" is a preference of
   * this install, not a property of the project. `activeProjectExplicitlyCleared`
   * distinguishes a deliberate global choice from a first-run unset preference.
   */
  activeProjectId?: string | null;
  /** True when the user explicitly chose global/no-default project context. */
  activeProjectExplicitlyCleared?: boolean;
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
    builderEngine: 'local',
    builderMaxSteps: DEFAULT_BUILDER_MAX_STEPS,
    mcpServers: [],
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

  // Decrypt external-service keys.
  if (decrypted.serviceKeys) {
    for (const [id, value] of Object.entries(decrypted.serviceKeys)) {
      if (typeof value !== 'string' || !value) continue;
      try {
        decrypted.serviceKeys[id] = safeStorage.decryptString(
          Buffer.from(value, 'base64'),
        );
      } catch {
        delete decrypted.serviceKeys[id];
      }
    }
  }

  // Decrypt named provider keys.
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

  // Decrypt MCP server env and headers.
  if (Array.isArray(decrypted.mcpServers)) {
    decrypted.mcpServers = decrypted.mcpServers.map((server) => {
      const serverCopy = { ...server };
      if (serverCopy.env) {
        const decryptedEnv: Record<string, string> = {};
        for (const [k, v] of Object.entries(serverCopy.env)) {
          if (v && v.startsWith('enc:')) {
            try {
              decryptedEnv[k] = safeStorage.decryptString(
                Buffer.from(v.slice(4), 'base64'),
              );
            } catch {
              decryptedEnv[k] = '';
            }
          } else {
            decryptedEnv[k] = v;
          }
        }
        serverCopy.env = decryptedEnv;
      }
      if (serverCopy.headers) {
        const decryptedHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(serverCopy.headers)) {
          if (v && v.startsWith('enc:')) {
            try {
              decryptedHeaders[k] = safeStorage.decryptString(
                Buffer.from(v.slice(4), 'base64'),
              );
            } catch {
              decryptedHeaders[k] = '';
            }
          } else {
            decryptedHeaders[k] = v;
          }
        }
        serverCopy.headers = decryptedHeaders;
      }
      return serverCopy;
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
    if (toWrite.serviceKeys) {
      for (const [id, value] of Object.entries(toWrite.serviceKeys)) {
        if (typeof value === 'string' && value) {
          toWrite.serviceKeys[id] = safeStorage
            .encryptString(value)
            .toString('base64');
        }
      }
    }

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

    if (Array.isArray(toWrite.mcpServers)) {
      toWrite.mcpServers = toWrite.mcpServers.map((server) => {
        const serverCopy = { ...server };
        if (serverCopy.env) {
          const encryptedEnv: Record<string, string> = {};
          for (const [k, v] of Object.entries(serverCopy.env)) {
            if (v && !v.startsWith('enc:')) {
              encryptedEnv[k] = `enc:${safeStorage
                .encryptString(v)
                .toString('base64')}`;
            } else {
              encryptedEnv[k] = v;
            }
          }
          serverCopy.env = encryptedEnv;
        }
        if (serverCopy.headers) {
          const encryptedHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(serverCopy.headers)) {
            if (v && !v.startsWith('enc:')) {
              encryptedHeaders[k] = `enc:${safeStorage
                .encryptString(v)
                .toString('base64')}`;
            } else {
              encryptedHeaders[k] = v;
            }
          }
          serverCopy.headers = encryptedHeaders;
        }
        return serverCopy;
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

/**
 * Persist a chosen active project. Deliberately the only main-process write path
 * for `activeProjectId`, so the manual sidebar picker and the automatic triggers
 * (project open, first-project creation, launch-time default) all go through one
 * place and one `settings:changed` broadcast.
 *
 * A repeated write of the same id is a no-op.
 *
 * `explicitlyCleared` records the user's deliberate All Projects choice. Without
 * it, null means no valid default and launch may choose a deterministic one.
 * Returns whether a write actually happened: `false` on the no-op early return,
 * `true` after a real `saveSettings`. The write itself is SILENT — callers are
 * responsible for broadcasting `settings:changed` when this returns `true`, so
 * an already-mounted `useProjectScope` does not keep a stale
 * `defaultProjectId = ''` until reload.
 */
export function setActiveProjectId(
  id: string | null,
  explicitlyCleared = false,
): boolean {
  const current = getRawSettings();
  const nextId: string | null = id ?? null;
  const nextExplicitlyCleared = nextId === null && explicitlyCleared;
  if (
    current.activeProjectId === nextId &&
    Boolean(current.activeProjectExplicitlyCleared) === nextExplicitlyCleared
  ) {
    return false;
  }
  saveSettings({
    ...current,
    activeProjectId: nextId,
    activeProjectExplicitlyCleared: nextExplicitlyCleared,
  });
  return true;
}

/**
 * Whether a stored `activeProjectId` still points at a live project row.
 *
 * Deleting a project re-homes its tasks to the Inbox but leaves settings.json
 * alone, so the stored id can outlive its row. Failing the check must not throw —
 * an unreadable DB here means "cannot prove it is stale", which keeps the user's
 * last explicit choice rather than silently retargeting them.
 */
function storedProjectExists(id: string): boolean {
  try {
    return getProject(id) !== null;
  } catch {
    return true;
  }
}

/**
 * The launch-time default resolution behind `resolveLaunchDefaultProjectId`,
 * with the extra fact the caller needs: did resolving actually WRITE?
 *
 * An explicit global choice suppresses auto-picking. Otherwise, a stored id is
 * trusted only when its project row still exists — a dangling id
 * would otherwise pin the app to a project it can no longer show. The stored
 * value still wins over the deterministic picker when it is valid: the picker
 * exists to fill a gap on a fresh install, not to overrule a real choice.
 *
 * The write is SILENT. The `settings:get` handler is responsible for broadcasting
 * `settings:changed` when `changed` is true.
 */
export function resolveLaunchDefaultProjectIdDetailed(): {
  id: string | null;
  changed: boolean;
} {
  const s = getRawSettings();
  if (!s.activeProjectId && s.activeProjectExplicitlyCleared) {
    return { id: null, changed: false };
  }
  if (s.activeProjectId && storedProjectExists(s.activeProjectId)) {
    return { id: s.activeProjectId, changed: false };
  }
  const picked = pickDefaultActiveProject();
  if (!picked) {
    const changed = s.activeProjectId ? setActiveProjectId(null) : false;
    return { id: null, changed };
  }
  // A dangling stored id is overwritten here; setActiveProjectId reports whether
  // that was a real write, so the handler can decide to broadcast.
  return { id: picked.id, changed: setActiveProjectId(picked.id) };
}

/**
 * When there is no persisted active project, pick one deterministically so the
 * app does not sit on "no project selected" on a launch where there is an obvious
 * choice. Returns the picked project id, or null when there is nothing sensible
 * to choose (no projects at all, or only the Inbox).
 *
 * This is what makes a fresh install with a single project, or a user who has one
 * obvious working project, start with an active project instead of forcing a
 * manual pick.
 *
 * Thin wrapper over {@link resolveLaunchDefaultProjectIdDetailed} for callers that
 * only want the id. The write is silent either way; if you need to broadcast
 * `settings:changed` afterwards, use the detailed form.
 */
export function resolveLaunchDefaultProjectId(): string | null {
  return resolveLaunchDefaultProjectIdDetailed().id;
}
