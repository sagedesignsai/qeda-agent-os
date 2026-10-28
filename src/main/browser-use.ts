/**
 * main/browser-use.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * In-process browser automation using Electron BrowserWindow + webContents.
 * No external browser engine required.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { BrowserWindow } from 'electron';

const sessions = new Map<string, BrowserWindow>();

export function openBrowser(
  url: string,
  options?: { visible?: boolean; partition?: string },
): { id: string } {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: options?.visible ?? false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      partition: options?.partition
        ? `persist:${options.partition}`
        : undefined,
    },
  });
  const id = String(win.id);
  sessions.set(id, win);
  void win.loadURL(url);
  win.on('closed', () => sessions.delete(id));
  return { id };
}

export function listBrowsers(): string[] {
  return Array.from(sessions.keys());
}

export async function navigate(id: string, url: string): Promise<void> {
  const win = sessions.get(id);
  if (!win) throw new Error(`Browser session ${id} not found`);
  await win.loadURL(url);
}

export async function clickSelector(
  id: string,
  selector: string,
): Promise<void> {
  const win = sessions.get(id);
  if (!win) throw new Error(`Browser session ${id} not found`);
  await win.webContents.executeJavaScript(
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('selector not found'); el.click(); return true; })()`,
  );
}

export async function typeSelector(
  id: string,
  selector: string,
  text: string,
): Promise<void> {
  const win = sessions.get(id);
  if (!win) throw new Error(`Browser session ${id} not found`);
  await win.webContents.executeJavaScript(
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('selector not found'); el.focus(); el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`,
  );
}

export async function evaluate(id: string, code: string): Promise<unknown> {
  const win = sessions.get(id);
  if (!win) throw new Error(`Browser session ${id} not found`);
  return await win.webContents.executeJavaScript(code);
}

export async function screenshot(id: string): Promise<string> {
  const win = sessions.get(id);
  if (!win) throw new Error(`Browser session ${id} not found`);
  const img = await win.webContents.capturePage();
  return img.toDataURL();
}

export function closeBrowser(id: string): void {
  const win = sessions.get(id);
  if (win && !win.isDestroyed()) win.close();
  sessions.delete(id);
}
