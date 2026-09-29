/**
 * components/chat/ToolCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows a tool call's status, input parameters, and result as a dense,
 * minimalist pill matching the agent IDE control surface:
 *   • Single-line collapsed pill: "Run jest on copilot tests finished ❯"
 *   • Natural-language verb mapping for all task & context tools
 *   • Collapsible full parameters, error trace, and terminal output
 *   • Dedicated "Open in Terminal" link for handToTerminal sessions
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Terminal,
  TerminalHeader,
  TerminalTitle,
  TerminalStatus,
  TerminalActions,
  TerminalCopyButton,
  TerminalContent,
} from '@/components/ai-elements/terminal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertCircleIcon,
  ChevronRightIcon,
  Loader2Icon,
  TerminalSquareIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { renderSpecializedTool } from './tool-renderers';

/** Tool names whose output should be rendered in a Terminal component. */
const TERMINAL_TOOLS = new Set(['runShell']);

interface ToolCardProps {
  toolName: string;
  input: Record<string, unknown>;
  output?: unknown;
  errorText?: string;
  state: string;
}

/** Generate a clean, natural-language action summary for the tool call. */
function getFriendlyToolSummary(
  toolName: string,
  input: Record<string, unknown>,
  output?: unknown,
  state?: string,
): { title: string; status: string } {
  const isDone = state === 'output-available';
  const isError =
    state === 'output-error' ||
    (isDone &&
      output != null &&
      typeof output === 'object' &&
      'success' in (output as object) &&
      !(output as { success: boolean }).success);
  const isRunning = state === 'input-streaming' || state === 'input-available';
  const isDenied = state === 'output-denied';

  let title = '';
  switch (toolName) {
    case 'runShell': {
      const cmd = typeof input.command === 'string' ? input.command : '';
      if (cmd.includes('jest')) title = 'Run jest on copilot tests';
      else if (cmd)
        title = `Run ${cmd.length > 40 ? cmd.slice(0, 37) + '…' : cmd}`;
      else title = 'Run shell command';
      break;
    }
    case 'listTasks':
      title = 'Check tasks on board';
      break;
    case 'getTask':
      title = 'Read task details';
      break;
    case 'getFocusStats':
      title = 'Check focus stats & streak';
      break;
    case 'listBlocks':
      title = 'Check scheduled time blocks';
      break;
    case 'createTask': {
      const t = typeof input.title === 'string' ? input.title : '';
      title = t
        ? `Create task "${t.length > 32 ? t.slice(0, 30) + '…' : t}"`
        : 'Create task';
      break;
    }
    case 'createTasks': {
      const count = Array.isArray(input.tasks) ? input.tasks.length : '';
      title = count ? `Create ${count} tasks` : 'Create tasks';
      break;
    }
    case 'createProject': {
      const name = typeof input.name === 'string' ? input.name : '';
      title = name ? `Create project "${name}"` : 'Create project';
      break;
    }
    case 'addSteps':
      title = 'Add breakdown steps to task';
      break;
    case 'scheduleBlock': {
      const t = typeof input.title === 'string' ? input.title : '';
      title = t ? `Block time for "${t}"` : 'Schedule focus block';
      break;
    }
    case 'handToTerminal':
      title = 'Open terminal session';
      break;
    case 'updateTask':
      title = 'Update task';
      break;
    case 'completeTask':
      title = 'Complete task';
      break;
    case 'deleteTask':
      title = 'Delete task';
      break;
    case 'assignTaskToProject':
      title = 'Assign task to project';
      break;
    case 'moveBlock':
      title = 'Reschedule focus block';
      break;
    case 'deleteBlock':
      title = 'Delete focus block';
      break;
    case 'webSearch': {
      const q = typeof input.query === 'string' ? input.query : '';
      title = q
        ? `Search web for "${q.length > 32 ? q.slice(0, 30) + '…' : q}"`
        : 'Search web';
      break;
    }
    case 'fetchUrl':
      title = 'Fetch webpage content';
      break;
    case 'libraryDocs': {
      const q =
        typeof input.query === 'string'
          ? input.query
          : typeof input.library === 'string'
            ? input.library
            : '';
      title = q ? `Look up docs for ${q}` : 'Look up documentation';
      break;
    }
    case 'readFile': {
      const p =
        typeof input.path === 'string' ? input.path.split('/').pop() : '';
      title = p ? `Read ${p}` : 'Read file';
      break;
    }
    case 'listDir':
      title = 'List directory files';
      break;
    case 'searchDocs':
      title = 'Search workspace documents';
      break;
    default:
      title = toolName;
  }

  let status = 'finished';
  if (isRunning) status = 'running…';
  else if (isError) status = 'failed';
  else if (isDenied) status = 'denied';

  return { title, status };
}

