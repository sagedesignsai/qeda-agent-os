/**
 * lib/task-launch.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified hand-off from Tasks (the backbone) to execution workspaces.
 *
 * `startTaskInWorkspace` marks the task active, records the last workspace
 * choice, and either navigates (Chat/Terminal) or returns a signal for the
 * caller to open a local surface (`documents` drafter sheet, `focus` modal).
 * It deliberately does NOT auto-start the pomodoro: starting a workspace is
 * an orientation step, pressing play in FocusMode / the sidebar player is the
 * commitment. Timer/focus sync is owned by focus-store (mirrored to
 * app-store); this helper only ensures the task row is active and the
 * workspace session exists before navigation.
 */

import type { Task } from '@/main/ipc/channels';
import type { WorkspaceKind } from '@/lib/workspace-suggestion';

export interface NavigateFn {
  (path: string, options?: { state?: unknown; replace?: boolean }): void;
}

export type LaunchResult =
  | { kind: 'navigate'; path: string; state?: unknown }
  | { kind: 'documents' }
  | { kind: 'focus' };

export function buildChatPrompt(task: Task): string {
  return `I'd like to work on this task: "${task.title}".${task.description ? `\n\nContext:\n${task.description}` : ''}\n\nPlease help me break this down, plan next actions, or answer any technical questions.`;
}

export function buildTerminalGoal(task: Task): string {
  return task.title;
}

export function getLastWorkspace(
  projectId: string | null,
): WorkspaceKind | null {
  try {
    const key = projectId
      ? `qeda:lastWorkspaceByProject:${projectId}`
      : 'qeda:lastWorkspace:global';
    const v = window.localStorage.getItem(key);
    if (
      v === 'chat' ||
      v === 'terminal' ||
      v === 'builder' ||
      v === 'documents' ||
      v === 'focus'
    )
      return v;
    return null;
  } catch {
    return null;
  }
}

export function setLastWorkspace(
  projectId: string | null,
  workspace: WorkspaceKind,
): void {
  try {
    const key = projectId
      ? `qeda:lastWorkspaceByProject:${projectId}`
      : 'qeda:lastWorkspace:global';
    window.localStorage.setItem(key, workspace);
  } catch {
    // Best-effort persistence.
  }
}

export interface LaunchDeps {
  navigate: NavigateFn;
  /** Optional: invoked once the task is marked active (e.g. optimistic board patch). */
  onMarkedActive?: (task: Task) => void;
  /** Optional: invoked with the focused task (e.g. focus-store startFocus). */
  onFocusTask?: (task: Task) => void;
}

export async function startTaskInWorkspace(
  task: Task,
  workspace: WorkspaceKind,
  deps: LaunchDeps,
): Promise<LaunchResult> {
  // Record the choice before any IPC so a crash still leaves a sensible
  // default next time.
  setLastWorkspace(task.project_id ?? null, workspace);

  // Move to active (no-op if already there). Tasks owns the lifecycle;
  // the workspace never changes status itself.
  let activeTask = task;
  if (task.status !== 'active') {
    try {
      const updated = await window.electron.ipc.invoke<Task | null>(
        'tasks:update',
        {
          id: task.id,
          status: 'active',
        },
      );
      // `tasks:update` currently returns void in some builds; fall back to
      // a local patch so the optimistic UI is correct regardless.
      activeTask = { ...task, status: 'active' };
      void updated;
    } catch {
      activeTask = { ...task, status: 'active' };
    }
    deps.onMarkedActive?.(activeTask);
  }

  // Keep the cross-feature focus in step without opening the modal or
  // starting the timer (picker "Just Focus" is the only modal path, and it
  // goes through focus-store directly from the caller).
  deps.onFocusTask?.(activeTask);

  if (workspace === 'focus') {
    return { kind: 'focus' };
  }

  if (workspace === 'documents') {
    return { kind: 'documents' };
  }

  if (workspace === 'chat') {
    const session = await window.electron.ipc.invoke<{ id: string }>(
      'sessions:create',
      {
        title: activeTask.title.slice(0, 32),
        projectId: activeTask.project_id ?? null,
      },
    );
    const scopeParam = activeTask.project_id
      ? `?project=${encodeURIComponent(activeTask.project_id)}&task=${encodeURIComponent(activeTask.id)}`
      : `?task=${encodeURIComponent(activeTask.id)}`;
    const path = `/chat/${session.id}${scopeParam}`;
    const state = {
      chatContext: {
        taskId: activeTask.id,
        projectId: activeTask.project_id ?? undefined,
      },
      initialPrompt: buildChatPrompt(activeTask),
    };
    deps.navigate(path, { state });
    return { kind: 'navigate', path, state };
  }

  if (workspace === 'terminal') {
    const session = await window.electron.ipc.invoke<{ id: string }>(
      'terminal:session-create',
      {
        title: activeTask.title,
        goal: buildTerminalGoal(activeTask),
        project_id: activeTask.project_id ?? null,
      },
    );
    const projectQuery = activeTask.project_id
      ? `&project=${encodeURIComponent(activeTask.project_id)}`
      : '';
    const path = `/terminal/${session.id}?goal=${encodeURIComponent(buildTerminalGoal(activeTask))}&task=${encodeURIComponent(activeTask.id)}${projectQuery}`;
    deps.navigate(path);
    return { kind: 'navigate', path };
  }

  if (workspace === 'builder') {
    const projectQuery = activeTask.project_id
      ? `?project=${encodeURIComponent(activeTask.project_id)}&task=${encodeURIComponent(activeTask.id)}`
      : `?task=${encodeURIComponent(activeTask.id)}`;
    const path = `/builder${projectQuery}`;
    deps.navigate(path, {
      state: { taskId: activeTask.id, taskTitle: activeTask.title },
    });
    return { kind: 'navigate', path };
  }

  return { kind: 'focus' };
}
