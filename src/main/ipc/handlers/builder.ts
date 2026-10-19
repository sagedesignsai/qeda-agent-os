/**
 * ipc/handlers/builder.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Main-process bridge for the Builder coding turn.
 *
 * ENGINE DISPATCH
 * ───────────────
 * `settings.builderEngine` selects the runtime for `builder:session-create`:
 *
 *   'local'     → Native Qeda ToolLoopAgent (LocalBuilderSession) with
 *                 workspace-scoped coding tools + dynamic MCP servers.
 *                 Always available; no external process required.
 *
 *   'opencode'  → External OpenCode v2 attach-only client. The user must have
 *                 OpenCode installed and running. This was the only path before
 *                 the Local engine landed.
 *
 * SHARED INFRASTRUCTURE
 * ─────────────────────
 * The following surface is engine-agnostic and works identically for both:
 *   • Builder preview (dev-server probing + live URL push)
 *   • Workspace files / changes / keep / discard
 *   • Session event buffer + `builder:session-event` broadcasts
 *
 * PERMISSIONS (both engines)
 * ─────────────────────────
 * Permission requests are forwarded to the renderer as explicit
 * Allow once / Always allow / Deny cards. Nothing is auto-approved here.
 *
 * SESSION CONTINUITY
 * ──────────────────
 * Session identity, the bound workspace, and the normalized event feed are
 * buffered so the renderer can re-attach after a route change or reload
 * without replaying the turn (`builder:session-state`).
 *
 * A persisted `engine` column on `builder_sessions` ensures the restore path
 * uses the same engine that created the session, not today's default.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { app, ipcMain, shell, type BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createCodeProject,
  deleteCodeProject,
  getCodeProject,
  listCodeProjects,
  setCodeProjectIndexState,
} from '../../db/code-projects';
import { getProject } from '../../db/projects';
import {
  connectBuilderRuntime,
  type BuilderRuntime,
} from '../../builder/client';
import {
  inspectBuilderWorkspace,
  readWorkspaceFiles,
  readWorkspaceChanges,
  readWorkspaceFileContent,
  removeBuilderWorktree,
  applyWorktreeChanges,
  discardWorktreeChanges,
} from '../../builder/workspace';
import {
  cloneGitCodeProject,
  createGitCodeProjectDirectory,
} from '../../builder/code-projects';
import { indexCodeProjectFiles } from '../../tools/rag';
import { normalizeBuilderSessionEvent } from '../../builder/session-events';
import { BuilderPreview } from '../../builder/preview';
import {
  createLocalBuilderSession,
  LocalBuilderSession,
} from '../../builder/local-engine';
import {
  getActiveBuilderSession,
  saveActiveBuilderSession,
  saveActiveBuilderSessionContext,
  deleteActiveBuilderSession,
} from '../../db/builder-sessions';
import { getSettings } from '../../ai/settings';
import type { ModelMessage } from 'ai';
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
/** Only the newest events are persisted; older history is not worth the bytes. */
const PERSISTED_EVENT_LIMIT = 500;

