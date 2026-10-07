/**
 * components/builder/BuilderChatPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The Builder coding conversation. Prompt submission stays disabled until a
 * workspace is bound and OpenCode is reachable; the run itself is supervised, so
 * OpenCode's permission requests surface as explicit approval cards rather than
 * being auto-approved.
 *
 * NO PANEL HEADER
 * ───────────────
 * The panel used to open with a 40px "Build with Qeda ⌄" row that restated the
 * page title directly above it, carried a help button that was permanently
 * disabled, and implied a dropdown that does not exist. It earned nothing, so it
 * is gone: the panel is now the conversation plus the composer, and workspace
 * identity lives where it is actually true — the canvas identity bar and the
 * session status card at the top of the activity feed.
 *
 * ONE FOLDER CALL TO ACTION, ONE STATUS LINE
 * ──────────────────────────────────────────
 * "Choose a project folder" used to appear as the empty-state button, the canvas
 * bar button, a 10px line under the composer's Start button, and a fourth
 * wrapping column beside the send button. Now: the empty-state button is the one
 * call to action, and everything the user needs to know before sending is a
 * single non-wrapping line under the composer.
 *
 * THAT LINE IS ALSO THE ONLY SAFETY PROMISE IN THE PANEL
 * ──────────────────────────────────────────────────────
 * "Nothing runs until you send a prompt, and every action needs your approval"
 * appeared in the composer footer, beside the send button, and again in the
 * empty state — while the canvas footer and the change surface said their own
 * versions of it. It is stated here once, in the place a user reads before every
 * single send.
 *
 * TYPE
 * ────
 * `text-xs` (11px) for chrome and labels, `text-sm` (12px) for prose. No
 * arbitrary font sizes anywhere in the Builder.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  ArrowUpIcon,
  CircleAlertIcon,
  CircleDashedIcon,
  CircleHelpIcon,
  FolderGit2Icon,
  ShieldCheckIcon,
  WandSparklesIcon,
} from 'lucide-react';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import type { BuilderModelOption } from '@/main/ipc/channels';

/**
 * The three directions a first build can take. These cards are the panel's
 * only starter affordance — the composer carries no suggestion chips of its
 * own, so the panel never offers the same prompt from two places at once.
 */
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
  models?: BuilderModelOption[];
  selectedModel?: BuilderModelOption | null;
  modelsLoading?: boolean;
  modelSwitching?: boolean;
  modelError?: string | null;
  onChooseWorkspace?: () => void;
  onModelChange?: (key: string) => void;
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

/** How the composer explains itself when sending is possible. */
const SUPERVISED_COPY =
  'Nothing runs until you send a prompt, and every action needs your approval.';
