/**
 * lib/workspace-suggestion.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure, UI-free heuristic that suggests which execution workspace best fits a
 * task title/description — the "Suggested" badge in the WorkspacePicker.
 *
 * Deterministic and dependency-free so it is unit-testable and runs at
 * render time without IPC. The match order matters: the first workspace whose
 * keyword set hits is the suggestion; otherwise Chat (plan/research) is the
 * safe default because it can plan any task before execution.
 */

import type { Task } from '@/main/ipc/channels';

export type WorkspaceKind =
  'chat' | 'terminal' | 'builder' | 'documents' | 'focus';

export interface WorkspaceSuggestion {
  workspace: WorkspaceKind;
  rationale: string;
}

const TERMINAL_KEYWORDS = [
  'terminal',
  'shell',
  'run ',
  'run:',
  'script',
  'deploy',
  'build ',
  'install',
  'test ',
  'debug',
  'sql',
  'git ',
  'commit',
  'command',
];

const BUILDER_KEYWORDS = [
  'builder',
  'component',
  'react',
  'bug',
  'fix ',
  'feature',
  'code',
  'refactor',
  'function',
  'api ',
  'endpoint',
  'ui ',
  ' page',
];

const DOCUMENT_KEYWORDS = [
  'draft',
  'letter',
  'invoice',
  'report',
  'write ',
  'document',
  'email',
  'contract',
  'summary',
  'proposal',
];

const CHAT_KEYWORDS = [
  'research',
  'plan',
  'break down',
  'breakdown',
  'decide',
  'compare',
  'analyze',
  'analyse',
  'questions',
  'strategy',
  'ideas',
];

function haystack(task: Task): string {
  return `${task.title} ${task.description ?? ''}`.toLowerCase();
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((k) => text.includes(k));
}

export function getSuggestedWorkspace(task: Task): WorkspaceSuggestion {
  const text = haystack(task);

  if (containsAny(text, BUILDER_KEYWORDS)) {
    return {
      workspace: 'builder',
      rationale: 'Best fit: code change',
    };
  }
  if (containsAny(text, TERMINAL_KEYWORDS)) {
    return {
      workspace: 'terminal',
      rationale: 'Best fit: shell / ops work',
    };
  }
  if (containsAny(text, DOCUMENT_KEYWORDS)) {
    return {
      workspace: 'documents',
      rationale: 'Best fit: written deliverable',
    };
  }
  if (containsAny(text, CHAT_KEYWORDS)) {
    return {
      workspace: 'chat',
      rationale: 'Best fit: plan / research first',
    };
  }
  return {
    workspace: 'chat',
    rationale: 'Plan & research before execution',
  };
}
