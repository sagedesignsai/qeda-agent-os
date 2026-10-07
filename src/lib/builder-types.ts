/**
 * lib/builder-types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Renderer-safe Builder domain shapes shared by the route and typed IPC
 * contract. Keep OpenCode client/provider types in the main process.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type BuilderConnectionState =
  'connected' | 'not-running' | 'unsupported' | 'error';

export interface BuilderConnectionStatus {
  state: BuilderConnectionState;
  version?: string;
  message: string;
}

/** A model the active OpenCode project makes available to Builder. */
export interface BuilderModelOption {
  providerID: string;
  id: string;
  name: string;
}

/** The app currently integrates against OpenCode's v2 server contract. */
export function isSupportedOpenCodeVersion(version: string): boolean {
  return /^2\./.test(version);
}
