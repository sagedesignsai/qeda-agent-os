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
  findCodeProjectByDirectory,
  getCodeProject,
  listCodeProjects,
  setCodeProjectIndexState,
} from '../../db/code-projects';
import { listProjects, getProject } from '../../db/projects';
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
  listBuilderWorktrees,
  removeBuilderWorktreeDir,
} from '../../builder/workspace';
import {
  cloneGitCodeProject,
  createGitCodeProjectDirectory,
} from '../../builder/code-projects';
import { indexCodeProjectFiles } from '../../tools/rag';
import { normalizeBuilderSessionEvent } from '../../builder/session-events';
import { BuilderSessionManager } from '../../builder/session-manager';
import {
  createLocalBuilderSession,
  LocalBuilderSession,
} from '../../builder/local-engine';
import { startBridge, type Bridge } from '../../opencode/bridge';
import {
  createSandbox,
  destroySandbox,
  capturePatch,
  applyPatchLocally,
  savePatchFile,
  resolveSourceRemoteUrl,
  type E2bSandboxHandle,
} from '../../sandbox/e2b.js';
import { assertQedaToolSession } from '../../opencode/session-binding';
import type { AgentPlan, PlanItemStatus } from '../../../lib/agent-plan';
import {
  getActiveBuilderSession,
  saveActiveBuilderSession,
  saveActiveBuilderSessionContext,
  deleteActiveBuilderSession,
  listBuilderSessionHistory,
  deleteBuilderSessionHistory,
  getBuilderSessionHistory,
  archiveActiveSession,
  saveBuilderSessionToHistory,
  type BuilderSessionHistoryRecord,
} from '../../db/builder-sessions';
import { getSettings } from '../../ai/settings';
import type { ModelMessage } from 'ai';
import { EMPTY_PREVIEW_STATUS } from '../../../lib/builder-preview';
import type { BuilderPreviewStatus } from '../../../lib/builder-preview';
import type { BuilderWorkspace } from '../../../lib/builder-workspace';
import type {
  BuilderSessionEvent,
  BuilderSessionStart,
  BuilderSessionState,
  BuilderSessionSummary,
  BuilderSessionHistoryEntry,
  BuilderWorktreeEntry,
} from '../../../lib/builder-session';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerBuilderHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  // ── Multi-session registry ────────────────────────────────────────────────

  /** Map of session ID → BuilderSessionManager for all active sessions. */
  const sessions = new Map<string, BuilderSessionManager>();
  /** The "focused" session is the default target for channels without an explicit ID. */
  let focusedSessionId: string | null = null;

  /** Authenticated localhost bridge the Qeda plugin calls into (singleton per window). */
  let bridge: Bridge | null = null;
  const bridgeConfigPath = path.join(
    app.getPath('userData'),
    'opencode',
    'bridge.json',
  );
  const clearBridgeConfig = async () => {
    await fs.rm(bridgeConfigPath, { force: true }).catch(() => undefined);
  };

  /**
   * Create a new BuilderSessionManager instance.
   */
  const createManager = (): BuilderSessionManager =>
    new BuilderSessionManager({
      onBroadcast: (event: BuilderSessionEvent) => {
        if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
          mainWindow.webContents.send('builder:session-event', event);
        }
      },
      onPersistContext: (messagesJson?: string, eventsJson?: string) => {
        saveActiveBuilderSessionContext({ messagesJson, eventsJson });
      },
      mainWindow,
    });

  /**
   * Get the focused session manager, or null if none.
   */
  const getFocusedManager = (): BuilderSessionManager | null => {
    if (!focusedSessionId) return null;
    return sessions.get(focusedSessionId) ?? null;
  };

  /**
   * Set the focused session ID.
   */
  const setFocusedSession = (id: string) => {
    if (sessions.has(id)) {
      focusedSessionId = id;
    }
  };

  // ── Helper: get or create manager for the focused session ──────────────────

  const ensureFocusedManager = (): BuilderSessionManager => {
    let mgr = getFocusedManager();
    if (!mgr) {
      mgr = createManager();
      mgr.sessionId = `local-${Date.now().toString(36)}`;
      sessions.set(mgr.sessionId, mgr);
      focusedSessionId = mgr.sessionId;
    }
    return mgr;
  };

  // ── Qeda bridge helpers (OpenCode engine) ─────────────────────────────────

  const realDirectory = async (value: string): Promise<string> => {
    try {
      return await fs.realpath(value);
    } catch {
      return path.resolve(value);
    }
  };

  /**
   * Qeda tools must never be able to point preview or indexing at an arbitrary
   * directory supplied by the model. Accept only the active source repo or its
   * worktree, then always act on the worktree.
   */
  const resolveActiveDirectory = async (
    mgr: BuilderSessionManager,
    candidate?: unknown,
  ): Promise<string> => {
    if (!mgr.workspace) {
      throw new Error('Create a Builder session before using Qeda tools.');
    }
    const active = mgr.worktreePath ?? mgr.workspace.directory;
    if (typeof candidate === 'string' && candidate.trim()) {
      const resolved = await realDirectory(candidate);
      const allowed = new Set([
        await realDirectory(active),
        await realDirectory(mgr.workspace.directory),
      ]);
      if (!allowed.has(resolved)) {
        throw new Error(
          'Qeda tools can only use the active Builder workspace or its worktree.',
        );
      }
    }
    return active;
  };

  const resolveCodeProject = async (body: unknown) => {
    const input =
      body && typeof body === 'object'
        ? (body as { codeProjectId?: unknown; directory?: unknown })
        : {};
    if (typeof input.codeProjectId === 'string' && input.codeProjectId) {
      const codeProject = getCodeProject(input.codeProjectId);
      if (!codeProject) {
        throw new Error(`Unknown Qeda codebase: ${input.codeProjectId}`);
      }
      return codeProject;
    }

    const mgr = getFocusedManager();
    const candidates = [
      typeof input.directory === 'string' ? input.directory : null,
      mgr?.activeBuilderDirectory() ?? null,
      mgr?.workspace?.directory ?? null,
    ].filter((value): value is string => Boolean(value));
    for (const candidate of candidates) {
      const resolved = await realDirectory(candidate);
      const codeProject =
        findCodeProjectByDirectory(resolved) ??
        findCodeProjectByDirectory(path.resolve(candidate));
      if (codeProject) return codeProject;
    }
    throw new Error(
      'No linked Qeda codebase matches this workspace. Link the folder under Projects → Code first.',
    );
  };

  const projectInfo = async (body: unknown) => {
    const mgr = getFocusedManager();
    const directory = mgr?.activeBuilderDirectory() ?? mgr?.workspace?.directory;
    if (!directory) {
      throw new Error('No active Builder workspace.');
    }
    const codeProject =
      findCodeProjectByDirectory(directory) ??
      (mgr?.workspace
        ? findCodeProjectByDirectory(
            await realDirectory(mgr.workspace.directory),
          )
        : null);
    const project =
      (codeProject?.project_id
        ? listProjects().find((item) => item.id === codeProject.project_id)
        : null) ??
      listProjects().find(
        (item) =>
          item.repo_path === directory ||
          item.repo_path === mgr?.workspace?.directory,
      ) ??
      null;
    const codeProjects = project
      ? listCodeProjects(project.id)
      : codeProject
        ? [codeProject]
        : [];

    return {
      projectId: project?.id ?? null,
      name: project?.name ?? null,
      description: project?.description ?? null,
      directory,
      sourceDirectory: mgr?.workspace?.directory ?? null,
      worktreePath: mgr?.worktreePath ?? null,
      codeProjects: codeProjects.map((item) => ({
        id: item.id,
        name: item.name,
        directory: item.directory,
        indexStatus: item.index_status,
        indexedFiles: item.indexed_files,
        indexedAt: item.indexed_at,
        indexError: item.index_error,
      })),
    };
  };

  const indexCodeProject = async (body: unknown) => {
    const codeProject = await resolveCodeProject(body);
    setCodeProjectIndexState(codeProject.id, { status: 'indexing' });
    try {
      const indexed = await indexCodeProjectFiles({
        codeProjectId: codeProject.id,
        projectId: codeProject.project_id ?? '',
        directory: codeProject.directory,
      });
      setCodeProjectIndexState(codeProject.id, {
        status: 'ready',
        indexedFiles: indexed.indexedFiles,
        error: null,
      });
      return indexed;
    } catch (error) {
      setCodeProjectIndexState(codeProject.id, {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  const createBridgeRoutes = (): Record<
    string,
    (body: unknown) => Promise<unknown>
  > => {
    const mgr = getFocusedManager();
    const routes: Record<string, (body: unknown) => Promise<unknown>> = {
      '/ping': async (body) => {
        const message = (body as { message?: string })?.message ?? '';
        return { reply: `${message} (qeda)` };
      },
      '/session/bind': async (body) => {
        if (!mgr?.session) {
          throw new Error('No active Qeda Builder session.');
        }
        const input = (body ?? {}) as {
          sessionID?: unknown;
          directory?: unknown;
        };
        if (
          typeof input.sessionID === 'string' &&
          input.sessionID !== mgr.session.id
        ) {
          throw new Error(
            'This OpenCode session is not bound to the active Qeda Builder session.',
          );
        }
        if (typeof input.directory === 'string' && input.directory.trim()) {
          await resolveActiveDirectory(mgr, input.directory);
        }
        return {
          sessionId: mgr.session.id,
          directory: mgr.activeBuilderDirectory(),
          worktreePath: mgr.worktreePath,
        };
      },
      '/preview/status': async () => mgr?.preview.getStatus() ?? { state: 'idle' },
      '/preview/start': async (body) => {
        if (!mgr) throw new Error('No active session.');
        const input = (body ?? {}) as {
          directory?: unknown;
          script?: string;
          command?: string;
        };
        const directory = await resolveActiveDirectory(mgr, input.directory);
        const status = await mgr.preview.start({
          directory,
          script: input.script,
          command: input.command,
        });
        return status;
      },
      '/preview/stop': async () => {
        if (!mgr) throw new Error('No active session.');
        await mgr.preview.stop();
        return mgr.preview.getStatus();
      },
      '/index': async (body) => indexCodeProject(body),
      '/index/status': async (body) => {
        const codeProject = await resolveCodeProject(body);
        return {
          id: codeProject.id,
          name: codeProject.name,
          directory: codeProject.directory,
          status: codeProject.index_status,
          indexedFiles: codeProject.indexed_files,
          indexedAt: codeProject.indexed_at,
          error: codeProject.index_error,
        };
      },
      '/project/info': async (body) => projectInfo(body),
      '/plan/create': async (body) => {
        if (!mgr) throw new Error('No active session.');
        const input = (body ?? {}) as { items?: unknown };
        if (!Array.isArray(input.items) || input.items.length === 0) {
          throw new Error('A plan needs at least one item.');
        }
        const items = input.items.map((item) => {
          const value = (item ?? {}) as { id?: unknown; title?: unknown };
          if (
            typeof value.id !== 'string' ||
            !value.id.trim() ||
            typeof value.title !== 'string' ||
            !value.title.trim()
          ) {
            throw new Error('Each plan item needs a non-empty id and title.');
          }
          return { id: value.id.trim(), title: value.title.trim() };
        });
        mgr.resetPlanManager();
        const plan = mgr.requirePlanManager().createPlan(items);
        return { plan };
      },
      '/plan/update': async (body) => {
        if (!mgr) throw new Error('No active session.');
        const input = (body ?? {}) as { id?: unknown; status?: unknown };
        const statuses: PlanItemStatus[] = [
          'pending',
          'in-progress',
          'done',
          'failed',
        ];
        if (
          typeof input.id !== 'string' ||
          !input.id.trim() ||
          typeof input.status !== 'string' ||
          !statuses.includes(input.status as PlanItemStatus)
        ) {
          throw new Error('A plan update needs an item id and a valid status.');
        }
        const manager = mgr.requirePlanManager();
        const before = manager.getSnapshot();
        const existed =
          before?.items.some((item) => item.id === input.id) ?? false;
        manager.updateItem(input.id, input.status as PlanItemStatus);
        return {
          updated: existed,
          plan: manager.getSnapshot(),
        };
      },
      '/plan/status': async () => {
        if (!mgr) throw new Error('No active session.');
        return {
          plan: mgr.requirePlanManager().getSnapshot(),
        };
      },
    };

    // The plugin loads globally: OpenCode exposes qeda_* tools in every
    // session. Reject calls that do not come from the Qeda-created session
    // before they can read or mutate Qeda's active workspace.
    const sessionId = mgr?.session?.id ?? null;
    for (const [route, handler] of Object.entries(routes)) {
      routes[route] = async (body) => {
        assertQedaToolSession(body, sessionId);
        return handler(body);
      };
    }
    return routes;
  };

  const startSessionBridge = async () => {
    const mgr = getFocusedManager();
    if (bridge) {
      await bridge.stop().catch(() => undefined);
      bridge = null;
    }
    const activeBridge = await startBridge(createBridgeRoutes());
    bridge = activeBridge;
    await fs.mkdir(path.dirname(bridgeConfigPath), { recursive: true });
    await fs.writeFile(
      bridgeConfigPath,
      JSON.stringify({
        url: activeBridge.url,
        token: activeBridge.token,
        sessionId: mgr?.session?.id ?? null,
        directory: mgr?.activeBuilderDirectory() ?? null,
        worktreePath: mgr?.worktreePath ?? null,
      }),
      { mode: 0o600 },
    );
    await fs.chmod(bridgeConfigPath, 0o600).catch(() => undefined);
    if (mgr?.opencodeRuntime) {
      mgr.opencodeRuntime.bridgeUrl = activeBridge.url;
      mgr.opencodeRuntime.bridgeToken = activeBridge.token;
    }
  };

  // ── Session teardown ──────────────────────────────────────────────────────

  /**
   * Best-effort OpenCode-side worktree removal. Qeda still falls back to its
   * local `git worktree remove` if OpenCode is already gone.
   */
  const removeOpenCodeWorktree = async (
    runtime: BuilderRuntime,
    repositoryDirectory: string,
    worktreePath: string,
  ): Promise<boolean> => {
    const headers = {
      'x-opencode-directory': encodeURIComponent(repositoryDirectory),
    };
    const projects = await runtime.client.project.list({ headers });
    const project = projects.find(
      (candidate) => candidate.canonical === repositoryDirectory,
    );
    if (!project) return false;
    await runtime.client.worktree.remove(
      {
        projectID: project.id,
        directory: worktreePath,
        force: true,
      },
      { headers },
    );
    return true;
  };

  const interruptOpenCodeSession = async (
    runtime: BuilderRuntime | null,
    session: BuilderSessionSummary | null,
  ): Promise<void> => {
    if (!runtime || !session) return;
    await runtime.client.session
      .interrupt({ sessionID: session.id })
      .catch(() => undefined);
  };

  const emitSandboxPatchFailed = (payload: {
    error: string;
    savedPath?: string;
  }) => {
    if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('builder:sandbox-patch-failed', payload);
    }
  };

  /**
   * Capture the sandbox diff and apply it to the local repository before the
   * sandbox is destroyed. Shared by stop and detach so both teardown paths
   * preserve work and report an apply failure the same way.
   */
  const finalizeSandboxSession = async (
    sandbox: E2bSandboxHandle,
    repoDir: string,
    localDir: string | null,
  ): Promise<void> => {
    try {
      const patch = await capturePatch(sandbox, repoDir, sandbox.baseSha);
      if (!patch.trim()) return;
      if (!localDir) {
        const savedPath = await savePatchFile(patch);
        emitSandboxPatchFailed({
          error:
            'No local repository was recorded for this sandbox session. Apply the saved patch manually.',
          savedPath,
        });
        return;
      }
      const result = await applyPatchLocally(localDir, patch);
      if (!result.ok) {
        emitSandboxPatchFailed({
          error: `${result.error ?? 'git apply failed'} The sandbox started from ${sandbox.baseSha}; if your local HEAD has moved, apply the saved patch manually.`,
          savedPath: result.savedPath,
        });
      }
    } catch (error) {
      emitSandboxPatchFailed({
        error: `Could not capture changes from the sandbox: ${messageOf(error)}`,
      });
    } finally {
      await destroySandbox(sandbox).catch(() => undefined);
    }
  };

  /**
   * Stop the focused session: discard worktree, archive to history, clear DB.
   */
  const stopActive = async () => {
    const mgr = getFocusedManager();
    if (!mgr) return;

    const prevEngine = mgr.engine;
    const prevWorktree = mgr.worktreePath;
    const prevRepo = mgr.workspace?.directory ?? null;
    const prevSandbox = mgr.sandbox;
    const prevSandboxLocalDir = mgr.sandboxLocalDir;
    const prevRuntime = mgr.opencodeRuntime;
    const prevSession = mgr.session;

    // Archive to history before clearing
    if (mgr.session) {
      archiveActiveSession('discarded');
    }

    mgr.stop();

    if (bridge) {
      await bridge.stop().catch(() => undefined);
      bridge = null;
    }
    await clearBridgeConfig();

    // Remove from registry
    sessions.delete(mgr.sessionId);
    if (focusedSessionId === mgr.sessionId) {
      focusedSessionId = sessions.size > 0 ? (sessions.keys().next().value ?? null) : null;
    }

    // Notify renderer that the session list changed
    if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('builder:sessions:changed');
    }

    if (prevEngine === 'opencode' || prevEngine === 'opencode-sandbox') {
      await interruptOpenCodeSession(prevRuntime, prevSession);
    }
    if (prevEngine === 'opencode-sandbox' && prevSandbox) {
      await finalizeSandboxSession(
        prevSandbox,
        prevRepo ?? prevSandbox.repoDir,
        prevSandboxLocalDir,
      );
    }
    if (prevWorktree && prevRepo && prevEngine !== 'opencode-sandbox') {
      if (prevEngine === 'opencode' && prevRuntime) {
        await removeOpenCodeWorktree(prevRuntime, prevRepo, prevWorktree).catch(
          () => false,
        );
      }
      await removeBuilderWorktree(prevRepo, prevWorktree).catch(
        () => undefined,
      );
    }
    if (prevRuntime) {
      await prevRuntime.provider.dispose().catch(() => undefined);
    }
    // Local session stop is handled by mgr.stop() which clears the reference;
    // the caller needs to call prevLocal.stop() for full cleanup.
  };

  /**
   * Detach the focused session: preserve worktree and DB, archive to history.
   */
  const detachActive = async () => {
    const mgr = getFocusedManager();
    if (!mgr) return;

    const prevEngine = mgr.engine;
    const prevRuntime = mgr.opencodeRuntime;
    const prevSession = mgr.session;
    const prevRepo = mgr.workspace?.directory ?? null;
    const prevSandbox = mgr.sandbox;
    const prevSandboxLocalDir = mgr.sandboxLocalDir;

    // Archive to history before clearing
    if (mgr.session) {
      archiveActiveSession('detached');
    }

    mgr.detach();

    if (bridge) {
      await bridge.stop().catch(() => undefined);
      bridge = null;
    }
    await clearBridgeConfig();

    // Remove from registry
    sessions.delete(mgr.sessionId);
    if (focusedSessionId === mgr.sessionId) {
      focusedSessionId = sessions.size > 0 ? (sessions.keys().next().value ?? null) : null;
    }

    // Notify renderer that the session list changed
    if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('builder:sessions:changed');
    }

    if (prevEngine === 'opencode' || prevEngine === 'opencode-sandbox') {
      await interruptOpenCodeSession(prevRuntime, prevSession);
    }
    if (prevEngine === 'opencode-sandbox' && prevSandbox) {
      await finalizeSandboxSession(
        prevSandbox,
        prevRepo ?? prevSandbox.repoDir,
        prevSandboxLocalDir,
      );
    }
    if (prevRuntime) {
      await prevRuntime.provider.dispose().catch(() => undefined);
    }
  };

  // ── Guard helpers ─────────────────────────────────────────────────────────

  const requireSession = (): BuilderSessionSummary => {
    const mgr = getFocusedManager();
    if (!mgr?.session) {
      throw new Error(
        'Create a Builder session bound to a workspace before sending a prompt.',
      );
    }
    return mgr.session;
  };

  const requireOpenCodeSession = (): {
    runtime: BuilderRuntime;
    session: BuilderSessionSummary;
  } => {
    const mgr = getFocusedManager();
    if (!mgr?.session) {
      throw new Error(
        'Create a Builder session bound to a workspace before sending a prompt.',
      );
    }
    if (
      !mgr.opencodeRuntime ||
      (mgr.engine !== 'opencode' && mgr.engine !== 'opencode-sandbox')
    ) {
      throw new Error(
        'This operation requires an OpenCode Builder session. Switch the engine in Settings → Builder & MCP.',
      );
    }
    return { runtime: mgr.opencodeRuntime, session: mgr.session };
  };

  const requireLocalSession = (): {
    local: LocalBuilderSession;
    session: BuilderSessionSummary;
  } => {
    const mgr = getFocusedManager();
    if (!mgr?.session) {
      throw new Error(
        'Create a Builder session bound to a workspace before sending a prompt.',
      );
    }
    if (!mgr.localSession || mgr.engine !== 'local') {
      throw new Error(
        'This operation requires a Local Builder session. Switch the engine in Settings → Builder & MCP.',
      );
    }
    return { local: mgr.localSession, session: mgr.session };
  };

  /**
   * Local review surfaces (preview, file tree, Keep/Discard) read paths on this
   * machine. A sandbox session's workspace lives in E2B, so those handlers must
   * refuse rather than probe a remote path like `/home/user/repo` locally.
   */
  const assertNotSandboxWorkspace = () => {
    const mgr = getFocusedManager();
    if (mgr?.engine === 'opencode-sandbox') {
      throw new Error(
        'This view is unavailable while the session runs in an E2B sandbox. Stop the session to apply its patch locally, then review the changes.',
      );
    }
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
      {
        directory,
        runInSandbox,
        remoteUrl,
      }: { directory: string; runInSandbox?: boolean; remoteUrl?: string },
    ): Promise<BuilderSessionStart> => {
      const workspace = await inspectBuilderWorkspace(directory, {
        autoInit: true,
      });
      await stopActive();

      const engine = getSettings().builderEngine ?? 'local';
      const mgr = createManager();
      mgr.sessionId = `local-${Date.now().toString(36)}`;
      sessions.set(mgr.sessionId, mgr);
      focusedSessionId = mgr.sessionId;

      // ── E2B sandbox path ───────────────────────────────────────────────────
      if (runInSandbox) {
        const sourceRemoteUrl = await resolveSourceRemoteUrl({
          remoteUrl,
          directory,
        });
        const settings = getSettings();
        const githubToken =
          settings.githubPat ||
          process.env.GITHUB_PAT ||
          process.env.GITHUB_TOKEN ||
          undefined;
        const envs: Record<string, string> = {};
        // Forward provider keys from settings into the sandbox env.
        for (const [pid, p] of Object.entries(settings.providers ?? {})) {
          if (p?.apiKey) {
            const envName = `${pid.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`;
            envs[envName] = p.apiKey;
          }
        }
        for (const cp of settings.customProviders ?? []) {
          if (cp?.apiKey) {
            envs[`${cp.id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`] =
              cp.apiKey;
          }
        }
        const timeoutMs = settings.e2bSandboxTimeoutMs ?? 3_600_000;

        let sandbox;
        try {
          sandbox = await createSandbox({
            remoteUrl: sourceRemoteUrl,
            githubToken,
            timeoutMs,
            template: settings.e2bSandboxTemplate,
            envs,
          });
        } catch (error) {
          throw new Error(
            `Failed to create E2B sandbox: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
        }

        const result = await connectBuilderRuntime({
          baseUrl: sandbox.baseUrl,
          headers: sandbox.headers,
        });
        if (!result.runtime) {
          await destroySandbox(sandbox).catch(() => undefined);
          throw new Error(result.status.message);
        }

        mgr.opencodeRuntime = result.runtime;
        mgr.sandbox = sandbox;
        mgr.sandboxLocalDir = workspace.directory;

        const sessionDirectory = sandbox.repoDir;

        const createSession = (agent?: string) =>
          mgr.opencodeRuntime!.client.session.create({
            title: `Builder · ${workspace.name}`,
            location: { directory: sessionDirectory },
            ...(agent ? { agent } : {}),
          });

        let ocSession;
        try {
          try {
            ocSession = await createSession('qeda-builder');
          } catch {
            ocSession = await createSession();
          }
        } catch (error) {
          await destroySandbox(sandbox).catch(() => undefined);
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
          directory: sandbox.repoDir,
          worktreePath: sandbox.repoDir,
          sandbox: true,
        };

        mgr.session = summary;
        mgr.workspace = boundWorkspace;
        mgr.worktreePath = sandbox.repoDir;
        mgr.engine = 'opencode-sandbox';

        // The host-local bridge binds 127.0.0.1 and is unreachable from E2B,
        // so sandbox sessions deliberately skip it. The qeda_* plugin tools are
        // unavailable there; workspace/review surfaces explain that in the UI.
        const controller = new AbortController();
        mgr.eventController = controller;
        void (async () => {
          try {
            for await (const event of mgr.opencodeRuntime!.client.event.subscribe({
              signal: controller.signal,
            })) {
              if (controller.signal.aborted || mgr.eventController !== controller) {
                return;
              }
              const normalized = normalizeBuilderSessionEvent(
                event,
                ocSession.id,
                {
                  directory: sessionDirectory,
                },
              );
              if (normalized) mgr.broadcast(normalized);
            }
          } catch (error) {
            if (!controller.signal.aborted && mgr.eventController === controller) {
              mgr.broadcast(
                mgr.localEvent({
                  type: 'error',
                  message:
                    error instanceof Error ? error.message : String(error),
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
          engine: 'opencode-sandbox',
          created_at: summary.createdAt,
        });

        return { session: summary, workspace: boundWorkspace };
      }

      // ── Local engine path ─────────────────────────────────────────────────
      if (engine === 'local') {
        const worktreeParentDirectory = BuilderSessionManager.getWorktreeParentDirectory();
        const {
          session,
          summary,
          workspace: boundWorkspace,
        } = await createLocalBuilderSession({
          workspaceDirectory: workspace.directory,
          onEvent: (event: BuilderSessionEvent) => mgr.broadcast(event),
          worktreeParentDirectory,
        });

        mgr.localSession = session;
        mgr.session = summary;
        mgr.workspace = boundWorkspace;
        mgr.worktreePath = boundWorkspace.worktreePath ?? null;
        mgr.engine = 'local';

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

      mgr.opencodeRuntime = result.runtime;

      let worktreePath: string;
      try {
        const locationHeaders = {
          'x-opencode-directory': encodeURIComponent(workspace.directory),
        };
        const projects = await mgr.opencodeRuntime.client.project.list({
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
        const worktreeName = `qeda-builder-${Date.now().toString(36)}`;
        const worktreeParent = BuilderSessionManager.getWorktreeParentDirectory();
        const worktree = await mgr.opencodeRuntime.client.worktree
          .create(
            {
              projectID: opencodeProject.id,
              directory: path.join(worktreeParent, worktreeName),
              name: worktreeName,
            },
            { headers: locationHeaders },
          )
          .catch(() =>
            mgr.opencodeRuntime!.client.worktree.create(
              { projectID: opencodeProject.id },
              { headers: locationHeaders },
            ),
          );
        worktreePath = worktree.directory;
      } catch (error) {
        await mgr.opencodeRuntime.provider.dispose().catch(() => undefined);
        mgr.opencodeRuntime = null;
        throw new Error(
          `Builder could not create an isolated workspace, so it did not start. Your repository was not changed. ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }

      const sessionDirectory = worktreePath ?? workspace.directory;

      const createSession = (agent?: string) =>
        mgr.opencodeRuntime!.client.session.create({
          title: `Builder · ${workspace.name}`,
          location: { directory: sessionDirectory },
          ...(agent ? { agent } : {}),
        });

      let ocSession;
      try {
        try {
          ocSession = await createSession('qeda-builder');
        } catch {
          ocSession = await createSession();
        }
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

      mgr.session = summary;
      mgr.workspace = boundWorkspace;
      mgr.worktreePath = worktreePath;
      mgr.engine = 'opencode';
      mgr.resetPlanManager();

      try {
        await startSessionBridge();
      } catch (error) {
        await stopActive();
        throw new Error(
          `Builder could not start the Qeda bridge: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }

      const controller = new AbortController();
      mgr.eventController = controller;
      void (async () => {
        try {
          for await (const event of mgr.opencodeRuntime!.client.event.subscribe({
            signal: controller.signal,
          })) {
            if (controller.signal.aborted || mgr.eventController !== controller) {
              return;
            }
            const normalized = normalizeBuilderSessionEvent(
              event,
              ocSession.id,
              { directory: sessionDirectory },
            );
            if (normalized) mgr.broadcast(normalized);
          }
        } catch (error) {
          if (!controller.signal.aborted && mgr.eventController === controller) {
            mgr.broadcast(
              mgr.localEvent({
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
      const mgr = getFocusedManager();
      if (mgr?.session) {
        return mgr.getSessionState();
      }

      const persisted = getActiveBuilderSession();
      if (!persisted) {
        return { session: null, workspace: null, events: [] };
      }

      const engine = (persisted.engine ?? 'opencode') as
        'local' | 'opencode' | 'opencode-sandbox';

      if (engine === 'opencode-sandbox') {
        deleteActiveBuilderSession();
        return { session: null, workspace: null, events: [] };
      }

      const restoredMgr = createManager();
      restoredMgr.sessionId = `local-${Date.now().toString(36)}`;
      sessions.set(restoredMgr.sessionId, restoredMgr);
      focusedSessionId = restoredMgr.sessionId;

      if (engine === 'local') {
        if (!persisted.worktree_path) {
          deleteActiveBuilderSession();
          sessions.delete(restoredMgr.sessionId);
          return { session: null, workspace: null, events: [] };
        }
        try {
          const worktreeStat = await fs.stat(persisted.worktree_path);
          if (!worktreeStat.isDirectory()) throw new Error('not a directory');
          const source = await inspectBuilderWorkspace(persisted.repo_directory);
          const restoredWorkspace: BuilderWorkspace = {
            ...source,
            worktreePath: persisted.worktree_path,
          };
          const { parseStoredArray } = await import('../../builder/session-manager.js');
          const restored = new LocalBuilderSession(
            persisted.opencode_session_id,
            restoredWorkspace,
            persisted.worktree_path,
            (event: BuilderSessionEvent) => restoredMgr.broadcast(event),
            undefined,
            {
              id: persisted.opencode_session_id,
              title: persisted.title,
              createdAt: persisted.created_at,
              messages: parseStoredArray<ModelMessage>(persisted.messages_json),
            },
          );

          restoredMgr.localSession = restored;
          restoredMgr.session = restored.getSummary();
          restoredMgr.workspace = restoredWorkspace;
          restoredMgr.worktreePath = persisted.worktree_path;
          restoredMgr.engine = 'local';
          restoredMgr.eventBuffer = parseStoredArray<BuilderSessionEvent>(
            persisted.events_json,
          );

          return restoredMgr.getSessionState();
        } catch {
          deleteActiveBuilderSession();
          sessions.delete(restoredMgr.sessionId);
          return { session: null, workspace: null, events: [] };
        }
      }

      // OpenCode sessions: try to reconnect.
      try {
        const result = await connectBuilderRuntime();
        if (!result.runtime) {
          deleteActiveBuilderSession();
          sessions.delete(restoredMgr.sessionId);
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
          sessions.delete(restoredMgr.sessionId);
          return { session: null, workspace: null, events: [] };
        }

        restoredMgr.opencodeRuntime = result.runtime;
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

        if (persisted.worktree_path) {
          try {
            const stat = await fs.stat(persisted.worktree_path);
            if (!stat.isDirectory()) throw new Error('not a directory');
          } catch {
            deleteActiveBuilderSession();
            await restoredMgr.opencodeRuntime.provider.dispose().catch(() => undefined);
            sessions.delete(restoredMgr.sessionId);
            return { session: null, workspace: null, events: [] };
          }
        }

        restoredMgr.session = summary;
        restoredMgr.workspace = restoredWorkspace;
        restoredMgr.worktreePath = persisted.worktree_path;
        restoredMgr.engine = 'opencode';
        const { parseStoredArray } = await import('../../builder/session-manager.js');
        restoredMgr.eventBuffer = parseStoredArray<BuilderSessionEvent>(
          persisted.events_json,
        );
        restoredMgr.resetPlanManager();

        try {
          await startSessionBridge();
        } catch (error) {
          restoredMgr.broadcast(
            restoredMgr.localEvent({
              type: 'error',
              message: `Qeda tools are unavailable for this restored session: ${
                error instanceof Error ? error.message : String(error)
              }`,
            }),
          );
        }

        const sessionDirectory =
          persisted.worktree_path ?? persisted.repo_directory;
        const controller = new AbortController();
        restoredMgr.eventController = controller;
        void (async () => {
          try {
            for await (const event of restoredMgr.opencodeRuntime!.client.event.subscribe({
              signal: controller.signal,
            })) {
              if (controller.signal.aborted || restoredMgr.eventController !== controller)
                return;
              const normalized = normalizeBuilderSessionEvent(
                event,
                ocSession.id,
                { directory: sessionDirectory },
              );
              if (normalized) restoredMgr.broadcast(normalized);
            }
          } catch (error) {
            if (!controller.signal.aborted && restoredMgr.eventController === controller) {
              restoredMgr.broadcast(
                restoredMgr.localEvent({
                  type: 'error',
                  message:
                    error instanceof Error ? error.message : String(error),
                }),
              );
            }
          }
        })();

        return restoredMgr.getSessionState();
      } catch {
        deleteActiveBuilderSession();
        sessions.delete(restoredMgr.sessionId);
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
      const mgr = getFocusedManager();
      if (mgr?.engine === 'local') {
        const s = getSettings();
        const sel = mgr.localSession?.getModel() ?? {
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
      const directory = mgr?.activeBuilderDirectory();
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
      const mgr = getFocusedManager();
      if (mgr?.engine === 'local') {
        const { local } = requireLocalSession();
        local.setModel(providerID, modelID);
        return;
      }

      const { runtime: rt, session } = requireOpenCodeSession();
      if (mgr?.running)
        throw new Error(
          'Wait for the current turn to finish before changing models.',
        );
      const directory = mgr?.activeBuilderDirectory();
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
      const mgr = getFocusedManager();
      const session = requireSession();
      if (!mgr?.workspace?.worktreePath) {
        throw new Error(
          'This legacy session is not isolated. Choose a repository again to start a protected Builder session.',
        );
      }
      const trimmed = typeof text === 'string' ? text.trim() : '';
      if (!trimmed) throw new Error('Write a prompt before sending.');

      if (mgr.engine === 'local') {
        const { local } = requireLocalSession();
        await local.prompt(trimmed);
        return;
      }

      const { runtime: rt } = requireOpenCodeSession();
      mgr.resetPlanManager();
      mgr.broadcast(mgr.localEvent({ type: 'user-prompt', text: trimmed }));
      mgr.running = true;
      mgr.broadcast(mgr.localEvent({ type: 'status', status: 'running' }));
      try {
        await rt.client.session.prompt({
          sessionID: session.id,
          text: trimmed,
        });
      } catch (error) {
        mgr.running = false;
        const message = error instanceof Error ? error.message : String(error);
        mgr.broadcast(mgr.localEvent({ type: 'error', message }));
        throw new Error(message, { cause: error });
      }
    },
  );

  // ── Abort ─────────────────────────────────────────────────────────────────

  ipcMain.handle('builder:abort', async () => {
    const mgr = getFocusedManager();
    const session = requireSession();

    if (mgr?.engine === 'local') {
      const { local } = requireLocalSession();
      local.abort();
      return;
    }

    const { runtime: rt } = requireOpenCodeSession();
    try {
      await rt.client.session.interrupt({ sessionID: session.id });
    } finally {
      if (mgr) {
        mgr.running = false;
        mgr.broadcast(mgr.localEvent({ type: 'status', status: 'interrupted' }));
      }
    }
  });

  // Disconnect keeps the worktree and the persisted row so the user can
  // re-attach; the explicit Discard action below is the destructive path.
  ipcMain.handle('builder:session-detach', async () => {
    await detachActive();
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
      const mgr = getFocusedManager();
      if (mgr?.engine === 'local') {
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

  ipcMain.handle('builder:preview-status', (): BuilderPreviewStatus => {
    const mgr = getFocusedManager();
    return mgr?.preview.getStatus() ?? EMPTY_PREVIEW_STATUS;
  });

  ipcMain.handle(
    'builder:preview-start',
    async (
      _event,
      req?: { script?: string; command?: string },
    ): Promise<BuilderPreviewStatus> => {
      assertNotSandboxWorkspace();
      const mgr = getFocusedManager();
      if (!mgr?.workspace) {
        throw new Error('Create a Builder session before starting a preview.');
      }
      const previewDir = mgr.worktreePath ?? mgr.workspace.directory;
      await inspectBuilderWorkspace(previewDir);
      return mgr.preview.start({
        directory: previewDir,
        script: req?.script,
        command: req?.command,
      });
    },
  );

  ipcMain.handle('builder:preview-stop', (): Promise<BuilderPreviewStatus> => {
    const mgr = getFocusedManager();
    if (!mgr) throw new Error('No active session.');
    return mgr.preview.stop();
  });

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
      assertNotSandboxWorkspace();
      const mgr = getFocusedManager();
      if (!mgr?.workspace) return [];
      return readWorkspaceFiles(
        mgr.workspace.worktreePath ?? mgr.workspace.directory,
      );
    },
  );

  ipcMain.handle(
    'builder:workspace-changes',
    async (): Promise<
      import('../../../lib/builder-workspace.js').BuilderFileChange[]
    > => {
      assertNotSandboxWorkspace();
      const mgr = getFocusedManager();
      if (!mgr?.workspace) return [];
      return readWorkspaceChanges(
        mgr.workspace.worktreePath ?? mgr.workspace.directory,
      );
    },
  );

  ipcMain.handle(
    'builder:workspace-file-read',
    async (_event, { filePath }: { filePath: string }) => {
      assertNotSandboxWorkspace();
      const mgr = getFocusedManager();
      if (!mgr?.workspace) {
        throw new Error('No active workspace. Choose a project folder first.');
      }
      const root = mgr.workspace.worktreePath ?? mgr.workspace.directory;
      return readWorkspaceFileContent(root, filePath);
    },
  );

  ipcMain.handle('builder:changes-keep', async () => {
    assertNotSandboxWorkspace();
    const mgr = getFocusedManager();
    if (!mgr?.workspace) {
      throw new Error('No active workspace to apply changes from.');
    }
    const { worktreePath, directory } = mgr.workspace;
    if (!worktreePath) {
      throw new Error(
        'Keep is unavailable because this legacy session is working directly in your repository.',
      );
    }
    const paths = await applyWorktreeChanges(directory, worktreePath);
    try {
      const refreshed = await inspectBuilderWorkspace(directory);
      mgr.workspace = { ...refreshed, worktreePath };
    } catch {
      // Keep succeeded; a stale count is cosmetic and self-corrects on restart.
    }
    return { paths };
  });

  ipcMain.handle('builder:changes-discard', async () => {
    assertNotSandboxWorkspace();
    const mgr = getFocusedManager();
    if (!mgr?.workspace) {
      throw new Error('No active workspace to discard changes in.');
    }
    if (!mgr.workspace.worktreePath) {
      throw new Error(
        'Discard is unavailable because this legacy session is working directly in your repository. Review and restore its changes manually.',
      );
    }
    await discardWorktreeChanges(mgr.workspace.worktreePath);
    try {
      const refreshed = await inspectBuilderWorkspace(mgr.workspace.directory);
      mgr.workspace = {
        ...refreshed,
        worktreePath: mgr.workspace.worktreePath,
      };
    } catch {
      // Cosmetic; the worktree itself is already reset.
    }
  });

  // ── Session management channels ────────────────────────────────────────────

  ipcMain.handle('builder:sessions:list', async (): Promise<BuilderSessionHistoryEntry[]> => {
    return listBuilderSessionHistory();
  });

  ipcMain.handle(
    'builder:sessions:restore',
    async (_event, { id }: { id: string }): Promise<BuilderSessionState> => {
      const record = getBuilderSessionHistory(id);
      if (!record) {
        throw new Error('Session not found in history.');
      }
      // Restore by re-creating the active session row
      saveActiveBuilderSession({
        opencode_session_id: record.opencode_session_id,
        title: record.title,
        repo_directory: record.repo_directory,
        worktree_path: record.worktree_path,
        workspace_name: record.workspace_name,
        branch: record.branch,
        engine: record.engine,
        created_at: record.created_at,
      });
      // Update status to active
      try {
        const { getDb } = await import('../../db/client.js');
        getDb().prepare(
          `UPDATE builder_session_history SET status = 'active', ended_at = NULL WHERE id = ?`,
        ).run(id);
      } catch { /* best effort */ }

      // Clear focused session so session-state will restore from DB
      focusedSessionId = null;
      sessions.clear();

      // Reuse the session-state restore logic
      const persisted = getActiveBuilderSession();
      if (!persisted) {
        return { session: null, workspace: null, events: [] };
      }

      const engine = (persisted.engine ?? 'opencode') as
        | 'local'
        | 'opencode'
        | 'opencode-sandbox';

      if (engine === 'opencode-sandbox') {
        deleteActiveBuilderSession();
        return { session: null, workspace: null, events: [] };
      }

      const restoredMgr = createManager();
      restoredMgr.sessionId = `local-${Date.now().toString(36)}`;
      sessions.set(restoredMgr.sessionId, restoredMgr);
      focusedSessionId = restoredMgr.sessionId;

      if (engine === 'local') {
        if (!persisted.worktree_path) {
          deleteActiveBuilderSession();
          sessions.delete(restoredMgr.sessionId);
          return { session: null, workspace: null, events: [] };
        }
        try {
          const worktreeStat = await fs.stat(persisted.worktree_path);
          if (!worktreeStat.isDirectory()) throw new Error('not a directory');
          const source = await inspectBuilderWorkspace(persisted.repo_directory);
          const restoredWorkspace: BuilderWorkspace = {
            ...source,
            worktreePath: persisted.worktree_path,
          };
          const { parseStoredArray } = await import(
            '../../builder/session-manager.js'
          );
          const restored = new LocalBuilderSession(
            persisted.opencode_session_id,
            restoredWorkspace,
            persisted.worktree_path,
            (event: BuilderSessionEvent) => restoredMgr.broadcast(event),
            undefined,
            {
              id: persisted.opencode_session_id,
              title: persisted.title,
              createdAt: persisted.created_at,
              messages: parseStoredArray<ModelMessage>(persisted.messages_json),
            },
          );

          restoredMgr.localSession = restored;
          restoredMgr.session = restored.getSummary();
          restoredMgr.workspace = restoredWorkspace;
          restoredMgr.worktreePath = persisted.worktree_path;
          restoredMgr.engine = 'local';
          const { parseStoredArray: psa } = await import(
            '../../builder/session-manager.js'
          );
          restoredMgr.eventBuffer = psa<BuilderSessionEvent>(
            persisted.events_json,
          );

          return restoredMgr.getSessionState();
        } catch {
          deleteActiveBuilderSession();
          sessions.delete(restoredMgr.sessionId);
          return { session: null, workspace: null, events: [] };
        }
      }

      // OpenCode sessions: try to reconnect
      try {
        const result = await connectBuilderRuntime();
        if (!result.runtime) {
          deleteActiveBuilderSession();
          sessions.delete(restoredMgr.sessionId);
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
          sessions.delete(restoredMgr.sessionId);
          return { session: null, workspace: null, events: [] };
        }

        restoredMgr.opencodeRuntime = result.runtime;
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

        if (persisted.worktree_path) {
          try {
            const stat = await fs.stat(persisted.worktree_path);
            if (!stat.isDirectory()) throw new Error('not a directory');
          } catch {
            deleteActiveBuilderSession();
            await restoredMgr.opencodeRuntime
              .provider.dispose()
              .catch(() => undefined);
            sessions.delete(restoredMgr.sessionId);
            return { session: null, workspace: null, events: [] };
          }
        }

        restoredMgr.session = summary;
        restoredMgr.workspace = restoredWorkspace;
        restoredMgr.worktreePath = persisted.worktree_path;
        restoredMgr.engine = 'opencode';
        const { parseStoredArray } = await import(
          '../../builder/session-manager.js'
        );
        restoredMgr.eventBuffer = parseStoredArray<BuilderSessionEvent>(
          persisted.events_json,
        );
        restoredMgr.resetPlanManager();

        try {
          await startSessionBridge();
        } catch (error) {
          restoredMgr.broadcast(
            restoredMgr.localEvent({
              type: 'error',
              message: `Qeda tools unavailable: ${
                error instanceof Error ? error.message : String(error)
              }`,
            }),
          );
        }

        const sessionDirectory =
          persisted.worktree_path ?? persisted.repo_directory;
        const controller = new AbortController();
        restoredMgr.eventController = controller;
        void (async () => {
          try {
            for await (const event of restoredMgr.opencodeRuntime!.client.event
              .subscribe({ signal: controller.signal })) {
              if (
                controller.signal.aborted ||
                restoredMgr.eventController !== controller
              )
                return;
              const normalized = normalizeBuilderSessionEvent(
                event,
                ocSession.id,
                { directory: sessionDirectory },
              );
              if (normalized) restoredMgr.broadcast(normalized);
            }
          } catch (error) {
            if (
              !controller.signal.aborted &&
              restoredMgr.eventController === controller
            ) {
              restoredMgr.broadcast(
                restoredMgr.localEvent({
                  type: 'error',
                  message:
                    error instanceof Error ? error.message : String(error),
                }),
              );
            }
          }
        })();

        return restoredMgr.getSessionState();
      } catch {
        deleteActiveBuilderSession();
        sessions.delete(restoredMgr.sessionId);
        return { session: null, workspace: null, events: [] };
      }
    },
  );

  ipcMain.handle(
    'builder:sessions:delete',
    async (_event, { id, deleteWorktree }: { id: string; deleteWorktree?: boolean }): Promise<boolean> => {
      const record = getBuilderSessionHistory(id);
      if (record?.worktree_path && deleteWorktree) {
        await removeBuilderWorktreeDir(record.worktree_path).catch(() => undefined);
      }
      return deleteBuilderSessionHistory(id);
    },
  );

  ipcMain.handle(
    'builder:sessions:focus',
    async (_event, { id }: { id: string }): Promise<void> => {
      setFocusedSession(id);
      if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('builder:sessions:changed');
      }
    },
  );

  ipcMain.handle('builder:worktrees:list', async (): Promise<BuilderWorktreeEntry[]> => {
    const parentDir = BuilderSessionManager.getWorktreeParentDirectory();
    const registered = new Set<string>();
    for (const mgr of sessions.values()) {
      if (mgr.worktreePath) registered.add(mgr.worktreePath);
    }
    return listBuilderWorktrees(parentDir, registered);
  });

  ipcMain.handle(
    'builder:worktrees:cleanup',
    async (_event, { path: worktreePath }: { path: string }): Promise<boolean> => {
      return removeBuilderWorktreeDir(worktreePath);
    },
  );

  ipcMain.handle(
    'builder:sessions:active-list',
    async (): Promise<import('../../../lib/builder-session.js').BuilderActiveSessionSummary[]> => {
      const summaries: import('../../../lib/builder-session.js').BuilderActiveSessionSummary[] = [];
      for (const [id, mgr] of sessions.entries()) {
        if (!mgr.session) continue;
        summaries.push({
          id,
          title: mgr.session.title,
          repoDirectory: mgr.workspace?.directory ?? '',
          branch: mgr.workspace?.branch ?? null,
          running: mgr.running,
          isFocused: id === focusedSessionId,
        });
      }
      return summaries;
    },
  );

  // ── Cleanup ───────────────────────────────────────────────────────────────

  mainWindow.once('closed', () => {
    for (const mgr of sessions.values()) {
      mgr.dispose();
    }
    sessions.clear();
    void detachActive();
  });
}
