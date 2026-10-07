/**
 * ipc/handlers/soundlab.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IPC handler module for SoundLab: Brain Entrainment DAW.
 *
 * Handles:
 *   - Listing, fetching, saving, and deleting SoundLab sessions
 *   - Broadcasting 'soundlab:changed' invalidation events to the renderer
 *
 * All persistence is delegated to db/soundlab-store; this module only owns
 * the IPC surface and the broadcast side-effect.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ipcMain, BrowserWindow } from 'electron';
import {
  listSoundLabSessions,
  getSoundLabSession,
  saveSoundLabSession,
  deleteSoundLabSession,
} from '../../db/soundlab-store.js';
import type { SoundLabSessionWithTracks } from '../../../lib/soundlab-types.js';

export function registerSoundLabHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  const broadcastChanged = () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('soundlab:changed');
    }
  };

  // ── List sessions ─────────────────────────────────────────────────────────

  ipcMain.handle(
    'soundlab:list',
    (_e, req?: { projectId?: string | null }) => {
      return listSoundLabSessions(req ?? {});
    },
  );

  // ── Get session ───────────────────────────────────────────────────────────

  ipcMain.handle(
    'soundlab:get',
    (_e, req: { id: string }) => {
      return getSoundLabSession(req.id);
    },
  );

  // ── Save session ──────────────────────────────────────────────────────────

  ipcMain.handle(
    'soundlab:save',
    (_e, data: SoundLabSessionWithTracks) => {
      saveSoundLabSession(data);
      broadcastChanged();
      return { id: data.id };
    },
  );

  // ── Delete session ────────────────────────────────────────────────────────

  ipcMain.handle(
    'soundlab:delete',
    (_e, req: { id: string }) => {
      const ok = deleteSoundLabSession(req.id);
      if (ok) broadcastChanged();
      return { ok };
    },
  );
}
