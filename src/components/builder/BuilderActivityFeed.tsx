/**
 * components/builder/BuilderActivityFeed.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders normalized OpenCode session activity with explicit progress, tools,
 * forms, permissions, and errors. This feed observes a session but does not
 * submit coding turns or imply that a project workspace is isolated.
 *
 * TOOL DISPLAY STRATEGY
 * ─────────────────────
 * Completed tool calls collapse to a single compact row:
 *   <icon> ToolName · key detail
 * Only pending/streaming/failed calls show the full expandable card, because
 * those require the user's attention. This keeps the feed focused on what
 * matters right now rather than burying it in completed history.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useMemo } from 'react';
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  FileCode2Icon,
  FolderSearchIcon,
  GitBranchIcon,
  GlobeIcon,
  SearchIcon,
  ShellIcon,
  TerminalSquareIcon,
  UserIcon,
  WrenchIcon,
} from 'lucide-react';
import { BuilderToolCall } from '@/components/builder/tools/BuilderToolCall';
import type { ToolPart } from '@/components/ai-elements/tool';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import { BuilderFormCard } from '@/components/builder/tools/BuilderFormCard';
import { BuilderPermissionCard } from '@/components/builder/tools/BuilderPermissionCard';
import { Button } from '@/components/ui/button';
import type { BuilderPermissionDecision } from '@/lib/builder-interactions';
import type { BuilderSessionEvent } from '@/lib/builder-session';
import type { BuilderWorkspace } from '@/lib/builder-workspace';

type TimelineItem =
  | { kind: 'user'; key: string; text: string }
  | { kind: 'assistant'; key: string; text: string }
  | {
      kind: 'tool';
      key: string;
      callId: string;
      updates: BuilderSessionEvent[];
    };

interface BuilderActivityFeedProps {
  events: BuilderSessionEvent[];
  error: string | null;
  pendingResponse: string | null;
  workspace?: BuilderWorkspace | null;
  onPermission: (
    requestId: string,
    decision: BuilderPermissionDecision,
  ) => void;
  onDisconnect: () => void;
  onForm: (reply: {
    formId: string;
    answer?: Record<string, string | number | boolean | string[]>;
    cancel?: boolean;
  }) => void;
}

export function BuilderActivityFeed({
  events,
  error,
  pendingResponse,
  workspace = null,
  onPermission,
  onDisconnect,
  onForm,
}: BuilderActivityFeedProps) {
  const messages = useMemo(() => {
    const timeline: TimelineItem[] = [];
    const assistantIndex = new Map<string, number>();
    const toolIndex = new Map<string, number>();
    for (const event of events) {
      if (event.type === 'user-prompt') {
        timeline.push({
          kind: 'user',
          key: `user-${event.eventId}`,
          text: event.text,
        });
        continue;
      }
      if (event.type === 'text-delta') {
        const index = assistantIndex.get(event.messageId);
        const existing = index === undefined ? undefined : timeline[index];
        if (existing?.kind === 'assistant') {
          existing.text += event.delta;
        } else {
          assistantIndex.set(event.messageId, timeline.length);
          timeline.push({
            kind: 'assistant',
            key: `assistant-${event.messageId}`,
            text: event.delta,
          });
        }
        continue;
      }
      if (
        event.type === 'tool-started' ||
        event.type === 'tool-input' ||
        event.type === 'tool-progress' ||
        event.type === 'tool-completed' ||
        event.type === 'tool-failed'
      ) {
        const index = toolIndex.get(event.callId);
        const existing = index === undefined ? undefined : timeline[index];
        if (existing?.kind === 'tool') {
          existing.updates.push(event);
        } else {
          toolIndex.set(event.callId, timeline.length);
          timeline.push({
            kind: 'tool',
            key: `tool-${event.callId}`,
            callId: event.callId,
            updates: [event],
          });
        }
      }
    }
    return timeline;
  }, [events]);

  const status = [...events].reverse().find((event) => event.type === 'status');
  const resolved = new Set(
    events
      .filter((event) => event.type === 'interaction-resolved')
      .map((event) => event.interactionId),
  );
  const activityEvents = events.filter(
    (
      event,
    ): event is Extract<
      BuilderSessionEvent,
      { type: 'permission' | 'form' | 'error' }
    > =>
      (event.type === 'permission' && !resolved.has(event.request.id)) ||
      (event.type === 'form' && !resolved.has(event.form.id)) ||
      event.type === 'error',
  );

  return (
    <div
      className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-5 sm:px-5"
      aria-label="Session activity"
    >
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-card/50 px-3 py-2">
        <div className="flex items-center gap-2 text-[10px]">
          {status?.type === 'status' &&
          (status.status === 'running' || status.status === 'retrying') ? (
            <CircleDashedIcon className="size-3.5 animate-spin text-primary" />
          ) : status?.type === 'status' && status.status === 'failed' ? (
            <AlertCircleIcon className="size-3.5 text-destructive" />
          ) : (
            <CheckCircle2Icon className="size-3.5 text-muted-foreground" />
          )}
          <span className="font-medium">
            {status?.type === 'status'
              ? status.status[0].toUpperCase() + status.status.slice(1)
              : 'Session ready'}
          </span>
          <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
            <GitBranchIcon className="size-3 shrink-0" />
            <span className="truncate">
              {workspace
                ? `${workspace.name}${workspace.branch ? ` \u00b7 ${workspace.branch}` : ''}`
                : 'No workspace bound'}
            </span>
            {workspace?.dirty && (
              <span className="shrink-0 text-amber-600 dark:text-amber-400">
                \u00b7 {workspace.changedFileCount} changed
              </span>
            )}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[9px] text-muted-foreground"
          onClick={onDisconnect}
          title="Disconnects the live feed but does not delete the OpenCode session."
        >
          Disconnect
        </Button>
      </div>
      {status?.type === 'status' && status.message && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-[10px] text-destructive"
        >
          {status.message}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-[11px] text-destructive"
        >
          {error}
        </div>
      )}

      {events.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/70 bg-card/20 px-4 py-8 text-center">
          <WrenchIcon className="mx-auto mb-2 size-4 text-muted-foreground" />
          <p className="text-xs font-medium">Listening for session activity</p>
          <p className="mx-auto mt-1 max-w-sm text-[10px] leading-relaxed text-muted-foreground">
            This session is bound to your workspace. Describe what to build and
            Qeda will ask before it runs anything.
          </p>
        </div>
      )}

      {messages.map((item) => {
        if (item.kind === 'user') {
          return (
            <Message key={item.key} from="user" className="max-w-full">
              <MessageContent className="ml-auto w-fit max-w-full rounded-xl border border-border/50 bg-primary/10 px-3 py-2.5 text-xs leading-relaxed whitespace-pre-wrap">
                <span className="mb-1 flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                  <UserIcon className="size-3" />
                  You
                </span>
                {item.text}
              </MessageContent>
            </Message>
          );
        }
        if (item.kind === 'assistant') {
          return (
            <Message key={item.key} from="assistant" className="max-w-full">
              <MessageContent className="w-full rounded-xl border border-border/50 bg-card/35 px-3 py-2.5 text-xs leading-relaxed whitespace-pre-wrap">
                <MessageResponse
                  isAnimating={
                    status?.type === 'status' &&
                    (status.status === 'running' ||
                      status.status === 'retrying')
                  }
                >
                  {item.text}
                </MessageResponse>
              </MessageContent>
            </Message>
          );
        }
        return (
          <ToolActivity
            key={item.key}
            callId={item.callId}
            updates={item.updates}
          />
        );
      })}

      {activityEvents.map((event) => {
        if (event.type === 'permission') {
          return (
            <BuilderPermissionCard
              key={event.eventId}
              request={event.request}
              submitting={pendingResponse === event.request.id}
              onDecision={(decision) =>
                onPermission(event.request.id, decision)
              }
            />
          );
        }
        if (event.type === 'form') {
          return (
            <BuilderFormCard
              key={event.eventId}
              form={event.form}
              submitting={pendingResponse === event.form.id}
              onSubmit={(answer) => onForm({ formId: event.form.id, answer })}
              onCancel={() => onForm({ formId: event.form.id, cancel: true })}
            />
          );
        }
        return (
          <div
            key={event.eventId}
            role="alert"
            className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-[11px] text-destructive"
          >
            {event.message}
          </div>
        );
      })}
    </div>
  );
}

// ─── Tool activity ──────────────────────────────────────────────────────────

function ToolActivity({
  callId,
  updates,
}: {
  callId: string;
  updates: BuilderSessionEvent[];
}) {
  const started = updates.find((event) => event.type === 'tool-started');
  const completed = [...updates]
    .reverse()
    .find(
      (event) =>
        event.type === 'tool-completed' || event.type === 'tool-failed',
    );
  if (!started || started.type !== 'tool-started') return null;

  const latestInput = [...updates]
    .reverse()
    .find((event) => event.type === 'tool-input');
  const input =
    latestInput?.type === 'tool-input' ? latestInput.input : started.input;

  const isDone = Boolean(completed);
  const isFailed = completed?.type === 'tool-failed';

  // Completed (succeeded) tools → compact single-line summary row.
  if (isDone && !isFailed) {
    return (
      <CompactToolRow
        key={callId}
        name={started.name}
        input={input}
        output={
          completed?.type === 'tool-completed' ? completed.output : undefined
        }
      />
    );
  }

  // Pending / streaming / failed → full expandable card.
  const part: ToolPart =
    completed?.type === 'tool-completed'
      ? {
          type: 'dynamic-tool',
          toolName: started.name,
          toolCallId: callId,
          state: 'output-available',
          input,
          output: completed.output,
        }
      : completed?.type === 'tool-failed'
        ? {
            type: 'dynamic-tool',
            toolName: started.name,
            toolCallId: callId,
            state: 'output-error',
            input,
            errorText: completed.error,
          }
        : {
            type: 'dynamic-tool',
            toolName: started.name,
            toolCallId: callId,
            state: 'input-streaming',
            input,
          };

  return <BuilderToolCall part={part} key={callId} />;
}

// ─── Compact row ─────────────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, typeof WrenchIcon> = {
  bash: TerminalSquareIcon,
  shell: ShellIcon,
  read: FileCode2Icon,
  write: FileCode2Icon,
  edit: FileCode2Icon,
  glob: FolderSearchIcon,
  grep: SearchIcon,
  webfetch: GlobeIcon,
  websearch: GlobeIcon,
  task: CircleDashedIcon,
  question: AlertCircleIcon,
};

/** Returns a small icon JSX node for the compact row — avoids a capitalized
 * variable inside render, which the static-components lint rule flags. */
