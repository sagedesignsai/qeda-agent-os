/**
 * components/builder/BuilderWelcome.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The Builder's empty state. It follows the app's AI-first landing precedent
 * (`components/chat/ChatWelcome.tsx`, `components/documents/DocumentsWelcome.tsx`):
 * one centred prompt input is the page, with everything else subordinate to it.
 *
 * WHY THIS SHAPE
 * The previous version was a two-column onboarding grid — a "Choose a codebase"
 * card beside a "Describe what you want" card, each with its own bordered panel,
 * heading, and explanation. That put the required setup step at the same visual
 * weight as the actual job of the page, and on a 13" window it rendered as two
 * dense panels with a marketing hero above them. Builder's job is to turn a
 * described intent into a reviewed diff; the composer is the only thing the user
 * came here to use.
 *
 * So the composer is centred and prominent, the starters are suggestion chips
 * beneath it in the ChatWelcome idiom (short label, full prompt — scannable row
 * that still gives Builder real instructions), and codebase setup moved into the
 * composer footer beside Submit as a nested menu (`BuilderCodebasePicker`).
 *
 * The codebase control is in the footer rather than in its own panel because it
 * qualifies the send: it is a parameter of the turn, the way the model selector
 * is, and not a prerequisite the user must clear first.
 *
 * The composer is honest about not being sendable yet: submitting without a
 * workspace is refused with a reason, rather than a silently disabled box or a
 * pretend success.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangleIcon,
  ArchiveRestoreIcon,
  Code2Icon,
  GitCompareArrowsIcon,
  Globe2Icon,
  LayoutTemplateIcon,
  LineChartIcon,
  Loader2Icon,
  SparklesIcon,
  Trash2Icon,
} from 'lucide-react';
import { ChatInput } from '@/components/chat/ChatInput';
import { BuilderCodebasePicker } from '@/components/builder/BuilderCodebasePicker';
import { useBuilderSessionHistory } from '@/hooks/use-builder-session-history';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { CodeProject } from '@/main/ipc/channels';
import type { BuilderConnectionStatus } from '@/lib/builder-types';

interface Suggestion {
  label: string;
  prompt: string;
  icon: LucideIcon;
}

const SUGGESTIONS: Suggestion[] = [
  {
    label: 'Launch page',
    icon: LayoutTemplateIcon,
    prompt:
      'Build a polished marketing landing page for my idea, with a clear headline, supporting sections, and a call to action.',
  },
  {
    label: 'Useful dashboard',
    icon: LineChartIcon,
    prompt:
      'Create a clear dashboard with useful data visualizations for the key metrics of my project.',
  },
  {
    label: 'Something new',
    icon: SparklesIcon,
    prompt:
      'I have an idea for something new. Ask me what you need to know, then build it.',
  },
];

interface BuilderWelcomeProps {
  status: BuilderConnectionStatus | null;
  runtimeLoading: boolean;
  projectName: string | null;
  projectRepoPath: string | null;
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmitPrompt: (value: string) => void;
  creatingSession: boolean;
  error: string | null;
  onChooseWorkspace: (defaultPath?: string | null) => void;
  onLinkExistingCodeProject: (defaultPath?: string | null) => void;
  projectId: string | null;
  codeProjects: CodeProject[];
  codeProjectsLoading: boolean;
  codeProjectsBusy: boolean;
  indexingId: string | null;
  onOpenCodeProject: (codeProject: CodeProject) => void;
  onOpenTerminal: (codeProject: CodeProject) => void;
  onProvisionCodeProject: (input: {
    name: string;
    source: 'created' | 'clone';
    remoteUrl?: string;
  }) => void;
  onIndexCodeProject: (codeProjectId: string) => void;
}

export function BuilderWelcome({
  status,
  runtimeLoading,
  projectName,
  projectRepoPath,
  prompt,
  onPromptChange,
  onSubmitPrompt,
  creatingSession,
  error,
  onChooseWorkspace,
  onLinkExistingCodeProject,
  projectId,
  codeProjects,
  codeProjectsLoading,
  codeProjectsBusy,
  indexingId,
  onOpenCodeProject,
  onOpenTerminal,
  onProvisionCodeProject,
  onIndexCodeProject,
}: BuilderWelcomeProps) {
  const connected = status?.state === 'connected';
  const canChoose = connected && !runtimeLoading && !creatingSession;

  /**
   * Without a workspace there is nowhere to run the turn, so the submit button
   * stays disabled and the reason is stated under the composer. This is the one
   * place the welcome view explains a blocked action — previously the same fact
   * was implied by a disabled picker with no stated cause.
   */
  const composerReason =
    !runtimeLoading && !connected
      ? status?.state === 'unsupported'
        ? 'Update the local Builder service to continue.'
        : status?.state === 'error'
          ? 'Builder could not connect to the local service.'
          : 'Start the local Builder service to continue.'
      : 'Choose a codebase below, or press Send to confirm one and start building.';

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex min-h-full w-full flex-col items-center justify-center gap-6 px-4 py-12 sm:py-16">
        <div className="text-center">
          <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            What do you want to build?
          </h1>
          <p className="mx-auto mt-2 max-w-md text-balance text-sm text-muted-foreground">
            Describe it and Builder will build it in an isolated worktree for
            you to preview and review.
          </p>
        </div>

        {/* Composer — the page's single primary action, mirroring ChatWelcome.
            The codebase picker sits in the footer beside Submit because it
            qualifies this send rather than being a step to finish first. */}
        <div className="w-full max-w-2xl">
          <ChatInput
            value={prompt}
            onValueChange={onPromptChange}
            onSend={onSubmitPrompt}
            clearOnSend={false}
            disabled={!canChoose}
            tall
            placeholder="Build a landing page, a dashboard, a new feature…"
            beforeSubmit={
              <BuilderCodebasePicker
                canChoose={canChoose}
                projectName={projectName}
                projectRepoPath={projectRepoPath}
                projectId={projectId}
                codeProjects={codeProjects}
                codeProjectsLoading={codeProjectsLoading}
                codeProjectsBusy={codeProjectsBusy || creatingSession}
                indexingId={indexingId}
                onChooseWorkspace={onChooseWorkspace}
                onLinkExistingCodeProject={onLinkExistingCodeProject}
                onOpenCodeProject={onOpenCodeProject}
                onOpenTerminal={onOpenTerminal}
                onProvisionCodeProject={onProvisionCodeProject}
                onIndexCodeProject={onIndexCodeProject}
              />
            }
          />
          <p
            className={cn(
              'mt-2 text-center text-xs',
              canChoose ? 'text-muted-foreground' : 'text-muted-foreground/70',
            )}
          >
            {composerReason}
          </p>
        </div>

        {/* Suggestions seed the composer rather than sending, so the draft is
            always visible and editable before it reaches Builder. */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {SUGGESTIONS.map((item) => (
            <SuggestionChip
              key={item.label}
              icon={item.icon}
              label={item.label}
              onClick={() => onPromptChange(item.prompt)}
            />
          ))}
        </div>

        {error && (
          <p
            role="alert"
            className="w-full max-w-2xl rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs leading-relaxed text-destructive"
          >
            {error}
          </p>
        )}

        {status && !connected && !runtimeLoading && (
          <div
            role="status"
            className="flex w-full max-w-3xl items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-relaxed text-muted-foreground"
          >
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <span>
              {status.state === 'unsupported'
                ? 'The local Builder service needs an update before you can start a session.'
                : status.state === 'error'
                  ? 'Builder could not connect. Check the local service and try again.'
                  : 'Start the local Builder service before choosing a repository.'}
            </span>
          </div>
        )}

        <p className="flex max-w-2xl flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground/70">
          <TrustNote icon={<Code2Icon className="size-3.5" />}>
            Builds in an isolated worktree
          </TrustNote>
          <TrustNote icon={<Globe2Icon className="size-3.5" />}>
            Preview before keeping
          </TrustNote>
          <TrustNote icon={<GitCompareArrowsIcon className="size-3.5" />}>
            Keep or discard from the diff
          </TrustNote>
        </p>

        {/* Recent sessions section */}
        <RecentSessionsSection />
      </div>
    </div>
  );
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function RecentSessionsSection() {
  const {
    sessions,
    worktrees,
    loading,
    restoreSession,
    deleteSession,
    cleanupWorktree,
  } = useBuilderSessionHistory();

  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const orphanedWorktrees = worktrees.filter((w) => w.orphaned);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
        <Loader2Icon className="size-3 animate-spin" />
        <span>Loading history…</span>
      </div>
    );
  }

  if (sessions.length === 0 && orphanedWorktrees.length === 0) return null;

  return (
    <div className="w-full max-w-2xl space-y-4">
      {sessions.length > 0 && (
        <div className="rounded-lg border border-border/40 bg-card/30 p-3">
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">
            Recent sessions
          </h3>
          <div className="space-y-1.5">
            {sessions.slice(0, 5).map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between rounded-md px-2 py-1.5 transition-colors hover:bg-accent/30"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {session.title || session.workspace_name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {session.repo_directory}
                    {session.branch ? ` · ${session.branch}` : ''}
                  </p>
                </div>
                <div className="ml-3 flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground/70">
                    {formatRelativeTime(session.created_at * 1000)}
                  </span>
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[10px] font-medium',
                      session.status === 'detached'
                        ? 'bg-blue-500/10 text-blue-600'
                        : session.status === 'discarded'
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-green-500/10 text-green-600',
                    )}
                  >
                    {session.status}
                  </span>
                  {session.status === 'detached' && (
                    <button
                      type="button"
                      onClick={() => restoreSession(session.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="Restore session"
                    >
                      <ArchiveRestoreIcon className="size-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setDeleteConfirm({
                        id: session.id,
                        title: session.title || session.workspace_name,
                      })
                    }
                    className="rounded p-1 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive"
                    title="Delete session and worktree"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {orphanedWorktrees.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-600">
            <AlertTriangleIcon className="size-3" />
            Orphaned worktrees
          </h3>
          <p className="mb-2 text-xs text-muted-foreground">
            These worktrees are not linked to any active session. Clean them up
            to free disk space.
          </p>
          <div className="space-y-1">
            {orphanedWorktrees.map((wt) => (
              <div
                key={wt.path}
                className="flex items-center justify-between rounded-md px-2 py-1.5 transition-colors hover:bg-accent/30"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-foreground">
                    {wt.path.split('/').pop()}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatSize(wt.sizeBytes)} ·{' '}
                    {formatRelativeTime(wt.ageMs)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => cleanupWorktree(wt.path)}
                  className="ml-2 rounded p-1 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive shrink-0"
                  title="Remove worktree"
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete session?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{' '}
              <span className="font-medium text-foreground">
                {deleteConfirm?.title}
              </span>{' '}
              and remove its isolated worktree. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleteConfirm) {
                  await deleteSession(deleteConfirm.id, true);
                  setDeleteConfirm(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SuggestionChip({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border bg-card/40 px-3 py-1.5',
        'text-xs text-muted-foreground transition-colors',
        'hover:border-primary/40 hover:bg-accent/40 hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span>{label}</span>
    </button>
  );
}

function TrustNote({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-primary/70">{icon}</span>
      <span>{children}</span>
    </span>
  );
}
