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
import { AcpSessionPanel } from '@/components/terminal/AcpSessionPanel';
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
import {
  DEFAULT_TERMINAL_SETTINGS,
  normalizeTerminalSettings,
  type TerminalSettings,
} from '@/lib/terminal-settings';
import type { TerminalBlock } from '@/main/ipc/channels';
import type {
  AcpSessionSnapshot,
  AcpTerminalEvent,
  CodingCliAvailability,
  CodingCliProvider,
} from '@/lib/terminal-acp';

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
  /** Repository directory for the active project, used for a new session. */
  defaultCwd?: string;
  /** Active project whose repo directory this tab should use by default. */
  projectId?: string | null;
  /** Called when the session title changes. */
  onTitleChange?: (tabId: string, title: string) => void;
  /** Called when the session ID is assigned (after auto-creation). */
  onSessionAssigned?: (tabId: string, sessionId: string) => void;
}

function applyAcpEvent(
  snapshot: AcpSessionSnapshot,
  event: AcpTerminalEvent,
): AcpSessionSnapshot {
  const pendingPermissions =
    event.type === 'permission-request'
      ? [...snapshot.pendingPermissions, event]
      : event.type === 'permission-resolved'
        ? snapshot.pendingPermissions.filter(
            (permission) => permission.requestId !== event.requestId,
          )
        : snapshot.pendingPermissions;
  return {
    ...snapshot,
    status: event.type === 'status' ? event.status : snapshot.status,
    events: [...snapshot.events, event].slice(-600),
    pendingPermissions,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TerminalTab({
  tabId,
  sessionId: initialSessionId,
  mode,
  defaultCwd,
  projectId,
  onTitleChange,
  onSessionAssigned,
}: TerminalTabProps) {
  const xtermRef = useRef<XtermPaneHandle>(null);
  const activePtyIdRef = useRef<string | null>(null);
  const interactiveLaunchStartedRef = useRef(false);
  const restoringInteractivePtyRef = useRef(false);

  const [shellExited, setShellExited] = useState(false);
  const [hasVisitedShell, setHasVisitedShell] = useState(false);
  const [acpAvailability, setAcpAvailability] =
    useState<CodingCliAvailability | null>(null);
  const [terminalSettings, setTerminalSettings] = useState<TerminalSettings>(
    DEFAULT_TERMINAL_SETTINGS,
  );
  const [terminalSettingsReady, setTerminalSettingsReady] = useState(false);
  const [acpSnapshot, setAcpSnapshot] = useState<AcpSessionSnapshot | null>(
    null,
  );
  const acpStartPendingRef = useRef(false);
  const acpEventsBeforeSnapshotRef = useRef<
    Array<{ sessionId: string; event: AcpTerminalEvent }>
  >([]);

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

  const refreshTerminalSettings = useCallback(async () => {
    const snapshot = await window.electron.ipc.invoke<{
      terminal?: Partial<TerminalSettings>;
    }>('settings:get');
    setTerminalSettings(normalizeTerminalSettings(snapshot.terminal));
    setTerminalSettingsReady(true);
    if (mode === 'agent') {
      try {
        const availability =
          await window.electron.ipc.invoke<CodingCliAvailability>(
            'terminal:acp-discover',
          );
        setAcpAvailability(availability);
      } catch {
        toast.error('Could not check for installed coding CLIs');
      }
    }
  }, [mode]);

  useEffect(() => {
    void refreshTerminalSettings().catch(() => {
      setTerminalSettings(DEFAULT_TERMINAL_SETTINGS);
      setTerminalSettingsReady(true);
      toast.error('Could not load Terminal preferences; using defaults.');
    });
  }, [refreshTerminalSettings]);

  useIpcEvent(
    'settings:changed',
    () => {
      void refreshTerminalSettings().catch(() => {
        toast.error('Could not refresh Terminal preferences');
      });
    },
    [refreshTerminalSettings],
  );

  useEffect(() => {
    if (mode !== 'agent' || !sessionId) {
      setAcpSnapshot(null);
      return;
    }

    let cancelled = false;
    void window.electron.ipc
      .invoke<AcpSessionSnapshot | null>('terminal:acp-state', { sessionId })
      .then((snapshot) => {
        if (cancelled || !snapshot) return;
        const earlyEvents = acpEventsBeforeSnapshotRef.current
          .filter((entry) => entry.sessionId === sessionId)
          .map((entry) => entry.event);
        acpEventsBeforeSnapshotRef.current =
          acpEventsBeforeSnapshotRef.current.filter(
            (entry) => entry.sessionId !== sessionId,
          );
        setAcpSnapshot(
          earlyEvents.reduce(
            (current, event) => applyAcpEvent(current, event),
            snapshot,
          ),
        );
      })
      .catch(() => {
        if (!cancelled) toast.error('Could not restore the coding CLI session');
      });

    return () => {
      cancelled = true;
    };
  }, [mode, sessionId]);

  const handleAcpEvent = useCallback(
    (...args: unknown[]) => {
      const payload = args[0] as {
        sessionId: string;
        event: AcpTerminalEvent;
      };
      if (payload.sessionId !== sessionId) return;
      setAcpSnapshot((current) => {
        if (!current) {
          acpEventsBeforeSnapshotRef.current.push(payload);
          return current;
        }
        return applyAcpEvent(current, payload.event);
      });
    },
    [sessionId],
  );
  useIpcEvent('terminal:acp-event', handleAcpEvent, [handleAcpEvent]);

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
    interactiveLaunchStartedRef.current = true;
    restoringInteractivePtyRef.current = false;
    setInteractivePtyCommand(command.trim() || null);
    setLastPtyCommand(null);
  }, []);

  useEffect(() => {
    if (mode !== 'agent' || !sessionId) return;
    let cancelled = false;

    void window.electron.ipc
      .invoke<{ command: string | null }>('pty:session-command', { sessionId })
      .then(({ command }) => {
        if (
          cancelled ||
          interactiveLaunchStartedRef.current ||
          !command
        ) {
          return;
        }
        restoringInteractivePtyRef.current = true;
        setInteractivePtyCommand(command);
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Could not check for a running terminal command');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mode, sessionId]);

  // Context info: cwd & git branch for Warp-style rich prompt
  const [contextInfo, setContextInfo] = useState<{
    cwd?: string;
    gitBranch?: string | null;
    gitRoot?: string | null;
    changedFiles?: number;
    additions?: number;
    deletions?: number;
  }>({});
  const [contextError, setContextError] = useState(false);

  const refreshContext = useCallback(
    (targetCwd?: string) => {
      void window.electron.ipc
        .invoke<{
          cwd: string;
          gitBranch: string | null;
          gitRoot: string | null;
          changedFiles: number;
          additions: number;
          deletions: number;
        }>('terminal:get-context-info', { cwd: targetCwd, projectId })
        .then((info) => {
          setContextInfo(info);
          setContextError(false);
        })
        .catch(() => setContextError(true));
    },
    [projectId],
  );

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
  const workingDirectory = sessionCwd || contextInfo.cwd || defaultCwd;
  useEffect(() => {
    setShellExited(false);
    if (!sessionId) {
      setSessionCwd(undefined);
      refreshContext(defaultCwd);
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
          refreshContext(defaultCwd);
        }
        return undefined;
      })
      .catch(() => {});
  }, [sessionId, refreshContext, defaultCwd]);

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

  // Focus and re-fit xterm after its initial working directory is resolved.
  useEffect(() => {
    if (mode === 'shell' && workingDirectory) {
      setHasVisitedShell(true);
      requestAnimationFrame(() => {
        xtermRef.current?.fit();
        xtermRef.current?.focus();
      });
    }
  }, [mode, workingDirectory]);

  // Agent goal submission
  const pendingGoalRef = useRef<string | null>(null);

  const handleGoalSubmit = useCallback(
    async (input: string) => {
      const intent = parseComposerInput(input);

      if (intent.kind === 'command') {
        if (
          terminalSettings.autoRouteInteractiveCommandsToPty &&
          shouldRouteDirectCommandToPty(input)
        ) {
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
        const cwd = contextInfo.cwd || defaultCwd;
        const folder = cwd
          ? cwd.split('/').filter(Boolean).pop() || ''
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
            cwd,
            project_id: projectId,
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
      defaultCwd,
      projectId,
      tabId,
      onSessionAssigned,
      handleRunInShell,
      terminalSettings.autoRouteInteractiveCommandsToPty,
    ],
  );

  const handleAcpSubmit = useCallback(
    async (provider: CodingCliProvider, prompt: string) => {
      const cwd = contextInfo.cwd || defaultCwd;
      if (!cwd) {
        toast.error('Resolve a project working directory before starting a CLI');
        return false;
      }

      if (acpStartPendingRef.current) return false;
      acpStartPendingRef.current = true;
      const previousSnapshot = acpSnapshot;
      if (!previousSnapshot || previousSnapshot.provider === provider) {
        setAcpSnapshot({
          provider,
          status: 'starting',
          events: previousSnapshot?.events ?? [],
          pendingPermissions: previousSnapshot?.pendingPermissions ?? [],
        });
      }

      try {
        let targetSessionId = sessionId;
        if (!targetSessionId) {
          const folder = cwd.split('/').filter(Boolean).pop() || '';
          const branchSuffix = contextInfo.gitBranch
            ? ` (${contextInfo.gitBranch})`
            : '';
          const shortPrompt =
            prompt.length > 25 ? `${prompt.slice(0, 22)}…` : prompt;
          const session = await window.electron.ipc.invoke<{ id: string }>(
            'terminal:session-create',
            {
              title: `${shortPrompt}${folder ? ` · ${folder}${branchSuffix}` : ''}`,
              goal: prompt,
              cwd,
              project_id: projectId,
            },
          );
          targetSessionId = session.id;
          setSessionId(session.id);
          onSessionAssigned?.(tabId, session.id);
        }

        await window.electron.ipc.invoke('terminal:acp-start', {
          sessionId: targetSessionId,
          provider,
          cwd,
          prompt,
        });
        const snapshot =
          await window.electron.ipc.invoke<AcpSessionSnapshot | null>(
            'terminal:acp-state',
            { sessionId: targetSessionId },
          );
        if (snapshot) {
          const earlyEvents = acpEventsBeforeSnapshotRef.current
            .filter((entry) => entry.sessionId === targetSessionId)
            .map((entry) => entry.event);
          acpEventsBeforeSnapshotRef.current =
            acpEventsBeforeSnapshotRef.current.filter(
              (entry) => entry.sessionId !== targetSessionId,
            );
          setAcpSnapshot(
            earlyEvents.reduce(
              (current, event) => applyAcpEvent(current, event),
              snapshot,
            ),
          );
        }
        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not start the coding CLI';
        if (previousSnapshot && previousSnapshot.provider !== provider) {
          setAcpSnapshot(previousSnapshot);
        } else {
          setAcpSnapshot((current) =>
            current
              ? {
                  ...current,
                  status: message.includes('cancelled') ? 'stopped' : 'error',
                  events: [
                    ...current.events,
                    { type: 'error' as const, message },
                  ].slice(-600),
                }
              : current,
          );
        }
        if (message.includes('cancelled')) toast.info(message);
        else toast.error(message);
        return false;
      } finally {
        acpStartPendingRef.current = false;
      }
    },
    [
      acpSnapshot,
      contextInfo.cwd,
      contextInfo.gitBranch,
      defaultCwd,
      sessionId,
      projectId,
      tabId,
      onSessionAssigned,
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
  const isAcpRunning =
    acpSnapshot?.status === 'starting' || acpSnapshot?.status === 'running';
  const isRunning = status === 'running' || isAcpRunning;
  const runningBlock = blocks.find((block) => block.status === 'running');

  const cancelAcp = useCallback(() => {
    if (!sessionId) return;
    void window.electron.ipc
      .invoke('terminal:acp-cancel', { sessionId })
      .catch(() => toast.error('Could not cancel the coding CLI turn'));
  }, [sessionId]);

  const stopAcp = useCallback(() => {
    if (!sessionId) return;
    void window.electron.ipc
      .invoke('terminal:acp-stop', { sessionId })
      .then(() => setAcpSnapshot((current) =>
        current ? { ...current, status: 'stopped' } : current,
      ))
      .catch(() => toast.error('Could not stop the coding CLI'));
  }, [sessionId]);

  const respondToAcpPermission = useCallback(
    (requestId: string, optionId?: string) => {
      if (!sessionId) return;
      void window.electron.ipc
        .invoke('terminal:acp-permission-response', {
          sessionId,
          requestId,
          optionId,
        })
        .catch(() => toast.error('Could not respond to the permission request'));
    },
    [sessionId],
  );

  const pendingShellCmdRef = useRef<string | null>(null);

  // ─── Render ───────────────────────────────────────────────────────────────

  // Shell mode: render xterm directly
  if (mode === 'shell') {
    return (
      <div className="flex h-full flex-col bg-background text-foreground">
        <div className="h-full">
          {hasVisitedShell &&
            !shellExited &&
            workingDirectory &&
            terminalSettingsReady && (
            <XtermPane
              key={sessionId ?? tabId}
              ref={xtermRef}
              sessionId={sessionId}
              cwd={workingDirectory}
              shell={terminalSettings.shellPath}
              fontSize={terminalSettings.fontSize}
              scrollbackLines={terminalSettings.scrollbackLines}
              replayBufferBytes={terminalSettings.ptyReplayBufferBytes}
              enableShellIntegration={terminalSettings.shellIntegration}
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
          {hasVisitedShell &&
            !shellExited &&
            workingDirectory &&
            !terminalSettingsReady && (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Loading terminal preferences…
              </div>
            )}
          {!shellExited && !workingDirectory && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {contextError ? (
                <div className="flex flex-col items-center gap-2">
                  <p>Could not resolve the terminal working directory.</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => refreshContext(defaultCwd)}
                  >
                    Retry
                  </Button>
                </div>
              ) : (
                'Resolving terminal working directory…'
              )}
            </div>
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

  if (interactivePtyCommand && !workingDirectory) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        {contextError ? (
          <div className="flex flex-col items-center gap-2">
            <p>Could not resolve the terminal working directory.</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => refreshContext(defaultCwd)}
            >
              Retry
            </Button>
          </div>
        ) : (
          'Resolving terminal working directory…'
        )}
      </div>
    );
  }

  if (interactivePtyCommand && !terminalSettingsReady) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        Loading terminal preferences…
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
            cwd={workingDirectory}
            shell={terminalSettings.shellPath}
            fontSize={terminalSettings.fontSize}
            scrollbackLines={terminalSettings.scrollbackLines}
            replayBufferBytes={terminalSettings.ptyReplayBufferBytes}
            enableShellIntegration={terminalSettings.shellIntegration}
            className="h-full"
            onReady={(ptyId) => {
              interactivePtyPtyIdRef.current = ptyId;
              if (restoringInteractivePtyRef.current) {
                restoringInteractivePtyRef.current = false;
                void window.electron.ipc
                  .invoke<{ command: string | null }>(
                    'pty:session-command',
                    { sessionId },
                  )
                  .then(({ command }) => {
                    if (!command) setInteractivePtyCommand(null);
                    return null;
                  })
                  .catch(() => {
                    toast.error('Could not restore the running terminal command');
                  });
                return;
              }
              void window.electron.ipc.invoke('pty:run-command', {
                ptyId,
                command: interactivePtyCommand,
              });
            }}
            onCommandExit={(code) => {
              const command = interactivePtyCommand;
              if (!command) return;
              interactivePtyPtyIdRef.current = null;
              setInteractivePtyCommand(null);
              setLastPtyCommand({ command, exitCode: code });
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
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 overflow-y-auto pb-20"
        >
          <div className="mx-auto max-w-3xl px-4 py-6">
            <AnimatePresence initial={false}>
            {!hasBlocks && !isRunning && !acpSnapshot ? (
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

                {acpSnapshot && (
                  <AcpSessionPanel
                    snapshot={acpSnapshot}
                    onPermissionResponse={respondToAcpPermission}
                    onCancel={cancelAcp}
                    onStop={stopAcp}
                  />
                )}

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
        {plan && (
          <div className="absolute bottom-0 left-0 right-0 z-20 px-4 pb-2 bg-background/80 backdrop-blur-xs">
            <PlanPanel
              plan={plan}
              isRunning={status === 'running'}
              title="Terminal Agent Plan"
              compact
            />
          </div>
        )}
      </div>

      {/* Goal input */}
      <div className="border-t border-border/60 p-3">
        <TerminalGoalInput
          onSubmit={handleGoalSubmit}
          onAcpSubmit={handleAcpSubmit}
          acpAvailability={acpAvailability}
          preferredCodingCli={terminalSettings.preferredCodingCli}
          historyLimit={terminalSettings.historyLimit}
          autoRouteToPty={terminalSettings.autoRouteInteractiveCommandsToPty}
          onRunInShell={handleRunInShell}
          onStop={
            isAcpRunning
              ? cancelAcp
              : runningBlock
                ? () => stop(runningBlock.id)
                : undefined
          }
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
