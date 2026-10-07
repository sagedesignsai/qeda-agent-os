/**
 * hooks/use-builder-session.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Owns the renderer-side Builder session lifecycle: workspace selection, event
 * subscription, re-attach, prompt submission, abort, and explicit
 * form/permission responses.
 *
 * Re-attach is the reason this hook does not stop the session on unmount: a
 * coding turn keeps running in the main process when the user navigates away,
 * and `builder:session-state` replays the buffered feed when they come back.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  BuilderFormReply,
  BuilderSessionEvent,
  BuilderSessionStart,
  BuilderSessionState,
  BuilderSessionSummary,
  BuilderWorkspace,
} from '@/main/ipc/channels';
import type { BuilderPermissionDecision } from '@/lib/builder-interactions';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useBuilderSession() {
  const [session, setSession] = useState<BuilderSessionSummary | null>(null);
  const [workspace, setWorkspace] = useState<BuilderWorkspace | null>(null);
  const [events, setEvents] = useState<BuilderSessionEvent[]>([]);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingResponse, setPendingResponse] = useState<string | null>(null);

  const mergeEvents = useCallback((incoming: BuilderSessionEvent[]) => {
    if (incoming.length === 0) return;
    setEvents((current) => {
      const seen = new Set(current.map((event) => event.eventId));
      const additions = incoming.filter((event) => !seen.has(event.eventId));
      if (additions.length === 0) return current;
      return [...current, ...additions].slice(-1000);
    });
  }, []);

  useEffect(() => {
    const unsubscribe = window.electron.ipc.on(
      'builder:session-event',
      (event) => {
        mergeEvents([event as BuilderSessionEvent]);
      },
    );
    // Re-attach to whatever the main process still has buffered.
    void (async () => {
      try {
        const state =
          await window.electron.ipc.invoke<BuilderSessionState>(
            'builder:session-state',
          );
        setSession(state.session);
        setWorkspace(state.workspace);
        mergeEvents(state.events);
      } catch (cause) {
        setError(messageOf(cause));
      }
    })();
    return unsubscribe;
  }, [mergeEvents]);

  const createSession = useCallback(
    async (directory: string): Promise<BuilderSessionStart | null> => {
      setCreating(true);
      setError(null);
      try {
        const started = await window.electron.ipc.invoke<BuilderSessionStart>(
          'builder:session-create',
          { directory },
        );
        setSession(started.session);
        setWorkspace(started.workspace);
        setEvents([]);
        return started;
      } catch (cause) {
        setError(messageOf(cause));
        return null;
      } finally {
        setCreating(false);
      }
    },
    [],
  );

  /**
   * Open the OS directory picker, then bind a session to the chosen folder.
   *
   * `defaultPath` is a convenience only: when the caller has an active project
   * it pre-opens the picker at that project's `repo_path`, so the folder the
   * user confirms is usually the right one. It is never bound on its own — the
   * directory still has to come back from the picker and pass the git check in
   * `main/builder/workspace.ts`, which is the whole point of the confirmation.
   *
   * The argument is type-guarded rather than trusted: this callback doubles as
   * an `onClick` handler in the Builder chrome, which would otherwise hand it a
   * React synthetic event instead of a path.
   */
  const chooseWorkspace = useCallback(async (defaultPath?: string) => {
    setError(null);
    const initialPath =
      typeof defaultPath === 'string' && defaultPath.trim()
        ? defaultPath
        : undefined;
    try {
      const payload: { title: string; defaultPath?: string } = {
        title: 'Choose a project folder',
      };
      if (initialPath) payload.defaultPath = initialPath;
      const directory = await window.electron.ipc.invoke<string | null>(
        'dialog:open-directory',
        payload,
      );
      if (!directory) return null;
      return await createSession(directory);
    } catch (cause) {
      setError(messageOf(cause));
      return null;
    }
  }, [createSession]);

  const stopSession = useCallback(async () => {
    try {
      await window.electron.ipc.invoke('builder:session-stop');
      setSession(null);
      setWorkspace(null);
      setEvents([]);
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, []);

  const sendPrompt = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setSending(true);
      setError(null);
      try {
        await window.electron.ipc.invoke('builder:prompt', { text: trimmed });
      } catch (cause) {
        setError(messageOf(cause));
      } finally {
        setSending(false);
      }
    },
    [],
  );

  const abort = useCallback(async () => {
    setError(null);
    try {
      await window.electron.ipc.invoke('builder:abort');
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, []);

  const replyPermission = useCallback(
    async (requestId: string, decision: BuilderPermissionDecision) => {
      setPendingResponse(requestId);
      setError(null);
      try {
        await window.electron.ipc.invoke('builder:permission-reply', {
          requestId,
          decision,
        });
      } catch (cause) {
        setError(messageOf(cause));
      } finally {
        setPendingResponse(null);
      }
    },
    [],
  );

  const replyForm = useCallback(async (reply: BuilderFormReply) => {
    setPendingResponse(reply.formId);
    setError(null);
    try {
      await window.electron.ipc.invoke('builder:form-reply', reply);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setPendingResponse(null);
    }
  }, []);

  // The run state is read from the authoritative status events, with `sending`
  // covering the brief window between submit and the first status arrives.
  const running = useMemo(() => {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event.type === 'status') {
        return (
          sending || event.status === 'running' || event.status === 'retrying'
        );
      }
    }
    return sending;
  }, [events, sending]);

  return {
    session,
    workspace,
    events,
    creating,
    sending,
    running,
    error,
    pendingResponse,
    chooseWorkspace,
    createSession,
    stopSession,
    sendPrompt,
    abort,
    replyPermission,
    replyForm,
  };
}
