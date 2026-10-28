/**
 * main/computer-use.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Privileged computer-use service: screenshots (via desktopCapturer) and
 * mouse/keyboard input (via @nut-tree-fork/nut-js), gated by an allowlist.
 *
 * nut-js is lazy-required so a missing/broken native module degrades to a
 * runtime error rather than breaking app startup or tests.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getSettings } from './ai/settings.js';

const DANGEROUS_KEYS = new Set([
  'F4', // Alt+F4 etc handled by modifiers; block bare F4? keep simple
]);

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

export async function getScreenSize(): Promise<{
  width: number;
  height: number;
}> {
  const nut = loadNut();
  if (!nut) throw new Error('nut-js is not available.');
  const width = await nut.screen.width();
  const height = await nut.screen.height();
  return { width, height };
}

export async function getCursorPosition(): Promise<{ x: number; y: number }> {
  const nut = loadNut();
  if (!nut) throw new Error('nut-js is not available.');
  const pos = await nut.mouse.getPosition();
  return { x: pos.x, y: pos.y };
}

export async function moveMouse(x: number, y: number): Promise<void> {
  const g = await guard();
  if (!g.ok) throw new Error(g.error);
  const nut = loadNut();
  if (!nut) throw new Error('nut-js is not available.');
  await nut.mouse.setPosition(new nut.Point(x, y));
}

export async function click(
  x: number,
  y: number,
  button: 'left' | 'right' | 'middle' = 'left',
): Promise<void> {
  const g = await guard();
  if (!g.ok) throw new Error(g.error);
  const nut = loadNut();
  if (!nut) throw new Error('nut-js is not available.');
  await nut.mouse.setPosition(new nut.Point(x, y));
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
  if (!nut) throw new Error('nut-js is not available.');
  await nut.keyboard.type(text);
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
  // Modifiers are best-effort; nut-js modifier handling requires Key enum.
  void modifiers;
  const nutKey = (nut.Key && nut.Key[key]) || key;
  await nut.keyboard.pressKey(nutKey);
  await nut.keyboard.releaseKey?.(nutKey);
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
