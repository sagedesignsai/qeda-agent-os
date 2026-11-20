/**
 * main/computer-use.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Privileged computer-use service.
 *
 * Phase 1 semantic layer:
 *  - Internal Electron windows: deterministic CDP/DOM channel (no OS cursor).
 *  - External desktop apps (Linux): AT-SPI sidecar runtime when available.
 *  - Coordinate-based fallback: legacy nut-js path retained for compatibility
 *    with existing allowlist-gated flows and Showcase Studio behavior.
 */

import { getSettings } from './ai/settings.js';
import { getRuntimeHost } from './computer/runtime-host.js';
import {
  getInternalAppState,
  internalClickElement,
  internalSetValue,
  resolveInternalTarget,
} from './computer/internal-cdp.js';
import { TreeDiffer, type SemanticSnapshot } from './computer/tree-diff.js';

const DANGEROUS_KEYS = new Set(['F4']);

function loadNut(): any {
  try {
    return require('@nut-tree-fork/nut-js');
  } catch {
    return null;
  }
}

function getElectron(): any {
  try {
    return require('electron');
  } catch {
    return {};
  }
}

const treeDiffer = new TreeDiffer();
const lastSnapshotElements = new Map<string, any>();

export function isComputerUseEnabled(): boolean {
  try {
    return Boolean(getSettings().computerUse?.enabled);
  } catch {
    return false;
  }
}

export function getAllowedWindows(): string[] {
  try {
    return getSettings().computerUse?.allowedWindows ?? [];
  } catch {
    return [];
  }
}

export async function getActiveWindowTitle(): Promise<string | null> {
  // Prefer internal focused window title when available.
  try {
    const electron = getElectron();
    const BW = electron?.BrowserWindow;
    const focused = BW?.getFocusedWindow?.();
    if (focused && !focused.isDestroyed?.()) {
      const t = focused.getTitle?.();
      if (t) return t;
    }
  } catch {
    // fall through
  }
  const nut = loadNut();
  if (!nut) return null;
  try {
    const win = await nut.getActiveWindow();
    return await win.title;
  } catch {
    return null;
  }
}

export async function isAllowed(): Promise<{
  allowed: boolean;
  reason?: string;
  activeWindow: string | null;
}> {
  if (!isComputerUseEnabled()) {
    const title = await getActiveWindowTitle();
    return {
      allowed: false,
      reason: 'Computer use is disabled in settings.',
      activeWindow: title,
    };
  }
  const title = await getActiveWindowTitle();
  const allow = getAllowedWindows();
  if (allow.length === 0) {
    return {
      allowed: false,
      reason: 'No allowed windows configured.',
      activeWindow: title,
    };
  }
  const ok =
    typeof title === 'string' &&
    allow.some((a) => title.toLowerCase().includes(String(a).toLowerCase()));
  return {
    allowed: ok,
    reason: ok
      ? undefined
      : `Foreground window "${title ?? ''}" is not in the allowlist.`,
    activeWindow: title,
  };
}

async function guard(): Promise<{ ok: true } | { ok: false; error: string }> {
  const check = await isAllowed();
  if (!check.allowed) {
    return { ok: false, error: check.reason || 'Not allowed.' };
  }
  return { ok: true };
}

function shouldUseInternalTarget(opts?: { app?: string; windowId?: string; element?: string }) {
  if (!opts) return false;
  if (opts.app && /qeda/i.test(opts.app)) return true;
  if (opts.windowId) {
    const target = resolveInternalTarget({ windowId: opts.windowId });
    if (target) return true;
  }
  // If an element ref came from the last internal snapshot we can route internally.
  if (opts.element && lastSnapshotElements.has(opts.element)) {
    const meta = lastSnapshotElements.get(opts.element);
    if (meta?.__source === 'internal') return true;
  }
  return false;
}

export async function getScreenSize(): Promise<{
  width: number;
  height: number;
}> {
  const electron = getElectron();
  const screen = electron?.screen;
  try {
    if (screen?.getPrimaryDisplay) {
      const d = screen.getPrimaryDisplay();
      const size = d?.size || d?.workAreaSize;
      if (size?.width && size?.height) return { width: size.width, height: size.height };
    }
  } catch {
    // fall through
  }
  const nut = loadNut();
  if (!nut) throw new Error('nut-js is not available.');
  const width = await nut.screen.width();
  const height = await nut.screen.height();
  return { width, height };
}

