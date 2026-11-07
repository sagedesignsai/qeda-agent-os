/**
 * ipc/handlers/trace-copilot.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IPC handlers for the autonomous NovaTrace Copilot Agent.
 *
 * Streams agent turns, tool calls, and results back to the renderer over
 * `trace-copilot:stream-*` channels, and broadcasts `trace:changed` on any
 * composition mutation so the canvas and timeline update in real-time.
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
import { renderProjectContext, resolveActiveProjectId } from '../../ai/project-context.js';
import { resolveModelChain } from '../../ai/provider.js';
import { createTraceCopilotAgent } from '../../ai/trace-copilot-agent.js';
import { PlanManager } from '../../ai/plan-manager.js';
import type { AgentPlanEvent } from '../../../lib/agent-plan.js';

export function registerTraceCopilotHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  ipcMain.handle(
    'trace-copilot:chat',
    async (
      _e,
      {
        messages,
        context,
      }: {
        messages: UIMessage[];
        context: {
          projectId?: string;
          traceProjectId?: string;
        };
      },
    ) => {
      const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const fail = (err: unknown) => {
        if (mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('trace-copilot:stream-error', {
          error: err instanceof Error ? err.message : String(err),
        });
      };

      const broadcastChanged = () => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('trace:changed');
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

        const planManager = new PlanManager();
        planManager.setEmit((event: AgentPlanEvent) => {
          if (mainWindow.isDestroyed()) return;
          mainWindow.webContents.send('trace-copilot:plan-event', event);
        });

        let lastError: unknown;

        for (let attempt = 0; attempt < chain.length; attempt += 1) {
          const target = chain[attempt];
          let emitted = false;
          planManager.reset();

          try {
            const agent = createTraceCopilotAgent({
              activeProject,
              projectId: context?.traceProjectId,
              target,
              broadcastChanged,
              planManager,
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
                'trace-copilot:stream-chunk',
                JSON.stringify(chunk),
              );
            }

            if (streamError) throw streamError;

            if (mainWindow.isDestroyed()) return;
            mainWindow.webContents.send('trace-copilot:stream-done', {
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
              mainWindow.webContents.send('trace-copilot:stream-fallback', {
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
