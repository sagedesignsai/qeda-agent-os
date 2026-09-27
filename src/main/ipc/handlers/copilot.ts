/**
 * ipc/handlers/copilot.ts
 * ────────────────────────────────────────────────────────────────────────────
 * The focus copilot, in both its schema-validated and agent-with-tools forms.
 *
 * Extracted verbatim from the former monolithic ipc/handlers.ts.
 * Wired up by ipc/index.ts, which is the map of channel -> module.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { type UIMessage } from 'ai';
import { ipcMain, type BrowserWindow } from 'electron';
import { describeFallbackReason, isOutputChunk, isRetryableProviderError } from '../../ai/fallback';
import { prepareModelMessages } from '../../ai/messages';
import { renderProjectContext, resolveActiveProjectId } from '../../ai/project-context';
import { resolveModelChain } from '../../ai/provider';
import { breakdownTask, expandBrainDump, planDay } from '../../ai/task-copilot';
import { createTaskCopilotAgent } from '../../ai/task-copilot-agent';
import { startOfDay } from '../../db/focus-sessions';
import { createBlock, listBlocks } from '../../db/task-blocks';
import { createSteps } from '../../db/task-steps';
import { createTask, getTask, listTasks } from '../../db/tasks';

export function registerCopilotHandlers({ mainWindow }: { mainWindow: BrowserWindow }): void {
  // ── AI focus copilot ──────────────────────────────────────────────────────

  ipcMain.handle(
    'tasks:breakdown',
    async (_e, { taskId }: { taskId: string }) => {
      const task = getTask(taskId);
      if (!task) throw new Error('Task not found');
      const { steps, note } = await breakdownTask({
        title: task.title,
        description: task.description,
      });
      return { steps: createSteps(taskId, steps), note };
    },
  );

  ipcMain.handle(
    'tasks:brain-dump',
    async (_e, { text }: { text: string }) => {
      const trimmed = (text ?? '').trim();
      if (!trimmed) return { tasks: [], note: 'Nothing to add.' };
      const { tasks: drafts, note } = await expandBrainDump(trimmed);
      const created = drafts.map((d) =>
        createTask({
          title: d.title,
          description: d.description,
          priority: d.priority,
          estimate_mins: d.estimate_mins,
          status: 'backlog',
        }),
      );
      return { tasks: created, note };
    },
  );

  ipcMain.handle(
    'tasks:plan-day',
    async (
      _e,
      req: { day?: number; workStartMin?: number; workEndMin?: number } | void,
    ) => {
      const nowSec = Math.floor(Date.now() / 1000);
      const dayStart = startOfDay(req?.day ?? nowSec);
      const dayEnd = dayStart + 86_400;
      const workStartMin = req?.workStartMin ?? 9 * 60;
      const workEndMin = req?.workEndMin ?? 18 * 60;

      const openTasks = listTasks().filter((t) => t.status !== 'done');
      if (openTasks.length === 0) {
        return { blocks: [], note: 'No open tasks to schedule.' };
      }

      const busy = listBlocks({ from: dayStart, to: dayEnd }).map((b) => ({
        title: b.title || b.task_title || 'Time block',
        start_min: Math.max(0, Math.round((b.start_at - dayStart) / 60)),
        end_min: Math.round((b.end_at - dayStart) / 60),
      }));

      const { blocks: proposals, note } = await planDay({
        tasks: openTasks.map((t) => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          estimate_mins: t.estimate_mins,
          due_at: t.due_at,
        })),
        busy,
        workStartMin,
        workEndMin,
      });

      const validIds = new Set(openTasks.map((t) => t.id));
      const created = proposals
        .filter((p) => validIds.has(p.task_id))
        .map((p) => {
          const start = dayStart + p.start_min * 60;
          return createBlock({
            task_id: p.task_id,
            title: p.title,
            start_at: start,
            end_at: start + p.duration_min * 60,
          });
        });

      return { blocks: created, note };
    },
  );

  // ── Focus copilot (agent with tools) ──────────────────────────────────────

  /**
   * One copilot turn. Mirrors `agent:chat` but runs the task copilot agent,
   * streams over copilot-namespaced events, and signals `copilot:changed` so the
   * board refreshes after tools have (possibly) mutated task data.
   */
  ipcMain.handle(
    'copilot:chat',
    async (
      _e,
      {
        messages,
        context,
      }: { messages: UIMessage[]; context?: { projectId?: string } },
    ) => {
      const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const fail = (err: unknown) => {
        if (mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('copilot:stream-error', {
          error: err instanceof Error ? err.message : String(err),
        });
      };

      try {
        const modelMessages = await prepareModelMessages(messages);
        // The rendered block carries deadline/repo/progress, not just the name.
        // Falls back to the persisted default when the surface is unscoped,
        // which is the normal state on a fresh launch.
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
            const agent = createTaskCopilotAgent({ activeProject, target });
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
                'copilot:stream-chunk',
                JSON.stringify(chunk),
              );
            }

            if (streamError) throw streamError;

            if (mainWindow.isDestroyed()) return;
            mainWindow.webContents.send('copilot:stream-done', { runId });
            // Tools may have added/changed tasks, blocks, or terminal sessions.
            mainWindow.webContents.send('copilot:changed');
            return;
          } catch (err) {
            lastError = err;

            const isLast = attempt === chain.length - 1;
            const canFallback =
              !emitted && !isLast && isRetryableProviderError(err);

            if (!canFallback) break;

            const next = chain[attempt + 1];
            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send('copilot:stream-fallback', {
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