export async function getCursorPosition(): Promise<{ x: number; y: number }> {
  const electron = getElectron();
  const screen = electron?.screen;
  try {
    if (screen?.getCursorScreenPoint) {
      return screen.getCursorScreenPoint();
    }
  } catch {
    // fall through
  }
  const nut = loadNut();
  if (!nut) throw new Error('nut-js is not available.');
  const pos = await nut.mouse.getPosition();
  return { x: pos.x, y: pos.y };
}

export async function getAppState(opts?: {
  app?: string;
  windowId?: string;
}): Promise<{ snapshot?: SemanticSnapshot; text?: string; diff?: any; error?: string }> {
  if (!isComputerUseEnabled()) {
    return { error: 'Computer use is disabled in settings.' };
  }

  // Try internal CDP for Qeda-owned windows first.
  if (!opts?.app || /qeda/i.test(opts.app) || opts?.windowId) {
    const internal = await getInternalAppState({ windowId: opts?.windowId, titleIncludes: opts?.app });
    if (internal && !(internal as any).error) {
      const snapshot = internal as SemanticSnapshot;
      lastSnapshotElements.clear();
      for (const [ref, el] of Object.entries(snapshot.elements)) {
        lastSnapshotElements.set(ref, { ...el, __source: 'internal', windowId: snapshot.windowId });
      }
      const diff = treeDiffer.diff(snapshot);
      const text = treeDiffer.format(snapshot, diff);
      return { snapshot, diff, text };
    }
    // if a specific external app was requested, don't treat internal miss as fatal
    if (opts?.app && !/qeda/i.test(opts.app)) {
      // continue to sidecar
    } else if ((internal as any)?.error && !opts?.app) {
      // fall through to sidecar attempt
    }
  }

  // External apps via Linux AT-SPI sidecar (best-effort).
  try {
    const host = getRuntimeHost();
    const result = await host.request('get_app_state', {
      app: opts?.app,
      windowId: opts?.windowId,
    });
    if (result && !result.error) {
      const snapshot = result as SemanticSnapshot;
      lastSnapshotElements.clear();
      for (const [ref, el] of Object.entries(snapshot.elements || {})) {
        lastSnapshotElements.set(ref, { ...(el as any), __source: 'sidecar', windowId: snapshot.windowId });
      }
      const diff = treeDiffer.diff(snapshot);
      const text = treeDiffer.format(snapshot, diff);
      return { snapshot, diff, text };
    }
    return { error: result?.error || 'Failed to get app state from sidecar.' };
  } catch (e) {
    return { error: (e as Error).message || 'Semantic app state unavailable.' };
  }
}

export async function moveMouse(x: number, y: number): Promise<void> {
  const g = await guard();
  if (!g.ok) throw new Error(g.error);
  const nut = loadNut();
  if (!nut) throw new Error('nut-js is not available.');
  await nut.mouse.setPosition(new nut.Point(x, y));
}

