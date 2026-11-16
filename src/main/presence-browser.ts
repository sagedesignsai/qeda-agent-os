/**
 * main/presence-browser.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Embedded web tabs for the Presence page.
 *
 * Unlike `browser-use.ts` (a standalone, visible `BrowserWindow` used for
 * automation), these views are attached to the app window's `contentView` and
 * positioned over a rectangle the renderer measures. That is what makes the
 * right-hand pane in the Presence layout feel like part of the page instead of a
 * second window.
 *
 * WHY `WebContentsView`, NOT `<webview>`
 * The renderer has `webviewTag` disabled (and Electron discourages it). A
 * `WebContentsView` is a first-class child view with its own process, no preload,
 * and no bridge into the app's renderer — which is exactly the isolation a
 * logged-in social tab needs.
 *
 * SECURITY POSTURE
 * A tab can hold a real session cookie for LinkedIn or X. So:
 *   • no preload, no node integration, sandboxed, context isolated;
 *   • top-level navigation restricted to the social allowlist (plus the handful
 *     of identity-provider hosts social logins actually redirect through);
 *   • `window.open` never creates a new Electron window: allowlisted targets
 *     navigate in place, everything else goes to the user's real browser;
 *   • all permission requests (camera, mic, notifications, geolocation, …) are
 *     denied. The tab is for reading and typing a post, not for granting access.
 *
 * Tab identity is owned by the renderer (it knows which platforms the user
 * configured). This module only owns the native views keyed by that id.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  BrowserWindow,
  WebContentsView,
  session,
  shell,
  type Session,
} from 'electron';
import type { PresenceBrowserBounds } from '../lib/presence.js';

/** Persistent partition: a login survives app restarts, per social account. */
const PARTITION = 'persist:presence';

/**
 * Sites a Presence tab may display. Suffix-matched, so `www.linkedin.com` and
 * `api.linkedin.com` both pass for `linkedin.com`.
 */
const ALLOWED_DOMAINS = [
  'linkedin.com',
  'x.com',
  'twitter.com',
  'facebook.com',
  'instagram.com',
  'discord.com',
  'discordapp.com',
] as const;

/**
 * Identity providers social sign-in redirects through. Restricted to the exact
 * hosts the platforms use; this is deliberately NOT a general `google.com`
 * allowance, which would turn the tab into a browser.
 */
const AUTH_HOSTS = new Set([
  'accounts.google.com',
  'appleid.apple.com',
  'login.microsoftonline.com',
  'login.live.com',
  'github.com',
]);

interface ViewEntry {
  id: string;
  view: WebContentsView;
  attached: boolean;
  lastUrl: string | null;
}

const views = new Map<string, ViewEntry>();
let owner: BrowserWindow | null = null;
let visibleId: string | null = null;
let sessionConfigured = false;

// ─── URL policy ───────────────────────────────────────────────────────────────

