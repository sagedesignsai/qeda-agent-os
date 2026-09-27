/**
 * ipc/handlers/sessions.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Chat session lifecycle and message persistence.
 *
 * Extracted verbatim from the former monolithic ipc/handlers.ts.
 * Wired up by ipc/index.ts, which is the map of channel -> module.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { type UIMessage } from 'ai';
import { ipcMain } from 'electron';
import {
  createSession,
  deleteSession,
  listSessions,
  loadMessages,
  updateSessionProject,
  updateSessionTitle,
  upsertMessage,
} from '../../db/sessions';

export function registerSessionsHandlers(): void {
  ipcMain.handle(
    'sessions:list',
    (_e, req: { projectId?: string | null } | void) =>
      listSessions(req?.projectId !== undefined ? { projectId: req.projectId } : undefined),
  );

  ipcMain.handle(
    'sessions:create',
    (_e, { title, projectId }: { title?: string; projectId?: string | null }) =>
      createSession(title, projectId ?? null),
  );

  ipcMain.handle(
    'sessions:set-project',
    (_e, { id, projectId }: { id: string; projectId: string | null }) =>
      updateSessionProject(id, projectId),
  );

  ipcMain.handle('sessions:delete', (_e, { id }: { id: string }) =>
    deleteSession(id),
  );

  ipcMain.handle('sessions:rename', (_e, { id, title }: { id: string; title: string }) =>
    updateSessionTitle(id, title),
  );

  ipcMain.handle('sessions:messages', (_e, { id }: { id: string }) =>
    loadMessages(id),
  );

  // The renderer owns the reconstructed UIMessages, so it hands them back for
  // persistence. Upserts are keyed by message id, making re-sends idempotent.
  ipcMain.handle(
    'sessions:save-messages',
    (_e, { sessionId, messages }: { sessionId: string; messages: UIMessage[] }) => {
      if (!sessionId || !Array.isArray(messages)) return;
      for (const message of messages) {
        if (message?.id && Array.isArray(message.parts)) {
          upsertMessage(sessionId, message);
        }
      }
    },
  );

}
