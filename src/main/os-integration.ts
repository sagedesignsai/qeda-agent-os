/**
 * main/os-integration.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * OS-level integration that makes Qeda behave like a desktop citizen rather
 * than a web page in a frame:
 *
 *   - Identity: AppUserModelID (Windows notifications are broken without it)
 *     and the About panel.
 *   - Single instance: two processes sharing vellum.db is a data hazard, so a
 *     second launch hands over to the running one (focusing it, and routing
 *     any deep link in its argv).
 *   - Deep links: `qeda://<route>` and the stored `vellum-page://<pageId>`
 *     URIs resolve to renderer paths.
 *   - Badge: the dock badge shows unfinished tasks due today.
 *   - Recent projects: macOS dock menu / Windows jump list quick access.
 *   - Global shortcut: system-wide quick capture.
 *   - Power: suspend events are forwarded so the focus timer can pause.
 *
 * Functions that outlive registration take a `getWindow` accessor because the
 * window is created (and recreated on macOS activate) after these are set up;
 * capturing the reference at registration time would freeze it as null.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  app,
  globalShortcut,
  Menu,
  powerMonitor,
  type BrowserWindow,
  type MenuItemConstructorOptions,
} from 'electron';
import log from 'electron-log';
import path from 'node:path';
import { getPage } from './db/workspace';
import { listProjects } from './db/projects';
import { countDueToday } from './db/tasks';

const APP_ID = 'com.qeda.desktop';
const DEEP_LINK_SCHEME = 'qeda';
/** Routes a `qeda://<route>` deep link may target. */
const KNOWN_ROUTES = [
  'chat',
  'projects',
  'tasks',
  'workspace',
  'terminal',
  'documents',
  'studio',
  'tools',
];

// ─── Identity ────────────────────────────────────────────────────────────────

/** Must run before the first Notification is created (Windows keys off this). */
export function applyAppIdentity(): void {
  app.setAppUserModelId(APP_ID);
  app.setAboutPanelOptions({
    applicationName: 'Qeda',
    applicationVersion: app.getVersion(),
    credits: 'Finish what you start. A local agent OS built for completion.',
  });
}

// ─── Single instance ─────────────────────────────────────────────────────────

/**
 * Claim the per-user instance lock. When false, a second instance is already
 * running and this process should quit immediately.
 */
export function acquireSingleInstanceLock(
  onDeepLinkUrl: (url: string) => void,
): boolean {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) return false;

  app.on('second-instance', (_event, argv) => {
    const url = argv.find(
      (arg) =>
        arg.startsWith(`${DEEP_LINK_SCHEME}://`) ||
        arg.startsWith('vellum-page://'),
    );
    if (url) onDeepLinkUrl(url);
  });
  return true;
}

// ─── Deep links ──────────────────────────────────────────────────────────────

/**
 * Register the `qeda://` protocol so links from browsers, Slack, or other
 * notes land in the app. On macOS the URL arrives via `open-url`; on
 * Windows/Linux via the `second-instance` argv handled above.
 */
export function registerDeepLinkClient(
  onDeepLinkUrl: (url: string) => void,
): void {
  try {
    if (process.defaultApp && process.argv[1]) {
      app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME, process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    } else {
      app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);
    }
  } catch (e) {
    log.warn('Could not register the qeda:// protocol handler', e);
  }

  app.on('open-url', (event, url) => {
    event.preventDefault();
    onDeepLinkUrl(url);
  });
}

