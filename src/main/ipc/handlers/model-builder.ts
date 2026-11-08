/**
 * ipc/handlers/model-builder.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IPC handlers for the Model Builder Agent.
 *
 * Streams agent turns, tool calls, and results back to the renderer over
 * `model-builder:stream-*` channels. The document is ephemeral — no persistence
 * to disk. The renderer manages the document lifecycle (create on open, discard
 * or save on close).
 *
 * Unlike the Motion Copilot, this handler does not save the document back to
 * a project. The dialog owns the document and decides whether to persist it.
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
import { resolveModelChain } from '../../ai/provider.js';
import { createModelBuilderAgent } from '../../ai/model-builder-agent.js';
import { PlanManager } from '../../ai/plan-manager.js';
import {
  planMotionCommand,
  applyMotionCommand,
  mintMotionApprovalToken,
  type MotionApplyResult,
} from '../../../lib/motion/plan.js';
import { diffMotionDocuments } from '../../../lib/motion/diff.js';
import type { AgentPlanEvent } from '../../../lib/agent-plan.js';
import type { MotionDocument } from '../../../lib/motion/types.js';

export function registerModelBuilderHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  ipcMain.handle(
    'model-builder:chat',
    async (
      _e,
      {
        messages,
        context,
      }: {
        messages: UIMessage[];
        context: {
          document: MotionDocument;
          /** Real project the dialog was opened from, for GLB asset staging. */
          projectId?: string;
        };
      },
    ) => {
      const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const fail = (err: unknown) => {
        if (mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('model-builder:stream-error', {
          error: err instanceof Error ? err.message : String(err),
        });
      };

      // Mutable document reference the agent tools read and write.
      // The document is ephemeral — no save to disk.
      let currentDoc: MotionDocument = context.document;
      const getDocument = () => currentDoc;
      const apply = (
        plan: ReturnType<typeof planMotionCommand>,
      ): MotionApplyResult => {
        try {
          const token = mintMotionApprovalToken(plan);
          const next = applyMotionCommand(currentDoc, plan, {
            now: new Date().toISOString(),
            approvalToken: token,
            // Ephemeral dialog: destructive ops (e.g. node remove) must still
            // apply, otherwise they silently no-op as APPLY_ERROR.
            confirmedDestructive: true,
          });
          currentDoc = next.document;
          return next;
        } catch (err) {
          const diff = diffMotionDocuments(currentDoc, currentDoc);
          return {
            document: currentDoc,
            revision: currentDoc.revision,
            applied: 0,
            diff,
            warnings: [
              {
                code: 'APPLY_ERROR',
                message: err instanceof Error ? err.message : String(err),
              },
            ],
          };
        }
      };

      try {
        const modelMessages = await prepareModelMessages(messages);

        const chain = resolveModelChain();
        if (chain.length === 0) {
          throw new Error(
            'No model configured. Pick a provider and model in Settings.',
          );
        }

        const planManager = new PlanManager();
        planManager.setEmit((event: AgentPlanEvent) => {
          if (mainWindow.isDestroyed()) return;
          mainWindow.webContents.send('model-builder:plan-event', event);
        });

        let lastError: unknown;

        for (let attempt = 0; attempt < chain.length; attempt += 1) {
          const target = chain[attempt];
          let emitted = false;
          planManager.reset();

          try {
            const agent = await createModelBuilderAgent({
              getDocument,
              apply,
              target,
              planManager,
              projectId: context.projectId,
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
                'model-builder:stream-chunk',
                JSON.stringify(chunk),
              );
            }

            if (streamError) throw streamError;

            if (mainWindow.isDestroyed()) return;

            // Send the updated document back to the renderer so the 3D viewport
            // reflects the changes made by the agent during this turn.
            mainWindow.webContents.send('model-builder:doc-updated', {
              document: currentDoc,
            });
            mainWindow.webContents.send('model-builder:stream-done', {
              runId,
            });
            return;
          } catch (err) {
            lastError = err;

            const isLast = attempt === chain.length - 1;
            const canFallback =
              !emitted && !isLast && isRetryableProviderError(err);

            if (!canFallback) break;

            const next = chain[attempt + 1];
            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send('model-builder:stream-fallback', {
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
