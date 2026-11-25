/**
 * ipc/handlers/settings.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Provider/model selection, fallback policy, and every encrypted API key.
 *
 * Extracted verbatim from the former monolithic ipc/handlers.ts.
 * Wired up by ipc/index.ts, which is the map of channel -> module.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { ipcMain, type BrowserWindow } from 'electron';
import { listProviderModels } from '../../ai/provider';
import { PROVIDERS, peekEnvApiKey } from '../../ai/registry';
import {
  getSettings,
  saveSettings,
  setActiveProjectId,
  type AppSettings,
} from '../../ai/settings';
import { performChatGPTSignIn } from '../../ai/chatgpt-auth';
import { mcpManager } from '../../ai/mcp/manager';
import { listServiceStatuses } from '../../services/keys';
import { DEFAULT_E2B_SANDBOX_TEMPLATE } from '../../../lib/builder/engine';
import {
  mergeTerminalSettings,
  normalizeTerminalSettings,
} from '../../../lib/terminal-settings';
import { type ProviderInfo } from '../channels';
import { resetAgents } from '../agent-runtime';

export function registerSettingsHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  // ── Settings ──────────────────────────────────────────────────────────────

  ipcMain.handle('settings:get', () => {
    const s = getSettings();
    // Only expose whether a key is set (boolean), never the actual value.
    const sanitizedProviders: Record<
      string,
      {
        apiKey?: boolean;
        apiKeySource?: 'settings' | 'environment';
        baseURL?: string;
      }
    > = {};
    for (const [k, v] of Object.entries(s.providers)) {
      sanitizedProviders[k] = {
        apiKey: !!(v as { apiKey?: string })?.apiKey,
        apiKeySource: (v as { apiKeySource?: 'settings' | 'environment' })
          ?.apiKeySource,
        baseURL: (v as { baseURL?: string })?.baseURL,
      };
    }
    const serviceKeysSet: Record<string, boolean> = {};
    for (const status of listServiceStatuses()) {
      serviceKeysSet[status.id] = status.configured;
    }

    // Reported exactly as persisted — deliberately NOT auto-picked. Launch
    // routing needs to tell "nothing chosen yet" (open Projects so the user can
    // pick) apart from "a project is active" (open Chat), so inventing a
    // default here would erase that distinction.
    const activeProjectId = s.activeProjectId ?? '';

    return {
      activeProvider: s.activeProvider,
      activeModel: s.activeModel,
      fallbackEnabled: s.fallbackEnabled !== false,
      onboardingCompleted: s.onboardingCompleted === true,
      spotlightTourCompleted: s.spotlightTourCompleted === true,
      // RAG embeddings are configured separately from the chat model. These are
      // plain (unencrypted) ids, so they are safe to hand to the renderer — see
      // tools/rag.ts, which falls back to the environment when they are unset.
      embeddingProvider: s.embeddingProvider ?? '',
      embeddingModel: s.embeddingModel ?? '',
      offlineModel: s.offlineModel ?? '',
      downloadedOfflineModels: s.downloadedOfflineModels ?? [],
      // The restored default project. Empty string rather than null so the
      // renderer gets a plain falsy value it can compare against directly.
      activeProjectId,
      providers: sanitizedProviders,
      serviceKeysSet,
      // Builder engine selection — defaults to 'local' on fresh installs.
      builderEngine: s.builderEngine ?? 'local',
      // E2B sandbox timeout. Only relevant when the Builder engine is OpenCode
      // and the user opts into running a session inside a remote sandbox.
      e2bSandboxTimeoutMs: s.e2bSandboxTimeoutMs ?? 3_600_000,
      // Pinned OpenCode runtime template used by the sandbox engine.
      e2bSandboxTemplate: s.e2bSandboxTemplate ?? DEFAULT_E2B_SANDBOX_TEMPLATE,
      terminal: normalizeTerminalSettings(s.terminal),
      // Whether an encrypted GitHub PAT is stored for cloning private repos
      // into the E2B sandbox. The value itself never leaves the main process.
      githubPatSet: Boolean(s.githubPat),
      // Text-to-speech selection and per-provider defaults. Contains no keys —
      // keys live in `serviceKeys` and are only ever reported as booleans.
      tts: s.tts ?? null,
      // MCP servers: strip secret env and header values, expose only presence.
      mcpServers: (s.mcpServers ?? []).map((srv) => ({
        id: srv.id,
        name: srv.name,
        enabled: srv.enabled,
        transport: srv.transport,
        command: srv.command,
        args: srv.args,
        cwd: srv.cwd,
        url: srv.url,
        hasEnv: !!(srv.env && Object.values(srv.env).some(Boolean)),
        hasHeaders: !!(srv.headers && Object.values(srv.headers).some(Boolean)),
      })),
    };
  });

  /**
   * Record the active project. Deliberately NOT folded into `settings:save`:
   * that is the Settings dialog's channel and carries a provider-state merge,
   * whereas this is a one-field write from a sidebar click (and, now, from the
   * automatic triggers that persist a project the user is clearly working in).
   */
  ipcMain.handle(
    'settings:set-active-project',
    (
      _e,
      {
        projectId,
        explicitlyAllProjects,
      }: { projectId: string | null; explicitlyAllProjects?: boolean },
    ) => {
      const changed = setActiveProjectId(
        projectId ?? null,
        explicitlyAllProjects === true,
      );
      if (!changed) return;
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('settings:changed');
      }
    },
  );

  ipcMain.handle('settings:save', (_e, incoming: Partial<AppSettings>) => {
    // The renderer only sends the fields it edits, so merge over the decrypted
    // current settings rather than replacing them – otherwise saving would drop
    // unrelated configuration such as custom providers or the embedding setup.
    const current = getSettings();
    const mergedProviders = { ...current.providers };
    for (const [id, providerPatch] of Object.entries(
      incoming.providers ?? {},
    )) {
      mergedProviders[id] = {
        ...current.providers?.[id],
        ...providerPatch,
      };
    }
    const merged: AppSettings = {
      ...current,
      ...incoming,
      providers: mergedProviders,
      terminal: Object.prototype.hasOwnProperty.call(incoming, 'terminal')
        ? mergeTerminalSettings(current.terminal, incoming.terminal)
        : current.terminal,
    };
    // Custom providers are replaced as a list (an entry left out is deleted),
    // but an omitted `apiKey` means "keep the stored cipher": the renderer only
    // ever learns whether a key exists, never its value.
    if (incoming.customProviders) {
      merged.customProviders = incoming.customProviders.map((provider) => {
        const previous = current.customProviders?.find(
          (candidate) => candidate.id === provider.id,
        );
        return {
          ...previous,
          ...provider,
          apiKey: provider.apiKey?.trim() || previous?.apiKey,
        };
      });
    }
    // External-service keys: merge per service. A non-empty value replaces the
    // stored key; an empty string clears it. Absent services are untouched.
    if (incoming.serviceKeys) {
      const nextServiceKeys: Record<string, string> = {
        ...(current.serviceKeys ?? {}),
      };
      for (const [id, value] of Object.entries(incoming.serviceKeys)) {
        const trimmed = typeof value === 'string' ? value.trim() : '';
        if (trimmed) nextServiceKeys[id] = trimmed;
        else delete nextServiceKeys[id];
      }
      merged.serviceKeys = nextServiceKeys;
    }
    // GitHub PAT: keep current when not provided; empty clears.
    if (Object.prototype.hasOwnProperty.call(incoming, 'githubPat')) {
      merged.githubPat =
        typeof incoming.githubPat === 'string' && incoming.githubPat.trim()
          ? incoming.githubPat.trim()
          : undefined;
    } else {
      merged.githubPat = current.githubPat;
    }
    // E2B sandbox timeout.
    if (Object.prototype.hasOwnProperty.call(incoming, 'e2bSandboxTimeoutMs')) {
      merged.e2bSandboxTimeoutMs = incoming.e2bSandboxTimeoutMs;
    } else {
      merged.e2bSandboxTimeoutMs = current.e2bSandboxTimeoutMs;
    }
    // E2B sandbox template. Empty clears back to the pinned default.
    if (Object.prototype.hasOwnProperty.call(incoming, 'e2bSandboxTemplate')) {
      merged.e2bSandboxTemplate =
        typeof incoming.e2bSandboxTemplate === 'string' &&
        incoming.e2bSandboxTemplate.trim()
          ? incoming.e2bSandboxTemplate.trim()
          : undefined;
    } else {
      merged.e2bSandboxTemplate = current.e2bSandboxTemplate;
    }
    // Downloaded offline models: merge — append new ids, remove cleared ones.
    // When the renderer sends a list, union it with the existing list so
    // saving other settings does not erase the downloaded model ids.
    if (
      Object.prototype.hasOwnProperty.call(incoming, 'downloadedOfflineModels')
    ) {
      const incomingModels = incoming.downloadedOfflineModels ?? [];
      const existing = current.downloadedOfflineModels ?? [];
      if (incomingModels.length === 0) {
        // Explicitly clearing — keep existing unless the incoming also
        // has the field set to an empty array (which means clear all).
        merged.downloadedOfflineModels = incomingModels;
      } else {
        // Union: add new ids, keep existing ones
        merged.downloadedOfflineModels = [
          ...new Set([...existing, ...incomingModels]),
        ];
      }
    } else {
      merged.downloadedOfflineModels = current.downloadedOfflineModels;
    }
    // TTS: merge defaults per provider. Saving the Deepgram tab must not erase
    // an ElevenLabs default configured earlier.
    if (incoming.tts) {
      const currentTts = current.tts ?? {};
      const mergedDefaults: NonNullable<
        NonNullable<AppSettings['tts']>['defaults']
      > = { ...(currentTts.defaults ?? {}) };
      for (const [providerId, patch] of Object.entries(
        incoming.tts.defaults ?? {},
      )) {
        const key = providerId as keyof typeof mergedDefaults;
        mergedDefaults[key] = {
          ...(mergedDefaults[key] ?? {}),
          ...(patch ?? {}),
        };
      }
      merged.tts = {
        ...currentTts,
        ...incoming.tts,
        defaults: mergedDefaults,
      };
    } else {
      merged.tts = current.tts;
    }
    saveSettings(merged);
    resetAgents();

    // The provider/model readout in the sidebar footer and the composer
    // indicator mounted long before this dialog, so tell them to re-read.
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('settings:changed');
    }
  });

  // ── Providers ─────────────────────────────────────────────────────────────

  ipcMain.handle('providers:list', (): ProviderInfo[] => {
    const settings = getSettings();

    const builtIn: ProviderInfo[] = PROVIDERS.map((provider) => {
      // ChatGPT is an OAuth session, not an API key. Its "signed in" state
      // lives under settings.chatgptAuth, not providers.chatgpt.apiKey.
      if (provider.id === 'chatgpt') {
        const auth = settings.chatgptAuth;
        const signedIn = Boolean(
          auth?.accessToken && (!auth.expiresAt || auth.expiresAt > Date.now()),
        );
        return {
          id: provider.id,
          name: provider.name,
          baseURL: provider.baseURL,
          freeModels: provider.freeModels ?? [],
          note: provider.note,
          apiKeyEnvs: provider.apiKeyEnvs ?? [],
          supportsEmbeddings: provider.supportsEmbeddings === true,
          apiKeySet: signedIn,
          apiKeySource: signedIn ? 'settings' : null,
          apiKeyPreference: 'settings',
        };
      }

      const fromSettings = settings.providers?.[provider.id]?.apiKey;
      const hasStoredKey = Boolean(fromSettings && fromSettings.trim());
      // Peek instead of rotating: listing providers must not consume a key
      // rotation slot that a real request should get.
      const hasEnvKey = Boolean(peekEnvApiKey(provider));
      const configuredSource = settings.providers?.[provider.id]?.apiKeySource;
      // Default to the encrypted store when neither source has a key. Defaulting
      // to "environment" would disable the key input on a first run, leaving the
      // user to discover the toggle before they can type anything.
      const apiKeyPreference =
        configuredSource ??
        (hasStoredKey ? 'settings' : hasEnvKey ? 'environment' : 'settings');
      const apiKeySource =
        apiKeyPreference === 'settings'
          ? hasStoredKey
            ? 'settings'
            : null
          : hasEnvKey
            ? 'environment'
            : null;

      return {
        id: provider.id,
        name: provider.name,
        baseURL: provider.baseURL,
        freeModels: provider.freeModels ?? [],
        note: provider.note,
        apiKeyEnvs: provider.apiKeyEnvs ?? [],
        supportsEmbeddings: provider.supportsEmbeddings === true,
        // A keyless provider (a local Ollama) counts as configured.
        apiKeySet: apiKeySource !== null || !provider.apiKeyEnvs?.length,
        apiKeySource,
        apiKeyPreference,
      };
    });

    const custom: ProviderInfo[] = (settings.customProviders ?? []).map(
      (provider) => ({
        id: provider.id,
        name: provider.name,
        baseURL: provider.baseURL,
        freeModels: [],
        note: 'Custom OpenAI-compatible provider.',
        apiKeyEnvs: [],
        supportsEmbeddings: true,
        custom: true,
        apiKeySet: Boolean(provider.apiKey?.trim()),
        apiKeySource: provider.apiKey?.trim() ? 'settings' : null,
        apiKeyPreference: 'settings',
      }),
    );

    return [...builtIn, ...custom];
  });

  ipcMain.handle(
    'providers:models',
    (_e, { providerId }: { providerId: string }) =>
      listProviderModels(providerId),
  );

  // ── External services ─────────────────────────────────────────────────────

  ipcMain.handle('services:list', () => listServiceStatuses());

  // ── Hugging Face token ────────────────────────────────────────────────────
  // The renderer process (browser environment) cannot read process.env, so
  // Transformers.js never gets the Authorization header for HF downloads.
  // This handler exposes the token so the renderer can inject it via env.fetch.

  ipcMain.handle('settings:get-hf-token', () => {
    return process.env.HF_TOKEN ?? process.env.HF_ACCESS_TOKEN ?? null;
  });

  // ── Offline models ──────────────────────────────────────────────────────
  // Return the list of downloaded offline model ids so the renderer can
  // populate the offline provider's model dropdown.

  ipcMain.handle('offline-models:list', (): string[] => {
    const settings = getSettings();
    // Only return language models with chat templates — @browser-ai/transformers-js
    // always calls apply_chat_template(), so base models without a chat template
    // will fail at runtime.
    const allDownloaded = settings.downloadedOfflineModels ?? [];
    const { OFFLINE_MODELS } = require('../../../lib/offline-ai/models');
    const chatModels = OFFLINE_MODELS.filter(
      (m: { category: string; hasChatTemplate?: boolean }) =>
        m.category === 'language' && m.hasChatTemplate === true,
    ).map((m: { id: string }) => m.id);
    return allDownloaded.filter((id: string) => chatModels.includes(id));
  });

  // ── MCP server management ─────────────────────────────────────────────────

  ipcMain.handle('mcp:statuses', () => mcpManager.getServerStatuses());

  ipcMain.handle('mcp:test-server', (_e, server) =>
    mcpManager.testServer(server),
  );

  ipcMain.handle('mcp:reload', async () => {
    const { activeCount } = await mcpManager.loadToolsForEnabledServers();
    return { activeCount };
  });

  // ── ChatGPT OAuth ────────────────────────────────────────────────────────

  ipcMain.handle('chatgpt:signin', async () => {
    return await performChatGPTSignIn();
  });

  ipcMain.handle('chatgpt:status', () => {
    const s = getSettings();
    const auth = s.chatgptAuth;
    return {
      signedIn: Boolean(
        auth?.accessToken && (!auth.expiresAt || auth.expiresAt > Date.now()),
      ),
      expiresAt: auth?.expiresAt,
      clientId: auth?.clientId,
    };
  });

  ipcMain.handle('chatgpt:signout', () => {
    const current = getSettings();
    const { chatgptAuth: _chatgptAuth, ...rest } = current;
    void _chatgptAuth;
    saveSettings(rest);
    return;
  });
}
