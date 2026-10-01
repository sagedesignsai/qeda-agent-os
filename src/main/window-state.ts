/**
 * main/window-state.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Persists the main window's bounds and maximized state across launches.
 *
 * A fixed 1024×728 window on every launch reads as "not native"; restoring
 * what the user had is the fix. Saved coordinates are validated against the
 * currently attached displays so a disconnected monitor can't leave the
 * window off-screen — Electron would open it invisible and the user would
 * think the app is broken.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { app, screen, type BrowserWindow, type Rectangle } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized: boolean;
}

const MIN_WIDTH = 900;
const MIN_HEIGHT = 600;
/** How far outside a display's work area the window may still count as visible. */
const ON_SCREEN_MARGIN = 40;

const stateFile = (): string =>
  path.join(app.getPath('userData'), 'window-state.json');

/** True when a meaningful part of the rect lands inside some display's work area. */
function isOnScreen(rect: Rectangle): boolean {
  return screen.getAllDisplays().some(({ workArea }) => {
    const { x, y } = workArea;
    return (
      rect.x >= x - ON_SCREEN_MARGIN &&
      rect.y >= y - ON_SCREEN_MARGIN &&
      rect.x + rect.width >= x + ON_SCREEN_MARGIN &&
      rect.y + rect.height >= y + ON_SCREEN_MARGIN
    );
  });
}

/** Read the saved state, falling back to centered defaults when unusable. */
export function loadWindowState(): WindowState {
  const fallback: WindowState = {
    width: 1024,
    height: 728,
    maximized: false,
  };

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(stateFile(), 'utf-8'));
  } catch {
    return fallback;
  }

  const saved = raw as Partial<WindowState>;
  if (
    typeof saved.width !== 'number' ||
    typeof saved.height !== 'number' ||
    !Number.isFinite(saved.width) ||
    !Number.isFinite(saved.height)
  ) {
    return fallback;
  }

  const state: WindowState = {
    width: Math.max(MIN_WIDTH, saved.width),
    height: Math.max(MIN_HEIGHT, saved.height),
    maximized: saved.maximized === true,
  };

  if (
    typeof saved.x === 'number' &&
    typeof saved.y === 'number' &&
    Number.isFinite(saved.x) &&
    Number.isFinite(saved.y)
  ) {
    const candidate: Rectangle = {
      x: saved.x,
      y: saved.y,
      width: state.width,
      height: state.height,
    };
    if (isOnScreen(candidate)) {
      state.x = saved.x;
      state.y = saved.y;
    }
  }

  return state;
}

/** Attach close-time persistence to a window. Call once, right after creation. */
export function trackWindowState(win: BrowserWindow): void {
  win.on('close', () => {
    const state: WindowState = {
      ...win.getBounds(),
      maximized: win.isMaximized(),
    };
    try {
      fs.writeFileSync(stateFile(), JSON.stringify(state));
    } catch {
      // Losing window bounds on a failed write is not worth surfacing.
    }
  });
}
