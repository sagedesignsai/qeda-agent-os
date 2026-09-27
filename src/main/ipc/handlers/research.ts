/**
 * ipc/handlers/research.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Deep-research run traces.
 *
 * Extracted verbatim from the former monolithic ipc/handlers.ts.
 * Wired up by ipc/index.ts, which is the map of channel -> module.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { ipcMain } from 'electron';
import { getResearchTrace, listResearchRuns } from '../../db/research';

export function registerResearchHandlers(): void {
  ipcMain.handle('research:trace', (_e, { runId }: { runId: string }) => {
    const trace = getResearchTrace(runId);
    return trace ?? null;
  });

  ipcMain.handle(
    'research:list',
    (_e, filter: { pageId?: string; notebookId?: string }) => listResearchRuns(filter),
  );

}
