/**
 * stores/app-store.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Cross-feature state & context management store powered by Zustand.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Qeda features (Tasks, Chat/Research, Terminal, Workspace/Knowledge, Builder)
 * formerly operated in separate silos with isolated state.
 * This store coordinates them as a cohesive unit:
 *
 * 1. Focused Task: When a user selects or focuses a task (in Today, Board, or
 *    Focus Mode), that task becomes globally known. The Chat page can plan or
 *    break it down; the Terminal can execute it; and the workspace can cite it.
 * 2. Active Research Run: When deep research is executing or finished, its
 *    findings and citations can be directly converted into actionable tasks or
 *    pages without manual copy-pasting.
 * 3. Unified Cross-Feature Navigation:
 *    - `discussTaskInChat`: seamlessly launches a chat turn scoped to the task.
 *    - `runTaskInTerminal`: binds a new terminal session to the task with goal + taskId.
 *    - `createTasksFromFindings`: batch creates tasks from research findings.
 * 4. IPC Synchronization: Reacts to `tasks:changed`, `terminal:goal-done`,
 *    `projects:changed`, keeping the in-store cache fresh across surfaces.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { create } from 'zustand';
import type {
  Task,
  Project,
  ChatContext,
  ResearchRun,
} from '@/main/ipc/channels';

export interface AppStoreState {
  // ── Focused / active task ──────────────────────────────────────────────────
  focusedTask: Task | null;
  focusedTaskId: string | null;
  setFocusedTask: (task: Task | null) => void;
  setFocusedTaskId: (id: string | null) => Promise<void>;
  clearFocusedTask: () => void;

  // ── Active project ─────────────────────────────────────────────────────────
  activeProjectId: string | null;
  activeProject: Project | null;
  setActiveProject: (project: Project | null) => void;
  setActiveProjectId: (id: string | null) => Promise<void>;

  // ── Active research run ────────────────────────────────────────────────────
  activeResearchRunId: string | null;
  activeResearchRun: ResearchRun | null;
  setActiveResearchRun: (run: ResearchRun | null) => void;
  clearActiveResearchRun: () => void;

  // ── Active workspace note / page ───────────────────────────────────────────
  activeNotebookId: string | null;
  activePageId: string | null;
  setActiveWorkspace: (notebookId: string | null, pageId?: string | null) => void;

  // ── Active terminal session ────────────────────────────────────────────────
  activeTerminalSessionId: string | null;
  linkedTerminalTaskId: string | null;
  setActiveTerminal: (
    sessionId: string | null,
    linkedTaskId?: string | null,
  ) => void;

  // ── Cross-feature action bridges ───────────────────────────────────────────
  /** Build a complete ChatContext object from current store state */
  getEffectiveChatContext: () => ChatContext;

  /** Hand over a task to Chat for AI planning, breakdown, or consultation */
  discussTaskInChat: (
    task: Task,
    navigate: (
      path: string,
      options?: { state?: unknown; replace?: boolean },
    ) => void,
  ) => Promise<void>;

  /** Hand over a task to the Terminal agent to execute shell commands */
  runTaskInTerminal: (
    task: Task,
    navigate: (path: string, options?: { replace?: boolean }) => void,
  ) => Promise<void>;

  /** Turn deep-research bullet points or findings into concrete tasks */
  createTasksFromFindings: (
    findings: string[],
    projectId?: string | null,
  ) => Promise<Task[]>;
}