export async function click(
  target: { x: number; y: number } | { element: string; windowId?: string },
  button: 'left' | 'right' | 'middle' = 'left',
): Promise<void> {
  if (!isComputerUseEnabled()) throw new Error('Computer use is disabled in settings.');

  if ('element' in target) {
    const meta = lastSnapshotElements.get(target.element);
    if (shouldUseInternalTarget({ element: target.element, windowId: target.windowId || meta?.windowId })) {
      const res = await internalClickElement({
        windowId: target.windowId || meta?.windowId,
        backendDOMNodeId: meta?.backendDOMNodeId,
      });
      if (!res.success) throw new Error(res.error || 'Failed to click element.');
      return;
    }
    try {
      const host = getRuntimeHost();
      const result = await host.request('perform_action', {
        element: target.element,
        windowId: target.windowId || meta?.windowId,
        action: 'click',
      });
      if (!result?.success) throw new Error(result?.error || 'Sidecar click failed.');
      return;
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  const g = await guard();
  if (!g.ok) throw new Error(g.error);
  const nut = loadNut();
  if (!nut) throw new Error('nut-js is not available.');
  await nut.mouse.setPosition(new nut.Point(target.x, target.y));
  if (button === 'right') await nut.mouse.rightClick();
  else if (button === 'middle') await nut.mouse.click(nut.Button.MIDDLE);
  else await nut.mouse.leftClick();
}

export async function doubleClick(x: number, y: number): Promise<void> {
  const g = await guard();
  if (!g.ok) throw new Error(g.error);
  const nut = loadNut();
  if (!nut) throw new Error('nut-js is not available.');
  await nut.mouse.setPosition(new nut.Point(x, y));
  await nut.mouse.doubleClick();
}

export async function typeText(text: string): Promise<void> {
  const g = await guard();
  if (!g.ok) throw new Error(g.error);
  const nut = loadNut();
  if (!nut) {
    // best-effort sidecar fallback
    try {
      const host = getRuntimeHost();
      await host.request('type_text', { text });
      return;
    } catch (e) {
      throw new Error('nut-js is not available.');
    }
  }
  await nut.keyboard.type(text);
}

export async function setValue(target: {
  element: string;
  value: string;
  windowId?: string;
}): Promise<void> {
  if (!isComputerUseEnabled()) throw new Error('Computer use is disabled in settings.');
  const meta = lastSnapshotElements.get(target.element);
  if (shouldUseInternalTarget({ element: target.element, windowId: target.windowId || meta?.windowId })) {
    const res = await internalSetValue({
      windowId: target.windowId || meta?.windowId,
      backendDOMNodeId: meta?.backendDOMNodeId,
      value: target.value,
    });
    if (!res.success) throw new Error(res.error || 'Failed to set value.');
    return;
  }
  const host = getRuntimeHost();
  const result = await host.request('set_value', {
    element: target.element,
    value: target.value,
    windowId: target.windowId || meta?.windowId,
  });
  if (!result?.success) throw new Error(result?.error || 'Failed to set value via sidecar.');
}

export async function pressKey(
  key: string,
  modifiers: string[] = [],
): Promise<void> {
  const g = await guard();
  if (!g.ok) throw new Error(g.error);
  if (DANGEROUS_KEYS.has(key.toUpperCase())) {
    throw new Error(`Key "${key}" is blocked for safety.`);
  }
  const nut = loadNut();
  if (!nut) throw new Error('nut-js is not available.');
  void modifiers;
  const nutKey = (nut.Key && nut.Key[key]) || key;
  await nut.keyboard.pressKey(nutKey);
  await nut.keyboard.releaseKey?.(nutKey);
}

export async function hotkey(key: string): Promise<void> {
  // Accept simple combos like "ctrl+enter" / "cmd+c" best-effort via nut-js
  const parts = key.split('+').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error('No key provided.');
  const main = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  await pressKey(main, mods);
}

export async function scroll(
  x: number,
  y: number,
  deltaX: number,
  deltaY: number,
): Promise<void> {
  const g = await guard();
  if (!g.ok) throw new Error(g.error);
  const nut = loadNut();
  if (!nut) throw new Error('nut-js is not available.');
  await nut.mouse.setPosition(new nut.Point(x, y));
  if (deltaY > 0) await nut.mouse.scrollDown(Math.abs(deltaY));
  else if (deltaY < 0) await nut.mouse.scrollUp(Math.abs(deltaY));
  if (deltaX > 0) await nut.mouse.scrollRight(Math.abs(deltaX));
  else if (deltaX < 0) await nut.mouse.scrollLeft(Math.abs(deltaX));
}

export async function wait(ms: number): Promise<void> {
  const nut = loadNut();
  if (nut?.sleep) await nut.sleep(ms);
  else await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function captureScreenshot(
  sourceId?: string,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  const g = await guard();
  if (!g.ok) throw new Error(g.error);
  const electron = getElectron();
  const dc = electron?.desktopCapturer;
  if (!dc?.getSources) {
    throw new Error('desktopCapturer is not available.');
  }
  const sources = await dc.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 1920, height: 1080 },
  });
  const source = sourceId
    ? sources.find((s: any) => s.id === sourceId)
    : sources[0];
  if (!source) return null;
  const img = source.thumbnail;
  return {
    dataUrl: img.toDataURL(),
    width: img.getSize().width,
    height: img.getSize().height,
  };
}

