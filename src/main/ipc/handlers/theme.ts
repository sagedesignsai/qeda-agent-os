/**
 * ipc/handlers/theme.ts
 */

import { app, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

interface PersistedTheme {
  mode: 'light' | 'dark' | 'system';
  background: string;
}

function themePath(): string {
  return path.join(app.getPath('userData'), 'theme.json');
}

export function readPersistedTheme(): PersistedTheme | null {
  try {
    const raw = fs.readFileSync(themePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistedTheme>;
    if (!parsed || typeof parsed.background !== 'string') return null;
    return {
      mode: parsed.mode === 'light' || parsed.mode === 'dark' ? parsed.mode : 'system',
      background: parsed.background,
    };
  } catch {
    return null;
  }
}

export function registerThemeHandlers(): void {
  ipcMain.handle('theme:get', async () => readPersistedTheme());
  ipcMain.handle('theme:save', async (_event, payload: { mode: 'light' | 'dark' | 'system'; background: string }) => {
    const data: PersistedTheme = {
      mode: payload?.mode ?? 'system',
      background: payload?.background ?? '',
    };
    const target = themePath();
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
    fs.renameSync(tmp, target);
  });
}