function hostnameOf(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isAllowedHost(host: string): boolean {
  return ALLOWED_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

/** True when a top-level URL is inside the social allowlist. */
export function isPresenceUrlAllowed(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;
    return isAllowedHost(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Identity-provider redirects get one hop in the same tab, never a new window. */
function isAuthUrl(raw: string): boolean {
  const host = hostnameOf(raw);
  return host !== null && AUTH_HOSTS.has(host);
}

// ─── Session hardening ────────────────────────────────────────────────────────

function presenceSession(): Session {
  const s = session.fromPartition(PARTITION);
  if (sessionConfigured) return s;
  sessionConfigured = true;

  // A tab with a cookie jar should never be able to ask for a device permission.
  s.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  s.setPermissionCheckHandler(() => false);

  return s;
}

// ─── View lifecycle ───────────────────────────────────────────────────────────

function chromeUserAgent(contents: WebContentsView['webContents']): string {
  // Electron's default UA contains an `Electron/x.y.z` token that several social
  // sites treat as an unsupported browser. Advertising a plain Chrome UA keeps
  // the login pages honest without pretending to be a different engine version.
  return contents
    .getUserAgent()
    .replace(/\sElectron\/[\d.]+/g, '')
    .replace(/\sQeda\/[\d.]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function ensureView(id: string, url: string): ViewEntry {
  const existing = views.get(id);
  if (existing) return existing;

  if (!isPresenceUrlAllowed(url)) {
    throw new Error(
      'That address is not on the Presence allowlist. Only the configured social platforms can open here.',
    );
  }

  const view = new WebContentsView({
    webPreferences: {
      partition: PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
    },
  });

  presenceSession();
  const contents = view.webContents;
  contents.setUserAgent(chromeUserAgent(contents));

  // Top-level navigation policy. This runs for both link clicks and redirects;
  // without the redirect hook an allowlisted page could 302 into anywhere.
  const guardNavigation = (event: Electron.Event, target: string): void => {
    if (isPresenceUrlAllowed(target) || isAuthUrl(target)) return;
    event.preventDefault();
    if (/^https?:/i.test(target)) void shell.openExternal(target);
  };
  contents.on('will-navigate', guardNavigation);
  contents.on('will-redirect', guardNavigation);

  // Track navigation state and emit to renderer
  contents.on('did-navigate', () => {
    const entry = views.get(id);
    if (entry) {
      entry.lastUrl = contents.getURL();
    }
    if (owner && !owner.isDestroyed() && visibleId === id) {
      owner.webContents.send('presence:browser-state', {
        id,
        url: contents.getURL(),
        title: contents.getTitle(),
        canGoBack: contents.canGoBack(),
        canGoForward: contents.canGoForward(),
      });
    }
  });

  contents.on('page-title-updated', () => {
    if (owner && !owner.isDestroyed() && visibleId === id) {
      owner.webContents.send('presence:browser-state', {
        id,
        url: contents.getURL(),
        title: contents.getTitle(),
        canGoBack: contents.canGoBack(),
        canGoForward: contents.canGoForward(),
      });
    }
  });

  contents.on('did-start-loading', () => {
    if (owner && !owner.isDestroyed() && visibleId === id) {
      owner.webContents.send('presence:browser-loading', { id, loading: true });
    }
  });

  contents.on('did-stop-loading', () => {
    if (owner && !owner.isDestroyed() && visibleId === id) {
      owner.webContents.send('presence:browser-loading', { id, loading: false });
    }
  });

  contents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    if (owner && !owner.isDestroyed() && visibleId === id) {
      owner.webContents.send('presence:browser-error', {
        id,
        error: errorDescription || `Error code ${errorCode}`,
      });
    }
  });

  // Popups are common on social sites (compose windows, OAuth). Never let one
  // create a bare Electron window; navigate in place when it is safe.
  contents.setWindowOpenHandler(({ url: target }) => {
    if (isPresenceUrlAllowed(target) || isAuthUrl(target)) {
      void contents.loadURL(target);
    } else if (/^https?:/i.test(target)) {
      void shell.openExternal(target);
    }
    return { action: 'deny' };
  });

  const entry: ViewEntry = { id, view, attached: false, lastUrl: url };
  views.set(id, entry);

  void contents.loadURL(url).catch(() => {
    // Navigation failures surface as the site's own error page; there is no
    // useful renderer action beyond leaving the tab visible.
  });

  return entry;
}

function detach(entry: ViewEntry): void {
  if (!entry.attached || !owner || owner.isDestroyed()) {
    entry.attached = false;
    return;
  }
  owner.contentView.removeChildView(entry.view);
  entry.attached = false;
}

function clampBounds(bounds: PresenceBrowserBounds): PresenceBrowserBounds {
  return {
    x: Math.max(0, Math.round(bounds.x)),
    y: Math.max(0, Math.round(bounds.y)),
    width: Math.max(0, Math.round(bounds.width)),
    height: Math.max(0, Math.round(bounds.height)),
  };
}

// ─── Public API used by the IPC handlers ──────────────────────────────────────

/** Bind the tab manager to the window it draws into. Safe to call again. */
export function attachPresenceBrowser(mainWindow: BrowserWindow): void {
  owner = mainWindow;

  // A full document navigation (reload, dev HMR full reload, deep link) replaces
  // the renderer. The new page has not measured anything yet, so an attached
  // social view would float over whatever route renders first. Detach on commit;
  // the fresh renderer re-shows a tab once it has measured its pane.
  mainWindow.webContents.on('did-navigate', () => {
    hidePresenceView();
  });

  mainWindow.once('closed', () => {
    for (const entry of views.values()) {
      if (!entry.view.webContents.isDestroyed()) {
        entry.view.webContents.close();
      }
    }
    views.clear();
    visibleId = null;
    owner = null;
  });
}

/**
 * Show (creating if needed) one tab over `bounds`, hiding the previously visible
 * one. Re-showing the same tab is idempotent, so a resize can call this freely.
 */
export function showPresenceView(input: {
  id: string;
  url: string;
  bounds: PresenceBrowserBounds;
}): void {
  if (!owner || owner.isDestroyed()) {
    throw new Error('The application window is not available.');
  }

  const bounds = clampBounds(input.bounds);
  if (bounds.width < 2 || bounds.height < 2) return;

  if (visibleId && visibleId !== input.id) {
    const previous = views.get(visibleId);
    if (previous) detach(previous);
  }

  const entry = ensureView(input.id, input.url);
  if (!entry.attached) {
    owner.contentView.addChildView(entry.view);
    entry.attached = true;
  }
  entry.view.setBounds(bounds);
  visibleId = entry.id;
}

/** Move the visible tab (or a specific one) after a layout change. */
export function setPresenceViewBounds(
  id: string,
  bounds: PresenceBrowserBounds,
): void {
  const entry = views.get(id);
  if (!entry || !entry.attached) return;
  const next = clampBounds(bounds);
  if (next.width < 2 || next.height < 2) return;
  entry.view.setBounds(next);
}

/** Detach the visible tab without destroying it (switch to an internal view). */
export function hidePresenceView(): void {
  if (!visibleId) return;
  const entry = views.get(visibleId);
  if (entry) detach(entry);
  visibleId = null;
}

/** Destroy one tab and its session-scoped page. */
export function closePresenceView(id: string): void {
  const entry = views.get(id);
  if (!entry) return;
  if (visibleId === id) {
    detach(entry);
    visibleId = null;
  }
  views.delete(id);
  if (!entry.view.webContents.isDestroyed()) {
    entry.view.webContents.close();
  }
}

/** Destroy every tab. Used when the Presence page unmounts. */
export function closeAllPresenceViews(): void {
  for (const id of [...views.keys()]) closePresenceView(id);
  visibleId = null;
}

export async function navigatePresenceView(
  id: string,
  url: string,
): Promise<void> {
  if (!isPresenceUrlAllowed(url)) {
    throw new Error('That address is not on the Presence allowlist.');
  }
  const entry = views.get(id);
  if (!entry) throw new Error('That Presence tab is not open.');
  await entry.view.webContents.loadURL(url);
}

export function reloadPresenceView(id: string): void {
  const entry = views.get(id);
  if (!entry) return;
  entry.view.webContents.reload();
}

export function goBackPresenceView(id: string): void {
  const entry = views.get(id);
  if (!entry) return;
  const history = entry.view.webContents.navigationHistory;
  if (history.canGoBack()) history.goBack();
}

export function goForwardPresenceView(id: string): void {
  const entry = views.get(id);
  if (!entry) return;
  const history = entry.view.webContents.navigationHistory;
  if (history.canGoForward()) history.goForward();
}

export function openPresenceViewExternal(id: string): void {
  const entry = views.get(id);
  if (!entry) return;
  const url = entry.view.webContents.getURL();
  if (url && /^https?:/i.test(url)) {
    void shell.openExternal(url);
  }
}

export function getPresenceViewLastUrl(id: string): string | null {
  const entry = views.get(id);
  return entry?.lastUrl ?? null;
}
