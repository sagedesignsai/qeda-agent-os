/**
 * ipc/handlers/tasks.ts
 * ────────────────────────────────────────────────────────────────────────────
 * The focus manager: tasks, breakdown steps, time blocks, focus sessions.
 *
 * Extracted verbatim from the former monolithic ipc/handlers.ts.
 * Wired up by ipc/index.ts, which is the map of channel -> module.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { isStepCount } from 'ai';
import { ipcMain, powerSaveBlocker, type BrowserWindow } from 'electron';
import { getSettings } from '../../ai/settings';
import {
  createFocusSession,
  getFocusStats,
  listFocusSessions,
} from '../../db/focus-sessions';
import {
  createBlock,
  deleteBlock,
  listBlocks,
  updateBlock,
} from '../../db/task-blocks';
import {
  createStep,
  deleteStep,
  listSteps,
  setStepDone,
  stepProgressMap,
} from '../../db/task-steps';
import {
  createTask,
  deleteTask,
  incrementPomodoro,
  listTasks,
  updateTask,
} from '../../db/tasks';
import { refreshBadge } from '../../os-integration';

/**
 * A running focus session holds a power-save blocker so OS throttling
 * (macOS App Nap, Windows efficiency mode) can't stall the countdown.
 * The renderer toggles it from the timer's `running` state; the handle is
 * held across calls and released on the matching disable.
 */
let focusPowerBlockerId: number | null = null;

export function registerTasksHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  // ── ADHD task manager ─────────────────────────────────────────────────────

  ipcMain.handle(
    'tasks:list',
    (
      _e,
      {
        status,
        projectId,
      }: {
        status?: import('../../db/tasks').TaskStatus;
        projectId?: string | null;
      },
    ) => listTasks({ status, projectId }),
  );

  ipcMain.handle(
    'tasks:create',
    (_e, req: Parameters<typeof createTask>[0]) => {
      const task = createTask(req);
      refreshBadge();
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('tasks:changed');
      return task;
    },
  );

  ipcMain.handle(
    'tasks:update',
    (
      _e,
      { id, ...patch }: { id: string } & Parameters<typeof updateTask>[1],
    ) => {
      const task = updateTask(id, patch);
      refreshBadge();
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('tasks:changed');
      return task;
    },
  );

  ipcMain.handle('tasks:delete', (_e, { id }: { id: string }) => {
    const result = deleteTask(id);
    refreshBadge();
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('tasks:changed');
    return result;
  });

  ipcMain.handle('tasks:increment-pomodoro', (_e, { id }: { id: string }) =>
    incrementPomodoro(id),
  );

  ipcMain.handle('tasks:prioritize', async () => {
    const { getSettings } = await import('../../ai/settings.js');
    const { resolveModel } = await import('../../ai/provider.js');
    const { generateText } = await import('ai');
    const allTasks = listTasks();
    if (allTasks.length === 0)
      return { orderedIds: [], reasoning: 'No tasks to prioritize.' };

    const settings = getSettings();
    const model = resolveModel(settings.activeProvider, settings.activeModel);

    const taskList = allTasks
      .map(
        (t) =>
          `- id:${t.id} priority:${t.priority} status:${t.status} title:"${t.title}"`,
      )
      .join('\n');

    const result = await generateText({
      model: model as any,
      system:
        'You are a productivity assistant. Given a list of tasks, return a JSON object with "orderedIds" (array of task ids, highest priority first) and "reasoning" (one sentence explaining your decision). Output only valid JSON.',
      prompt: `Tasks:\n${taskList}\n\nReturn JSON only.`,
      stopWhen: isStepCount(1),
    });

    try {
      const parsed = JSON.parse(result.text ?? '{}') as {
        orderedIds?: string[];
        reasoning?: string;
      };
      return {
        orderedIds: parsed.orderedIds ?? allTasks.map((t) => t.id),
        reasoning: parsed.reasoning ?? 'Prioritized by AI.',
      };
    } catch {
      return {
        orderedIds: allTasks.map((t) => t.id),
        reasoning: 'Could not parse AI response. Order unchanged.',
      };
    }
  });

  // ── Focus system · breakdown steps ────────────────────────────────────────

  ipcMain.handle('tasks:steps-list', (_e, { taskId }: { taskId: string }) =>
    listSteps(taskId),
  );

  ipcMain.handle(
    'tasks:step-add',
    (_e, { taskId, title }: { taskId: string; title: string }) =>
      createStep({ task_id: taskId, title }),
  );

  ipcMain.handle(
    'tasks:step-toggle',
    (_e, { id, done }: { id: string; done: boolean }) => setStepDone(id, done),
  );

  ipcMain.handle('tasks:step-delete', (_e, { id }: { id: string }) =>
    deleteStep(id),
  );

  ipcMain.handle('tasks:steps-progress', () => stepProgressMap());

  // ── Focus system · time blocking ──────────────────────────────────────────

  ipcMain.handle(
    'tasks:blocks-list',
    (
      _e,
      req: { from?: number; to?: number; projectId?: string | null } | void,
    ) => listBlocks(req ?? undefined),
  );

  ipcMain.handle(
    'tasks:block-create',
    (_e, req: Parameters<typeof createBlock>[0]) => createBlock(req),
  );

  ipcMain.handle(
    'tasks:block-update',
    (
      _e,
      { id, ...patch }: { id: string } & Parameters<typeof updateBlock>[1],
    ) => updateBlock(id, patch),
  );

  ipcMain.handle('tasks:block-delete', (_e, { id }: { id: string }) =>
    deleteBlock(id),
  );

  // ── Focus system · sessions & stats ───────────────────────────────────────

  ipcMain.handle(
    'focus:session-create',
    (_e, req: Parameters<typeof createFocusSession>[0]) =>
      createFocusSession(req),
  );

  ipcMain.handle(
    'focus:sessions-list',
    (_e, req: { from?: number; to?: number } | void) =>
      listFocusSessions(req ?? undefined),
  );

  ipcMain.handle('focus:stats', () => getFocusStats());

  // ── Focus system · native power integration ───────────────────────────────

  ipcMain.handle(
    'focus:set-power-blocker',
    (_e, { enabled }: { enabled: boolean }) => {
      if (enabled && focusPowerBlockerId === null) {
        focusPowerBlockerId = powerSaveBlocker.start('prevent-app-suspension');
      } else if (!enabled && focusPowerBlockerId !== null) {
        powerSaveBlocker.stop(focusPowerBlockerId);
        focusPowerBlockerId = null;
      }
      return { active: focusPowerBlockerId !== null };
    },
  );
}
