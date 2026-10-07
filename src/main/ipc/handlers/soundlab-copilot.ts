/**
 * ipc/handlers/soundlab-copilot.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IPC handler for the autonomous SoundLab Copilot Agent.
 *
 * Streams agent turns, tool calls, and results back to the renderer over
 * `soundlab-copilot:stream-*` channels. After each tool mutation the agent
 * fires broadcastChanged(), which sends 'soundlab:changed' so the DAW UI
 * refreshes in real-time without a page reload.
 *
 * Fallback chain: if the active provider returns a retryable error (rate-limit,
 * 5xx, network timeout) and no output has been sent yet, the handler cascades to
 * the next configured provider and signals the renderer via
 * 'soundlab-copilot:stream-fallback'.
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
import {
  renderProjectContext,
  resolveActiveProjectId,
} from '../../ai/project-context.js';
import { resolveModelChain } from '../../ai/provider.js';
import { createSoundLabCopilotAgent } from '../../ai/soundlab-copilot-agent.js';

export function registerSoundLabCopilotHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  ipcMain.handle(
    'soundlab-copilot:chat',
    async (
      _e,
      {
        messages,
        context,
      }: {
        messages: UIMessage[];
        context: {
          sessionId: string;
          projectId?: string;
          currentBeat?: number;
        };
      },
    ) => {
      const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const fail = (err: unknown) => {
        if (mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('soundlab-copilot:stream-error', {
          error: err instanceof Error ? err.message : String(err),
        });
      };

      const broadcastChanged = () => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('soundlab:changed');
        }
      };

      try {
        const modelMessages = await prepareModelMessages(messages);
        const projectId = resolveActiveProjectId(context?.projectId);
        const activeProject = projectId
          ? renderProjectContext({ projectId })
          : undefined;

        const chain = resolveModelChain();
        if (chain.length === 0) {
          throw new Error(
            'No model configured. Pick a provider and model in Settings.',
          );
        }

        let lastError: unknown;

        for (let attempt = 0; attempt < chain.length; attempt += 1) {
          const target = chain[attempt];
          let emitted = false;

          try {
            const agent = createSoundLabCopilotAgent({
              activeSessionId: context.sessionId,
              activeProject,
              currentBeat: context.currentBeat,
              target,
              broadcastChanged,
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
              mainWindow.webContents.send(
                'soundlab-copilot:stream-chunk',
                JSON.stringify(chunk),
              );
            }

            if (streamError) throw streamError;

            if (mainWindow.isDestroyed()) return;
            mainWindow.webContents.send('soundlab-copilot:stream-done', {
              runId,
            });
            broadcastChanged();
            return;
          } catch (err) {
            lastError = err;

            const isLast = attempt === chain.length - 1;
            const canFallback =
              !emitted && !isLast && isRetryableProviderError(err);

            if (!canFallback) break;

            const next = chain[attempt + 1];
            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send('soundlab-copilot:stream-fallback', {
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
