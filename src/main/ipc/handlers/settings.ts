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
  resolveLaunchDefaultProjectIdDetailed,
  type AppSettings,
} from '../../ai/settings';
import { mcpManager } from '../../ai/mcp/manager';
import { listServiceStatuses } from '../../services/keys';
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
      { apiKey?: boolean; baseURL?: string }
    > = {};
    for (const [k, v] of Object.entries(s.providers)) {
      sanitizedProviders[k] = {
        apiKey: !!(v as { apiKey?: string })?.apiKey,
        baseURL: (v as { baseURL?: string })?.baseURL,
      };
    }
    const serviceKeysSet: Record<string, boolean> = {};
    for (const status of listServiceStatuses()) {
      serviceKeysSet[status.id] = status.configured;
    }

    // If no active project is persisted, pick one deterministically so the app
    // does not sit on "no project selected" when there is an obvious choice
    // (e.g. a fresh install with a single project). This is a one-time write on
    // first read after launch, so a later explicit pick still wins.
    const launchDefault = resolveLaunchDefaultProjectIdDetailed();
    const activeProjectId = launchDefault.id ?? '';
    if (launchDefault.changed && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('settings:changed');
    }

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
    (_e, { projectId }: { projectId: string | null }) => {
      const current = getRawSettings();
      // Store null rather than '' so the field round-trips as "no default".
      const nextId = projectId ?? null;
      if (current.activeProjectId === nextId) return;
      saveSettings({ ...current, activeProjectId: nextId });
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
    const merged: AppSettings = {
      ...current,
      ...incoming,
      providers: { ...current.providers, ...(incoming.providers ?? {}) },
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

      return {
        id: provider.id,
        name: provider.name,
        baseURL: provider.baseURL,
        freeModels: provider.freeModels ?? [],
        note: provider.note,
        // A keyless provider (a local Ollama) counts as configured.
        apiKeySet: hasStoredKey || hasEnvKey || !provider.apiKeyEnvs?.length,
        apiKeySource: hasStoredKey
          ? ('settings' as const)
          : hasEnvKey
            ? ('environment' as const)
            : null,
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

  ipcMain.handle('mcp:test-server', (_e, server) => mcpManager.testServer(server));

  ipcMain.handle('mcp:reload', async () => {
    const { activeCount } = await mcpManager.loadToolsForEnabledServers();
    return { activeCount };
  });
}
