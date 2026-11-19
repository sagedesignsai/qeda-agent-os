/**
 * lib/tts/client.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The renderer-side TTS surface. Consumers (chat, Studio add-ons, Motion) call
 * these helpers instead of touching IPC channel strings, so the contract can
 * evolve in one place.
 *
 * Every generative call returns a structured `TtsResult` rather than throwing:
 * Electron serialises only `Error.message` across IPC, and a dialog needs the
 * machine-readable code to distinguish "no key" from "rate limited".
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  TtsAsset,
  TtsAssetPage,
  TtsAssetQuery,
  TtsCapabilities,
  TtsEstimate,
  TtsExportRequest,
  TtsExportResult,
  TtsGenerateRequest,
  TtsProgress,
  TtsResult,
  TtsVoiceCatalog,
  TtsVoiceQuery,
} from './types';

function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  return window.electron.ipc.invoke<T>(channel, payload);
}

export const ttsClient = {
  capabilities(): Promise<TtsResult<TtsCapabilities[]>> {
    return invoke('tts:capabilities');
  },

  voices(query?: TtsVoiceQuery): Promise<TtsResult<TtsVoiceCatalog>> {
    return invoke('tts:voices', query);
  },

  estimate(req: TtsGenerateRequest): Promise<TtsResult<TtsEstimate>> {
    return invoke('tts:estimate', req);
  },

  generate(req: TtsGenerateRequest): Promise<TtsResult<TtsAsset>> {
    return invoke('tts:generate', req);
  },

  preview(req: TtsGenerateRequest): Promise<TtsResult<TtsAsset>> {
    return invoke('tts:preview', req);
  },

  cancel(requestId: string): Promise<{ ok: boolean }> {
    return invoke('tts:cancel', { requestId });
  },

  list(query?: TtsAssetQuery): Promise<TtsAssetPage> {
    return invoke('tts:list', query ?? {});
  },

  get(id: string): Promise<TtsAsset | null> {
    return invoke('tts:get', { id });
  },

  remove(id: string): Promise<{ ok: boolean }> {
    return invoke('tts:delete', { id });
  },

  exportAsset(req: TtsExportRequest): Promise<TtsExportResult> {
    return invoke('tts:export', req);
  },

  reveal(id: string): Promise<void> {
    return invoke('tts:reveal', { id });
  },

  /** Subscribe to generation progress. Returns an unsubscribe function. */
  onProgress(listener: (progress: TtsProgress) => void): () => void {
    return window.electron.ipc.on('tts:progress', (payload) => {
      listener(payload as TtsProgress);
    });
  },
};