/** Map a deep link URL to a renderer route, or null when unrecognised. */
export function resolveDeepLinkPath(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const safeSegment = (value: string | null) =>
    value && /^[a-z0-9-]+$/i.test(value) ? value : null;

  // `vellum-page://<pageId>` — the URIs persisted by the workspace RAG indexer.
  if (url.protocol === 'vellum-page:') {
    const pageId = safeSegment(url.host || url.pathname.replace(/^\/+/, ''));
    if (!pageId) return null;
    const page = getPage(pageId);
    return page ? `/workspace/${page.notebook_id}/${page.id}` : null;
  }

  if (url.protocol !== `${DEEP_LINK_SCHEME}:`) return null;
  const route = safeSegment(url.host);
  if (!route) return null;
  const mapped = route === 'project' ? 'projects' : route;
  if (!KNOWN_ROUTES.includes(mapped)) return null;
  const rest = url.pathname === '/' ? '' : url.pathname;
  if (rest && !/^\/[a-z0-9-]+$/i.test(rest)) return null;
  return `/${mapped}${rest}`;
}

// ─── Navigation (shared by tray, menu, notifications, deep links) ────────────

/** Bring the window to the front and route the renderer to `target`. */
export function navigateTo(mainWindow: BrowserWindow, target: string): void {
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('ui:navigate', { path: target });
}

// ─── Badge ───────────────────────────────────────────────────────────────────

/** Sync the dock badge (macOS/Linux) with unfinished tasks due today. */
export function refreshBadge(): void {
  try {
    app.setBadgeCount(countDueToday());
  } catch (e) {
    log.warn('Could not update the badge count', e);
  }
}

// ─── Recent projects ─────────────────────────────────────────────────────────

/** How many recent projects to surface in OS-level menus. */
const RECENT_PROJECT_LIMIT = 8;

/**
 * Surface recent projects where the OS expects them: the macOS dock menu and
 * the Windows taskbar jump list. Jump-list items relaunch the executable with
 * a `qeda://` argument, which the single-instance handler routes into the
 * running app — Windows has no in-process menu API, only argv.
 */
export function refreshRecentProjects(
  handlePath: (path: string) => void,
): void {
  const recent = listProjects().slice(0, RECENT_PROJECT_LIMIT);
  if (recent.length === 0) return;

  if (process.platform === 'darwin') {
    app.dock?.setMenu(
      Menu.buildFromTemplate([
        {
          label: 'Recent Projects',
          enabled: false,
        },
        ...recent.map<MenuItemConstructorOptions>((project) => ({
          label: project.name,
          click: () => handlePath(`/projects/${project.id}`),
        })),
      ]),
    );
    return;
  }

  if (process.platform === 'win32') {
    try {
      const result = app.setJumpList([
        {
          type: 'custom',
          name: 'Recent Projects',
          items: recent.map((project) => ({
            type: 'task' as const,
            title: project.name,
            description: `Open the ${project.name} project`,
            program: process.execPath,
            args: `qeda://project/${project.id}`,
            iconPath: process.execPath,
            iconIndex: 0,
          })),
        },
      ]);
      if (result !== 'ok') {
        log.warn('Taskbar jump list was rejected by the shell:', result);
      }
    } catch (e) {
      // Jump lists throw on some shell configurations; they are optional.
      log.warn('Could not set the taskbar jump list', e);
    }
  }
}

// ─── Global shortcut ─────────────────────────────────────────────────────────

/** System-wide quick capture: focus the app and open the brain-dump dialog. */
export function registerGlobalShortcuts(
  getWindow: () => BrowserWindow | null,
): void {
  const ok = globalShortcut.register('CommandOrControl+Shift+Space', () => {
    const win = getWindow();
    if (win) navigateTo(win, '/tasks?capture=1');
  });
  if (!ok) {
    log.warn(
      'Quick-capture shortcut (Cmd/Ctrl+Shift+Space) is claimed by another app',
    );
  }
}

// ─── Power events ────────────────────────────────────────────────────────────

/** Forward OS suspend so long-running timers can pause instead of drifting. */
export function registerPowerMonitor(
  getWindow: () => BrowserWindow | null,
): void {
  powerMonitor.on('suspend', () => {
    getWindow()?.webContents.send('power:suspended');
  });
}

// ─── Shutdown ────────────────────────────────────────────────────────────────

/** Release OS-held resources. Registered once; safe to call unconditionally. */
export function shutdownOsIntegration(): void {
  globalShortcut.unregisterAll();
}
