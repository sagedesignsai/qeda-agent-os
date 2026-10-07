/**
 * pages/Terminal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Vellum terminal page — two modes behind a toggle in the header:
 *
 *   Agent Mode  (default)
 *     Goal-driven shell agent. Type a natural-language goal, the AI plans
 *     and runs commands with per-command approval. Uses CommandBlock UI.
 *
 *   Shell Mode
 *     Raw interactive PTY via node-pty + xterm.js. A real terminal emulator
 *     — no AI in the loop, full interactivity (vim, htop, ssh, etc.).
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────┐
 *   │  PageHeader  [Agent | Shell]  status badge      │
 *   ├─────────────────────────────────────────────────┤
 *   │  Agent: block stream + TerminalGoalInput        │
 *   │  Shell:  XtermPane (fills remaining height)     │
 *   └─────────────────────────────────────────────────┘
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertCircleIcon,
  BotIcon,
  ExternalLinkIcon,
  SquareIcon,
  TerminalIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
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
import { useProjectScope } from '@/hooks/use-project-scope';
import { ProjectScopeChip } from '@/components/projects/ProjectScopeChip';
import { useIpcEvent } from '@/hooks/use-ipc';
import { extractLocalhostUrls, parseComposerInput } from '@/lib/terminal-input';
import { cn } from '@/lib/utils';
import type { TerminalBlock } from '@/main/ipc/channels';

// ─── Mode toggle ──────────────────────────────────────────────────────────────

type TerminalMode = 'agent' | 'shell';

interface ModeSwitcherProps {
  mode: TerminalMode;
  onChange: (m: TerminalMode) => void;
  disabled?: boolean;
}

function ModeSwitcher({ mode, onChange, disabled }: ModeSwitcherProps) {
  return (
    <div className="flex items-center rounded-lg border border-border/60 bg-card p-0.5">
      {(['agent', 'shell'] as TerminalMode[]).map((m) => {
        const Icon = m === 'agent' ? BotIcon : TerminalIcon;
        const active = mode === m;
        return (
          <Button
            key={m}
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => onChange(m)}
            className={cn(
              'h-6 gap-1.5 rounded-md px-2.5 text-[11px] font-medium capitalize transition-all',
              active
                ? 'bg-accent text-foreground shadow-sm'
                : 'text-muted-foreground/75 hover:text-muted-foreground',
            )}
          >
            <Icon className="size-3" />
            {m}
          </Button>
        );
      })}
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; cls: string }> = {
    idle: {
      label: 'idle',
      cls: 'bg-muted text-muted-foreground border-border',
    },
    running: {
      label: 'running',
      cls: 'bg-sky-900/60 text-sky-300 border-sky-700/40 animate-pulse',
    },
    done: {
      label: 'done',
      cls: 'bg-emerald-900/60 text-emerald-300 border-emerald-700/40',
    },
    error: {
      label: 'error',
      cls: 'bg-rose-900/60 text-rose-300 border-rose-700/40',
    },
    shell: {
      label: 'shell',
      cls: 'bg-violet-900/60 text-violet-300 border-violet-700/40',
    },
  };
  const cfg = configs[status] ?? configs.idle;
  return (
    <Badge
      variant="outline"
      className={cn(
        'h-5 border font-mono text-[10px] uppercase tracking-wide',
        cfg.cls,
      )}
    >
      {cfg.label}
    </Badge>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Terminal() {
  const { sessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    projectId,
    project,
    projectName,
    clear: clearProjectScope,
    withScope,
  } = useProjectScope();
  const bottomRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XtermPaneHandle>(null);

  const [mode, setMode] = useState<TerminalMode>('agent');
  const [shellExited, setShellExited] = useState(false);
  const [hasVisitedShell, setHasVisitedShell] = useState(false);

  const {
    blocks,
    status,
    summary,
    error,
    isExplainingId,
    fixes,
    isFixingId,
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
  // the shell — the user still presses Enter. See CommandBlockFix.
  const [draftCommand, setDraftCommand] = useState<string | undefined>();
  const handleUseFix = useCallback((command: string) => {
    setDraftCommand(command);
  }, []);

  // Context info: cwd & git branch for Warp-style rich prompt (Pillar 2)
  const [contextInfo, setContextInfo] = useState<{
    cwd?: string;
    gitBranch?: string | null;
  }>({});

  const refreshContext = useCallback((targetCwd?: string) => {
    void window.electron.ipc
      .invoke<{ cwd: string; gitBranch: string | null }>(
        'terminal:get-context-info',
        {
          cwd: targetCwd,
        },
      )
      .then((info) => setContextInfo(info))
      .catch(() => {});
  }, []);

  // A project-scoped session starts in the project's repo when it has one.
  useEffect(() => {
    refreshContext(project?.repo_path ?? undefined);
  }, [refreshContext, project?.repo_path]);

  // Update working directory whenever PTY shell reports OSC 7 directory changes
  useIpcEvent('pty:cwd-changed', (...args: unknown[]) => {
    const { cwd } = args[0] as { cwd: string };
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
      navigate(withScope(`/terminal/${newSessionId}`), { replace: true });
    }
  });

  // Track saved session working directory for fresh shell launches
  const [sessionCwd, setSessionCwd] = useState<string | undefined>();
  useEffect(() => {
    setShellExited(false);
    if (!sessionId) {
      setSessionCwd(undefined);
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
        }
      })
      .catch(() => {});
  }, [sessionId, refreshContext]);

  // Auto-run goal from ?goal= (set by Tasks "Hand to Agent")
  useEffect(() => {
    const goal = searchParams.get('goal');
    if (goal && sessionId && status === 'idle') {
      // Drop only `goal`; the project scope must survive.
      const next = new URLSearchParams(searchParams);
      next.delete('goal');
      setSearchParams(next, { replace: true });
      runGoal(decodeURIComponent(goal));
    }
  }, [sessionId, searchParams, setSearchParams, status, runGoal]);

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

  // Focus and re-fit xterm when switching to shell mode
  useEffect(() => {
    if (mode === 'shell') {
      setHasVisitedShell(true);
      requestAnimationFrame(() => {
        xtermRef.current?.fit();
        xtermRef.current?.focus();
      });
    }
  }, [mode]);

  // Reset shell-exited state when switching back to shell mode
  const handleModeChange = useCallback((m: TerminalMode) => {
    setMode(m);
    if (m === 'shell') {
      setHasVisitedShell(true);
      setShellExited(false);
    }
  }, []);

  // Agent goal submission
  const pendingGoalRef = useRef<string | null>(null);

  const handleGoalSubmit = useCallback(
    async (input: string) => {
      const intent = parseComposerInput(input);

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
            // A project's repo wins over the ambient working directory.
            cwd: project?.repo_path || contextInfo.cwd,
            project_id: projectId ?? null,
          },
        );
        navigate(withScope(`/terminal/${session.id}`), { replace: true });
        // Replay through this same handler once the session id exists.
        pendingGoalRef.current = input;
      } catch {
        toast.error('Could not create terminal session');
      }
    },
    [
      sessionId,
      navigate,
      runGoal,
      runCommand,
      contextInfo,
      project,
      projectId,
      withScope,
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

  const runningBlock = useMemo(
    () => blocks.find((b) => b.status === 'running'),
    [blocks],
  );
  const runningUrls = useMemo(
    () =>
      runningBlock?.output ? extractLocalhostUrls(runningBlock.output) : [],
    [runningBlock?.output],
  );

  const pendingShellCmdRef = useRef<string | null>(null);

  const handleRunInShell = useCallback((cmd: string) => {
    setMode('shell');
    setHasVisitedShell(true);
    setShellExited(false);

    requestAnimationFrame(() => {
      xtermRef.current?.fit();
      xtermRef.current?.focus();
      const ptyId = xtermRef.current?.ptyId;
      if (ptyId) {
        void window.electron.ipc.invoke('pty:write', {
          ptyId,
          data: cmd + '\n',
        });
      } else {
        pendingShellCmdRef.current = cmd;
      }
    });
  }, []);

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <PageHeader
        crumbs={[
          { label: 'Terminal' },
          ...(projectName ? [{ label: projectName }] : []),
        ]}
        meta={
          <ProjectScopeChip name={projectName} onClear={clearProjectScope} />
        }
        actions={
          <>
            {/* Long-running service readout: hides below lg so it never squeezes
                the mode switcher on a narrow window. */}
            {runningBlock && (
              <div className="hidden items-center gap-2 rounded-full border border-sky-500/30 bg-sky-950/40 px-2.5 py-1 text-xs text-sky-200 lg:flex">
                <span className="size-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span
                  className="font-mono text-[11px] font-medium text-sky-300 truncate max-w-[140px]"
                  title={runningBlock.command}
                >
                  {runningBlock.command}
                </span>
                {runningUrls.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      void window.electron.ipc.invoke('terminal:open-url', {
                        url: runningUrls[0],
                      })
                    }
                    className="inline-flex items-center gap-1 rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-mono text-sky-200 hover:bg-sky-500/30 transition-colors cursor-pointer"
                    title={`Open ${runningUrls[0]}`}
                  >
                    {runningUrls[0].replace(/^https?:\/\//, '')}
                    <ExternalLinkIcon className="size-2.5 text-sky-400" />
                  </button>
                )}
                <Button
                  type="button"
                  size="xs"
                  variant="destructive"
                  className="h-5 px-1.5 text-[10px] bg-rose-600/90 hover:bg-rose-500 text-white"
                  onClick={() => stop(runningBlock.id)}
                  title="Stop running service"
                >
                  <SquareIcon className="size-2 fill-current" />
                  Stop
                </Button>
              </div>
            )}
            {/* Mode is the primary control, so it stays inline as the nav slot
                rather than an action — see the `nav` contract in PageHeader. */}
            <ModeSwitcher
              mode={mode}
              onChange={handleModeChange}
              disabled={isRunning}
            />
            <StatusBadge status={mode === 'shell' ? 'shell' : status} />
          </>
        }
      />

      {/* ── Content area ────────────────────────────────────────────────────── */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {/* ── Agent Mode ──────────────────────────────────────────────────── */}
        <div
          className={cn(
            'flex h-full flex-col min-h-0',
            mode !== 'agent' && 'hidden',
          )}
        >
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 min-h-0 overflow-y-auto"
          >
            <div className="mx-auto max-w-3xl px-4 py-6">
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
                        onRunInShell={handleRunInShell}
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
            <div className="mx-auto max-w-3xl">
              <TerminalGoalInput
                onSubmit={handleGoalSubmit}
                onRunInShell={handleRunInShell}
                isRunning={isRunning}
                disabled={isRunning}
                prefill={draftCommand}
                cwd={contextInfo.cwd}
                gitBranch={contextInfo.gitBranch}
              />
            </div>
          </div>
        </div>

        {/* ── Shell Mode ──────────────────────────────────────────────────── */}
        <div className={cn('h-full', mode !== 'shell' && 'hidden')}>
          {hasVisitedShell && !shellExited && (
            <XtermPane
              key={sessionId ?? 'scratch'}
              ref={xtermRef}
              sessionId={sessionId}
              cwd={sessionCwd || contextInfo.cwd}
              className="h-full"
              onReady={(ptyId) => {
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
                setShellExited(true);
                toast.info(`Shell exited with code ${code}`);
              }}
            />
          )}
          {shellExited && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground/75">
              <TerminalIcon className="size-8 opacity-30" />
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
    </div>
  );
}
