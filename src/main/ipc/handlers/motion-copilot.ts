/**
 * ipc/handlers/motion-copilot.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IPC handlers for the Motion Copilot Agent.
 *
 * Streams agent turns, tool calls, and results back to the renderer over
 * `motion-copilot:stream-*` channels, and broadcasts `motion:changed` on any
 * scene mutation so the editor updates in real-time.
 *
 * The renderer passes the current document in the chat request; the agent
 * applies ops via `createMotionTools` and the modified document is saved
 * back by the renderer after the turn completes.
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
import { createMotionCopilotAgent } from '../../ai/motion-copilot-agent.js';
import { PlanManager } from '../../ai/plan-manager.js';
import { applyMotionOps, type MotionOpRequest } from '../../../lib/motion/ops.js';
import { planMotionCommand, applyMotionCommand, type MotionApplyResult } from '../../../lib/motion/plan.js';
import { diffMotionDocuments } from '../../../lib/motion/diff.js';
import type { AgentPlanEvent } from '../../../lib/agent-plan.js';
import type { MotionDocument } from '../../../lib/motion/types.js';
import { getMotionProjectStore } from '../../motion/service.js';

export function registerMotionCopilotHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  ipcMain.handle(
    'motion-copilot:chat',
    async (
      _e,
      {
        messages,
        context,
      }: {
        messages: UIMessage[];
        context: {
          projectId?: string;
          document: MotionDocument;
        };
      },
    ) => {
      const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const fail = (err: unknown) => {
        if (mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('motion-copilot:stream-error', {
          error: err instanceof Error ? err.message : String(err),
        });
      };

      // Mutable document reference the agent tools read and write
      let currentDoc: MotionDocument = context.document;
      const getDocument = () => currentDoc;
      const apply = (plan: ReturnType<typeof planMotionCommand>): MotionApplyResult => {
        try {
          const next = applyMotionCommand(currentDoc, plan, { now: new Date().toISOString() });
          currentDoc = next.document;
          return next;
        } catch (err) {
          // On failure, return a no-op result so the tool doesn't crash
          const diff = diffMotionDocuments(currentDoc, currentDoc);
          return {
            document: currentDoc,
            revision: currentDoc.revision,
            applied: 0,
            diff,
            warnings: [{ code: 'APPLY_ERROR', message: err instanceof Error ? err.message : String(err) }],
          };
        }
      };

      const broadcastChanged = () => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('motion:changed');
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
          mainWindow.webContents.send('motion-copilot:plan-event', event);
        });

        let lastError: unknown;

        for (let attempt = 0; attempt < chain.length; attempt += 1) {
          const target = chain[attempt];
          let emitted = false;
          planManager.reset();

          try {
            const agent = createMotionCopilotAgent({
              getDocument,
              apply,
              activeProject,
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
                'motion-copilot:stream-chunk',
                JSON.stringify(chunk),
              );
            }

            if (streamError) throw streamError;

            if (mainWindow.isDestroyed()) return;

            // Save the modified document back to disk
            if (context.projectId && currentDoc.revision !== context.document.revision) {
              try {
                const store = getMotionProjectStore();
                await store.saveProject(context.projectId, currentDoc, {
                  expectedRevision: context.document.revision,
                });
              } catch (saveErr) {
                // Save failure is non-fatal for the chat turn; the renderer
                // will pick up the revision mismatch on next save.
                console.error('Motion copilot save failed:', saveErr);
              }
            }

            mainWindow.webContents.send('motion-copilot:stream-done', {
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
              mainWindow.webContents.send('motion-copilot:stream-fallback', {
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
