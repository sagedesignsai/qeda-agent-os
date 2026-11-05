/**
 * ipc/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Composition root for all IPC handlers.
 *
 * main.ts calls registerIpcHandlers(mainWindow) and nothing else. Each module
 * owns one user-facing concern.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { type BrowserWindow } from 'electron';
import { registerSoundlabHandlers } from './handlers/soundlab.js';
import { registerSoundlabCopilotHandlers } from './handlers/soundlab-copilot.js';

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  registerSoundlabHandlers({ mainWindow });
  registerSoundlabCopilotHandlers({ mainWindow });
}