function renderToolIcon(name: string) {
  const Ic = TOOL_ICONS[name.toLowerCase()] ?? WrenchIcon;
  return <Ic className="size-3 shrink-0 text-muted-foreground/60" />;
}

function compactSummary(name: string, input: unknown, output?: string): string {
  const args = isRecord(input) ? input : {};
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  // Count lines in the output to annotate reads/writes.
  const outputLineCount = output
    ? output.split('\n').filter((l) => l.trim()).length
    : 0;

  switch (name.toLowerCase()) {
    case 'bash':
    case 'shell': {
      const cmd = str(args.command);
      return cmd ? truncate(cmd, 60) : 'Ran shell command';
    }
    case 'read': {
      const file = str(args.filePath ?? args.path ?? args.file);
      return file
        ? `${file}${outputLineCount > 0 ? ` \u00b7 ${outputLineCount} lines` : ''}`
        : 'Read file';
    }
    case 'write': {
      const file = str(args.filePath ?? args.path ?? args.file);
      return file ? file : 'Wrote file';
    }
    case 'edit': {
      const file = str(args.filePath ?? args.path ?? args.file);
      return file ? file : 'Edited file';
    }
    case 'glob': {
      const pattern = str(args.pattern);
      const count = outputLineCount;
      return `${pattern || '**/*'}${count > 0 ? ` \u00b7 ${count} files` : ''}`;
    }
    case 'grep': {
      const pattern = str(args.pattern);
      const count = outputLineCount;
      return `${pattern || 'pattern'}${count > 0 ? ` \u00b7 ${count} matches` : ''}`;
    }
    case 'webfetch': {
      const url = str(args.url);
      return url ? truncate(url, 60) : 'Fetched page';
    }
    case 'websearch': {
      const query = str(args.query);
      return query ? truncate(query, 60) : 'Searched web';
    }
    default:
      return name;
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}\u2026` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Human-readable label for a tool name. */
function toolLabel(name: string): string {
  const labels: Record<string, string> = {
    bash: 'Bash',
    shell: 'Shell',
    read: 'Read',
    write: 'Write',
    edit: 'Edit',
    glob: 'Find files',
    grep: 'Search',
    webfetch: 'Fetch',
    websearch: 'Search web',
    task: 'Subtask',
    question: 'Question',
  };
  return labels[name.toLowerCase()] ?? name;
}

function CompactToolRow({
  name,
  input,
  output,
}: {
  name: string;
  input: unknown;
  output?: string;
}) {
  const label = toolLabel(name);
  const summary = compactSummary(name, input, output);
  const iconNode = renderToolIcon(name);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/30 px-3 py-1.5 text-[11px] text-muted-foreground">
      <CheckCircle2Icon className="size-3 shrink-0 text-emerald-500/70" />
      {iconNode}
      <span className="shrink-0 font-medium text-foreground/70">{label}</span>
      {summary && (
        <>
          <span className="text-muted-foreground/40">&middot;</span>
          <span className="min-w-0 truncate font-mono text-[10px]">
            {summary}
          </span>
        </>
      )}
    </div>
  );
}