const RUNNING_COPY =
  'Working in the folder you chose — every action still needs your approval.';

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
  models = [],
  selectedModel = null,
  modelsLoading = false,
  modelSwitching = false,
  modelError = null,
  onChooseWorkspace,
  onModelChange,
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

  // One line, three states: why sending is blocked, what a run is doing, or the
  // promise that holds when the composer is idle. It never wraps into a column
  // beside the button — the full text stays available as the title.
  const statusCopy = running
    ? RUNNING_COPY
    : modelError
      ? modelError
      : session && !modelsLoading && models.length === 0
        ? 'No models available. Configure a model in OpenCode.'
        : blockedReason || SUPERVISED_COPY;
  const statusIconNode = running ? (
    <CircleDashedIcon className="size-3 shrink-0 animate-spin text-primary" />
  ) : blockedReason ? (
    <CircleAlertIcon className="size-3 shrink-0" />
  ) : (
    <ShieldCheckIcon className="size-3 shrink-0" />
  );

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
            <ConversationEmptyState className="mx-auto flex w-full max-w-xl flex-1 items-stretch justify-start px-4 pb-5 pt-6 text-left sm:px-5">
              <div className="flex min-h-full w-full flex-col gap-6">
                <div className="flex items-start gap-3">
                  <Avatar className="size-8 shrink-0 rounded-xl border border-primary/20 bg-primary/10 text-primary">
                    <AvatarFallback className="rounded-xl bg-transparent text-primary">
                      <WandSparklesIcon className="size-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 space-y-1 pt-0.5">
                    <p className="text-sm font-semibold tracking-tight">
                      A little idea goes a long way.
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Choose a folder, describe what you want, and watch it get
                      built.
                    </p>
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground/80">
                    <span className="h-px flex-1 bg-border/50" />
                    Pick a direction
                    <span className="h-px flex-1 bg-border/50" />
                  </div>
                  <div className="grid gap-1.5">
                    {STARTER_IDEAS.map((idea) => (
                      <button
                        key={idea.title}
                        type="button"
                        onClick={() => onPromptChange(idea.prompt)}
                        className="group flex items-center gap-3 rounded-lg border border-border/60 bg-card/45 px-3 py-2 text-left transition-colors hover:border-primary/30 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/80 text-sm text-primary transition-colors group-hover:bg-primary/10">
                          {idea.icon}
                        </span>
                        <span className="min-w-0 flex-1 text-sm font-medium">
                          {idea.title}
                        </span>
                        <ArrowUpIcon className="size-3.5 rotate-45 text-muted-foreground/60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Runtime state, then the one folder call to action. */}
                <div className="mt-auto pt-4 text-center">
                  {!runtimeConnected ? (
                    <>
                      <div className="mx-auto mb-2 flex size-9 items-center justify-center rounded-full border border-border/50 bg-card/60 text-muted-foreground">
                        <CircleHelpIcon className="size-4" />
                      </div>
                      <p className="text-sm font-medium">
                        {status?.state === 'unsupported'
                          ? 'Update needed'
                          : status?.state === 'error'
                            ? 'Connection needs attention'
                            : 'Your build starts here'}
                      </p>
                      <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground">
                        {status?.state === 'unsupported'
                          ? 'This OpenCode version is not supported. Update the local service to continue.'
                          : status?.state === 'error'
                            ? 'Qeda could not reach the local service. Check that OpenCode is running and try again.'
                            : 'Start the local OpenCode service to prepare the Builder connection.'}
                      </p>
                    </>
                  ) : (
                    <>
                      {onChooseWorkspace ? (
                        <Button
                          size="sm"
                          className="gap-2"
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
                      ) : (
                        // No picker wired: the only honest thing left is to say
                        // what the next step is.
                        <p className="text-sm font-medium">
                          Choose a project folder
                        </p>
                      )}
                      <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">
                        The folder must be a git repository. Builder runs there
                        and never touches another directory.
                      </p>
                    </>
                  )}
                  {sessionError && (
                    <p
                      role="alert"
                      className="mx-auto mt-2 max-w-xs text-xs text-destructive"
                    >
                      {sessionError}
                    </p>
                  )}
                </div>
              </div>
            </ConversationEmptyState>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="shrink-0 border-t border-border/50 bg-background/90 p-3">
        <div className="mx-auto max-w-xl">
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
                className="min-h-[64px] resize-none px-3.5 pb-2 pt-3 text-sm"
                aria-label="Describe what you want to build"
              />
            </PromptInputBody>
            {/* Model, folder, then Send. Both selections affect the next turn, so
                keep them together at the composer. `justify-between` with a
                shrinking left cluster keeps the footer on one row at this panel
                width — labels truncate before the row wraps. */}
            <PromptInputFooter className="justify-between gap-1.5 px-2.5 pb-2.5">
              <PromptInputTools className="min-w-0 shrink">
                <Select
                  value={
                    selectedModel
                      ? `${selectedModel.providerID}/${selectedModel.id}`
                      : ''
                  }
                  onValueChange={(value) => onModelChange?.(value)}
                  disabled={
                    !session ||
                    modelsLoading ||
                    modelSwitching ||
                    running ||
                    models.length === 0
                  }
                >
                  <SelectTrigger
                    size="sm"
                    aria-label="Select Builder model"
                    title={
                      selectedModel
                        ? `${selectedModel.providerID}/${selectedModel.id}`
                        : 'Choose an OpenCode model'
                    }
                    className="h-7 w-[130px] min-w-0 px-2 text-xs"
                  >
                    <SelectValue
                      placeholder={
                        modelsLoading
                          ? 'Loading models…'
                          : modelSwitching
                            ? 'Switching…'
                            : 'Select model'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent align="start">
                    {models.map((model) => (
                      <SelectItem
                        key={`${model.providerID}/${model.id}`}
                        value={`${model.providerID}/${model.id}`}
                      >
                        {model.name} · {model.providerID}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-w-0 gap-1.5 px-2 text-xs"
                  onClick={onChooseWorkspace}
                  disabled={creatingSession || !onChooseWorkspace}
                  title={
                    workspace
                      ? 'Choose a different project folder.'
                      : 'Choose the git repository Builder should work in.'
                  }
                >
                  {creatingSession ? (
                    <span className="size-3 shrink-0 animate-spin rounded-full border border-current border-t-transparent" />
                  ) : (
                    <FolderGit2Icon className="size-3.5 shrink-0" />
                  )}
                  <span className="truncate">
                    {workspace ? 'Switch folder' : 'Choose folder'}
                  </span>
                </Button>
              </PromptInputTools>
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
            </PromptInputFooter>
          </PromptInput>

          {/* The single line that explains the composer. One row, always —
              never a wrapping column beside the button. */}
          <p
            className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"
            title={statusCopy}
          >
            {statusIconNode}
            <span className="truncate">{statusCopy}</span>
          </p>
        </div>
      </div>
    </section>
  );
}