export const useAppStore = create<AppStoreState>((set, get) => ({
  // Task
  focusedTask: null,
  focusedTaskId: null,
  setFocusedTask: (task) => {
    set({
      focusedTask: task,
      focusedTaskId: task?.id ?? null,
      ...(task?.project_id ? { activeProjectId: task.project_id } : {}),
    });
  },
  setFocusedTaskId: async (id) => {
    if (!id) {
      set({ focusedTask: null, focusedTaskId: null });
      return;
    }
    set({ focusedTaskId: id });
    try {
      const task = await window.electron.ipc.invoke<Task | null>('tasks:get', {
        id,
      });
      if (task) {
        set({
          focusedTask: task,
          ...(task.project_id ? { activeProjectId: task.project_id } : {}),
        });
      }
    } catch {
      // Best-effort
    }
  },
  clearFocusedTask: () => set({ focusedTask: null, focusedTaskId: null }),

  // Project
  activeProjectId: null,
  activeProject: null,
  setActiveProject: (project) => {
    set({
      activeProject: project,
      activeProjectId: project?.id ?? null,
    });
  },
  setActiveProjectId: async (id) => {
    set({ activeProjectId: id });
    if (!id) {
      set({ activeProject: null });
      return;
    }
    try {
      const project = await window.electron.ipc.invoke<Project | null>(
        'projects:get',
        { id },
      );
      set({ activeProject: project ?? null });
    } catch {
      set({ activeProject: null });
    }
  },

  // Research
  activeResearchRunId: null,
  activeResearchRun: null,
  setActiveResearchRun: (run) => {
    set({
      activeResearchRun: run,
      activeResearchRunId: run?.id ?? null,
      ...(run?.notebook_id ? { activeNotebookId: run.notebook_id } : {}),
      ...(run?.page_id ? { activePageId: run.page_id } : {}),
    });
  },
  clearActiveResearchRun: () =>
    set({ activeResearchRun: null, activeResearchRunId: null }),

  // Workspace
  activeNotebookId: null,
  activePageId: null,
  setActiveWorkspace: (notebookId, pageId = null) => {
    set({
      activeNotebookId: notebookId,
      activePageId: pageId,
    });
  },

  // Terminal
  activeTerminalSessionId: null,
  linkedTerminalTaskId: null,
  setActiveTerminal: (sessionId, linkedTaskId = null) => {
    set({
      activeTerminalSessionId: sessionId,
      linkedTerminalTaskId: linkedTaskId,
    });
  },

  // Effective chat context
  getEffectiveChatContext: () => {
    const s = get();
    const ctx: ChatContext = {};
    if (s.activeProjectId) ctx.projectId = s.activeProjectId;
    if (s.focusedTaskId) ctx.taskId = s.focusedTaskId;
    if (s.activeNotebookId) ctx.notebookId = s.activeNotebookId;
    if (s.activePageId) ctx.pageId = s.activePageId;
    if (s.activeResearchRunId) ctx.researchRunId = s.activeResearchRunId;
    return ctx;
  },

  // Bridges
  discussTaskInChat: async (task, navigate) => {
    get().setFocusedTask(task);
    const scopeParam = task.project_id
      ? `?project=${encodeURIComponent(task.project_id)}&task=${encodeURIComponent(task.id)}`
      : `?task=${encodeURIComponent(task.id)}`;

    navigate(`/chat${scopeParam}`, {
      state: {
        chatContext: {
          taskId: task.id,
          projectId: task.project_id ?? undefined,
        },
        initialPrompt: `I'd like to work on this task: "${task.title}".${
          task.description ? `\n\nContext:\n${task.description}` : ''
        }\n\nPlease help me break this down, plan next actions, or answer any technical questions.`,
      },
    });
  },

  runTaskInTerminal: async (task, navigate) => {
    get().setFocusedTask(task);
    const session = await window.electron.ipc.invoke<{ id: string }>(
      'terminal:session-create',
      {
        title: task.title,
        projectId: task.project_id ?? null,
      },
    );
    get().setActiveTerminal(session.id, task.id);

    const projectQuery = task.project_id
      ? `&project=${encodeURIComponent(task.project_id)}`
      : '';
    navigate(
      `/terminal/${session.id}?goal=${encodeURIComponent(task.title)}&task=${encodeURIComponent(task.id)}${projectQuery}`,
    );
  },

  createTasksFromFindings: async (findings, projectId = null) => {
    const created: Task[] = [];
    const pid = projectId ?? get().activeProjectId ?? null;

    for (const finding of findings) {
      const trimmed = finding.trim();
      if (!trimmed) continue;
      try {
        const t = await window.electron.ipc.invoke<Task>('tasks:create', {
          title: trimmed,
          projectId: pid,
          priority: 2,
        });
        if (t) created.push(t);
      } catch {
        // Continue creating remaining tasks
      }
    }
    return created;
  },
}));
