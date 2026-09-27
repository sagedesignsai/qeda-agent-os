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
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getProject, projectRollup } from '../db/projects';
import { getRawSettings } from './settings';

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
 * A stored id pointing at a deleted project resolves to null here rather than
 * throwing: `renderProjectContext` already returns '' for an unknown id, so a
 * stale default degrades to "unscoped" instead of breaking the turn.
 */
export function resolveActiveProjectId(scoped?: string | null): string | null {
  if (scoped) return scoped;
  try {
    return getRawSettings().activeProjectId || null;
  } catch {
    // Settings unreadable (first run, corrupt file) must not fail a turn.
    return null;
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
        `Deadline: ${new Date(project.deadline * 1000).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}`,
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

    lines.push(
      'Treat work in this conversation as belonging to this project unless the user says otherwise.',
    );

    return lines.join('\n');
  } catch {
    return '';
  }
}
