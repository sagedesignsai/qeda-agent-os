/**
 * ipc/handlers/agent-chat.ts
 * ────────────────────────────────────────────────────────────────────────────
 * The streaming chat agent turn.
 *
 * Extracted verbatim from the former monolithic ipc/handlers.ts.
 * Wired up by ipc/index.ts, which is the map of channel -> module.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { type UIMessage } from 'ai';
import { ipcMain, type BrowserWindow } from 'electron';
import {
  describeFallbackReason,
  isOutputChunk,
  isRetryableProviderError,
} from '../../ai/fallback';
import { prepareModelMessages } from '../../ai/messages';
import { resolveModelChain } from '../../ai/provider';
import { type AgentIntent, type ChatContext } from '../channels';
import { getAgent, detectMode } from '../agent-runtime';

export function registerAgentChatHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  ipcMain.handle(
    'agent:chat',
    async (
      _e,
      {
        sessionId,
        messages,
        context,
        intent,
      }: {
        sessionId: string;
        messages: UIMessage[];
        context?: ChatContext;
        intent?: AgentIntent;
      },
    ) => {
      const fail = (err: unknown) => {
        if (mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('agent:stream-error', {
          error: err instanceof Error ? err.message : String(err),
        });
      };

      try {
        // Convert UIMessages to model messages once and reuse them for every
        // attempt – sanitizing reasoning parts so providers like Groq do not reject them.
        const modelMessages = await prepareModelMessages(messages);

        // A declared intent always wins. The heuristic stays as the fallback
        // for free-form chat, where nothing knows the mode but the wording.
        const mode = intent ?? detectMode(messages);
        const chain = resolveModelChain();
        if (chain.length === 0) {
          throw new Error(
            'No model configured. Pick a provider and model in Settings.',
          );
        }

        let lastError: unknown;

        for (let attempt = 0; attempt < chain.length; attempt += 1) {
          const target = chain[attempt];
          // Once a content-bearing chunk has reached the renderer this attempt
          // is committed: retrying elsewhere would duplicate or contradict
          // what the user can already see. Lifecycle chunks do not count – the
          // SDK emits `start` before a provider error.
          let emitted = false;

          try {
            const agent = getAgent(target, mode, context);

            const result = await (agent as any).stream({
              messages: modelMessages,
            });

            // `fullStream` reports provider failures as an `error` part rather
            // than throwing, so capture it and let the catch block decide.
            let streamError: unknown;
            for await (const chunk of result.fullStream) {
              if (mainWindow.isDestroyed()) return;
              if (chunk?.type === 'error') {
                streamError = chunk.error;
                break;
              }
              if (isOutputChunk(chunk?.type)) emitted = true;
              mainWindow.webContents.send(
                'agent:stream-chunk',
                JSON.stringify(chunk),
              );
            }

            if (streamError) throw streamError;

            // Persistence is handled by the renderer via
            // `sessions:save-messages` once it has folded the stream into
            // UIMessages – the raw model messages are not in UIMessage shape.
            mainWindow.webContents.send('agent:stream-done', { sessionId });
            return;
          } catch (err) {
            lastError = err;

            const isLast = attempt === chain.length - 1;
            const canFallback =
              !emitted && !isLast && isRetryableProviderError(err);

            if (!canFallback) break;

            const next = chain[attempt + 1];
            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send('agent:stream-fallback', {
                fromProvider: target.providerId,
                fromModel: target.modelId,
                toProvider: next.providerId,
                toModel: next.modelId,
                reason: describeFallbackReason(err),
              });
            }
          }
        }

        fail(lastError);
      } catch (err) {
        fail(err);
      }
    },
  );
}
