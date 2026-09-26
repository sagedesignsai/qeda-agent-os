/**
 * hooks/use-terminal-session.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the state of a single terminal session from the renderer side.
 *
 * Mirrors the pattern of use-agent-chat.ts — IPC events flow in, action
 * invokers flow out. The hook:
 *
 *   1. Loads persisted blocks from DB on mount (via terminal:blocks-get)
 *   2. Subscribes to streaming events:
 *      - terminal:block-proposed   → append new pending block
 *      - terminal:block-update-event → patch existing block in place
 *      - terminal:agent-done       → set summary + status=done
 *      - terminal:agent-error      → set error + status=error
 *   3. Exposes actions:
 *      - runGoal(goal)  → invoke terminal:run-goal
 *      - approve(id)    → invoke terminal:approve
 *      - reject(id)     → invoke terminal:reject
 *      - explain(id)    → invoke terminal:explain → patch block.explanation
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useIpcEvent } from './use-ipc';
import type { TerminalBlock } from '@/main/ipc/channels';

export type SessionStatus = 'idle' | 'running' | 'done' | 'error';

/** A model-proposed repair for a failed block. Never auto-executed. */
export interface FixSuggestion {
  diagnosis: string;
  command: string;
}

export interface UseTerminalSessionReturn {
  blocks: TerminalBlock[];
  status: SessionStatus;
  summary: string;
  error: string | undefined;
  isExplainingId: string | undefined;
  /** Repair proposals keyed by block id. */
  fixes: Record<string, FixSuggestion>;
  /** Block id currently being diagnosed, if any. */
  isFixingId: string | undefined;
  runGoal: (goal: string) => void;
  runCommand: (command: string) => void;
  rerun: (blockId: string) => void;
  approve: (blockId: string) => void;
  reject: (blockId: string) => void;
  explain: (blockId: string) => void;
  fix: (blockId: string) => void;
}

export function useTerminalSession(
  sessionId: string | undefined,
): UseTerminalSessionReturn {
  const [blocks, setBlocks] = useState<TerminalBlock[]>([]);
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [summary, setSummary] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [isExplainingId, setIsExplainingId] = useState<string | undefined>();
  const [fixes, setFixes] = useState<Record<string, FixSuggestion>>({});
  const [isFixingId, setIsFixingId] = useState<string | undefined>();

  // Track the active sessionId to ignore stale events from prior sessions
  const activeSessionRef = useRef<string | undefined>(sessionId);
  useEffect(() => {
    activeSessionRef.current = sessionId;
  }, [sessionId]);

  // ── Load persisted blocks on session change ────────────────────────────────
  useEffect(() => {
    if (!sessionId) {
      setBlocks([]);
      setStatus('idle');
      setSummary('');
      setError(undefined);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const rows = await window.electron.ipc.invoke<TerminalBlock[]>(
          'terminal:blocks-get',
          { sessionId },
        );
        if (!cancelled) setBlocks(rows ?? []);
      } catch {
        // Best-effort
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // ── Streaming event: new block proposed ───────────────────────────────────
  useIpcEvent('terminal:block-proposed', (...args: unknown[]) => {
    const block = args[0] as TerminalBlock;
    if (block.session_id !== activeSessionRef.current) return;
    setBlocks((prev) => {
      if (prev.some((b) => b.id === block.id)) return prev;
      return [...prev, block];
    });
  });

  // ── Streaming event: block status/output changed ──────────────────────────
  useIpcEvent('terminal:block-update-event', (...args: unknown[]) => {
    const patch = args[0] as Partial<TerminalBlock> & { id: string };
    setBlocks((prev) =>
      prev.map((b) => (b.id === patch.id ? { ...b, ...patch } : b)),
    );
  });

  // ── Streaming event: agent finished ──────────────────────────────────────
  useIpcEvent('terminal:agent-done', (...args: unknown[]) => {
    const { sessionId: sid, summary: s } = args[0] as { sessionId: string; summary: string };
    if (sid !== activeSessionRef.current) return;
    setSummary(s);
    setStatus('done');
  });

  // ── Streaming event: agent errored ────────────────────────────────────────
  useIpcEvent('terminal:agent-error', (...args: unknown[]) => {
    const { sessionId: sid, error: e } = args[0] as { sessionId: string; error: string };
    if (sid !== activeSessionRef.current) return;
    setError(e);
    setStatus('error');
  });

  // ── Actions ───────────────────────────────────────────────────────────────

  const runGoal = useCallback(
    (goal: string) => {
      if (!sessionId) return;
      setStatus('running');
      setSummary('');
      setError(undefined);
      void window.electron.ipc.invoke('terminal:run-goal', { sessionId, goal });
    },
    [sessionId],
  );

  const runCommand = useCallback(
    (command: string) => {
      if (!sessionId || !command.trim()) return;
      void window.electron.ipc.invoke('terminal:execute-command', {
        sessionId,
        command,
      });
    },
    [sessionId],
  );

  const rerun = useCallback(
    (blockId: string) => {
      if (!sessionId) return;
      void window.electron.ipc.invoke('terminal:rerun-block', { sessionId, blockId });
    },
    [sessionId],
  );

  const approve = useCallback(
    (blockId: string) => {
      if (!sessionId) return;
      void window.electron.ipc.invoke('terminal:approve', { sessionId, blockId });
    },
    [sessionId],
  );

  const reject = useCallback(
    (blockId: string) => {
      if (!sessionId) return;
      void window.electron.ipc.invoke('terminal:reject', { sessionId, blockId });
    },
    [sessionId],
  );

  const explain = useCallback(
    (blockId: string) => {
      if (!sessionId) return;
      setIsExplainingId(blockId);
      void window.electron.ipc
        .invoke<{ explanation: string }>('terminal:explain', { blockId })
        .then(({ explanation }) => {
          setBlocks((prev) =>
            prev.map((b) => (b.id === blockId ? { ...b, explanation } : b)),
          );
        })
        .finally(() => setIsExplainingId(undefined));
    },
    [sessionId],
  );

  const fix = useCallback((blockId: string) => {
    setIsFixingId(blockId);
    void window.electron.ipc
      .invoke<FixSuggestion>('terminal:suggest-fix', { blockId })
      .then((suggestion) => {
        setFixes((prev) => ({ ...prev, [blockId]: suggestion }));
      })
      .finally(() => setIsFixingId(undefined));
  }, []);

  return {
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
  };
}
