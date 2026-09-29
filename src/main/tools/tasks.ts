/**
 * tools/tasks.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The copilot's task-domain tools — the verbs that let an agent actually *do*
 * productivity work rather than just talk about it.
 *
 * Two classes of tool, and the distinction is load-bearing:
 *
 *   • additive  — create a task, add steps, block time, open a terminal.
 *                 These only add work, so they run without an interruption.
 *   • risky     — update, complete, delete, or reschedule *existing* work.
 *                 These are classed `destructive` in tools/policies/copilot.ts,
 *                 which derives to a user-approval request. There is no name
 *                 list here to drift out of sync.
 *
 * Every tool returns a `{ success, … }` envelope (matching the rest of the tool
 * registry) so the model can recover from a bad id instead of throwing.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { tool } from 'ai';
import { z } from 'zod';
import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '../db/tasks.js';
import { listSteps, createSteps, stepProgress } from '../db/task-steps.js';
import {
  listBlocks,
  getBlock,
  createBlock,
  updateBlock,
  deleteBlock,
} from '../db/task-blocks.js';
import { getFocusStats } from '../db/focus-sessions.js';
import { createTerminalSession } from '../db/terminal.js';
import {
  listProjectRollups,
  getProject,
  createProject,
} from '../db/projects.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Accept an ISO datetime string or a unix-seconds number; return unix seconds
 * (or null when absent/unparseable). Models are unreliable at epoch arithmetic,
 * so ISO strings are the encouraged form.
 */
function toEpochSeconds(input?: string | number | null): number | null {
  if (input === undefined || input === null || input === '') return null;
  if (typeof input === 'number') {
    return Number.isFinite(input) ? Math.floor(input) : null;
  }
  const ms = Date.parse(input);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

/** A compact, model-friendly view of a task (with checklist progress). */
function serializeTask(task: Task) {
  const progress = stepProgress(task.id);
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    due_at: task.due_at,
    estimate_mins: task.estimate_mins,
    project_id: task.project_id,
    pomodoro_count: task.pomodoro_count,
    steps: progress.total > 0 ? `${progress.done}/${progress.total}` : null,
  };
}

const PRIORITY = z
  .number()
  .int()
  .min(1)
  .max(3)
  .describe('1 = high, 2 = medium, 3 = low.');

/** Shared shape for a task the copilot wants to create. */
const draftTaskSchema = z.object({
  title: z.string().min(1).describe('Short, imperative title.'),
  description: z
    .string()
    .optional()
    .describe('One clarifying sentence, or omit.'),
  priority: PRIORITY.optional(),
  estimate_mins: z
    .number()
    .int()
    .min(5)
    .max(480)
    .optional()
    .describe('Realistic single-sitting estimate in minutes.'),
  due: z
    .union([z.string(), z.number()])
    .optional()
    .describe(
      'Due date as an ISO datetime string (preferred) or unix seconds.',
    ),
  projectId: z
    .string()
    .optional()
    .describe(
      'Project id from listProjects. Omit to file in the Inbox (unsorted capture).',
    ),
});

function createFromDraft(draft: z.infer<typeof draftTaskSchema>): Task {
  return createTask({
    title: draft.title.trim(),
    description: draft.description ?? '',
    priority: (draft.priority ?? 2) as TaskPriority,
    estimate_mins: draft.estimate_mins ?? null,
    due_at: toEpochSeconds(draft.due),
    project_id: draft.projectId ?? null,
    status: 'backlog',
  });
}

// ─── Read tools (no approval) ─────────────────────────────────────────────────

