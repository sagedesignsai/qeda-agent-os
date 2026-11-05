/**
 * ipc/handlers/music.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IPC surface for the local music library, playlists, scenes and resumable
 * playback state.
 *
 * Scanning is the only long-running operation here. It runs detached from the
 * invoke that starts it and reports through `music:scan-progress`, because a
 * 20-minute first index must not block the renderer's request — and because a
 * cancelled scan still needs to deliver a final event.
 *
 * A folder watcher keeps the index current between scans; a scan at startup and
 * every 30 minutes reconciles anything the watcher missed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import {
  addMusicFolder,
  addTracksToPlaylist,
  createMusicPlaylist,
  deleteMusicPlaylist,
  deleteMusicScene,
  getMusicState,
  getMusicPlaylist,
  getMusicTrack,
  getMusicTracksByIds,
  listMusicFolders,
  listMusicScenes,
  listMusicPlaylists,
  listPlaylistTracks,
  musicFacets,
  queryMusicTracks,
  removeMusicFolder,
  removeTrackFromPlaylist,
  reorderPlaylist,
  saveMusicScene,
  saveMusicState,
  updateMusicPlaylist,
} from '../../db/music-store.js';
import { scanMusicFolder } from '../../music/scanner.js';
import { createMusicWatcher } from '../../music/watcher.js';
import type {
  AudioSceneConfig,
  MusicLibraryQuery,
  MusicScanProgress,
  MusicStateRecord,
} from '../../../lib/music/types.js';

/** One controller per folder so cancelling one does not stop the others. */
const activeScans = new Map<string, AbortController>();

const STARTUP_RECONCILE_DELAY_MS = 5_000;
const RECONCILE_INTERVAL_MS = 30 * 60 * 1000;

function errorProgress(folderId: string, error: string): MusicScanProgress {
  return {
    folderId,
    phase: 'error',
    scanned: 0,
    total: 0,
    added: 0,
    updated: 0,
    missing: 0,
    error,
  };
}

