/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * main/main.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Minimal Electron bootstrap for SoundLab.
 *
 * Creates a single window, loads the renderer, registers IPC handlers, and
 * manages the SQLite database lifecycle. No tray, no deep links, no PTY,
 * no studio media — just the DAW.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import path from 'path';
import { app, BrowserWindow, nativeTheme, shell, ipcMain } from 'electron';
import log from 'electron-log';
import { loadEnvironment } from './env';
import { getDb, closeDb } from './db/client.js';
import { registerIpcHandlers } from './ipc/index.js';

let mainWindow: BrowserWindow | null = null;

loadEnvironment();

// Disable GPU in headless CI containers.
if (process.env.CI === 'true') {
  app.disableHardwareAcceleration();
}

if (process.env.NODE_ENV === 'production') {
  process.setSourceMapsEnabled(true);
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  void import('electron-debug')
    .then(({ default: debug }) => debug({ showDevTools: false }))
    .catch(console.error);
}

const installExtensions = async () => {
  const { installExtension, REACT_DEVELOPER_TOOLS } =
    await import('electron-devtools-installer');
  return installExtension(REACT_DEVELOPER_TOOLS, {
    forceDownload: !!process.env.UPGRADE_EXTENSIONS,
  }).catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  mainWindow = new BrowserWindow({
    show: false,
    title: 'SoundLab',
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0e0f14' : '#f4f4f5',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external URLs in the system browser.
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    try {
      const url = new URL(edata.url);
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        void shell.openExternal(url.toString());
      }
    } catch {
      // Ignore malformed URLs.
    }
    return { action: 'deny' };
  });

  // Register all IPC handlers before loading the URL.
  registerIpcHandlers(mainWindow);

  const htmlPath = path.join(__dirname, '../renderer/index.html');
  if (isDebug) {
    await mainWindow.loadURL('http://localhost:1212');
  } else {
    await mainWindow.loadFile(htmlPath);
  }
};

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  closeDb();
});

app
  .whenReady()
  .then(async () => {
    try {
      getDb();
    } catch (e) {
      log.error('Failed to initialize database', e);
    }
    await createWindow();
    app.on('activate', () => {
      if (mainWindow === null) {
        void createWindow().catch((error) => {
          log.error('Failed to create window', error);
          app.quit();
        });
      }
    });
  })
  .catch((error) => {
    log.error('Failed to start app', error);
    app.quit();
  });
