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

/** The app currently integrates against OpenCode's v2 server contract. */
export function isSupportedOpenCodeVersion(version: string): boolean {
  return /^2\./.test(version);
}
