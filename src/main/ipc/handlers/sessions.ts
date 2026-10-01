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
import { ipcMain, type BrowserWindow } from 'electron';
import {
  createSession,
  deleteSession,
  listSessions,
  loadMessages,
  updateSessionProject,
  updateSessionTitle,
  upsertMessage,
} from '../../db/sessions';

export function registerSessionsHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  /**
   * Tell the renderer a session row changed.
   *
   * The rail reads sessions in two places — the main menu's recents list and
   * the ChatMenu conversation list. Without this, deleting a conversation
   * leaves it on screen until something forces a remount.
   */
  const broadcastSessionsChanged = () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sessions:changed');
    }
  };

  ipcMain.handle(
    'sessions:list',
    (_e, req: { projectId?: string | null } | void) =>
      listSessions(
        req?.projectId !== undefined ? { projectId: req.projectId } : undefined,
      ),
  );

  ipcMain.handle(
    'sessions:create',
    (
      _e,
      { title, projectId }: { title?: string; projectId?: string | null },
    ) => {
      const session = createSession(title, projectId ?? null);
      broadcastSessionsChanged();
      return session;
    },
  );

  ipcMain.handle(
    'sessions:set-project',
    (_e, { id, projectId }: { id: string; projectId: string | null }) => {
      updateSessionProject(id, projectId);
      broadcastSessionsChanged();
    },
  );

  ipcMain.handle('sessions:delete', (_e, { id }: { id: string }) => {
    const removed = deleteSession(id);
    // Only broadcast on a real delete: the renderer already removed the row, and
    // a broadcast for a no-op would refetch for nothing.
    if (removed) broadcastSessionsChanged();
    return removed;
  });

  ipcMain.handle(
    'sessions:rename',
    (_e, { id, title }: { id: string; title: string }) => {
      updateSessionTitle(id, title);
      broadcastSessionsChanged();
    },
  );

  ipcMain.handle('sessions:messages', (_e, { id }: { id: string }) =>
    loadMessages(id),
  );

  // The renderer owns the reconstructed UIMessages, so it hands them back for
  // persistence. Upserts are keyed by message id, making re-sends idempotent.
  //
  // Deliberately does NOT broadcast. This runs at the end of every chat turn, so
  // broadcasting here would refetch the session list once per turn for a change
  // the recents list does not display (it shows titles and recency, not bodies).
  ipcMain.handle(
    'sessions:save-messages',
    (
      _e,
      { sessionId, messages }: { sessionId: string; messages: UIMessage[] },
    ) => {
      if (!sessionId || !Array.isArray(messages)) return;
      for (const message of messages) {
        if (message?.id && Array.isArray(message.parts)) {
          upsertMessage(sessionId, message);
        }
      }
    },
  );
}
