import { AlertTriangleIcon, BotIcon, LoaderCircleIcon, TerminalIcon } from 'lucide-react';
import type { AcpSessionSnapshot, AcpTerminalEvent } from '@/lib/terminal-acp';
import { Button } from '@/components/ui/button';

interface AcpSessionPanelProps {
  snapshot: AcpSessionSnapshot;
  onPermissionResponse: (requestId: string, optionId?: string) => void;
  onCancel: () => void;
  onStop: () => void;
}

function updateLabel(event: Extract<AcpTerminalEvent, { type: 'update' }>) {
  const { update } = event;
  switch (update.sessionUpdate) {
    case 'agent_message_chunk':
    case 'agent_thought_chunk':
    case 'user_message_chunk':
    case 'session_message_chunk':
      return update.content.type === 'text'
        ? update.content.text
        : `[${update.content.type}]`;
    case 'tool_call':
      return `${update.title} · ${update.status ?? 'started'}`;
    case 'tool_call_update':
      return `${update.title ?? update.name ?? update.toolCallId} · ${update.status ?? 'updated'}`;
    case 'plan':
      return update.entries
        .map((entry) => `${entry.status === 'completed' ? '✓' : '•'} ${entry.content}`)
        .join('\n');
    case 'plan_removed':
      return 'Plan cleared';
    case 'notice':
      return update.description
        ? `${update.title}: ${update.description}`
        : update.title;
    default:
      return update.sessionUpdate.replaceAll('_', ' ');
  }
}

export function AcpSessionPanel({
  snapshot,
  onPermissionResponse,
  onCancel,
  onStop,
}: AcpSessionPanelProps) {
  const isRunning = snapshot.status === 'starting' || snapshot.status === 'running';
  const providerName = {
    opencode: 'OpenCode',
    cline: 'Cline',
    kiro: 'Kiro CLI',
  }[snapshot.provider];

  return (
    <section className="overflow-hidden rounded-lg border border-border/60 bg-card/40">
      <header className="flex items-center justify-between gap-3 border-b border-border/50 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {isRunning ? (
            <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin text-sky-400" />
          ) : (
            <BotIcon className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-xs font-medium">{providerName}</span>
          <span className="text-[11px] text-muted-foreground">
            {snapshot.status}
          </span>
        </div>
        <div className="flex shrink-0 gap-1">
          {isRunning && (
            <Button size="xs" variant="outline" onClick={onCancel}>
              Cancel turn
            </Button>
          )}
          {snapshot.status !== 'stopped' && (
            <Button size="xs" variant="ghost" onClick={onStop}>
              Stop CLI
            </Button>
          )}
        </div>
      </header>

      <div className="border-b border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">
        <div className="flex items-start gap-2">
          <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
          <p>
            This CLI runs with your operating-system account permissions. Review
            every requested action before allowing it.
          </p>
        </div>
      </div>

      <div className="max-h-[min(42vh,420px)] space-y-2 overflow-y-auto p-3">
        {snapshot.events.map((event, index) => {
          if (event.type === 'permission-request') {
            const isPending = snapshot.pendingPermissions.some(
              (permission) => permission.requestId === event.requestId,
            );
            if (!isPending) return null;
            return (
              <div
                key={`${event.requestId}-${index}`}
                className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3"
              >
                <p className="text-xs font-medium text-foreground">
                  Permission requested: {event.title}
                </p>
                <p className="mt-1 break-words font-mono text-[11px] text-muted-foreground">
                  {event.toolCall.title}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {event.options.map((option) => (
                    <Button
                      key={option.optionId}
                      size="xs"
                      onClick={() =>
                        onPermissionResponse(event.requestId, option.optionId)
                      }
                    >
                      {option.name}
                    </Button>
                  ))}
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => onPermissionResponse(event.requestId)}
                  >
                    Deny
                  </Button>
                </div>
              </div>
            );
          }

          if (event.type === 'permission-resolved') return null;

          const text =
            event.type === 'update'
              ? updateLabel(event)
              : event.type === 'status'
                ? event.message ?? `CLI ${event.status}`
                : event.type === 'error'
                  ? event.message
                  : event.text.trim();
          if (!text) return null;

          const isError = event.type === 'error';
          const isLog = event.type === 'log';
          return (
            <div
              key={`${event.type}-${index}`}
              className={`flex gap-2 text-xs leading-relaxed ${
                isError
                  ? 'text-destructive'
                  : isLog
                    ? 'text-muted-foreground/60'
                    : 'text-foreground/90'
              }`}
            >
              {event.type === 'update' ? (
                <BotIcon className="mt-0.5 size-3 shrink-0 text-sky-400" />
              ) : (
                <TerminalIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground/50" />
              )}
              <pre className="min-w-0 whitespace-pre-wrap break-words font-sans">
                {text}
              </pre>
            </div>
          );
        })}
      </div>
    </section>
  );
}
