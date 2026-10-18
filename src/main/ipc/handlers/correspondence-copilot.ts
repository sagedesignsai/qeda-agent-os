/**
 * ipc/handlers/correspondence-copilot.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IPC handler for one turn of the Correspondence Copilot.
 *
 * Streams agent turns and tool events back over `correspondence-copilot:stream-*`,
 * and broadcasts the existing `correspondence:changed` event on any mutation so the
 * hook stores refresh — reusing the shared invalidation surface the same way the
 * document drafter reuses `documents:changed`.
 *
 * The provider-fallback loop is structurally identical to the one in
 * `document-drafter.ts` and `studio-copilot.ts`. That duplication is deliberate:
 * it is the whole reason the IPC layer was split per-concern, and each copy is
 * short enough that extracting it would cost more indirection than it saves.
 * The critical invariant is `emitted` — once any output chunk has reached the
 * renderer the turn is partially visible, so falling back would splice two
 * different models' answers together. Retry is only safe before first output.
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
import { createCorrespondenceCopilotAgent } from '../../ai/correspondence-copilot-agent.js';
import type { AgentPlanEvent } from '../../../lib/agent-plan.js';
import { PlanManager } from '../../ai/plan-manager.js';

export function registerCorrespondenceCopilotHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  ipcMain.handle(
    'correspondence-copilot:chat',
    async (
      _e,
      {
        messages,
        context,
      }: {
        messages: UIMessage[];
        context?: { projectId?: string };
      },
    ) => {
      const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const fail = (err: unknown) => {
        if (mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('correspondence-copilot:stream-error', {
          error: err instanceof Error ? err.message : String(err),
        });
      };

      const broadcastChanged = () => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('correspondence:changed');
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

      const planManager = new PlanManager((event: AgentPlanEvent) => {
        if (mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('correspondence-copilot:plan-event', event);
      });

        let lastError: unknown;

        for (let attempt = 0; attempt < chain.length; attempt += 1) {
          const target = chain[attempt];
          let emitted = false;

          try {
            const agent = createCorrespondenceCopilotAgent({
              activeProject,
              projectId,
              target,
              planManager,
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
                'correspondence-copilot:stream-chunk',
                JSON.stringify(chunk),
              );
            }

            if (streamError) throw streamError;

            if (mainWindow.isDestroyed()) return;
            mainWindow.webContents.send('correspondence-copilot:stream-done', {
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
              mainWindow.webContents.send(
                'correspondence-copilot:stream-fallback',
                {
                  fromProvider: target.providerId,
                  fromModel: target.modelId,
                  toProvider: next.providerId,
                  toModel: next.modelId,
                  reason: describeFallbackReason(err),
                },
              );
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
