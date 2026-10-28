/**
 * components/terminal/TerminalTab.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A single terminal tab — the core session UI extracted from the Terminal page.
 *
 * Each tab manages its own session (agent or shell mode), blocks, input, and
 * xterm instance. Multiple tabs can coexist in split panes or tab bars.
 *
 * Props drive the session identity; callbacks report state changes back to the
 * parent layout manager (tab bar, panel tree, etc.).
 *
 * No PageHeader — chrome is provided by the parent (tab bar, split controls).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircleIcon } from 'lucide-react';
import { toast } from 'sonner';

import { PlanPanel } from '@/components/plan/PlanPanel';
import { Button } from '@/components/ui/button';
import {
  CommandBlock,
  CommandBlockHeader,
  CommandBlockThought,
  CommandBlockApproval,
  CommandBlockFilterBar,
  CommandBlockOutput,
  CommandBlockExplanation,
  CommandBlockFix,
  CommandBlockFooter,
  CommandBlockSkipped,
  AgentSummary,
} from '@/components/terminal/CommandBlock';
import { TerminalGoalInput } from '@/components/terminal/TerminalGoalInput';
import { TerminalWelcome } from '@/components/terminal/TerminalWelcome';
import {
  XtermPane,
  type XtermPaneHandle,
} from '@/components/terminal/XtermPane';
import { useTerminalSession } from '@/hooks/use-terminal-session';
import { useIpcEvent } from '@/hooks/use-ipc';
import {
  parseComposerInput,
  shouldRouteDirectCommandToPty,
} from '@/lib/terminal-input';
import type { TerminalBlock } from '@/main/ipc/channels';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TerminalMode = 'agent' | 'shell';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface TerminalTabProps {
  /** Stable tab ID for the layout manager. */
  tabId: string;
  /** Session ID — if undefined, a session is created on first input. */
  sessionId?: string;
  /** Fixed mode — the tab always renders in this mode. */
  mode: TerminalMode;
  /** Called when the session title changes. */
  onTitleChange?: (tabId: string, title: string) => void;
  /** Called when the session ID is assigned (after auto-creation). */
  onSessionAssigned?: (tabId: string, sessionId: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TerminalTab({
  tabId,
  sessionId: initialSessionId,
  mode,
  onTitleChange,
  onSessionAssigned,
}: TerminalTabProps) {
  const xtermRef = useRef<XtermPaneHandle>(null);
  const activePtyIdRef = useRef<string | null>(null);

  const [shellExited, setShellExited] = useState(false);
  const [hasVisitedShell, setHasVisitedShell] = useState(false);

  // Track the current session ID — may change if auto-created
  const [sessionId, setSessionId] = useState<string | undefined>(
    initialSessionId,
  );

  const {
    blocks,
    status,
    summary,
    error,
    isExplainingId,
    fixes,
    isFixingId,
    plan,
    runGoal,
    runCommand,
    rerun,
    approve,
    reject,
    explain,
    fix,
    stop,
  } = useTerminalSession(sessionId);

  // When a fix is accepted, it goes into the composer rather than straight to
  // the shell — the user still presses Enter.
  const [draftCommand, setDraftCommand] = useState<string | undefined>();
  const [interactivePtyCommand, setInteractivePtyCommand] = useState<
    string | null
  >(null);
  const [lastPtyCommand, setLastPtyCommand] = useState<{
    command: string;
    exitCode: number | null;
  } | null>(null);
  const interactivePtyPtyIdRef = useRef<string | null>(null);
  const handleUseFix = useCallback((command: string) => {
    setDraftCommand(command);
  }, []);

  const handleRunInShell = useCallback((command: string) => {
    setInteractivePtyCommand(command.trim() || null);
    setLastPtyCommand(null);
  }, []);

  // Context info: cwd & git branch for Warp-style rich prompt
  const [contextInfo, setContextInfo] = useState<{
    cwd?: string;
    gitBranch?: string | null;
    gitRoot?: string | null;
    changedFiles?: number;
    additions?: number;
    deletions?: number;
  }>({});

  const refreshContext = useCallback((targetCwd?: string) => {
    void window.electron.ipc
      .invoke<{
        cwd: string;
        gitBranch: string | null;
        gitRoot: string | null;
        changedFiles: number;
        additions: number;
        deletions: number;
      }>('terminal:get-context-info', { cwd: targetCwd })
      .then((info) => setContextInfo(info))
      .catch(() => {});
  }, []);

  // Update working directory whenever PTY shell reports OSC 7 directory changes
  useIpcEvent('pty:cwd-changed', (...args: unknown[]) => {
    const { ptyId, cwd } = args[0] as { ptyId: string; cwd: string };
    if (ptyId !== activePtyIdRef.current) return;
    refreshContext(cwd);
  });

  // Promote scratchpad to saved session when first command is run in PTY
  useIpcEvent('pty:session-assigned', (...args: unknown[]) => {
    const { sessionId: newSessionId } = args[0] as {
      ptyId: string;
      sessionId: string;
      title: string;
    };
    if (!sessionId) {
      setSessionId(newSessionId);
      onSessionAssigned?.(tabId, newSessionId);
    }
  });

  // Track saved session working directory for fresh shell launches
  const [sessionCwd, setSessionCwd] = useState<string | undefined>();
  useEffect(() => {
    setShellExited(false);
    if (!sessionId) {
      setSessionCwd(undefined);
      refreshContext();
      return;
    }
    void window.electron.ipc
      .invoke<{ id: string; cwd?: string } | null>('terminal:session-get', {
        id: sessionId,
      })
      .then((data) => {
        if (data?.cwd) {
          setSessionCwd(data.cwd);
          refreshContext(data.cwd);
        } else {
          refreshContext();
        }
        return undefined;
      })
      .catch(() => {});
  }, [sessionId, refreshContext]);

  // Report title changes to parent
  useEffect(() => {
    if (sessionId && onTitleChange) {
      void window.electron.ipc
        .invoke<{ id: string; title: string } | null>('terminal:session-get', {
          id: sessionId,
        })
        .then((data) => {
          if (data?.title) {
            onTitleChange(tabId, data.title);
          }
          return undefined;
        })
        .catch(() => {});
    }
  }, [sessionId, blocks.length, status, tabId, onTitleChange]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } =
      scrollContainerRef.current;
    userScrolledUpRef.current = scrollHeight - scrollTop - clientHeight > 80;
  }, []);

  const lastBlock = blocks[blocks.length - 1];
  const lastOutput = lastBlock?.output;
  const lastStatus = lastBlock?.status;

  // Auto-scroll agent blocks smoothly as new blocks arrive or as output streams in
  useEffect(() => {
    if (scrollContainerRef.current && !userScrolledUpRef.current) {
      requestAnimationFrame(() => {
        if (scrollContainerRef.current && !userScrolledUpRef.current) {
          scrollContainerRef.current.scrollTop =
            scrollContainerRef.current.scrollHeight;
        }
      });
    }
  }, [blocks.length, lastOutput, lastStatus, summary]);

  // Focus and re-fit xterm on mount for shell tabs
  useEffect(() => {
    if (mode === 'shell') {
      setHasVisitedShell(true);
      requestAnimationFrame(() => {
        xtermRef.current?.fit();
        xtermRef.current?.focus();
      });
    }
  }, [mode]);

  // Agent goal submission
  const pendingGoalRef = useRef<string | null>(null);

  const handleGoalSubmit = useCallback(
    async (input: string) => {
      const intent = parseComposerInput(input);

      if (intent.kind === 'command') {
        if (shouldRouteDirectCommandToPty(input)) {
          handleRunInShell(intent.command);
          return;
        }
      }

      if (sessionId) {
        if (intent.kind === 'command') runCommand(intent.command);
        else runGoal(intent.text);
        return;
      }

      try {
        const folder = contextInfo.cwd
          ? contextInfo.cwd.split('/').filter(Boolean).pop() || ''
          : '';
        const branchSuffix = contextInfo.gitBranch
          ? ` (${contextInfo.gitBranch})`
          : '';
        const contextSuffix = folder ? ` · ${folder}${branchSuffix}` : '';
        const cmdText = intent.kind === 'command' ? intent.command : input;
        const shortCmd =
          cmdText.length > 25 ? `${cmdText.slice(0, 22)}…` : cmdText;
        const title = `${shortCmd}${contextSuffix}`;

        const session = await window.electron.ipc.invoke<{ id: string }>(
          'terminal:session-create',
          {
            title,
            goal: input,
            cwd: contextInfo.cwd,
          },
        );
        setSessionId(session.id);
        onSessionAssigned?.(tabId, session.id);
        // Replay through this same handler once the session id exists.
        pendingGoalRef.current = input;
      } catch {
        toast.error('Could not create terminal session');
      }
    },
    [
      sessionId,
      runGoal,
      runCommand,
      contextInfo,
      tabId,
      onSessionAssigned,
      handleRunInShell,
    ],
  );

  useEffect(() => {
    if (sessionId && pendingGoalRef.current) {
      const queued = pendingGoalRef.current;
      pendingGoalRef.current = null;
      const intent = parseComposerInput(queued);
      if (intent.kind === 'command') runCommand(intent.command);
      else runGoal(intent.text);
    }
  }, [sessionId, runGoal, runCommand]);

  const hasBlocks = blocks.length > 0;
  const isDone = status === 'done' || status === 'error';
  const isRunning = status === 'running';
  const runningBlock = blocks.find((block) => block.status === 'running');

  const pendingShellCmdRef = useRef<string | null>(null);

  // ─── Render ───────────────────────────────────────────────────────────────

  // Shell mode: render xterm directly
  if (mode === 'shell') {
    return (
      <div className="flex h-full flex-col bg-background text-foreground">
        <div className="h-full">
          {hasVisitedShell && !shellExited && (
            <XtermPane
              key={sessionId ?? tabId}
              ref={xtermRef}
              sessionId={sessionId}
              cwd={sessionCwd || contextInfo.cwd}
              className="h-full"
              onReady={(ptyId) => {
                activePtyIdRef.current = ptyId;
                if (pendingShellCmdRef.current) {
                  const cmd = pendingShellCmdRef.current;
                  pendingShellCmdRef.current = null;
                  void window.electron.ipc.invoke('pty:write', {
                    ptyId,
                    data: cmd + '\n',
                  });
                }
              }}
              onExit={(code) => {
                activePtyIdRef.current = null;
                setShellExited(true);
                toast.info(`Shell exited with code ${code}`);
              }}
            />
          )}
          {shellExited && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground/75">
              <p className="font-sans text-sm">Shell process exited.</p>
              <Button
                size="sm"
                variant="outline"
                className="border-border text-muted-foreground hover:text-foreground"
                onClick={() => setShellExited(false)}
              >
                New shell
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (interactivePtyCommand) {
    return (
      <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border/60 bg-background text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-background/80 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex size-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
            <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/75">
              Interactive shell
            </p>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate font-mono text-[11px] text-muted-foreground/80">
              {contextInfo.cwd
                ? contextInfo.cwd.replace(/^\/home\/[^/]+/, '~')
                : 'shell'}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 border-border/60 text-muted-foreground hover:text-foreground"
              onClick={() => {
                if (interactivePtyPtyIdRef.current) {
                  void window.electron.ipc.invoke('pty:interrupt', {
                    ptyId: interactivePtyPtyIdRef.current,
                  });
                }
              }}
            >
              Stop
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <XtermPane
            key={`pty-${sessionId ?? tabId}-${interactivePtyCommand}`}
            sessionId={sessionId}
            cwd={sessionCwd || contextInfo.cwd}
            className="h-full"
            onReady={(ptyId) => {
              interactivePtyPtyIdRef.current = ptyId;
              void window.electron.ipc.invoke('pty:run-command', {
                ptyId,
                command: interactivePtyCommand,
              });
            }}
            onExit={(code) => {
              const command = interactivePtyCommand;
              interactivePtyPtyIdRef.current = null;
              setInteractivePtyCommand(null);
              setLastPtyCommand({ command, exitCode: code });
            }}
          />
        </div>
      </div>
    );
  }

  if (lastPtyCommand) {
    return (
      <div className="flex h-full items-center justify-center bg-background px-4 py-6 text-foreground">
        <div className="w-full max-w-xl rounded-xl border border-border/60 bg-card/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="font-sans text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70">
              Interactive command
            </div>
            <div className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
              exit {lastPtyCommand.exitCode ?? 'unknown'}
            </div>
          </div>
          <p className="mb-4 font-mono text-sm text-foreground/90">
            {lastPtyCommand.command}
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLastPtyCommand(null)}
            >
              Dismiss
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setInteractivePtyCommand(lastPtyCommand.command)}
            >
              Re-run in PTY
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Agent mode: render blocks + goal input
  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto"
      >
        <div className="mx-auto max-w-3xl px-4 py-6">
          {plan && (
            <div className="sticky top-0 z-20 mb-4 bg-background/80 backdrop-blur-xs">
              <PlanPanel
                plan={plan}
                isRunning={status === 'running'}
                title="Terminal Agent Plan"
              />
            </div>
          )}
          <AnimatePresence initial={false}>
            {!hasBlocks && !isRunning ? (
              <motion.div
                key="welcome"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <TerminalWelcome />
              </motion.div>
            ) : (
              <div className="flex flex-col gap-3">
                {blocks.map((block: TerminalBlock) => (
                  <CommandBlock
                    key={block.id}
                    block={block}
                    onApprove={() => approve(block.id)}
                    onReject={() => reject(block.id)}
                    onExplain={() => explain(block.id)}
                    isExplaining={isExplainingId === block.id}
                    onRerun={() => rerun(block.id)}
                    onStop={() => stop(block.id)}
                    onFix={() => fix(block.id)}
                    fix={fixes[block.id]}
                    isFixing={isFixingId === block.id}
                    onUseFix={handleUseFix}
                  >
                    {block.status === 'skipped' ? (
                      <>
                        <CommandBlockHeader />
                        <CommandBlockSkipped />
                      </>
                    ) : (
                      <>
                        <CommandBlockHeader />
                        <CommandBlockThought />
                        <CommandBlockApproval />
                        <CommandBlockFilterBar />
                        <CommandBlockOutput />
                        <CommandBlockFix />
                        <CommandBlockExplanation />
                        <CommandBlockFooter />
                      </>
                    )}
                  </CommandBlock>
                ))}

                <AnimatePresence>
                  {isDone && summary && (
                    <AgentSummary key="summary" summary={summary} />
                  )}
                  {status === 'error' && error && (
                    <motion.div
                      key="error"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-start gap-2 rounded-xl border border-rose-800/40 bg-rose-950/30 px-4 py-3 font-sans text-sm text-rose-300"
                    >
                      <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
                      <div>
                        <p className="font-medium">Agent error</p>
                        <p className="mt-0.5 text-rose-400/80">{error}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </AnimatePresence>
          <div className="h-4" />
        </div>
      </div>

      {/* Goal input */}
      <div className="border-t border-border/60 p-3">
        <TerminalGoalInput
          onSubmit={handleGoalSubmit}
          onRunInShell={handleRunInShell}
          onStop={runningBlock ? () => stop(runningBlock.id) : undefined}
          isRunning={isRunning}
          disabled={isRunning}
          prefill={draftCommand}
          cwd={contextInfo.cwd}
          gitBranch={contextInfo.gitBranch}
          gitRoot={contextInfo.gitRoot}
          changedFiles={contextInfo.changedFiles}
          additions={contextInfo.additions}
          deletions={contextInfo.deletions}
          onCwdChange={(cwd) => {
            setContextInfo((current) => ({ ...current, cwd }));
            setSessionCwd(cwd);
            if (sessionId) {
              void window.electron.ipc.invoke('terminal:set-session-cwd', {
                sessionId,
                cwd,
              });
            }
            refreshContext(cwd);
          }}
        />
      </div>
    </div>
  );
}
