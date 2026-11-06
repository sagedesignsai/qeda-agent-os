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

import {
  getProject,
  projectRollup,
  projectResources,
} from '../db/projects.js';
import { getRawSettings } from './settings';
import { getRecentProjectMemories } from '../tools/rag.js';
import type { ProjectResources } from '../db/projects.js';

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
    const settings = getRawSettings();
    if (settings.activeProjectExplicitlyCleared && !settings.activeProjectId) {
      return null;
    }
    return projectExistsOrKeep(settings.activeProjectId || null);
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
 * Format a duration in milliseconds to a human-readable string.
 */
function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remain = secs % 60;
  return remain > 0 ? `${mins}m ${remain}s` : `${mins}m`;
}

/**
 * Render a compact "Project resources" subsection listing all workspace
 * resources belonging to the active project. Only categories with at least
 * one item are shown. Each category lists up to 5 items with title and one
 * metadata field (duration for takes, template for documents, etc.).
 *
 * Returns '' when no resources are found.
 */
export function renderProjectResources(resources: ProjectResources): string {
  const lines: string[] = [];

  if (resources.studioTakes.length > 0) {
    const items = resources.studioTakes
      .slice(0, 5)
      .map(
        (t) =>
          `"${t.title}" (${formatDuration(t.durationMs)})`,
      );
    lines.push(
      `**Studio takes (${resources.studioTakes.length})**: ${items.join(', ')}`,
    );
  }

  if (resources.documents.length > 0) {
    const items = resources.documents
      .slice(0, 5)
      .map((d) => `"${d.title}" (${d.templateId})`);
    lines.push(
      `**Documents (${resources.documents.length})**: ${items.join(', ')}`,
    );
  }

  if (resources.researchRuns.length > 0) {
    const items = resources.researchRuns
      .slice(0, 5)
      .map((r) => `"${r.question}" (${r.status})`);
    lines.push(
      `**Research runs (${resources.researchRuns.length})**: ${items.join(', ')}`,
    );
  }

  if (resources.terminalSessions.length > 0) {
    const items = resources.terminalSessions
      .slice(0, 5)
      .map((t) => `"${t.title}" (${t.status})`);
    lines.push(
      `**Terminal sessions (${resources.terminalSessions.length})**: ${items.join(', ')}`,
    );
  }

  if (resources.soundLabSessions.length > 0) {
    const items = resources.soundLabSessions
      .slice(0, 5)
      .map((s) => `"${s.title}" (${s.bpm} BPM, ${s.keySignature})`);
    lines.push(
      `**SoundLab sessions (${resources.soundLabSessions.length})**: ${items.join(', ')}`,
    );
  }

  if (resources.knowledgePages.length > 0) {
    const items = resources.knowledgePages
      .slice(0, 5)
      .map((p) => `"${p.title}"`);
    lines.push(
      `**Knowledge pages (${resources.knowledgePages.length})**: ${items.join(', ')}`,
    );
  }

  if (resources.codeProjects.length > 0) {
    const items = resources.codeProjects
      .map((c) => `"${c.name}" (${c.indexStatus})`);
    lines.push(
      `**Code projects (${resources.codeProjects.length})**: ${items.join(', ')}`,
    );
  }

  if (resources.chatSessions.length > 0) {
    const items = resources.chatSessions
      .slice(0, 5)
      .map((s) => `"${s.title}"`);
    lines.push(
      `**Chat sessions (${resources.chatSessions.length})**: ${items.join(', ')}`,
    );
  }

  if (lines.length === 0) return '';

  return `\n### Project resources\n${lines.join('\n')}`;
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

    // Append project resources — cross-workspace awareness for agents
    const resources = projectResources(projectId);
    const resourceBlock = renderProjectResources(resources);
    if (resourceBlock) {
      lines.push(resourceBlock);
    }

    lines.push(
      'Treat work in this conversation as belonging to this project unless the user says otherwise.',
    );

    return lines.join('\n');
  } catch {
    return '';
  }
}
