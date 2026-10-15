/**
 * ai/project-context.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The "Active project" block both agents receive.
 *
 * A scoped surface (Tasks, Terminal, Chat) can carry `?project=<id>`, and the
 * turn's IPC context forwards it to main. Rather than each agent re-deriving
 * what the project *is*, this module loads it once and renders a compact,
 * factual block for the system prompt — so an agent answering "what should I
 * do next" knows the deadline, the repo, and how much work is open without
 * being told.
 *
 * The block is deliberately *descriptive only*: it names the project, its
 * progress, and its paths. It never instructs the agent to file new tasks
 * there — filing behaviour belongs to the copilot's own instructions, and the
 * chat agent should not invent project-management behaviour it has no tools
 * for. (The chat agent does get the repo path, which is genuinely useful for
 * terminal-style work.)
 *
 * `resolveActiveProjectId` is the single place that decides which project a turn
 * belongs to. It validates both the explicit scope and the persisted default
 * against the projects store, because every downstream consumer — the prompt
 * block, the repo tools, the copilot's task-filing fallback — assumes the id it
 * is handed names a project that still exists.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getProject, projectRollup } from '../db/projects.js';
import { getRawSettings } from './settings';
import { getRecentProjectMemories } from '../tools/rag';

export interface ProjectAgentContext {
  projectId?: string;
}

/**
 * Resolve which project a turn belongs to.
 *
 * A scoped surface wins: an explicit `?project=<id>` is a deliberate, temporary
 * lens ("I am looking at this project HERE") and must not be overridden.
 *
 * Otherwise fall back to the persisted default. This fallback is what makes the
 * agents useful on a fresh launch: the renderer's scope lives in MemoryRouter
 * state and is always empty at startup, so without it main could never name a
 * project, the "Active project" block would be blank, and the repo tools —
 * which resolve `projectId → repo_path` — would have nothing to resolve and
 * would (correctly, per spec §6.1) refuse rather than guess.
 *
 * Both the scoped id and the persisted default are VALIDATED against the
 * projects store, so a deleted project resolves to null rather than being handed
 * to consumers that treat it as real. That matters beyond the prompt block:
 * `renderProjectContext` already degraded an unknown id to '', but repo-path
 * tools and the copilot's task-filing fallback did not, so a stale id leaked a
 * bogus project into them.
 *
 * An empty string counts as *not scoped* (`?project=` with no value) and falls
 * through to the default.
 *
 * Every read is best-effort and never throws. A store read that FAILS is not the
 * same as a read that says "no such project": failure means we cannot disprove
 * the id, so the id is passed through unchanged and the turn behaves exactly as
 * it did before validation existed. Only a successful read that finds no row
 * yields null.
 */
export function resolveActiveProjectId(scoped?: string | null): string | null {
  if (scoped) return projectExistsOrKeep(scoped);
  try {
    return projectExistsOrKeep(getRawSettings().activeProjectId || null);
  } catch {
    // Settings unreadable (first run, corrupt file) must not fail a turn.
    return null;
  }
}

/**
 * `id` when the projects store can still resolve it, `null` when the store says
 * it does not exist, and `id` unchanged when the store itself is unreadable.
 */
function projectExistsOrKeep(id: string | null): string | null {
  if (!id) return null;
  try {
    return getProject(id) ? id : null;
  } catch {
    return id;
  }
}

/**
 * Render the active-project block for a system prompt.
 *
 * Returns '' when no project is scoped, unknown, or the read fails — context
 * is best-effort and must never break a turn.
 */
export function renderProjectContext(
  context: ProjectAgentContext | undefined,
): string {
  const projectId = context?.projectId;
  if (!projectId) return '';

  try {
    const project = getProject(projectId);
    if (!project) return '';

    const rollup = projectRollup(projectId);

    const lines: string[] = [
      '\n## Active project',
      `The user is currently working inside the project **${project.name}** (id: ${project.id}).`,
    ];

    if (project.description) {
      lines.push(`Outcome: ${project.description}`);
    }
    if (project.deadline !== null) {
      lines.push(
        `Deadline: ${new Date(project.deadline * 1000).toLocaleDateString(
          'en-US',
          {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          },
        )}`,
      );
    }
    if (project.repo_path) {
      lines.push(`Repo: ${project.repo_path}`);
    }
    if (rollup) {
      lines.push(
        `Tasks: ${rollup.taskTotal} total, ${rollup.taskDone} done, ${rollup.taskActive} active` +
          (rollup.overdue > 0 ? `, ${rollup.overdue} overdue` : ''),
      );
    }

    const memories = getRecentProjectMemories(projectId, 5);
    if (memories.length > 0) {
      lines.push('\n### Recent Project Memory Context');
      memories.forEach((mem) => {
        lines.push(`• ${mem.content}`);
      });
      lines.push(
        'Use searchProjectMemory or storeProjectMemory tools to search or persist facts, decisions, and instructions.',
      );
    }

    lines.push(
      'Treat work in this conversation as belonging to this project unless the user says otherwise.',
    );

    return lines.join('\n');
  } catch {
    return '';
  }
}