export const listTasksTool = tool({
  description:
    'List tasks, optionally filtered to one status. Call this before creating or changing anything so you can avoid duplicates and see what already exists.',
  inputSchema: z.object({
    status: z
      .enum(['backlog', 'active', 'done'])
      .optional()
      .describe('Restrict to a single column.'),
    projectId: z
      .string()
      .optional()
      .describe('Restrict to one project (id from listProjects).'),
  }),
  execute: async ({ status, projectId }) => {
    try {
      const tasks = listTasks({ status, projectId }).map(serializeTask);
      return { success: true, count: tasks.length, tasks };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const listProjectsTool = tool({
  description:
    'List projects with their progress: task counts, overdue items, and focus minutes logged today and overall. Call this to see the shape of the work and to get project ids before filing tasks.',
  inputSchema: z.object({
    includeArchived: z
      .boolean()
      .optional()
      .describe('Include archived projects (default false).'),
  }),
  execute: async ({ includeArchived }) => {
    try {
      const rollups = listProjectRollups({
        includeArchived: includeArchived ?? false,
      });
      return {
        success: true,
        count: rollups.length,
        projects: rollups.map((r) => ({
          id: r.project.id,
          name: r.project.name,
          status: r.project.status,
          deadline: r.project.deadline,
          repo_path: r.project.repo_path,
          taskTotal: r.taskTotal,
          taskDone: r.taskDone,
          taskActive: r.taskActive,
          taskBacklog: r.taskBacklog,
          overdue: r.overdue,
          focusMinutesToday: Math.round(r.focusSecToday / 60),
        })),
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const getTaskTool = tool({
  description:
    'Read one task in full: its fields, its checklist steps, and every time block scheduled for it. Use before editing a task or when the user names one.',
  inputSchema: z.object({
    taskId: z.string().describe('The task id from listTasks.'),
  }),
  execute: async ({ taskId }) => {
    const task = getTask(taskId);
    if (!task) return { success: false, error: `No task with id ${taskId}` };

    return {
      success: true,
      task: serializeTask(task),
      steps: listSteps(taskId).map((s) => ({
        id: s.id,
        title: s.title,
        done: s.done === 1,
      })),
      blocks: listBlocks({ taskId }).map((b) => ({
        id: b.id,
        title: b.title || b.task_title || '',
        start_at: b.start_at,
        end_at: b.end_at,
        status: b.status,
      })),
    };
  },
});

export const getFocusStatsTool = tool({
  description:
    "Read the user's focus progress — minutes focused today, completed sessions today, and current daily streak. Use it to calibrate how much to schedule: a low-streak day wants fewer, easier blocks.",
  inputSchema: z.object({}),
  execute: async () => {
    try {
      return { success: true, stats: getFocusStats() };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const listBlocksTool = tool({
  description:
    'List scheduled time blocks, optionally within [from, to]. Both bounds are ISO datetimes. Defaults to the next 48 hours. Call this before planning so you never double-book.',
  inputSchema: z.object({
    from: z.string().optional().describe('ISO datetime for the window start.'),
    to: z.string().optional().describe('ISO datetime for the window end.'),
  }),
  execute: async ({ from, to }) => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const start = toEpochSeconds(from) ?? now;
      const end = toEpochSeconds(to) ?? start + 48 * 3600;
      const blocks = listBlocks({ from: start, to: end }).map((b) => ({
        id: b.id,
        task_id: b.task_id,
        title: b.title || b.task_title || '',
        start_at: b.start_at,
        end_at: b.end_at,
        status: b.status,
      }));
      return {
        success: true,
        from: start,
        to: end,
        count: blocks.length,
        blocks,
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

// ─── Additive write tools (no approval) ───────────────────────────────────────

export const createTaskTool = tool({
  description:
    'Create a single task. Prefer createTasks when capturing several at once. Use this for one well-defined, realistic task.',
  inputSchema: draftTaskSchema,
  execute: async (draft) => {
    try {
      return { success: true, task: serializeTask(createFromDraft(draft)) };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const createTasksTool = tool({
  description:
    'Create several tasks in one call — the right tool for a brain dump. Keep titles imperative, merge duplicates, and only capture things the user can actually do.',
  inputSchema: z.object({
    tasks: z.array(draftTaskSchema).min(1).max(20),
  }),
  execute: async ({ tasks }) => {
    try {
      const created = tasks.map((draft) =>
        serializeTask(createFromDraft(draft)),
      );
      return { success: true, count: created.length, tasks: created };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const addStepsTool = tool({
  description:
    "Add checklist steps to a task's breakdown. Steps live inside the task (not on the board), so this is how you make a big task approachable. The first step should take under two minutes.",
  inputSchema: z.object({
    taskId: z.string().describe('The task to break down.'),
    steps: z
      .array(z.string().min(1))
      .min(1)
      .max(8)
      .describe('Short, action-first steps; each starts with a verb.'),
  }),
  execute: async ({ taskId, steps }) => {
    if (!getTask(taskId)) {
      return { success: false, error: `No task with id ${taskId}` };
    }
    try {
      const created = createSteps(taskId, steps);
      return {
        success: true,
        count: created.length,
        steps: created.map((s) => ({ id: s.id, title: s.title })),
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const scheduleBlockTool = tool({
  description:
    'Schedule one focus block. Provide either a taskId or a plain title. `start` is an ISO datetime; durationMins is 15–180. Leave buffers between blocks.',
  inputSchema: z.object({
    taskId: z
      .string()
      .optional()
      .describe('Attach the block to an existing task.'),
    title: z
      .string()
      .optional()
      .describe('Standalone label when no task is given.'),
    start: z
      .string()
      .describe(
        'ISO 8601 datetime for the block start, e.g. 2026-09-27T14:00.',
      ),
    durationMins: z.number().int().min(15).max(180).default(45),
  }),
  execute: async ({ taskId, title, start, durationMins }) => {
    const startAt = toEpochSeconds(start);
    if (startAt === null) {
      return {
        success: false,
        error: `Could not parse start datetime "${start}".`,
      };
    }
    if (!taskId && !title) {
      return { success: false, error: 'Provide a taskId or a title.' };
    }
    if (taskId && !getTask(taskId)) {
      return { success: false, error: `No task with id ${taskId}` };
    }
    try {
      const block = createBlock({
        task_id: taskId ?? null,
        title: title ?? '',
        start_at: startAt,
        end_at: startAt + durationMins * 60,
      });
      return {
        success: true,
        block: {
          id: block.id,
          task_id: block.task_id,
          start_at: block.start_at,
          end_at: block.end_at,
        },
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const handToTerminalTool = tool({
  description:
    'Open an agentic terminal session to actually carry out a task (run a command, scaffold a project, fix something). Returns a session id the user can open from the Terminal tab. Offer this; do not assume the user wants it.',
  inputSchema: z.object({
    goal: z.string().describe('What the terminal agent should accomplish.'),
    title: z.string().optional().describe('Short session title.'),
  }),
  execute: async ({ goal, title }) => {
    try {
      const session = createTerminalSession({
        title: title ?? (goal.length > 57 ? `${goal.slice(0, 54)}…` : goal),
        goal,
      });
      return { success: true, sessionId: session.id, title: session.title };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const createProjectTool = tool({
  description:
    'Create a project — the container an outcome, its tasks, its repo, and its docs hang off. Use when the user starts something new that will span more than a sitting. Additive, so no approval is needed.',
  inputSchema: z.object({
    name: z.string().min(1).describe('Short project name.'),
    description: z.string().optional().describe('One sentence on the outcome.'),
    deadline: z
      .union([z.string(), z.number()])
      .optional()
      .describe('Target date as ISO string (preferred) or unix seconds.'),
    repoPath: z
      .string()
      .optional()
      .describe('Working directory for this project\u2019s terminal sessions.'),
  }),
  execute: async ({ name, description, deadline, repoPath }) => {
    try {
      const project = createProject({
        name: name.trim(),
        description: description ?? '',
        deadline: toEpochSeconds(deadline),
        repo_path: repoPath ?? null,
      });
      return {
        success: true,
        project: { id: project.id, name: project.name, status: project.status },
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

// ─── Risky write tools (require approval) ─────────────────────────────────────

export const assignTaskToProjectTool = tool({
  description:
    'Move an existing task into a project. Changes where work is filed, so it asks for approval.',
  inputSchema: z.object({
    taskId: z.string(),
    projectId: z
      .string()
      .describe('Destination project id, or "inbox" to unsort.'),
  }),
  execute: async ({ taskId, projectId }) => {
    if (!getTask(taskId)) {
      return { success: false, error: `No task with id ${taskId}` };
    }
    if (!getProject(projectId)) {
      return { success: false, error: `No project with id ${projectId}` };
    }
    try {
      updateTask(taskId, { project_id: projectId });
      return { success: true, taskId, projectId };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const updateTaskTool = tool({
  description:
    'Change an existing task: title, description, priority, estimate, due date, or status. This modifies work the user already has, so it asks for approval.',
  inputSchema: z.object({
    taskId: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    priority: PRIORITY.optional(),
    estimate_mins: z
      .union([z.number().int().min(5).max(480), z.null()])
      .optional()
      .describe('New estimate, or null to clear it.'),
    due: z
      .union([z.string(), z.number(), z.null()])
      .optional()
      .describe('New due date (ISO or unix seconds), or null to clear it.'),
    status: z.enum(['backlog', 'active', 'done']).optional(),
  }),
  execute: async ({ taskId, ...patch }) => {
    if (!getTask(taskId)) {
      return { success: false, error: `No task with id ${taskId}` };
    }
    try {
      const update: Parameters<typeof updateTask>[1] = {};
      if (patch.title !== undefined) update.title = patch.title;
      if (patch.description !== undefined)
        update.description = patch.description;
      if (patch.priority !== undefined)
        update.priority = patch.priority as TaskPriority;
      if (patch.estimate_mins !== undefined)
        update.estimate_mins = patch.estimate_mins;
      if (patch.due !== undefined) update.due_at = toEpochSeconds(patch.due);
      if (patch.status !== undefined)
        update.status = patch.status as TaskStatus;

      updateTask(taskId, update);
      return { success: true, task: serializeTask(getTask(taskId)!) };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const completeTaskTool = tool({
  description:
    'Mark a task done, or reopen it with done=false. Changes existing work, so it asks for approval.',
  inputSchema: z.object({
    taskId: z.string(),
    done: z.boolean().default(true),
  }),
  execute: async ({ taskId, done }) => {
    if (!getTask(taskId)) {
      return { success: false, error: `No task with id ${taskId}` };
    }
    try {
      updateTask(taskId, { status: done ? 'done' : 'active' });
      return { success: true, taskId, status: done ? 'done' : 'active' };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const deleteTaskTool = tool({
  description:
    'Permanently delete a task and its steps. Destructive, so it asks for approval.',
  inputSchema: z.object({ taskId: z.string() }),
  execute: async ({ taskId }) => {
    const task = getTask(taskId);
    if (!task) return { success: false, error: `No task with id ${taskId}` };
    try {
      deleteTask(taskId);
      return { success: true, deleted: task.title };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const moveBlockTool = tool({
  description:
    'Move or resize an existing time block. Provide a new `start` (ISO) and/or `durationMins`. Rescheduling existing plans needs approval.',
  inputSchema: z.object({
    blockId: z.string(),
    start: z.string().optional().describe('New ISO start datetime.'),
    durationMins: z.number().int().min(15).max(180).optional(),
  }),
  execute: async ({ blockId, start, durationMins }) => {
    const block = getBlock(blockId);
    if (!block) return { success: false, error: `No block with id ${blockId}` };

    try {
      const update: Parameters<typeof updateBlock>[1] = {};
      let nextStart = block.start_at;

      if (start !== undefined) {
        const parsed = toEpochSeconds(start);
        if (parsed === null) {
          return {
            success: false,
            error: `Could not parse start datetime "${start}".`,
          };
        }
        nextStart = parsed;
        update.start_at = parsed;
        // Preserve the existing length unless a new duration overrides it.
        update.end_at = parsed + (block.end_at - block.start_at);
      }
      if (durationMins !== undefined) {
        update.end_at = nextStart + durationMins * 60;
      }

      updateBlock(blockId, update);
      return { success: true, blockId };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const deleteBlockTool = tool({
  description:
    'Delete a scheduled time block. Destructive, so it asks for approval.',
  inputSchema: z.object({ blockId: z.string() }),
  execute: async ({ blockId }) => {
    const block = getBlock(blockId);
    if (!block) return { success: false, error: `No block with id ${blockId}` };
    try {
      deleteBlock(blockId);
      return { success: true, deleted: blockId };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

// ─── Registry ─────────────────────────────────────────────────────────────────

/** Every task-domain tool, keyed by the name the model sees. */
export const taskTools = {
  listTasks: listTasksTool,
  listProjects: listProjectsTool,
  getTask: getTaskTool,
  getFocusStats: getFocusStatsTool,
  listBlocks: listBlocksTool,
  createTask: createTaskTool,
  createTasks: createTasksTool,
  createProject: createProjectTool,
  addSteps: addStepsTool,
  scheduleBlock: scheduleBlockTool,
  handToTerminal: handToTerminalTool,
  updateTask: updateTaskTool,
  completeTask: completeTaskTool,
  deleteTask: deleteTaskTool,
  assignTaskToProject: assignTaskToProjectTool,
  moveBlock: moveBlockTool,
  deleteBlock: deleteBlockTool,
};

/**
 * REMOVED: `RISKY_TASK_TOOLS`.
 *
 * This hand-maintained set of six tool names WAS the copilot's approval policy.
 * It is now derived from capability classes in `tools/policies/copilot.ts`:
 * `updateTask`, `completeTask`, `deleteTask`, `assignTaskToProject`, `moveBlock`
 * and `deleteBlock` are all classed `destructive`, which derives to
 * `'user-approval'` — the same six, with no list left to keep in sync.
 *
 * The derivation additionally gates the two indexing tools (`cost`), which is
 * new intended behaviour rather than a translation of the old set.
 */
