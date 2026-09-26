/**
 * renderer/preload.d.ts
 * Type declarations for the contextBridge-exposed electron object.
 * Consumed by the renderer TypeScript compiler.
 */
import type { ElectronHandler } from '../main/preload';

declare global {
  interface Window {
    electron: ElectronHandler;
  }
}

export {};
