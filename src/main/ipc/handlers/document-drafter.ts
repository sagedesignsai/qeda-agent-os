/**
 * ipc/handlers/document-drafter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IPC handlers for the Document Drafter agent.
 *
 * Streams agent turns back to the renderer over `document-drafter:stream-*`, and
 * broadcasts the existing `documents:changed` invalidation event on any mutation
 * so the document list and open editor refresh. No `document-drafter:changed`
 * channel exists on purpose — `use-documents.ts` already listens to
 * `documents:changed`, so reusing it keeps a single subscription site for the
 * whole document store.
 *
 * The provider-fallback loop below is structurally identical to the one in
 * `studio-copilot.ts` and `soundlab-copilot.ts`. That duplication is deliberate:
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
import {
  renderProjectContext,
  resolveActiveProjectId,
} from '../../ai/project-context.js';
import { resolveModelChain } from '../../ai/provider.js';
import {
  createDocumentDrafterAgent,
  DRAFTER_STEP_BUDGET,
} from '../../ai/document-drafter-agent.js';
import { PlanManager } from '../../ai/plan-manager.js';

// ─── Truncation detection ─────────────────────────────────────────────────────

/**
 * The slice of `StreamTextResult` this module reads, declared structurally.
 *
 * `agent.stream()` returns `StreamTextResult<TOOLS, RUNTIME_CONTEXT>`, whose
 * generics are inferred from the tool set and would leak into this file's
 * signatures for no benefit. Typing the parameter structurally keeps the helper
 * unit-testable with a plain object and survives an SDK rename of either
 * generic. Verified against ai@7.0.114: `steps` is
 * `PromiseLike<Array<StepResult<...>>>`, and `StepResult` declares non-optional
 * `toolCalls: Array<TypedToolCall<TOOLS>>` plus `finishReason: FinishReason`.
 */
interface StepObservations {
  steps: PromiseLike<Array<{ finishReason: string; toolCalls?: unknown[] }>>;
}

/**
 * Did this run stop because it exhausted the step budget?
 *
 * WHY NOT JUST `finishReason === 'tool-calls'`: that reason is ambiguous. The
 * loop also ends with `tool-calls` when a tool requires approval and the model
 * is waiting on the user, or when a tool has no `execute`. Those runs are
 * CORRECTLY short and must not be reported as truncated — flagging a paused
 * approval prompt as a broken draft would train the user to ignore the warning.
 *
 * So the test is the conjunction of two conditions:
 *   1. the budget was actually consumed (`steps.length >= DRAFTER_STEP_BUDGET`);
 *   2. the final step genuinely still wanted to call tools — it emitted at least
 *      one tool call and finished asking for more rather than stopping on its
 *      own. Condition 2 alone would flag every approval pause; condition 1 alone
 *      would flag a run that happened to use its whole budget and then finished
 *      cleanly. Only together do they mean "we ran out mid-work".
 *
 * `result.steps` is `PromiseLike`, not an array, so it must be awaited. That is
 * safe to do AFTER draining `result.stream`: the property's docs say it
 * "automatically consumes the stream", meaning it will drive consumption itself
 * if nobody has — but we always exhaust the stream first, so the underlying
 * promise is already settled and this await resolves immediately rather than
 * pulling a second pass over the provider.
 *
 * Returns the payload for `document-drafter:stream-truncated`, or null when the
 * run completed normally.
 */
async function detectStepCeiling(
  result: StepObservations,
): Promise<{ steps: number; budget: number } | null> {
  const steps = await result.steps;
  const last = steps.at(-1);

  const hitCeiling =
    steps.length >= DRAFTER_STEP_BUDGET &&
    last?.finishReason === 'tool-calls' &&
    (last.toolCalls?.length ?? 0) > 0;

  if (!hitCeiling) return null;
  return { steps: steps.length, budget: DRAFTER_STEP_BUDGET };
}

export function registerDocumentDrafterHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  ipcMain.handle(
    'document-drafter:chat',
    async (
      _e,
      {
        messages,
        context,
      }: {
        messages: UIMessage[];
        context?: {
          documentId?: string;
          projectId?: string;
          taskId?: string;
        };
      },
    ) => {
      const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const fail = (err: unknown) => {
        if (mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('document-drafter:stream-error', {
          error: err instanceof Error ? err.message : String(err),
        });
      };

      // Reused by both the agent turn and the completion path below. The drafter
      // has no store of its own, so invalidating the shared document store is
      // the correct broadcast — exactly how `studio:changed` works for Studio.
      const broadcastChanged = () => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('documents:changed');
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
            const planManager = new PlanManager((event) => {
              if (mainWindow.isDestroyed()) return;
              mainWindow.webContents.send('document-drafter:plan-event', event);
            });

            const agent = createDocumentDrafterAgent({
              activeProject,
              taskId: context?.taskId,
              documentId: context?.documentId,
              target,
              planManager,
            });

            const result = await agent.stream({ messages: modelMessages });

            let streamError: unknown;
            const streamToIterate = (result as any).fullStream ?? result.stream;
            for await (const chunk of streamToIterate) {
              if (mainWindow.isDestroyed()) return;
              if (chunk?.type === 'error') {
                streamError = chunk.error;
                break;
              }
              if (isOutputChunk(chunk?.type)) emitted = true;
              mainWindow.webContents.send(
                'document-drafter:stream-chunk',
                JSON.stringify(chunk),
              );
            }

            if (streamError) throw streamError;

            if (mainWindow.isDestroyed()) return;

            // Truncation detection — see the long comment on the helper below.
            // Runs only when the stream drained cleanly (any `error` chunk broke
            // out and threw above), so `steps` here reflects a real completion,
            // not a partial one.
            const truncated = await detectStepCeiling(result);
            if (truncated && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send(
                'document-drafter:stream-truncated',
                truncated,
              );
            }

            // Sent in BOTH cases. A truncated run DID finish — the agent simply
            // stopped wanting more steps before it wanted to stop drafting — so
            // `stream-done` is still true. `stream-truncated` rides alongside it
            // as an extra signal for the renderer, not instead of it.
            if (mainWindow.isDestroyed()) return;
            mainWindow.webContents.send('document-drafter:stream-done', {
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
              mainWindow.webContents.send('document-drafter:stream-fallback', {
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
