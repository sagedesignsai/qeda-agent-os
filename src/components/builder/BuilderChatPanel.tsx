/**
 * components/builder/BuilderChatPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The Builder coding conversation. Prompt submission stays disabled until a
 * workspace is bound and OpenCode is reachable; the run itself is supervised, so
 * OpenCode's permission requests surface as explicit approval cards rather than
 * being auto-approved.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  AlertTriangleIcon,
  ArrowUpIcon,
  BotIcon,
  ChevronDownIcon,
  CircleHelpIcon,
  FolderGit2Icon,
  GitBranchIcon,
  SparklesIcon,
  WandSparklesIcon,
} from 'lucide-react';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BuilderActivityFeed } from '@/components/builder/BuilderActivityFeed';
import type { BuilderPermissionDecision } from '@/lib/builder-interactions';
import type {
  BuilderSessionEvent,
  BuilderSessionSummary,
} from '@/lib/builder-session';
import type { BuilderWorkspace } from '@/lib/builder-workspace';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import type { BuilderConnectionStatus } from '@/lib/builder-types';

const STARTER_IDEAS = [
  {
    icon: '✳',
    title: 'A launch page for my idea',
    prompt: 'Build a polished launch page for my idea',
  },
  {
    icon: '▦',
    title: 'A dashboard with real data',
    prompt: 'Create a clean dashboard with useful data visualizations',
  },
  {
    icon: '◈',
    title: 'A portfolio that feels like me',
    prompt: 'Design a distinctive portfolio site with a strong visual identity',
  },
];

const PROMPT_STARTERS = [
  'Build a polished landing page',
  'Create a dashboard with useful data visualizations',
  'Design a distinctive portfolio',
  'Make a task tracker',
];

interface BuilderChatPanelProps {
  status: BuilderConnectionStatus | null;
  prompt: string;
  onPromptChange: (value: string) => void;
  workspace?: BuilderWorkspace | null;
  session?: BuilderSessionSummary | null;
  events?: BuilderSessionEvent[];
  creatingSession?: boolean;
  running?: boolean;
  sessionError?: string | null;
  pendingResponse?: string | null;
  onChooseWorkspace?: () => void;
  onSend?: (text: string) => void;
  onAbort?: () => void;
  onDisconnectSession?: () => void;
  onPermissionDecision?: (
    requestId: string,
    decision: BuilderPermissionDecision,
  ) => void;
  onFormReply?: (reply: {
    formId: string;
    answer?: Record<string, string | number | boolean | string[]>;
    cancel?: boolean;
  }) => void;
}

export function BuilderChatPanel({
  status,
  prompt,
  onPromptChange,
  workspace = null,
  session = null,
  events = [],
  creatingSession = false,
  running = false,
  sessionError = null,
  pendingResponse = null,
  onChooseWorkspace,
  onSend,
  onAbort,
  onDisconnectSession = () => undefined,
  onPermissionDecision = () => undefined,
  onFormReply = () => undefined,
}: BuilderChatPanelProps) {
  const runtimeConnected = status?.state === 'connected';
  const canSend =
    runtimeConnected &&
    !!session &&
    prompt.trim().length > 0 &&
    !creatingSession;
  const blockedReason = !runtimeConnected
    ? status?.state === 'unsupported'
      ? 'Update OpenCode to continue'
      : status?.state === 'error'
        ? 'Check the local connection'
        : 'Waiting for the local agent'
    : !session
      ? 'Choose a project folder first'
      : '';

  const handleSubmit = () => {
    const text = prompt.trim();
    if (!canSend || !text) return;
    onSend?.(text);
    onPromptChange('');
  };

  return (
    <section
      className="flex h-full min-h-0 flex-col bg-background"
      aria-label="Builder conversation"
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border/50 px-3">
        <div className="flex items-center gap-2 text-[11px] font-medium">
          <SparklesIcon className="size-3.5 text-primary" />
          <span>Build with Qeda</span>
          <ChevronDownIcon className="size-3 text-muted-foreground" />
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Builder help"
          disabled
        >
          <CircleHelpIcon />
        </Button>
      </div>

      <Conversation className="flex-1">
        <ConversationContent className="min-h-full p-0">
          {session ? (
            <BuilderActivityFeed
              events={events}
              error={sessionError}
              pendingResponse={pendingResponse}
              workspace={workspace}
              onPermission={onPermissionDecision}
              onDisconnect={onDisconnectSession}
              onForm={onFormReply}
            />
          ) : (
            <ConversationEmptyState className="mx-auto flex w-full max-w-xl flex-1 items-stretch justify-start px-4 pb-5 pt-8 text-left sm:px-5">
              <div className="flex min-h-full w-full flex-col">
                <div className="mb-7 flex items-start gap-3">
                  <Avatar className="size-8 rounded-xl border border-primary/20 bg-primary/10 text-primary">
                    <AvatarFallback className="rounded-xl bg-transparent text-primary">
                      <WandSparklesIcon className="size-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 space-y-2 pt-0.5">
                    <p className="text-sm font-semibold tracking-tight">
                      A little idea goes a long way.
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Pick a folder, describe what you want to make, and review
                      every change before it stays.
                    </p>
                  </div>
                </div>

                <div className="mb-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">
                  <span className="h-px flex-1 bg-border/50" />
                  Pick a direction
                  <span className="h-px flex-1 bg-border/50" />
                </div>
                <div className="grid gap-2">
                  {STARTER_IDEAS.map((idea) => (
                    <button
                      key={idea.title}
                      type="button"
                      onClick={() => onPromptChange(idea.prompt)}
                      className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card/45 px-3 py-2.5 text-left transition-colors hover:border-primary/30 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted/80 text-sm text-primary transition-colors group-hover:bg-primary/10">
                        {idea.icon}
                      </span>
                      <span className="min-w-0 flex-1 text-xs font-medium">
                        {idea.title}
                      </span>
                      <ArrowUpIcon className="size-3.5 rotate-45 text-muted-foreground/60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                    </button>
                  ))}
                </div>

                <div className="mt-auto pt-8 text-center">
                  <div className="mx-auto mb-2 flex size-9 items-center justify-center rounded-full border border-border/50 bg-card/60 text-muted-foreground">
                    {runtimeConnected ? (
                      <BotIcon className="size-4" />
                    ) : (
                      <CircleHelpIcon className="size-4" />
                    )}
                  </div>
                  <p className="text-[11px] font-medium">
                    {runtimeConnected
                      ? 'Choose a project folder'
                      : status?.state === 'unsupported'
                        ? 'Update needed'
                        : status?.state === 'error'
                          ? 'Connection needs attention'
                          : 'Your build starts here'}
                  </p>
                  <p className="mx-auto mt-1 max-w-xs text-[10px] leading-relaxed text-muted-foreground">
                    {runtimeConnected
                      ? 'Builder scopes every change to the git repository you choose, so runs stay reviewable and reversible.'
                      : status?.state === 'unsupported'
                        ? 'This OpenCode version is not supported. Update the local service to continue.'
                        : status?.state === 'error'
                          ? 'Qeda could not reach the local service. Check that OpenCode is running and try again.'
                          : 'Start the local OpenCode service to prepare the Builder connection.'}
                  </p>
                  {sessionError && (
                    <p
                      role="alert"
                      className="mx-auto mt-2 max-w-xs text-[10px] text-destructive"
                    >
                      {sessionError}
                    </p>
                  )}
                  {runtimeConnected && onChooseWorkspace && (
                    <>
                      <Button
                        size="sm"
                        className="mt-4 gap-2"
                        onClick={onChooseWorkspace}
                        disabled={creatingSession}
                      >
                        {creatingSession ? (
                          <span className="size-3 animate-spin rounded-full border border-current border-t-transparent" />
                        ) : (
                          <FolderGit2Icon className="size-3.5" />
                        )}
                        {creatingSession
                          ? 'Preparing workspace…'
                          : 'Choose project folder'}
                      </Button>
                      <p className="mx-auto mt-2 max-w-xs text-[9px] leading-relaxed text-muted-foreground/70">
                        The folder must be a git repository. Builder runs there
                        and never touches another directory.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </ConversationEmptyState>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="shrink-0 border-t border-border/50 bg-background/90 p-3 sm:p-4">
        <div className="mx-auto max-w-xl">
          {workspace && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[9px] text-muted-foreground">
              <Badge
                variant="outline"
                className="h-5 gap-1 border-border/70 px-1.5 font-normal"
              >
                <GitBranchIcon className="size-3" />
                {workspace.branch ?? 'detached'}
              </Badge>
              <span className="truncate font-mono">{workspace.directory}</span>
              {workspace.dirty && (
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <AlertTriangleIcon className="size-3" />
                  {workspace.changedFileCount} uncommitted
                </span>
              )}
            </div>
          )}
          <PromptInput
            onSubmit={() => handleSubmit()}
            className="rounded-2xl border border-border/70 bg-card shadow-sm transition-colors focus-within:border-primary/40 focus-within:shadow-md focus-within:shadow-primary/5"
          >
            <PromptInputBody>
              <PromptInputTextarea
                value={prompt}
                onChange={(event) => onPromptChange(event.target.value)}
                placeholder={
                  session
                    ? 'Describe the next change…'
                    : 'Draft your build idea…'
                }
                className="min-h-[72px] resize-none px-3.5 pb-2 pt-3 text-xs"
                aria-label="Describe what you want to build"
              />
            </PromptInputBody>
            <PromptInputFooter className="justify-between px-2.5 pb-2.5">
              <PromptInputTools className="flex-wrap gap-y-1">
                {PROMPT_STARTERS.map((starter) => (
                  <Button
                    key={starter}
                    size="sm"
                    variant="outline"
                    className="h-6 max-w-full truncate rounded-full border-border/60 px-2 text-[10px] font-normal text-muted-foreground hover:text-foreground"
                    onClick={() => onPromptChange(starter)}
                  >
                    {starter}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 gap-1 px-2 text-[10px] text-muted-foreground"
                  disabled
                  title="Agent selection will be available after sessions are connected."
                >
                  <SparklesIcon className="size-3" />
                  Agent
                  <ChevronDownIcon className="size-3" />
                </Button>
              </PromptInputTools>
              <div className="flex items-center gap-2">
                <span className="hidden text-[10px] text-muted-foreground/70 sm:inline">
                  {running
                    ? 'Building — every tool use needs your approval'
                    : blockedReason}
                </span>
                <PromptInputSubmit
                  className="size-7 rounded-lg"
                  status={running ? 'streaming' : 'ready'}
                  onStop={onAbort}
                  disabled={!running && !canSend}
                  aria-label={running ? 'Stop build' : 'Send prompt'}
                  title={
                    running
                      ? 'Stop the in-flight build.'
                      : !session
                        ? 'Choose a project folder before sending a prompt.'
                        : 'Send this prompt to Builder.'
                  }
                />
              </div>
            </PromptInputFooter>
          </PromptInput>
          <p className="mt-2 text-center text-[9px] leading-relaxed text-muted-foreground/70">
            {running
              ? 'OpenCode is working in your chosen folder. Approve or deny each action as it appears.'
              : 'Nothing runs until you send a prompt, and every action needs your approval.'}
          </p>
        </div>
      </div>
    </section>
  );
}
