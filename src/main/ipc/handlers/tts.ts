/**
 * ipc/handlers/tts.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IPC surface for the text-to-speech core.
 *
 * Every generative call answers with a structured `TtsResult` instead of
 * throwing: Electron serialises only `Error.message` across IPC, and the Studio
 * Voiceover dialog needs the machine-readable code to tell "add a Deepgram key"
 * apart from "wait out a rate limit".
 *
 * Long generations run detached from the invoke — progress and completion both
 * arrive through `tts:progress`, but the invoke still returns the final asset so
 * a simple caller can await one thing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import type {
  TtsAsset,
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
} from '../../../lib/tts/types.js';
import {
  TtsError,
  cancelTts,
  deleteTtsAsset,
  estimateTts,
  generateTtsAsset,
  getTtsAsset,
  listTtsAssets,
  previewVoice,
  toPublicTtsAsset,
  ttsCapabilities,
} from '../../tts/index.js';
import { loadDeepgramVoices } from '../../tts/voices.js';
import { defaultTtsFilename, exportTtsAsset } from '../../tts/export.js';
import { TTS_FORMAT_EXTENSION } from '../../../lib/tts/types.js';

function failure(error: unknown): TtsResult<never> {
  if (error instanceof TtsError) {
    return {
      ok: false,
      code: error.code,
      error: error.message,
      ...(error.requestId ? { requestId: error.requestId } : {}),
    };
  }
  return {
    ok: false,
    code: 'PROVIDER_ERROR',
    error: error instanceof Error ? error.message : String(error),
  };
}

function asResult<T>(value: T): TtsResult<T> {
  return { ok: true, value };
}

export function registerTtsHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  const sendProgress = (progress: TtsProgress) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tts:progress', progress);
    }
  };

  ipcMain.handle(
    'tts:capabilities',
    (): TtsResult<TtsCapabilities[]> => asResult(ttsCapabilities()),
  );

  ipcMain.handle(
    'tts:voices',
    async (
      _e,
      query?: TtsVoiceQuery,
    ): Promise<TtsResult<TtsVoiceCatalog>> => {
      const provider = query?.provider ?? 'deepgram';
      if (provider !== 'deepgram') {
        return {
          ok: false,
          code: 'PROVIDER_UNSUPPORTED',
          error: `${provider} voices are not available yet.`,
        };
      }
      try {
        return asResult(
          await loadDeepgramVoices({
            ...(query?.refresh ? { refresh: true } : {}),
            ...(query ? { query } : {}),
          }),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  ipcMain.handle(
    'tts:estimate',
    async (
      _e,
      req: TtsGenerateRequest,
    ): Promise<TtsResult<TtsEstimate>> => {
      try {
        return asResult(await estimateTts(req));
      } catch (error) {
        return failure(error);
      }
    },
  );

  ipcMain.handle(
    'tts:generate',
    async (
      _e,
      req: TtsGenerateRequest,
    ): Promise<TtsResult<TtsAsset>> => {
      try {
        return asResult(
          await generateTtsAsset(req, { onProgress: sendProgress }),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  ipcMain.handle(
    'tts:preview',
    async (
      _e,
      req: TtsGenerateRequest,
    ): Promise<TtsResult<TtsAsset>> => {
      try {
        return asResult(
          await previewVoice(req, { onProgress: sendProgress }),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  ipcMain.handle(
    'tts:cancel',
    (_e, { requestId }: { requestId: string }) => ({
      ok: cancelTts(requestId),
    }),
  );

  ipcMain.handle(
    'tts:list',
    (_e, query?: TtsAssetQuery) =>
      listTtsAssets(query ?? { kind: 'speech' }),
  );

  ipcMain.handle('tts:get', (_e, { id }: { id: string }) => {
    const record = getTtsAsset(id);
    return record ? toPublicTtsAsset(record) : null;
  });

  ipcMain.handle('tts:delete', (_e, { id }: { id: string }) => ({
    ok: deleteTtsAsset(id),
  }));

  ipcMain.handle(
    'tts:export',
    async (
      _e,
      req: TtsExportRequest,
    ): Promise<TtsExportResult> => {
      const asset = getTtsAsset(req.id);
      if (!asset) {
        return { saved: false, error: 'That speech clip no longer exists.' };
      }

      const requestedStem = req.filename
        ? path.parse(req.filename).name.replace(/[\\/:*?"<>|]/g, ' ').trim()
        : '';
      const suggested = requestedStem
        ? `${requestedStem}${TTS_FORMAT_EXTENSION[asset.format]}`
        : defaultTtsFilename(asset);
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save speech clip',
        defaultPath: path.join(app.getPath('downloads'), suggested),
        filters: [
          {
            name: 'Audio',
            extensions: [asset.format === 'opus' ? 'ogg' : asset.format],
          },
        ],
      });
      if (result.canceled || !result.filePath) {
        return { saved: false };
      }
      return exportTtsAsset(req.id, result.filePath);
    },
  );

  ipcMain.handle('tts:reveal', (_e, { id }: { id: string }) => {
    const asset = getTtsAsset(id);
    if (asset) shell.showItemInFolder(asset.path);
  });
}
