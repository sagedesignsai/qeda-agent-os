/**
 * ipc/handlers/studio-copilot.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IPC handlers for the autonomous Studio Copilot Agent.
 *
 * Streams agent turns, tool calls, and results back to the renderer over
 * `studio-copilot:stream-*` channels, and broadcasts `studio:changed` on any
 * timeline or styling mutation so the canvas and timeline update in real-time.
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
import { createStudioCopilotAgent } from '../../ai/studio-copilot-agent.js';

export function registerStudioCopilotHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  ipcMain.handle(
    'studio-copilot:chat',
    async (
      _e,
      {
        messages,
        context,
      }: {
        messages: UIMessage[];
        context: {
          takeId: string;
          projectId?: string;
          currentTimeMs?: number;
        };
      },
    ) => {
      const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const fail = (err: unknown) => {
        if (mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('studio-copilot:stream-error', {
          error: err instanceof Error ? err.message : String(err),
        });
      };

      const broadcastChanged = () => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('studio:changed');
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
            const agent = createStudioCopilotAgent({
              activeTakeId: context.takeId,
              activeProject,
              currentTimeMs: context.currentTimeMs,
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
                'studio-copilot:stream-chunk',
                JSON.stringify(chunk),
              );
            }

            if (streamError) throw streamError;

            if (mainWindow.isDestroyed()) return;
            mainWindow.webContents.send('studio-copilot:stream-done', {
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
              mainWindow.webContents.send('studio-copilot:stream-fallback', {
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
