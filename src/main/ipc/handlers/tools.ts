/**
 * ipc/handlers/tools.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Tool listing and approval-gated direct execution from the Tools page.
 *
 * Extracted verbatim from the former monolithic ipc/handlers.ts.
 * Wired up by ipc/index.ts, which is the map of channel -> module.
 * ────────────────────────────────────────────────────────────────────────────
 */

import {
  ipcMain,
  dialog,
  BrowserWindow,
  type IpcMainInvokeEvent,
} from 'electron';
import { allTools, requiresApproval } from '../../tools/index.js';

export function registerToolsHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  ipcMain.handle('tools:list', () => {
    return Object.entries(allTools).map(([name, t]) => ({
      name,
      description:
        typeof t.description === 'function' ? 'Tool' : (t.description ?? ''),
      requiresApproval: requiresApproval(name),
    }));
  });

  ipcMain.handle(
    'tools:execute',
    async (
      event: IpcMainInvokeEvent,
      {
        toolName,
        params,
      }: { toolName: string; params: Record<string, unknown> },
    ) => {
      const targetTool = (allTools as Record<string, any>)[toolName];
      if (!targetTool) {
        throw new Error(`Tool not found: ${toolName}`);
      }

      // Manual execution must honour the same approval policy as the agent
      // loop, otherwise the Tools page would be an approval bypass. This calls
      // the SAME derived policy the agent uses rather than a second list, so
      // the two can no longer disagree.
      if (requiresApproval(toolName)) {
        const { response } = await dialog.showMessageBox(
          BrowserWindow.fromWebContents(event.sender) ?? mainWindow,
          {
            type: 'warning',
            buttons: ['Cancel', 'Run'],
            defaultId: 1,
            cancelId: 0,
            title: 'Confirm tool execution',
            message: `Run "${toolName}"?`,
            detail: `${targetTool.description ?? ''}\n\nArguments:\n${JSON.stringify(params, null, 2)}`,
          },
        );
        if (response !== 1) {
          return {
            success: false,
            denied: true,
            error: 'Execution cancelled by user.',
          };
        }
      }

      return await targetTool.execute(params, { messages: [] });
    },
  );
}