export function ToolCard({
  toolName,
  input,
  output,
  errorText,
  state,
}: ToolCardProps) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  const isRunning = state === 'input-streaming' || state === 'input-available';
  const isDenied = state === 'output-denied';
  const isDone = state === 'output-available';
  const isError =
    state === 'output-error' ||
    (isDone &&
      output != null &&
      typeof output === 'object' &&
      'success' in (output as object) &&
      !(output as { success: boolean }).success);

  // ── Purpose-built service tool cards (search, docs, images, audio, …) ────────
  if (isDone && !isError) {
    const specialized = renderSpecializedTool(toolName, output);
    if (specialized) return <>{specialized}</>;
  }

  const { title, status } = getFriendlyToolSummary(
    toolName,
    input,
    output,
    state,
  );

  const sessionId =
    toolName === 'handToTerminal' &&
    output != null &&
    typeof output === 'object' &&
    'sessionId' in (output as object)
      ? String((output as { sessionId: string }).sessionId)
      : null;

  return (
    <div className="w-full rounded-xl border border-border/40 bg-muted/20 transition-colors hover:border-border/70 hover:bg-muted/30">
      {/* Dense pill header row matching the agent status line */}
      <button
        type="button"
        className="group flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-xs"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex min-w-0 items-center gap-2 truncate">
          {isRunning ? (
            <Loader2Icon className="size-3.5 shrink-0 animate-spin text-primary" />
          ) : isError ? (
            <AlertCircleIcon className="size-3.5 shrink-0 text-destructive" />
          ) : (
            <span className="text-muted-foreground/70 group-hover:text-foreground">
              ⚡
            </span>
          )}
          <span className="truncate font-medium text-foreground/90 group-hover:text-foreground">
            {title}
          </span>
          <span
            className={cn(
              'text-[11px] select-none',
              isError
                ? 'font-medium text-destructive'
                : isRunning
                  ? 'text-primary'
                  : 'text-muted-foreground/60',
            )}
          >
            {status}
          </span>
        </div>
        <ChevronRightIcon
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground/50 transition-transform duration-150 group-hover:text-foreground',
            expanded && 'rotate-90 text-foreground',
          )}
        />
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="space-y-2.5 border-t border-border/40 px-3.5 py-2.5 text-xs">
          {sessionId && (
            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/50 p-2">
              <span className="text-muted-foreground">
                Terminal session created
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-6 gap-1.5 text-xs"
                onClick={() => navigate(`/terminal?sessionId=${sessionId}`)}
              >
                <TerminalSquareIcon className="size-3" />
                Open in Terminal
              </Button>
            </div>
          )}

          {/* Shell output (Terminal component) */}
          {TERMINAL_TOOLS.has(toolName) && isDone && (
            <div className="overflow-hidden rounded-lg">
              {(() => {
                const result = output as {
                  success: boolean;
                  output?: string;
                  exitCode?: number | null;
                  error?: string;
                };
                const textOutput = result.output ?? result.error ?? '';
                return (
                  <Terminal output={textOutput} isStreaming={isRunning}>
                    <TerminalHeader>
                      <TerminalTitle>
                        $ {String(input.command ?? toolName)}
                      </TerminalTitle>
                      <TerminalStatus>
                        {result.success ? (
                          <Badge
                            variant="secondary"
                            className="bg-green-500/10 text-xs text-green-600"
                          >
                            exit 0
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">
                            exit {result.exitCode ?? '?'}
                          </Badge>
                        )}
                      </TerminalStatus>
                      <TerminalActions>
                        <TerminalCopyButton />
                      </TerminalActions>
                    </TerminalHeader>
                    <TerminalContent />
                  </Terminal>
                );
              })()}
            </div>
          )}

          {/* Input params */}
          <div>
            <p className="mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
              Input
            </p>
            <pre className="max-h-40 overflow-x-auto rounded-lg bg-background/60 p-2 text-[11px] text-muted-foreground">
              {JSON.stringify(input, null, 2)}
            </pre>
          </div>

          {/* Error */}
          {errorText && (
            <div>
              <p className="mb-1 text-[10px] font-semibold tracking-wider text-destructive uppercase">
                Error
              </p>
              <pre className="overflow-x-auto rounded-lg bg-destructive/10 p-2 text-[11px] text-destructive">
                {errorText}
              </pre>
            </div>
          )}

          {/* Output */}
          {isDone && output != null && !TERMINAL_TOOLS.has(toolName) && (
            <div>
              <p className="mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
                Output
              </p>
              <pre className="max-h-48 overflow-x-auto rounded-lg bg-background/60 p-2 text-[11px] text-muted-foreground">
                {JSON.stringify(output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
