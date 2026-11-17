/**
 * ipc/handlers/ollama.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IPC handlers for Ollama local model management and connection testing.
 *
 * Exposes Ollama connectivity checks, model listing, and setup instructions to
 * the renderer so users can manage their local models from the UI.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ipcMain } from 'electron';
import {
  checkOllamaConnection,
  listOllamaModels,
  formatOllamaSetupInstructions,
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
}
