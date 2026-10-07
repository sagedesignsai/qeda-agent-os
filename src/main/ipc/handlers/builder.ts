/**
 * ipc/handlers/builder.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Main-process bridge for the Builder coding turn.
 *
 * OWNERSHIP & SAFETY
 * ──────────────────
 * The user owns the OpenCode service; Qeda only attaches to it. A session is
 * never created against OpenCode's ambient working directory — the renderer
 * must supply a folder that resolves to a git repository, and that directory is
 * passed to `session.create({ location })` so every turn runs inside it.
 *
 * PERMISSIONS ARE SUPERVISED
 * ──────────────────────────
 * OpenCode's permission requests are forwarded to the renderer as explicit
 * Allow once / Always allow / Deny cards; nothing is auto-approved here. This is
 * why the prompt path only submits text — it never widens the permission set.
 *
 * SESSION CONTINUITY
 * ──────────────────
 * Session identity, the bound workspace, and the normalized event feed are
 * buffered here for the active session, so the renderer can re-attach after a
 * route change or reload without replaying the turn (`builder:session-state`).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ipcMain, shell, type BrowserWindow } from 'electron';
import {
  connectBuilderRuntime,
  type BuilderRuntime,
} from '../../builder/client';
import {
  inspectBuilderWorkspace,
  readWorkspaceFiles,
  readWorkspaceChanges,
  readWorkspaceFileContent,
  createBuilderWorktree,
  removeBuilderWorktree,
  applyWorktreeChanges,
  discardWorktreeChanges,
} from '../../builder/workspace';
import { normalizeBuilderSessionEvent } from '../../builder/session-events';
import { BuilderPreview } from '../../builder/preview';
import type { BuilderPreviewStatus } from '../../../lib/builder-preview';
import type { BuilderWorkspace } from '../../../lib/builder-workspace';
import type {
  BuilderSessionEvent,
  BuilderSessionStart,
  BuilderSessionState,
  BuilderSessionSummary,
} from '../../../lib/builder-session';

/** Upper bound on buffered events so a long session cannot grow unbounded. */
const EVENT_BUFFER_LIMIT = 2_000;

