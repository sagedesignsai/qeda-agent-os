/**
 * components/chat/ToolCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows a tool call's status, input parameters, and result.
 * Uses ai-elements Terminal component for shell output.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
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
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { renderSpecializedTool } from './tool-renderers';

/** Tool names whose output should be rendered in a Terminal component. */
const TERMINAL_TOOLS = new Set(['runShell']);
/** Tool names whose output is file content. */
const FILE_TOOLS = new Set(['readFile', 'writeFile', 'deleteFile', 'listDir']);

interface ToolCardProps {
  toolName: string;
  input: Record<string, unknown>;
  output?: unknown;
  errorText?: string;
  state: string;
}

export function ToolCard({
  toolName,
  input,
  output,
  errorText,
  state,
}: ToolCardProps) {
  const [expanded, setExpanded] = useState(false);

  // AI SDK v7 ToolUIPart states. See MessageList for the approval states that
  // are rendered before this card is reached.
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

  // ── Shell output (Terminal component) ───────────────────────────────────────
  if (TERMINAL_TOOLS.has(toolName) && isDone) {
    const result = output as { success: boolean; output?: string; exitCode?: number | null; error?: string };
    const textOutput = result.output ?? result.error ?? '';
    return (
      <Terminal output={textOutput} isStreaming={isRunning}>
        <TerminalHeader>
          <TerminalTitle>$ {String(input.command ?? toolName)}</TerminalTitle>
          <TerminalStatus>
            {result.success ? (
              <Badge variant="secondary" className="bg-green-500/10 text-green-600 text-xs">
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
  }

  // ── Generic collapsible tool card ────────────────────────────────────────────
  const statusColor = isError
    ? 'text-destructive'
    : isDenied
      ? 'text-muted-foreground'
      : isRunning
        ? 'text-muted-foreground'
        : 'text-green-600 dark:text-green-400';

  const statusLabel = isRunning
    ? 'running…'
    : isError
      ? 'error'
      : isDenied
        ? 'denied'
        : 'done';

  return (
    <div className="rounded-lg border bg-card text-card-foreground text-sm">
      {/* Header row */}
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="font-mono font-medium">{toolName}</span>
        <span className={cn('ml-auto text-xs font-medium', statusColor)}>
          {statusLabel}
        </span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t px-3 pb-3 pt-2 space-y-2">
          {/* Input params */}
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Input
            </p>
            <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(input, null, 2)}
            </pre>
          </div>

          {/* Error */}
          {errorText && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Error
              </p>
              <pre className="overflow-x-auto rounded bg-destructive/10 p-2 text-xs text-destructive">
                {errorText}
              </pre>
            </div>
          )}

          {/* Output */}
          {isDone && output != null && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Output
              </p>
              <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
                {JSON.stringify(output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
