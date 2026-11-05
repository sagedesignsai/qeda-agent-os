/**
 * ipc/handlers/music-copilot.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * One Music Copilot turn: stream the agent's text and tool calls over
 * `music-copilot:stream-*`, and forward playback commands to the renderer.
 *
 * Playback is renderer-owned, so the tools never touch audio directly. They
 * emit typed commands on `music:copilot-command`, which the app-wide command
 * bridge applies to the music and soundscape stores.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { type UIMessage } from 'ai';
import { ipcMain, type BrowserWindow } from 'electron';
import {
  describeFallbackReason,
  isOutputChunk,
  isRetryableProviderError,
} from '../../ai/fallback.js';
import { prepareModelMessages } from '../../ai/messages.js';
import { createMusicCopilotAgent } from '../../ai/music-copilot-agent.js';
import { resolveModelChain } from '../../ai/provider.js';
import type {
  MusicCopilotCommand,
  MusicCopilotContext,
} from '../../../lib/music/types.js';

export function registerMusicCopilotHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  ipcMain.handle(
    'music-copilot:chat',
    async (
      _e,
      {
        messages,
        context,
      }: { messages: UIMessage[]; context?: MusicCopilotContext },
    ) => {
      const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const send = (channel: string, payload?: unknown) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send(channel, payload);
        }
      };

      const fail = (err: unknown) => {
        send('music-copilot:stream-error', {
          error: err instanceof Error ? err.message : String(err),
        });
      };

      try {
        const modelMessages = await prepareModelMessages(messages);
        const chain = resolveModelChain();
        if (chain.length === 0) {
          throw new Error(
            'No model configured. Pick a provider and model in Settings.',
          );
        }

        const onCommand = (command: MusicCopilotCommand) =>
          send('music:copilot-command', command);
        const onChanged = () => send('music:changed');

        let lastError: unknown;

        for (let attempt = 0; attempt < chain.length; attempt += 1) {
          const target = chain[attempt];
          let emitted = false;

          try {
            const agent = createMusicCopilotAgent({
              target,
              context,
              onCommand,
              onChanged,
            });
            const result = await agent.stream({ messages: modelMessages });

            let streamError: unknown;
            for await (const chunk of result.fullStream) {
              if (mainWindow.isDestroyed()) return;
              if (chunk?.type === 'error') {
                streamError = chunk.error;
                break;
              }
              if (isOutputChunk(chunk?.type)) emitted = true;
              send('music-copilot:stream-chunk', JSON.stringify(chunk));
            }

            if (streamError) throw streamError;

            send('music-copilot:stream-done', { runId });
            // Playlists are the only persisted mutation; one broadcast keeps
            // the Music page and the dock's sheet in sync.
            onChanged();
            return;
          } catch (err) {
            lastError = err;

            const isLast = attempt === chain.length - 1;
            const canFallback =
              !emitted && !isLast && isRetryableProviderError(err);

            if (!canFallback) break;

            const next = chain[attempt + 1];
            send('music-copilot:stream-fallback', {
              fromProvider: target.providerId,
              fromModel: target.modelId,
              toProvider: next.providerId,
              toModel: next.modelId,
              reason: describeFallbackReason(err),
            });
          }
        }

        fail(lastError);
      } catch (err) {
        fail(err);
      }
    },
  );
}