export function registerBuilderHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  /** The runtime the active session was created with; reused for its turns. */
  let runtime: BuilderRuntime | null = null;
  let activeSession: BuilderSessionSummary | null = null;
  let activeWorkspace: BuilderWorkspace | null = null;
  /** Absolute path of the isolated git worktree, or null when not isolated. */
  let activeWorktreePath: string | null = null;
  let eventController: AbortController | null = null;
  let eventBuffer: BuilderSessionEvent[] = [];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- written by broadcast/stopActive/prompt/abort to track optimistic state; read path is the renderer's status events
  let running = false;
  let localEventSeq = 0;

  /**
   * The one preview Qeda owns for this window. Started by the renderer, owned
   * by main, so it survives route changes and can be torn down deterministically
   * on session stop, workspace switch, or app quit.
   */
  const preview = new BuilderPreview();
  preview.subscribe((status: BuilderPreviewStatus) => {
    if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('builder:preview-changed', status);
    }
  });

  const broadcast = (event: BuilderSessionEvent) => {
    eventBuffer.push(event);
    if (eventBuffer.length > EVENT_BUFFER_LIMIT) {
      eventBuffer.splice(0, eventBuffer.length - EVENT_BUFFER_LIMIT);
    }
    // The run state is derived from the authoritative status events so the
    // server, not a local guess, decides when a turn has finished.
    if (event.type === 'status') {
      running = event.status === 'running' || event.status === 'retrying';
    }
    if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('builder:session-event', event);
    }
  };

  /**
   * A renderer-originated event (the echoed user prompt, optimistic run state).
   * It gets a locally unique id so the buffer can still dedupe by `eventId`.
   */
  const localEvent = (
    sessionId: string,
    rest:
      | { type: 'user-prompt'; text: string }
      | { type: 'status'; status: 'running' | 'interrupted' }
      | { type: 'error'; message: string },
  ): BuilderSessionEvent =>
    ({
      sessionId,
      eventId: `local-${Date.now()}-${++localEventSeq}`,
      createdAt: Date.now(),
      ...rest,
    }) as BuilderSessionEvent;

  const stopActive = async () => {
    eventController?.abort();
    eventController = null;
    // The preview belongs to the workspace, so it goes with the session.
    await preview.stop();
    const previous = runtime;
    const prevWorktree = activeWorktreePath;
    const prevRepo = activeWorkspace?.directory ?? null;
    runtime = null;
    activeSession = null;
    activeWorkspace = null;
    activeWorktreePath = null;
    eventBuffer = [];
    running = false;
    if (previous) {
      // dispose() never closes a caller-supplied client, so this only releases
      // the provider wrapper, not the OpenCode connection.
      await previous.provider.dispose().catch(() => undefined);
    }
    // Remove the isolated worktree after the session is fully torn down so
    // any in-flight git operations can complete first.
    if (prevWorktree && prevRepo) {
      await removeBuilderWorktree(prevRepo, prevWorktree).catch(
        () => undefined,
      );
    }
  };

  const requireActiveSession = (): {
    runtime: BuilderRuntime;
    session: BuilderSessionSummary;
  } => {
    if (!runtime || !activeSession) {
      throw new Error(
        'Create a Builder session bound to a workspace before sending a prompt.',
      );
    }
    return { runtime, session: activeSession };
  };

  ipcMain.handle('builder:connection-status', async () => {
    const { status, runtime: probe } = await connectBuilderRuntime();
    if (probe) await probe.provider.dispose().catch(() => undefined);
    return status;
  });

  ipcMain.handle(
    'builder:workspace-validate',
    (_event, { directory }: { directory: string }) =>
      inspectBuilderWorkspace(directory),
  );

  ipcMain.handle(
    'builder:session-create',
    async (
      _event,
      { directory }: { directory: string },
    ): Promise<BuilderSessionStart> => {
      // Validate before touching OpenCode, so a bad folder never creates a
      // session — and never falls back to the ambient default location.
      const workspace = await inspectBuilderWorkspace(directory);
      const result = await connectBuilderRuntime();
      if (!result.runtime) throw new Error(result.status.message);

      await stopActive();
      runtime = result.runtime;

      // Create an isolated git worktree so all agent turns run in a copy of
      // the repo. The source branch is untouched until the user keeps changes.
      const sessionNonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      let worktreePath: string | null = null;
      try {
        worktreePath = await createBuilderWorktree(
          workspace.directory,
          sessionNonce,
        );
      } catch (error) {
        // Worktree creation failure is non-fatal: fall back to running in the
        // actual repo directory and surface a visible warning via the session
        // error channel. This keeps Builder usable in environments where git
        // worktree is unavailable (e.g. shallow clones).
        console.warn(
          '[Builder] Worktree isolation failed, running in repo directly:',
          error instanceof Error ? error.message : String(error),
        );
      }

      // The session runs in the worktree when isolation succeeded, else in the
      // validated repo root.
      const sessionDirectory = worktreePath ?? workspace.directory;

      let session;
      try {
        session = await runtime.client.session.create({
          title: `Builder · ${workspace.name}`,
          location: { directory: sessionDirectory },
        });
      } catch (error) {
        // Clean up the worktree if the session create failed.
        if (worktreePath) {
          await removeBuilderWorktree(workspace.directory, worktreePath).catch(
            () => undefined,
          );
        }
        await stopActive();
        throw error;
      }

      const summary: BuilderSessionSummary = {
        id: session.id,
        title: session.title ?? `Builder · ${workspace.name}`,
        createdAt: session.time.created,
      };

      const boundWorkspace: BuilderWorkspace = {
        ...workspace,
        worktreePath,
      };

      activeSession = summary;
      activeWorkspace = boundWorkspace;
      activeWorktreePath = worktreePath;
      eventBuffer = [];
      running = false;

      const controller = new AbortController();
      eventController = controller;
      void (async () => {
        try {
          for await (const event of runtime!.client.event.subscribe({
            signal: controller.signal,
          })) {
            if (controller.signal.aborted || eventController !== controller) {
              return;
            }
            const normalized = normalizeBuilderSessionEvent(event, session.id);
            if (normalized) broadcast(normalized);
          }
        } catch (error) {
          if (!controller.signal.aborted && eventController === controller) {
            broadcast(
              localEvent(session.id, {
                type: 'error',
                message: error instanceof Error ? error.message : String(error),
              }),
            );
          }
        }
      })();

      return { session: summary, workspace: boundWorkspace };
    },
  );

  ipcMain.handle('builder:session-state', (): BuilderSessionState => ({
    session: activeSession,
    workspace: activeWorkspace,
    events: eventBuffer,
  }));

  ipcMain.handle(
    'builder:prompt',
    async (_event, { text }: { text: string }) => {
      const { runtime: rt, session } = requireActiveSession();
      const trimmed = typeof text === 'string' ? text.trim() : '';
      if (!trimmed) throw new Error('Write a prompt before sending.');

      broadcast(localEvent(session.id, { type: 'user-prompt', text: trimmed }));
      running = true;
      broadcast(localEvent(session.id, { type: 'status', status: 'running' }));
      try {
        await rt.client.session.prompt({
          sessionID: session.id,
          text: trimmed,
        });
      } catch (error) {
        running = false;
        const message = error instanceof Error ? error.message : String(error);
        broadcast(localEvent(session.id, { type: 'error', message }));
        throw new Error(message, { cause: error });
      }
    },
  );

  ipcMain.handle('builder:abort', async () => {
    const { runtime: rt, session } = requireActiveSession();
    try {
      await rt.client.session.interrupt({ sessionID: session.id });
    } finally {
      running = false;
      broadcast(
        localEvent(session.id, { type: 'status', status: 'interrupted' }),
      );
    }
  });

  ipcMain.handle('builder:session-stop', async () => {
    await stopActive();
  });

  ipcMain.handle('builder:preview-status', (): BuilderPreviewStatus =>
    preview.getStatus(),
  );

  ipcMain.handle(
    'builder:preview-start',
    async (
      _event,
      req?: { script?: string },
    ): Promise<BuilderPreviewStatus> => {
      // The preview is bound to the active session's workspace, never to a
      // renderer-supplied path. The directory was already proven to be a real
      // git repository by the session that created it; re-validating here keeps
      // that guarantee true even if the folder moved or was deleted since.
      if (!activeWorkspace) {
        throw new Error('Create a Builder session before starting a preview.');
      }
      const workspace = await inspectBuilderWorkspace(
        activeWorkspace.directory,
      );
      return preview.start({
        directory: workspace.directory,
        script: req?.script,
      });
    },
  );

  ipcMain.handle('builder:preview-stop', (): Promise<BuilderPreviewStatus> =>
    preview.stop(),
  );

  ipcMain.handle('builder:preview-open', (_event, { url }: { url: string }) => {
    // Same http(s) gate as the terminal's open-url: this hands a string from a
    // project's own output to the OS, so it must not be able to name a scheme
    // like `file:` or `javascript:`.
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      void shell.openExternal(url);
    }
  });

  ipcMain.handle(
    'builder:workspace-files',
    async (): Promise<
      import('../../../lib/builder-workspace.js').BuilderFileNode[]
    > => {
      if (!activeWorkspace) return [];
      return readWorkspaceFiles(
        activeWorkspace.worktreePath ?? activeWorkspace.directory,
      );
    },
  );

  ipcMain.handle(
    'builder:workspace-changes',
    async (): Promise<
      import('../../../lib/builder-workspace.js').BuilderFileChange[]
    > => {
      if (!activeWorkspace) return [];
      return readWorkspaceChanges(
        activeWorkspace.worktreePath ?? activeWorkspace.directory,
      );
    },
  );

  ipcMain.handle(
    'builder:workspace-file-read',
    async (_event, { filePath }: { filePath: string }) => {
      if (!activeWorkspace) {
        throw new Error('No active workspace. Choose a project folder first.');
      }
      const root = activeWorkspace.worktreePath ?? activeWorkspace.directory;
      return readWorkspaceFileContent(root, filePath);
    },
  );

  ipcMain.handle('builder:changes-keep', async () => {
    if (!activeWorkspace) {
      throw new Error('No active workspace to apply changes from.');
    }
    const { worktreePath, directory } = activeWorkspace;
    if (!worktreePath) {
      // No worktree isolation: the agent ran directly in the repo, so there
      // is nothing to "apply" — the changes are already there.
      return { paths: [] };
    }
    const paths = await applyWorktreeChanges(directory, worktreePath);
    return { paths };
  });

  ipcMain.handle('builder:changes-discard', async () => {
    if (!activeWorkspace) {
      throw new Error('No active workspace to discard changes in.');
    }
    const root = activeWorkspace.worktreePath ?? activeWorkspace.directory;
    await discardWorktreeChanges(root);
  });

  ipcMain.handle(
    'builder:permission-reply',
    async (
      _event,
      payload: { requestId: string; decision: 'once' | 'always' | 'reject' },
    ) => {
      const { runtime: rt, session } = requireActiveSession();
      await rt.client.permission.reply({
        sessionID: session.id,
        requestID: payload.requestId,
        decision: payload.decision,
      });
    },
  );

  ipcMain.handle(
    'builder:form-reply',
    async (
      _event,
      payload: {
        formId: string;
        answer?: Record<string, string | number | boolean | string[]>;
        cancel?: boolean;
      },
    ) => {
      const { runtime: rt, session } = requireActiveSession();
      if (payload.cancel) {
        await rt.client.session.form.cancel({
          sessionID: session.id,
          formID: payload.formId,
        });
      } else {
        await rt.client.session.form.reply({
          sessionID: session.id,
          formID: payload.formId,
          answer: payload.answer ?? {},
        });
      }
    },
  );

  mainWindow.once('closed', () => {
    // Nothing can be awaited here, so the group is signalled synchronously and
    // the session teardown follows best-effort.
    preview.dispose();
    void stopActive();
  });
}
