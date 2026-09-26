/**
 * main/preload.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Exposes a typed IPC bridge to the renderer process via contextBridge.
 *
 * The renderer never imports Node.js or Electron directly – it only calls
 * window.electron.ipc.*. This keeps the renderer fully sandboxed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

// ─── Generic IPC helpers ──────────────────────────────────────────────────────

const ipc = {
  /** Two-way request/response (invoke/handle). */
  invoke<T = unknown>(channel: string, payload?: unknown): Promise<T> {
    return ipcRenderer.invoke(channel, payload) as Promise<T>;
  },

  /** Subscribe to events pushed from main → renderer. */
  on(channel: string, listener: (...args: unknown[]) => void) {
    const wrapper = (_event: IpcRendererEvent, ...args: unknown[]) =>
      listener(...args);
    ipcRenderer.on(channel, wrapper);
    // Return cleanup function.
    return () => {
      ipcRenderer.removeListener(channel, wrapper);
    };
  },

  /** Subscribe to a one-time event. */
  once(channel: string, listener: (...args: unknown[]) => void) {
    ipcRenderer.once(channel, (_event, ...args) => listener(...args));
  },
};

const electronHandler = {
  ipc,
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
