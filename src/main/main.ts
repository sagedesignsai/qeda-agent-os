/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build`, this file is compiled to
 * `./release/app/dist/main/main.js` using electron-vite.
 */
import path from 'path';
import { app, BrowserWindow, nativeTheme, shell, ipcMain } from 'electron';
import log from 'electron-log';
// Imported first so provider keys from .env.local are in process.env before any
// module reads them during app startup.
import { loadEnvironment } from './env';
import { getDb, closeDb } from './db/client.js';
import { registerIpcHandlers } from './ipc/index.js';
import { registerPtyHandlers } from './pty/manager.js';
import MenuBuilder, { attachContentContextMenu } from './menu';
import { resolveHtmlPath } from './util';
import startAutoUpdates from './updates';
import { loadWindowState, trackWindowState } from './window-state';
import { createTray, destroyTray } from './tray';
import {
  acquireSingleInstanceLock,
  applyAppIdentity,
  navigateTo,
  refreshBadge,
  refreshRecentProjects,
  registerDeepLinkClient,
  registerGlobalShortcuts,
  registerPowerMonitor,
  resolveDeepLinkPath,
  shutdownOsIntegration,
} from './os-integration';

let mainWindow: BrowserWindow | null = null;
/** A deep link that arrived before the window existed; flushed after first paint. */
let pendingDeepLink: string | null = null;

loadEnvironment();

// Identity must be applied before any Notification is created: on Windows the
// AppUserModelID decides whether toasts are attributed to Qeda or fail.
applyAppIdentity();

// A second process would share vellum.db with the running one — better-sqlite3
// is not built for that. Hand over to the existing instance instead.
const handleDeepLinkUrl = (url: string): void => {
  const target = resolveDeepLinkPath(url);
  if (!target) return;
  if (mainWindow) {
    navigateTo(mainWindow, target);
  } else {
    pendingDeepLink = target;
  }
};

if (!acquireSingleInstanceLock(handleDeepLinkUrl)) {
  app.quit();
} else {
  // macOS delivers deep links via open-url; Windows/Linux re-invoke the
  // executable, which the lock converts into this event (with argv).
  registerDeepLinkClient(handleDeepLinkUrl);
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Headless CI containers and servers have no usable GPU, and Chromium aborts
// the whole app ("GPU process isn't usable. Goodbye.") when it tries to start
// one. Acceleration must be disabled before the app becomes ready.
if (process.env.CI === 'true' || process.env.VELLUM_DISABLE_HW_ACCEL === '1') {
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

const RESOURCES_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(app.getAppPath(), 'assets');

const getAssetPath = (...paths: string[]): string => {
  return path.join(RESOURCES_PATH, ...paths);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const state = loadWindowState();
  // Match the theme the renderer will start in (next-themes follows the OS)
  // so the first paint never flashes the wrong color.
  mainWindow = new BrowserWindow({
    show: false,
    title: 'Qeda',
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0e0f14' : '#f4f4f5',
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
    },
  });

  // Restoring a window that was maximized when closed.
  if (state.maximized) {
    mainWindow.maximize();
  }

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

  trackWindowState(mainWindow);

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Right-click: edit roles, spelling suggestions, links (dev adds Inspect).
  attachContentContextMenu(mainWindow);

  // Native spellchecking for the word processor, chat, and capture inputs;
  // suggestions surface through the context menu above.
  mainWindow.webContents.session.setSpellCheckerEnabled(true);

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Register all IPC handlers BEFORE loading URL so they are ready when renderer mounts.
  registerIpcHandlers(mainWindow);
  registerPtyHandlers(ipcMain, mainWindow);

  await mainWindow.loadURL(resolveHtmlPath('index.html'));

  if (pendingDeepLink && mainWindow) {
    navigateTo(mainWindow, pendingDeepLink);
    pendingDeepLink = null;
  }
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  shutdownOsIntegration();
  destroyTray();
});

app.on('quit', () => {
  closeDb();
});

function reportWindowError(error: unknown) {
  log.error('Failed to create the application window', error);
  mainWindow?.destroy();
  mainWindow = null;
}

function onActivate() {
  // Reopening a macOS window must not initialize another updater.
  if (mainWindow === null) {
    void createWindow().catch(reportWindowError);
  }
}

app
  .whenReady()
  .then(async () => {
    try {
      getDb();
    } catch (e) {
      log.error('Failed to initialize database', e);
    }
    await createWindow();

    // OS presence: tray icon, global quick capture, suspend events, badge,
    // and recent-project quick access. The shortcut/power accessors re-read
    // the module-level window because it can be recreated (macOS activate).
    if (!mainWindow) {
      throw new Error('Main window was not created');
    }
    createTray(mainWindow, getAssetPath('icons', '24x24.png'));
    registerGlobalShortcuts(() => mainWindow);
    registerPowerMonitor(() => mainWindow);
    refreshBadge();
    refreshRecentProjects((target) => {
      if (mainWindow) navigateTo(mainWindow, target);
    });

    startAutoUpdates();
    app.on('activate', onActivate);
  })
  .catch((error: unknown) => {
    reportWindowError(error);
    app.quit();
  });