export function registerMusicHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  const send = (channel: string, payload?: unknown) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  };

  const watcher = createMusicWatcher({
    listFolders: listMusicFolders,
    isScanning: (folderId) => activeScans.has(folderId),
    onChange: () => send('music:changed'),
  });

  async function scanFolders(folderIds: string[]): Promise<void> {
    for (const folderId of folderIds) {
      if (activeScans.has(folderId)) continue;
      const controller = new AbortController();
      activeScans.set(folderId, controller);
      try {
        const result = await scanMusicFolder(folderId, {
          signal: controller.signal,
          onProgress: (progress) => send('music:scan-progress', progress),
          onLibraryChange: () => send('music:changed'),
        });
        send('music:scan-progress', result);
        send('music:changed');
      } catch (error) {
        send(
          'music:scan-progress',
          errorProgress(
            folderId,
            error instanceof Error ? error.message : 'Scan failed',
          ),
        );
      } finally {
        activeScans.delete(folderId);
      }
    }
  }

  ipcMain.handle('music:folders-list', () => listMusicFolders());

  ipcMain.handle('music:folder-pick', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Add a music folder',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return { path: null };
    return { path: result.filePaths[0] };
  });

  ipcMain.handle(
    'music:folder-add',
    (_e, { path: folderPath }: { path: string }) => {
      const folder = addMusicFolder(path.resolve(folderPath));
      watcher.sync();
      return folder;
    },
  );

  ipcMain.handle('music:folder-remove', (_e, { id }: { id: string }) => {
    activeScans.get(id)?.abort();
    const ok = removeMusicFolder(id);
    watcher.sync();
    return { ok };
  });

  ipcMain.handle('music:scan-start', (_e, req?: { folderId?: string }) => {
    const folders = listMusicFolders();
    const folderIds = req?.folderId
      ? folders.filter((folder) => folder.id === req.folderId).map((f) => f.id)
      : folders.map((folder) => folder.id);
    void scanFolders(folderIds);
    return { started: folderIds.length > 0 };
  });

  ipcMain.handle('music:scan-cancel', (_e, req?: { folderId?: string }) => {
    if (req?.folderId) {
      activeScans.get(req.folderId)?.abort();
      return { ok: true };
    }
    for (const controller of activeScans.values()) controller.abort();
    return { ok: true };
  });

  ipcMain.handle('music:library-query', (_e, query: MusicLibraryQuery) =>
    queryMusicTracks(query ?? {}),
  );

  ipcMain.handle('music:track-get', (_e, { id }: { id: string }) =>
    getMusicTrack(id),
  );

  ipcMain.handle('music:tracks-by-ids', (_e, { ids }: { ids: string[] }) =>
    getMusicTracksByIds(Array.isArray(ids) ? ids : []),
  );

  ipcMain.handle(
    'music:facets',
    (_e, req?: { folderId?: string | null }) => musicFacets(req?.folderId),
  );

  ipcMain.handle('music:playlists-list', () => listMusicPlaylists());

  ipcMain.handle('music:playlist-create', (_e, { name }: { name: string }) => {
    const playlist = createMusicPlaylist(name);
    send('music:changed');
    return playlist;
  });

  ipcMain.handle(
    'music:playlist-update',
    (_e, { id, ...patch }: { id: string; name?: string; description?: string }) => {
      const playlist = updateMusicPlaylist(id, patch);
      send('music:changed');
      return playlist;
    },
  );

  ipcMain.handle('music:playlist-delete', (_e, { id }: { id: string }) => {
    const ok = deleteMusicPlaylist(id);
    send('music:changed');
    return { ok };
  });

  ipcMain.handle('music:playlist-tracks', (_e, { id }: { id: string }) =>
    getMusicPlaylist(id) ? listPlaylistTracks(id) : [],
  );

  ipcMain.handle(
    'music:playlist-add-tracks',
    (_e, { id, trackIds }: { id: string; trackIds: string[] }) => {
      const added = addTracksToPlaylist(id, trackIds ?? []);
      if (added > 0) send('music:changed');
      return { added };
    },
  );

  ipcMain.handle(
    'music:playlist-remove-track',
    (_e, { id, trackId }: { id: string; trackId: string }) => {
      const ok = removeTrackFromPlaylist(id, trackId);
      if (ok) send('music:changed');
      return { ok };
    },
  );

  ipcMain.handle(
    'music:playlist-reorder',
    (_e, { id, trackIds }: { id: string; trackIds: string[] }) => {
      reorderPlaylist(id, trackIds ?? []);
      send('music:changed');
    },
  );

  ipcMain.handle('music:scenes-list', () => listMusicScenes());

  ipcMain.handle(
    'music:scene-save',
    (
      _e,
      {
        id,
        name,
        config,
      }: { id?: string; name: string; config: AudioSceneConfig },
    ) => {
      const scene = saveMusicScene(id, name, config);
      send('music:changed');
      return scene;
    },
  );

  ipcMain.handle('music:scene-delete', (_e, { id }: { id: string }) => {
    const ok = deleteMusicScene(id);
    send('music:changed');
    return { ok };
  });

  // The watcher is the fast path; this reconciliation is the safety net for
  // events a platform dropped (sleep/wake, network shares, removable drives).
  // It is an incremental scan, so on an unchanged library it is a stat per file.
  const reconcile = () =>
    void scanFolders(listMusicFolders().map((folder) => folder.id));
  watcher.sync();
  const startupTimer = setTimeout(reconcile, STARTUP_RECONCILE_DELAY_MS);
  const reconcileTimer = setInterval(reconcile, RECONCILE_INTERVAL_MS);
  startupTimer.unref();
  reconcileTimer.unref();
  mainWindow.on('closed', () => {
    clearTimeout(startupTimer);
    clearInterval(reconcileTimer);
    watcher.close();
    for (const controller of activeScans.values()) controller.abort();
  });

  ipcMain.handle('music:state-get', () => getMusicState());

  ipcMain.handle('music:state-save', (_e, state: MusicStateRecord) => {
    saveMusicState(state);
    return { ok: true };
  });
}
