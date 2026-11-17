/**
 * ipc/handlers/ollama.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IPC handlers for Ollama local model management and server control.
 *
 * Exposes Ollama connectivity checks, model listing, and server control to
 * the renderer so users can manage their local models from the UI.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ipcMain } from 'electron';
import {
  checkOllamaConnection,
  listOllamaModels,
  formatOllamaSetupInstructions,
  isOllamaInstalled,
  getOllamaVersion,
  startOllamaServer,
  pullOllamaModel,
  getRunningOllamaModels,
  stopOllamaModel,
} from '../../ai/ollama.js';

export function registerOllamaHandlers(): void {
  /**
   * Check if Ollama server is running and reachable.
   */
  ipcMain.handle(
    'ollama:check-connection',
    async (
      _e,
      req: { baseURL?: string },
    ): Promise<{ isRunning: boolean; error?: string }> => {
      return checkOllamaConnection(req.baseURL);
    },
  );

  /**
   * List all locally installed Ollama models.
   */
  ipcMain.handle(
    'ollama:list-models',
    async (
      _e,
      req: { baseURL?: string },
    ): Promise<{ models: string[]; error?: string }> => {
      return listOllamaModels(req.baseURL);
    },
  );

  /**
   * Get setup instructions for Ollama.
   */
  ipcMain.handle(
    'ollama:get-setup-instructions',
    async (): Promise<string> => {
      return formatOllamaSetupInstructions();
    },
  );

  /**
   * Check if Ollama is installed on the system.
   */
  ipcMain.handle(
    'ollama:is-installed',
    async (): Promise<boolean> => {
      return isOllamaInstalled();
    },
  );

  /**
   * Get the installed Ollama version.
   */
  ipcMain.handle(
    'ollama:get-version',
    async (): Promise<string | null> => {
      return getOllamaVersion();
    },
  );

  /**
   * Start the Ollama server.
   */
  ipcMain.handle(
    'ollama:start-server',
    async (): Promise<{ success: boolean; pid?: number; error?: string; message?: string }> => {
      return startOllamaServer();
    },
  );

  /**
   * Pull (download) a model from Ollama registry.
   */
  ipcMain.handle(
    'ollama:pull-model',
    async (
      _e,
      req: { modelId: string },
    ): Promise<{ success: boolean; modelId?: string; progress?: string; error?: string }> => {
      return pullOllamaModel(req.modelId);
    },
  );

  /**
   * Get currently running Ollama models.
   */
  ipcMain.handle(
    'ollama:get-running',
    async (): Promise<string[]> => {
      return getRunningOllamaModels();
    },
  );

  /**
   * Stop a running Ollama model.
   */
  ipcMain.handle(
    'ollama:stop-model',
    async (
      _e,
      req: { modelId: string },
    ): Promise<boolean> => {
      return stopOllamaModel(req.modelId);
    },
  );
}
