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

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircleIcon, BotIcon, TerminalIcon } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { XtermPane, type XtermPaneHandle } from '@/components/terminal/XtermPane';
import { useTerminalSession } from '@/hooks/use-terminal-session';
import { parseComposerInput } from '@/lib/terminal-input';
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
    idle:    { label: 'idle',    cls: 'bg-muted text-muted-foreground border-border' },
    running: { label: 'running', cls: 'bg-sky-900/60 text-sky-300 border-sky-700/40 animate-pulse' },
    done:    { label: 'done',    cls: 'bg-emerald-900/60 text-emerald-300 border-emerald-700/40' },
    error:   { label: 'error',   cls: 'bg-rose-900/60 text-rose-300 border-rose-700/40' },
    shell:   { label: 'shell',   cls: 'bg-violet-900/60 text-violet-300 border-violet-700/40' },
  };
  const cfg = configs[status] ?? configs.idle;
  return (
    <Badge
      variant="outline"
      className={cn('h-5 border font-mono text-[10px] uppercase tracking-wide', cfg.cls)}
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const xtermRef  = useRef<XtermPaneHandle>(null);

  const [mode, setMode] = useState<TerminalMode>('agent');
  const [shellExited, setShellExited] = useState(false);

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
  } = useTerminalSession(sessionId);

  // When a fix is accepted, it goes into the composer rather than straight to
  // the shell — the user still presses Enter. See CommandBlockFix.
  const [draftCommand, setDraftCommand] = useState<string | undefined>();
  const handleUseFix = useCallback((command: string) => {
    setDraftCommand(command);
  }, []);

  // Auto-run goal from ?goal= (set by Tasks "Hand to Agent")
  useEffect(() => {
    const goal = searchParams.get('goal');
    if (goal && sessionId && status === 'idle') {
      setSearchParams({}, { replace: true });
      runGoal(decodeURIComponent(goal));
    }
  }, [sessionId, searchParams, setSearchParams, status, runGoal]);

  // Auto-scroll agent blocks
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [blocks.length, summary]);

  // Focus xterm when switching to shell mode
  useEffect(() => {
    if (mode === 'shell') {
      setTimeout(() => xtermRef.current?.focus(), 50);
    }
  }, [mode]);

  // Reset shell-exited state when switching back to shell mode
  const handleModeChange = useCallback((m: TerminalMode) => {
    setMode(m);
    if (m === 'shell') setShellExited(false);
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
        const session = await window.electron.ipc.invoke<{ id: string }>(
          'terminal:session-create',
          { title: input.length > 50 ? `${input.slice(0, 47)}…` : input },
        );
        navigate(`/terminal/${session.id}`, { replace: true });
        // Replay through this same handler once the session id exists.
        pendingGoalRef.current = input;
      } catch {
        toast.error('Could not create terminal session');
      }
    },
    [sessionId, navigate, runGoal, runCommand],
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
  const isDone    = status === 'done' || status === 'error';
  const isRunning = status === 'running';

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <PageHeader
        crumbs={[{ label: 'Terminal' }]}
        actions={
          <div className="flex items-center gap-2">
            <ModeSwitcher
              mode={mode}
              onChange={handleModeChange}
              disabled={isRunning}
            />
            <StatusBadge status={mode === 'shell' ? 'shell' : status} />
          </div>
        }
      />

      {/* ── Content area ────────────────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden">

        {/* ── Agent Mode ──────────────────────────────────────────────────── */}
        <div className={cn('flex h-full flex-col', mode !== 'agent' && 'hidden')}>
          <ScrollArea className="flex-1">
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
              <div ref={bottomRef} className="h-4" />
            </div>
          </ScrollArea>

          {/* Goal input */}
          <div className="border-t border-border/60 p-3">
            <div className="mx-auto max-w-3xl">
              <TerminalGoalInput
                onSubmit={handleGoalSubmit}
                isRunning={isRunning}
                disabled={isRunning}
                prefill={draftCommand}
              />
            </div>
          </div>
        </div>

        {/* ── Shell Mode ──────────────────────────────────────────────────── */}
        <div className={cn('h-full', mode !== 'shell' && 'hidden')}>
          {mode === 'shell' && !shellExited && (
            <XtermPane
              ref={xtermRef}
              sessionId={sessionId}
              className="h-full"
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
