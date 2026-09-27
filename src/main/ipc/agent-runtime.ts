/**
 * ipc/agent-runtime.ts
 * ────────────────────────────────────────────────────────────────────────────
 * The cached chat agent and the pure helpers that go with it.
 *
 * WHY A SEPARATE MODULE: `agentCache` is the only mutable module-level
 * state in the IPC layer. Settings must invalidate it when the user
 * changes provider or model, and the chat handler must read from it, so
 * both need access without importing each other.
 *
 * Deliberately NOT shared more widely: the terminal agent and the task
 * copilot build their agents directly (ai/terminal-agent.ts,
 * ai/task-copilot-agent.ts) and never touch this cache.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { type UIMessage } from 'ai';
import { createDesktopAgent, type WorkspaceContext } from '../ai/agent';
import { resolveActiveProjectId } from '../ai/project-context';
import { type ModelTarget } from '../ai/fallback';
import { type ChatContext } from './channels';

/** One cached agent per provider/model pair, for the duration of the session. */
const agentCache = new Map<string, ReturnType<typeof createDesktopAgent>>();

/** The turn's operating mode, inferred from the user's latest message. */
type AgentMode = 'chat' | 'research' | 'notebook';

function cacheKey(target: ModelTarget, mode: AgentMode, context?: ChatContext): string {
  // Contexts are additive (page + notebook + project can coexist), so all three
  // go into the key — otherwise a project-scoped chat would reuse an agent whose
  // system prompt omits the project, and vice versa.
  const parts = [
    context?.pageId ? `p:${context.pageId}` : null,
    context?.notebookId ? `n:${context.notebookId}` : null,
    context?.projectId ? `pr:${context.projectId}` : null,
  ].filter(Boolean);
  return `${target.providerId}::${target.modelId}::${mode}::${parts.join('|') || '-'}`;
}

export function getAgent(
  target: ModelTarget,
  mode: AgentMode,
  context?: ChatContext,
): ReturnType<typeof createDesktopAgent> {
  // Resolve the project ONCE, before the cache key is computed, and put the
  // resolved value into the context the agent receives. Two reasons this must
  // happen here rather than at the call site:
  //
  //  1. Fallback. An unscoped surface — the normal state on a fresh launch,
  //     since the renderer's scope lives in MemoryRouter memory — resolves to
  //     the persisted default, so the prompt still names a project and the repo
  //     tools have an id to resolve `repo_path` from.
  //  2. Cache correctness. The key includes the project id, so resolving first
  //     means a turn that fell back to the default and a turn explicitly scoped
  //     to that same project share one agent — correct, they are the same
  //     context. Resolving after the key would let an unscoped turn reuse an
  //     agent built for a *different* project.
  const resolved: ChatContext | undefined = context?.projectId
    ? context
    : (() => {
        const projectId = resolveActiveProjectId(null);
        return projectId ? { ...context, projectId } : context;
      })();

  const key = cacheKey(target, mode, resolved);
  let agent = agentCache.get(key);
  if (!agent) {
    agent = createDesktopAgent({
      target,
      researchMode: mode !== 'chat',
      notebookMode: mode === 'notebook',
      context: resolved as WorkspaceContext | undefined,
    });
    agentCache.set(key, agent);
  }
  return agent;
}

export function resetAgents() {
  agentCache.clear();
}

/** Text of the user's latest message, concatenated (empty when there is none). */
function lastUserText(messages: UIMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) return '';
  return lastUser.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join(' ');
}

/**
 * Heuristic: pick the system-prompt mode for this turn from the user's latest
 * message. "Notebook" verbs (build me a tutorial/guide/paper) also imply the
 * research protocol, since a generated notebook must be researched first.
 */
export function detectMode(messages: UIMessage[]): AgentMode {
  const text = lastUserText(messages);
  if (
    /\b(notebook|tutorial|walkthrough|guide|paper|documentation|getting[\s-]?started|step[\s-]?by[\s-]?step|from scratch)\b/i.test(
      text,
    )
  ) {
    return 'notebook';
  }
  if (
    /\b(research|investigate|deep[\s-]?dive|report on|write a report|analyze|analyse|summarise|summarize)\b/i.test(
      text,
    )
  ) {
    return 'research';
  }
  return 'chat';
}
