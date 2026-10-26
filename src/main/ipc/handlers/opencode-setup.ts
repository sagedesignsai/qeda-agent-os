/**
 * ipc/handlers/opencode-setup.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Main-process bridge for OpenCode installation detection and plugin
 * registration. Thin wrappers over main/opencode/*.
 *
 * Registration snapshots Qeda's step budget and enabled MCP servers next to the
 * per-session bridge config, so the plugin can configure its agent and mirror
 * Qeda's MCP servers when OpenCode loads it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { app, ipcMain, shell } from 'electron';
import path from 'node:path';
import { getSettings } from '../../ai/settings';
import { detectOpenCode } from '../../opencode/detection';
import {
  registerPlugin,
  unregisterPlugin,
  readRegisteredPlugins,
} from '../../opencode/registration';
import { buildOpenCodeRuntimeConfig } from '../../opencode/runtime-config';

export function registerOpencodeSetupHandlers(): void {
  ipcMain.handle('opencode:detect', async () => detectOpenCode());
  ipcMain.handle('opencode:open-install-page', async () => {
    await shell.openExternal('https://opencode.ai/download');
  });

  ipcMain.handle('opencode:register-plugin', async (_event, req) => {
    const sourcePath = app.isPackaged
      ? path.join(process.resourcesPath, 'opencode-plugins', 'qeda-builder')
      : path.join(app.getAppPath(), 'plugins', 'qeda-builder', 'dist');
    const configDirectory = path.join(app.getPath('userData'), 'opencode');
    const bridgeConfigPath = path.join(configDirectory, 'bridge.json');
    const runtimeConfigPath = path.join(configDirectory, 'runtime.json');
    const settings = getSettings();
    const runtimeConfig = buildOpenCodeRuntimeConfig({
      maxSteps: settings.builderMaxSteps,
      mcpServers: settings.mcpServers,
    });

    return registerPlugin({
      mode: req.mode,
      resourcePath: sourcePath,
      bridgeConfigPath,
      runtimeConfigPath,
      runtimeConfig,
    });
  });

  ipcMain.handle('opencode:unregister-plugin', async (_event, req) => {
    return unregisterPlugin(req.entry);
  });

  ipcMain.handle('opencode:registered-plugins', async () =>
    readRegisteredPlugins(),
  );
}
