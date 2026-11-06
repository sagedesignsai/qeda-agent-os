/**
 * lib/focus/task-actions.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Completing a task from the global focus bar.
 *
 * The Tasks page used to own this because the bar was only rendered there. Now
 * the bar is app-wide, so the IPC calls that mark a task done and award XP need
 * to be callable from outside the page. Both writes are idempotent for a double
 * click: the second `tasks:update` is a no-op patch, and the XP award carries a
 * per-task key so main refuses to pay for the same completion twice.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { xpForTaskPriority } from '../gamification';
import type { Task } from '@/main/ipc/channels';

export async function completeTask(task: Task): Promise<void> {
  await window.electron.ipc.invoke('tasks:update', {
    id: task.id,
    status: 'done',
  });
  await window.electron.ipc.invoke('gamification:award-xp', {
    amount: xpForTaskPriority(task.priority),
    source: `task_p${task.priority}`,
    entityId: task.id,
    idempotencyKey: `task_done:${task.id}`,
  });
}
