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
import { PROVIDERS, envApiKey } from '../../ai/registry';
import {
  getRawSettings,
  getSettings,
  saveSettings,
  setActiveProjectId,
  type AppSettings,
} from '../../ai/settings';
import { mcpManager } from '../../ai/mcp/manager';
import { listServiceStatuses } from '../../services/keys';
import { DEFAULT_E2B_SANDBOX_TEMPLATE } from '../../../lib/builder-engine';
import { type ProviderInfo } from '../channels';
import { resetAgents } from '../agent-runtime';

export function registerSettingsHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  // ── Settings ──────────────────────────────────────────────────────────────

  ipcMain.handle('settings:get', () => {
    const s = getRawSettings();
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
      // RAG embeddings are configured separately from the chat model. These are
      // plain (unencrypted) ids, so they are safe to hand to the renderer — see
      // tools/rag.ts, which falls back to the environment when they are unset.
      embeddingProvider: s.embeddingProvider ?? '',
      embeddingModel: s.embeddingModel ?? '',
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
      // Whether an encrypted GitHub PAT is stored for cloning private repos
      // into the E2B sandbox. The value itself never leaves the main process.
      githubPatSet: Boolean(s.githubPat),
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
    };
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

    return PROVIDERS.map((provider) => {
      const fromSettings = settings.providers?.[provider.id]?.apiKey;
      const hasStoredKey = Boolean(fromSettings && fromSettings.trim());
      const hasEnvKey = Boolean(envApiKey(provider));
      const configuredSource = settings.providers?.[provider.id]?.apiKeySource;
      const apiKeyPreference =
        configuredSource ?? (hasStoredKey ? 'settings' : 'environment');
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
        // A keyless provider (a local Ollama) counts as configured.
        apiKeySet: apiKeySource !== null || !provider.apiKeyEnvs?.length,
        apiKeySource,
        apiKeyPreference,
      };
    });
  });

  ipcMain.handle(
    'providers:models',
    (_e, { providerId }: { providerId: string }) =>
      listProviderModels(providerId),
  );

  // ── External services ─────────────────────────────────────────────────────

  ipcMain.handle('services:list', () => listServiceStatuses());

  // ── MCP server management ─────────────────────────────────────────────────

  ipcMain.handle('mcp:statuses', () => mcpManager.getServerStatuses());

  ipcMain.handle('mcp:test-server', (_e, server) =>
    mcpManager.testServer(server),
  );

  ipcMain.handle('mcp:reload', async () => {
    const { activeCount } = await mcpManager.loadToolsForEnabledServers();
    return { activeCount };
  });
}