function parseStoredArray<T>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function registerBuilderHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  // ── Active-session state ──────────────────────────────────────────────────

  /** OpenCode runtime; null when using local engine or no session. */
  let opencodeRuntime: BuilderRuntime | null = null;
  /** Local engine session; null when using OpenCode engine or no session. */
  let localSession: LocalBuilderSession | null = null;

  let activeSession: BuilderSessionSummary | null = null;
  let activeWorkspace: BuilderWorkspace | null = null;
  /** Absolute path of the isolated git worktree, or null when not isolated. */
  let activeWorktreePath: string | null = null;
  /** Which engine owns the active session. */
  let activeEngine: 'local' | 'opencode' | null = null;

  let eventController: AbortController | null = null;
  let eventBuffer: BuilderSessionEvent[] = [];
  let running = false;
  let localEventSeq = 0;
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Preview (engine-agnostic) ─────────────────────────────────────────────

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

  // ── Durable context ───────────────────────────────────────────────────────

  /**
   * Persist the Local conversation and the event tail that lets a restarted
   * renderer rebuild the feed. Writes are debounced because `broadcast` fires
   * for every token delta; `flushPersistedContext` is called at terminal
   * statuses and on shutdown.
   */
  const flushPersistedContext = () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    if (!activeSession) return;
    saveActiveBuilderSessionContext({
      ...(localSession
        ? { messagesJson: JSON.stringify(localSession.getMessages()) }
        : {}),
      eventsJson: JSON.stringify(eventBuffer.slice(-PERSISTED_EVENT_LIMIT)),
    });
  };

  const schedulePersistedContext = () => {
    if (!activeSession || persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      flushPersistedContext();
    }, 300);
    persistTimer.unref?.();
  };

  // ── Event broadcasting ────────────────────────────────────────────────────

  const broadcast = (event: BuilderSessionEvent) => {
    eventBuffer.push(event);
    if (eventBuffer.length > EVENT_BUFFER_LIMIT) {
      eventBuffer.splice(0, eventBuffer.length - EVENT_BUFFER_LIMIT);
    }
    if (event.type === 'status') {
      running = event.status === 'running' || event.status === 'retrying';
    }
    if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('builder:session-event', event);
    }
    if (
      event.type === 'status' &&
      (event.status === 'idle' ||
        event.status === 'interrupted' ||
        event.status === 'failed')
    ) {
      flushPersistedContext();
    } else {
      schedulePersistedContext();
    }
  };

  /**
   * A renderer-originated event (the echoed user prompt, optimistic run state).
   * Gets a locally unique id so the buffer can still dedupe by eventId.
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

  // ── Session teardown ──────────────────────────────────────────────────────

  const stopActive = async () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    eventController?.abort();
    eventController = null;
    await preview.stop();

    const prevRuntime = opencodeRuntime;
    const prevLocal = localSession;
    const prevWorktree = activeWorktreePath;
    const prevRepo = activeWorkspace?.directory ?? null;

    opencodeRuntime = null;
    localSession = null;
    activeSession = null;
    activeWorkspace = null;
    activeWorktreePath = null;
    activeEngine = null;
    eventBuffer = [];
    running = false;

    deleteActiveBuilderSession();

    if (prevRuntime) {
      await prevRuntime.provider.dispose().catch(() => undefined);
    }
    if (prevLocal) {
      await prevLocal.stop().catch(() => undefined);
    }
    if (prevWorktree && prevRepo) {
      await removeBuilderWorktree(prevRepo, prevWorktree).catch(
        () => undefined,
      );
    }
  };

  /**
   * Release the running processes without destroying the session.
   *
   * This is the window-close path: the worktree and the persisted context must
   * outlive the app so a long run can be re-attached on next launch. Explicit
   * `builder:session-stop` still uses `stopActive`, which deletes the worktree.
   */
  const detachActive = async () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    eventController?.abort();
    eventController = null;
    await preview.stop();
    flushPersistedContext();

    const prevRuntime = opencodeRuntime;
    const prevLocal = localSession;

    opencodeRuntime = null;
    localSession = null;
    activeSession = null;
    activeWorkspace = null;
    activeWorktreePath = null;
    activeEngine = null;
    eventBuffer = [];
    running = false;

    if (prevRuntime) {
      await prevRuntime.provider.dispose().catch(() => undefined);
    }
    if (prevLocal) {
      // Abort only: `stop()` would remove the worktree we are preserving.
      prevLocal.abort();
    }
  };

  // ── Guard helpers ─────────────────────────────────────────────────────────

  const requireSession = (): BuilderSessionSummary => {
    if (!activeSession) {
      throw new Error(
        'Create a Builder session bound to a workspace before sending a prompt.',
      );
    }
    return activeSession;
  };

  const requireOpenCodeSession = (): {
    runtime: BuilderRuntime;
    session: BuilderSessionSummary;
  } => {
    const session = requireSession();
    if (!opencodeRuntime || activeEngine !== 'opencode') {
      throw new Error(
        'This operation requires an OpenCode Builder session. Switch the engine in Settings → Builder & MCP.',
      );
    }
    return { runtime: opencodeRuntime, session };
  };

  const requireLocalSession = (): {
    local: LocalBuilderSession;
    session: BuilderSessionSummary;
  } => {
    const session = requireSession();
    if (!localSession || activeEngine !== 'local') {
      throw new Error(
        'This operation requires a Local Builder session. Switch the engine in Settings → Builder & MCP.',
      );
    }
    return { local: localSession, session };
  };

  // ── Channels ──────────────────────────────────────────────────────────────

  ipcMain.handle('builder:connection-status', async () => {
    const engine = getSettings().builderEngine ?? 'local';
    if (engine === 'local') {
      // Local engine is always available; no external connectivity required.
      return { state: 'connected', message: 'Local Builder engine is ready.' };
    }
    // OpenCode: probe the running service.
    const { status, runtime: probe } = await connectBuilderRuntime();
    if (probe) await probe.provider.dispose().catch(() => undefined);
    return status;
  });

  ipcMain.handle(
    'builder:code-projects:list',
    (_event, { projectId }: { projectId: string }) => {
      if (!getProject(projectId))
        throw new Error('That Project no longer exists.');
      return listCodeProjects(projectId);
    },
  );

  ipcMain.handle(
    'builder:code-projects:register',
    async (
      _event,
      { projectId, directory }: { projectId: string; directory: string },
    ) => {
      if (!getProject(projectId))
        throw new Error('Choose an active Project first.');
      const workspace = await inspectBuilderWorkspace(directory);
      const existing = listCodeProjects(projectId).find(
        (codeProject) => codeProject.directory === workspace.directory,
      );
      if (existing) return existing;
      return createCodeProject({
        projectId,
        name: workspace.name,
        directory: workspace.directory,
        source: 'existing',
      });
    },
  );

  ipcMain.handle(
    'builder:code-projects:provision',
    async (
      _event,
      input: {
        projectId: string;
        parentDirectory: string;
        name: string;
        source: 'created' | 'clone';
        remoteUrl?: string;
      },
    ) => {
      if (!getProject(input.projectId)) {
        throw new Error('Choose an active Project before creating a codebase.');
      }
      const provisioned =
        input.source === 'clone'
          ? await cloneGitCodeProject({
              parentDirectory: input.parentDirectory,
              name: input.name,
              remoteUrl: input.remoteUrl ?? '',
            })
          : await createGitCodeProjectDirectory(input);
      const remoteUrl =
        'remoteUrl' in provisioned && typeof provisioned.remoteUrl === 'string'
          ? provisioned.remoteUrl
          : undefined;
      return createCodeProject({
        projectId: input.projectId,
        name: provisioned.name,
        directory: provisioned.directory,
        source: input.source,
        ...(remoteUrl ? { remoteUrl } : {}),
      });
    },
  );

  ipcMain.handle(
    'builder:code-projects:index',
    async (_event, { codeProjectId }: { codeProjectId: string }) => {
      const codeProject = getCodeProject(codeProjectId);
      if (!codeProject || !codeProject.project_id) {
        throw new Error('This codebase is no longer linked to a Project.');
      }
      setCodeProjectIndexState(codeProjectId, { status: 'indexing' });
      try {
        const result = await indexCodeProjectFiles({
          codeProjectId,
          projectId: codeProject.project_id,
          directory: codeProject.directory,
        });
        setCodeProjectIndexState(codeProjectId, {
          status: 'ready',
          indexedFiles: result.indexedFiles,
        });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setCodeProjectIndexState(codeProjectId, {
          status: 'error',
          error: message,
        });
        throw error;
      }
    },
  );

  ipcMain.handle(
    'builder:code-projects:delete',
    (_event, { codeProjectId }: { codeProjectId: string }) =>
      deleteCodeProject(codeProjectId),
  );

  ipcMain.handle(
    'builder:workspace-validate',
    (_event, { directory }: { directory: string }) =>
      inspectBuilderWorkspace(directory),
  );

  // ── Session create (engine dispatch) ────────────────────────────────────

  ipcMain.handle(
    'builder:session-create',
    async (
      _event,
      { directory }: { directory: string },
    ): Promise<BuilderSessionStart> => {
      const workspace = await inspectBuilderWorkspace(directory);
      await stopActive();

      const engine = getSettings().builderEngine ?? 'local';

      // ── Local engine path ─────────────────────────────────────────────────
      if (engine === 'local') {
        const worktreeParentDirectory = path.join(
          app.getPath('userData'),
          'builder-worktrees',
        );
        const {
          session,
          summary,
          workspace: boundWorkspace,
        } = await createLocalBuilderSession({
          workspaceDirectory: workspace.directory,
          onEvent: broadcast,
          worktreeParentDirectory,
        });

        localSession = session;
        activeSession = summary;
        activeWorkspace = boundWorkspace;
        activeWorktreePath = boundWorkspace.worktreePath ?? null;
        activeEngine = 'local';
        eventBuffer = [];
        running = false;

        saveActiveBuilderSession({
          opencode_session_id: summary.id, // reuses the same col as local id
          title: summary.title,
          repo_directory: boundWorkspace.directory,
          worktree_path: boundWorkspace.worktreePath ?? null,
          workspace_name: boundWorkspace.name,
          branch: boundWorkspace.branch ?? null,
          engine: 'local',
          messages_json: '[]',
          events_json: '[]',
          created_at: summary.createdAt,
        });

        return { session: summary, workspace: boundWorkspace };
      }

      // ── OpenCode engine path ──────────────────────────────────────────────
      const result = await connectBuilderRuntime();
      if (!result.runtime) throw new Error(result.status.message);

      opencodeRuntime = result.runtime;

      let worktreePath: string;
      try {
        const locationHeaders = {
          'x-opencode-directory': encodeURIComponent(workspace.directory),
        };
        const projects = await opencodeRuntime.client.project.list({
          headers: locationHeaders,
        });
        const opencodeProject = projects.find(
          (project) => project.canonical === workspace.directory,
        );
        if (!opencodeProject) {
          throw new Error(
            'OpenCode could not associate the selected folder with a project. Open the folder in OpenCode once, then try again.',
          );
        }
        const worktree = await opencodeRuntime.client.worktree.create(
          { projectID: opencodeProject.id },
          { headers: locationHeaders },
        );
        worktreePath = worktree.directory;
      } catch (error) {
        await opencodeRuntime.provider.dispose().catch(() => undefined);
        opencodeRuntime = null;
        throw new Error(
          `Builder could not create an isolated workspace, so it did not start. Your repository was not changed. ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }

      const sessionDirectory = worktreePath ?? workspace.directory;

      let ocSession;
      try {
        ocSession = await opencodeRuntime.client.session.create({
          title: `Builder · ${workspace.name}`,
          location: { directory: sessionDirectory },
        });
      } catch (error) {
        if (worktreePath) {
          await removeBuilderWorktree(workspace.directory, worktreePath).catch(
            () => undefined,
          );
        }
        await stopActive();
        throw error;
      }

      const summary: BuilderSessionSummary = {
        id: ocSession.id,
        title: ocSession.title ?? `Builder · ${workspace.name}`,
        createdAt: ocSession.time.created,
      };

      const boundWorkspace: BuilderWorkspace = {
        ...workspace,
        worktreePath,
      };

      activeSession = summary;
      activeWorkspace = boundWorkspace;
      activeWorktreePath = worktreePath;
      activeEngine = 'opencode';
      eventBuffer = [];
      running = false;

      // Subscribe to OpenCode event stream.
      const controller = new AbortController();
      eventController = controller;
      void (async () => {
        try {
          for await (const event of opencodeRuntime!.client.event.subscribe({
            signal: controller.signal,
          })) {
            if (controller.signal.aborted || eventController !== controller) {
              return;
            }
            const normalized = normalizeBuilderSessionEvent(
              event,
              ocSession.id,
            );
            if (normalized) broadcast(normalized);
          }
        } catch (error) {
          if (!controller.signal.aborted && eventController === controller) {
            broadcast(
              localEvent(ocSession.id, {
                type: 'error',
                message: error instanceof Error ? error.message : String(error),
              }),
            );
          }
        }
      })();

      saveActiveBuilderSession({
        opencode_session_id: summary.id,
        title: summary.title,
        repo_directory: boundWorkspace.directory,
        worktree_path: boundWorkspace.worktreePath ?? null,
        workspace_name: boundWorkspace.name,
        branch: boundWorkspace.branch ?? null,
        engine: 'opencode',
        created_at: summary.createdAt,
      });

      return { session: summary, workspace: boundWorkspace };
    },
  );

  // ── Session state restore ────────────────────────────────────────────────

  ipcMain.handle(
    'builder:session-state',
    async (): Promise<BuilderSessionState> => {
      // Fast path: already live in memory.
      if (activeSession) {
        return {
          session: activeSession,
          workspace: activeWorkspace,
          events: eventBuffer,
        };
      }

      // Restore path: check DB for a persisted session.
      const persisted = getActiveBuilderSession();
      if (!persisted) {
        return { session: null, workspace: null, events: [] };
      }

      const engine = (persisted.engine ?? 'opencode') as 'local' | 'opencode';

      // Local sessions are durable when their worktree survived: the model
      // context and event tail are persisted, and the worktree lives under
      // userData instead of the OS temp dir. If either is gone there is nothing
      // honest to re-attach, so the stale row is removed.
      if (engine === 'local') {
        if (!persisted.worktree_path) {
          deleteActiveBuilderSession();
          return { session: null, workspace: null, events: [] };
        }
        try {
          const worktreeStat = await fs.stat(persisted.worktree_path);
          if (!worktreeStat.isDirectory()) throw new Error('not a directory');
          const source = await inspectBuilderWorkspace(
            persisted.repo_directory,
          );
          const restoredWorkspace: BuilderWorkspace = {
            ...source,
            worktreePath: persisted.worktree_path,
          };
          const restored = new LocalBuilderSession(
            persisted.opencode_session_id,
            restoredWorkspace,
            persisted.worktree_path,
            broadcast,
            undefined,
            {
              id: persisted.opencode_session_id,
              title: persisted.title,
              createdAt: persisted.created_at,
              messages: parseStoredArray<ModelMessage>(persisted.messages_json),
            },
          );

          localSession = restored;
          activeSession = restored.getSummary();
          activeWorkspace = restoredWorkspace;
          activeWorktreePath = persisted.worktree_path;
          activeEngine = 'local';
          eventBuffer = parseStoredArray<BuilderSessionEvent>(
            persisted.events_json,
          );
          running = false;

          return {
            session: activeSession,
            workspace: activeWorkspace,
            events: eventBuffer,
          };
        } catch {
          deleteActiveBuilderSession();
          return { session: null, workspace: null, events: [] };
        }
      }

      // OpenCode sessions: try to reconnect.
      try {
        const result = await connectBuilderRuntime();
        if (!result.runtime) {
          deleteActiveBuilderSession();
          return { session: null, workspace: null, events: [] };
        }

        let ocSession: {
          id: string;
          title?: string;
          time: { created: number };
        };
        try {
          ocSession = await result.runtime.client.session.get({
            sessionID: persisted.opencode_session_id,
          });
        } catch {
          deleteActiveBuilderSession();
          await result.runtime.provider.dispose().catch(() => undefined);
          return { session: null, workspace: null, events: [] };
        }

        opencodeRuntime = result.runtime;
        const summary: BuilderSessionSummary = {
          id: ocSession.id,
          title: ocSession.title ?? persisted.title,
          createdAt: ocSession.time.created,
        };
        const restoredWorkspace: BuilderWorkspace = {
          directory: persisted.repo_directory,
          name: persisted.workspace_name,
          branch: persisted.branch,
          dirty: false,
          changedFileCount: 0,
          worktreePath: persisted.worktree_path,
        };

        activeSession = summary;
        activeWorkspace = restoredWorkspace;
        activeWorktreePath = persisted.worktree_path;
        activeEngine = 'opencode';
        eventBuffer = parseStoredArray<BuilderSessionEvent>(
          persisted.events_json,
        );
        running = false;

        const controller = new AbortController();
        eventController = controller;
        void (async () => {
          try {
            for await (const event of opencodeRuntime!.client.event.subscribe({
              signal: controller.signal,
            })) {
              if (controller.signal.aborted || eventController !== controller)
                return;
              const normalized = normalizeBuilderSessionEvent(
                event,
                ocSession.id,
              );
              if (normalized) broadcast(normalized);
            }
          } catch (error) {
            if (!controller.signal.aborted && eventController === controller) {
              broadcast(
                localEvent(ocSession.id, {
                  type: 'error',
                  message:
                    error instanceof Error ? error.message : String(error),
                }),
              );
            }
          }
        })();

        return { session: summary, workspace: restoredWorkspace, events: [] };
      } catch {
        deleteActiveBuilderSession();
        return { session: null, workspace: null, events: [] };
      }
    },
  );

  // ── Model selection (OpenCode only; local uses settings model) ────────────

  ipcMain.handle(
    'builder:models',
    async (): Promise<{
      models: Array<{ providerID: string; id: string; name: string }>;
      selected: { providerID: string; id: string; name: string } | null;
    }> => {
      // Local engine: expose the current settings model as the only option.
      if (activeEngine === 'local') {
        const s = getSettings();
        const sel = localSession?.getModel() ?? {
          providerID: s.activeProvider,
          id: s.activeModel,
          name: `${s.activeProvider} / ${s.activeModel}`,
        };
        return {
          models: [{ providerID: sel.providerID, id: sel.id, name: sel.name }],
          selected: { providerID: sel.providerID, id: sel.id, name: sel.name },
        };
      }

      const { runtime: rt, session } = requireOpenCodeSession();
      const directory = activeWorktreePath ?? activeWorkspace?.directory;
      if (!directory) throw new Error('No active Builder workspace.');

      const location = { directory };
      const [available, info, defaultModel] = await Promise.all([
        rt.client.model.list({ location }),
        rt.client.session.get({ sessionID: session.id }),
        rt.client.model.default({ location }),
      ]);
      const models = available.data
        .filter((model) => model.enabled)
        .map(({ providerID, modelID, name }) => ({
          providerID,
          id: modelID,
          name,
        }));
      const selectedRef = info.model ?? defaultModel.data;
      const selected = selectedRef
        ? (models.find(
            (model) =>
              model.providerID === selectedRef.providerID &&
              model.id === selectedRef.id,
          ) ?? {
            providerID: selectedRef.providerID,
            id: selectedRef.id,
            name: selectedRef.id,
          })
        : null;

      return { models, selected };
    },
  );

  ipcMain.handle(
    'builder:model-select',
    async (
      _event,
      { providerID, modelID }: { providerID: string; modelID: string },
    ) => {
      if (activeEngine === 'local') {
        const { local } = requireLocalSession();
        local.setModel(providerID, modelID);
        return;
      }

      const { runtime: rt, session } = requireOpenCodeSession();
      if (running)
        throw new Error(
          'Wait for the current turn to finish before changing models.',
        );
      const directory = activeWorktreePath ?? activeWorkspace?.directory;
      if (!directory) throw new Error('No active Builder workspace.');

      const available = await rt.client.model.list({
        location: { directory },
      });
      const model = available.data.find(
        (candidate) =>
          candidate.enabled &&
          candidate.providerID === providerID &&
          candidate.modelID === modelID,
      );
      if (!model)
        throw new Error(
          'That model is not available in this OpenCode project.',
        );

      await rt.client.session.switchModel({
        sessionID: session.id,
        model: { providerID, id: modelID },
      });
    },
  );

  // ── Prompt ────────────────────────────────────────────────────────────────

  ipcMain.handle(
    'builder:prompt',
    async (_event, { text }: { text: string }) => {
      const session = requireSession();
      if (!activeWorkspace?.worktreePath) {
        throw new Error(
          'This legacy session is not isolated. Choose a repository again to start a protected Builder session.',
        );
      }
      const trimmed = typeof text === 'string' ? text.trim() : '';
      if (!trimmed) throw new Error('Write a prompt before sending.');

      if (activeEngine === 'local') {
        const { local } = requireLocalSession();
        // Local engine emits its own user-prompt and status events directly via
        // the onEvent callback wired at session creation — no echo needed here.
        await local.prompt(trimmed);
        return;
      }

      // OpenCode path.
      const { runtime: rt } = requireOpenCodeSession();
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

  // ── Abort ─────────────────────────────────────────────────────────────────

  ipcMain.handle('builder:abort', async () => {
    const session = requireSession();

    if (activeEngine === 'local') {
      const { local } = requireLocalSession();
      local.abort();
      return;
    }

    const { runtime: rt } = requireOpenCodeSession();
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

  // ── Permission reply ──────────────────────────────────────────────────────

  ipcMain.handle(
    'builder:permission-reply',
    async (
      _event,
      payload: { requestId: string; decision: 'once' | 'always' | 'reject' },
    ) => {
      if (activeEngine === 'local') {
        const { local } = requireLocalSession();
        local.replyPermission(payload.requestId, payload.decision);
        return;
      }

      const { runtime: rt, session } = requireOpenCodeSession();
      await rt.client.permission.reply({
        sessionID: session.id,
        requestID: payload.requestId,
        decision: payload.decision,
      });
    },
  );

  // ── Form reply (OpenCode only) ────────────────────────────────────────────

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
      const { runtime: rt, session } = requireOpenCodeSession();
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

  // ── Preview (engine-agnostic) ─────────────────────────────────────────────

  ipcMain.handle('builder:preview-status', (): BuilderPreviewStatus =>
    preview.getStatus(),
  );

  ipcMain.handle(
    'builder:preview-start',
    async (
      _event,
      req?: { script?: string; command?: string },
    ): Promise<BuilderPreviewStatus> => {
      if (!activeWorkspace) {
        throw new Error('Create a Builder session before starting a preview.');
      }
      const previewDir = activeWorktreePath ?? activeWorkspace.directory;
      await inspectBuilderWorkspace(previewDir);
      return preview.start({
        directory: previewDir,
        script: req?.script,
        command: req?.command,
      });
    },
  );

  ipcMain.handle('builder:preview-stop', (): Promise<BuilderPreviewStatus> =>
    preview.stop(),
  );

  ipcMain.handle('builder:preview-open', (_event, { url }: { url: string }) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      void shell.openExternal(url);
    }
  });

  // ── Workspace (engine-agnostic) ───────────────────────────────────────────

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
      throw new Error(
        'Keep is unavailable because this legacy session is working directly in your repository.',
      );
    }
    const paths = await applyWorktreeChanges(directory, worktreePath);
    // The source tree's dirty count changed; refresh the bound workspace so the
    // canvas identity bar does not keep reporting the pre-Keep state.
    try {
      const refreshed = await inspectBuilderWorkspace(directory);
      activeWorkspace = { ...refreshed, worktreePath };
    } catch {
      // Keep succeeded; a stale count is cosmetic and self-corrects on restart.
    }
    return { paths };
  });

  ipcMain.handle('builder:changes-discard', async () => {
    if (!activeWorkspace) {
      throw new Error('No active workspace to discard changes in.');
    }
    if (!activeWorkspace.worktreePath) {
      throw new Error(
        'Discard is unavailable because this legacy session is working directly in your repository. Review and restore its changes manually.',
      );
    }
    await discardWorktreeChanges(activeWorkspace.worktreePath);
    try {
      const refreshed = await inspectBuilderWorkspace(
        activeWorkspace.directory,
      );
      activeWorkspace = {
        ...refreshed,
        worktreePath: activeWorkspace.worktreePath,
      };
    } catch {
      // Cosmetic; the worktree itself is already reset.
    }
  });

  // ── Cleanup ───────────────────────────────────────────────────────────────

  mainWindow.once('closed', () => {
    preview.dispose();
    void detachActive();
  });
}
