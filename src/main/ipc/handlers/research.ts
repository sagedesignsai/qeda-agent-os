/**
 * ipc/handlers/research.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Deep-research run traces.
 *
 * Extracted verbatim from the former monolithic ipc/handlers.ts.
 * Wired up by ipc/index.ts, which is the map of channel -> module.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { ipcMain, type BrowserWindow } from 'electron';
import {
  getResearchTrace,
  listResearchRuns,
  researchRunToPage,
  type ResearchRunToPageOptions,
} from '../../db/research';

export function registerResearchHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  const broadcastWorkspaceChanged = () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('workspace:changed');
    }
  };

  ipcMain.handle('research:trace', (_e, { runId }: { runId: string }) => {
    const trace = getResearchTrace(runId);
    return trace ?? null;
  });

  ipcMain.handle(
    'research:list',
    (_e, filter: { pageId?: string; notebookId?: string }) =>
      listResearchRuns(filter),
  );

  // Filing a report creates a page, so the tree changed.
  ipcMain.handle(
    'research:to-page',
    (_e, { runId, ...options }: { runId: string } & ResearchRunToPageOptions) => {
      const page = researchRunToPage(runId, options);
      if (page) broadcastWorkspaceChanged();
      return page;
    },
  );
}
