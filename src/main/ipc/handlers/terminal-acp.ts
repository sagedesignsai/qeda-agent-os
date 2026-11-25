import { ipcMain, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { getTerminalSession, updateTerminalSession } from '../../db/terminal.js';
import { AcpManager } from '../../pty/acp-manager.js';
import type { CodingCliProvider } from '../../../lib/terminal-acp.js';

let acpManager: AcpManager | null = null;

export function stopAcpTerminalSession(sessionId: string): Promise<void> {
  return acpManager?.stop(sessionId) ?? Promise.resolve();
}

export function registerTerminalAcpHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  if (acpManager) acpManager.setWindow(mainWindow);
  else acpManager = new AcpManager(mainWindow);

  mainWindow.once('closed', () => {
    void acpManager?.stopAll();
  });

  ipcMain.handle('terminal:acp-discover', () => acpManager!.discover());

  ipcMain.handle(
    'terminal:acp-state',
    (_event, { sessionId }: { sessionId: string }) =>
      acpManager!.getState(sessionId),
  );

  ipcMain.handle(
    'terminal:acp-start',
    async (
      _event,
      {
        sessionId,
        provider,
        cwd,
        prompt,
      }: {
        sessionId: string;
        provider: CodingCliProvider;
        cwd: string;
        prompt: string;
      },
    ) => {
      if (!getTerminalSession(sessionId)) {
        throw new Error('The terminal session no longer exists.');
      }
      if (!path.isAbsolute(cwd)) {
        throw new Error('ACP requires an absolute project working directory.');
      }
      if (!fs.statSync(cwd).isDirectory()) {
        throw new Error('The selected project working directory is unavailable.');
      }

      updateTerminalSession(sessionId, { goal: prompt });
      await acpManager!.startOrPrompt({ sessionId, provider, cwd, prompt });
    },
  );

  ipcMain.handle(
    'terminal:acp-cancel',
    (_event, { sessionId }: { sessionId: string }) =>
      acpManager!.cancel(sessionId),
  );

  ipcMain.handle(
    'terminal:acp-stop',
    (_event, { sessionId }: { sessionId: string }) =>
      acpManager!.stop(sessionId),
  );

  ipcMain.handle(
    'terminal:acp-permission-response',
    (
      _event,
      {
        sessionId,
        requestId,
        optionId,
      }: { sessionId: string; requestId: string; optionId?: string },
    ) => {
      acpManager!.respondToPermission(sessionId, requestId, optionId);
    },
  );
}
