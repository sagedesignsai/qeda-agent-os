/**
 * ipc/handlers.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Registers all IPC handlers on the main process side.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { exec } from 'node:child_process';
import path from 'node:path';
import {
  ipcMain,
  dialog,
  BrowserWindow,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import {
  convertToModelMessages,
  isStepCount,
  type UIMessage,
} from 'ai';
import {
  listSessions,
  createSession,
  deleteSession,
  updateSessionTitle,
  loadMessages,
  upsertMessage,
} from '../db/sessions';
import {
  getRawSettings,
  getSettings,
  saveSettings,
  type AppSettings,
} from '../ai/settings';
import { PROVIDERS, envApiKey } from '../ai/registry';
import { listProviderModels, resolveModelChain } from '../ai/provider';
import {
  describeFallbackReason,
  isOutputChunk,
  isRetryableProviderError,
  type ModelTarget,
} from '../ai/fallback';
import type { ProviderInfo, PageDetail, ChatContext } from './channels';
import { createDesktopAgent, type WorkspaceContext } from '../ai/agent';
import { allTools, toolApprovalPolicy } from '../tools/index.js';
import {
  listNotebooks,
  createNotebook,
  updateNotebook,
  deleteNotebook,
  listPages,
  getPage,
  createPage,
  updatePage,
  deletePage,
  loadPageBlocks,
  loadPageMarkdown,
  savePageBlocks,
  searchPages,
  listPageVersions,
  listBacklinks,
  listOutgoingLinks,
  listPageTags,
  relatedPages,
  restoreVersion,
  listTags,
} from '../db/workspace';
import {
  getResearchTrace,
  listResearchRuns,
} from '../db/research';
import { listServiceStatuses } from '../services/keys';
import { isBlockType } from '../../lib/markdown-blocks.js';
import {
  listTerminalSessions,
  getTerminalSession,
  createTerminalSession,
  deleteTerminalSession,
  updateTerminalSession,
  getSessionBlocks,
  getBlock,
  updateBlock,
} from '../db/terminal';
import { getPtyManager } from '../pty/manager.js';
import {
  runGoal,
  resolveApproval,
  explainBlock,
  suggestFix,
  executeDirectCommand,
  stopCommand,
  stopSessionProcesses,
  type TerminalAgentEmitter,
} from '../ai/terminal-agent';
import { clearSessionEnv } from '../ai/shell-env.js';
import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  incrementPomodoro,
} from '../db/tasks';
import {
  listSteps,
  createStep,
  createSteps,
  setStepDone,
  deleteStep,
  stepProgressMap,
} from '../db/task-steps';
import {
  listBlocks,
  createBlock,
  updateBlock,
  deleteBlock,
} from '../db/task-blocks';
import {
  createFocusSession,
  listFocusSessions,
  getFocusStats,
  startOfDay,
} from '../db/focus-sessions';
import {
  breakdownTask,
  expandBrainDump,
  planDay,
} from '../ai/task-copilot';
import { createTaskCopilotAgent } from '../ai/task-copilot-agent';

/** One cached agent per provider/model pair, for the duration of the session. */
const agentCache = new Map<string, ReturnType<typeof createDesktopAgent>>();

/** The turn's operating mode, inferred from the user's latest message. */
type AgentMode = 'chat' | 'research' | 'notebook';

function cacheKey(target: ModelTarget, mode: AgentMode, context?: ChatContext): string {
  const ctx = context?.pageId
    ? `p:${context.pageId}`
    : context?.notebookId
      ? `n:${context.notebookId}`
      : '-';
  return `${target.providerId}::${target.modelId}::${mode}::${ctx}`;
}

function getAgent(
  target: ModelTarget,
  mode: AgentMode,
  context?: ChatContext,
): ReturnType<typeof createDesktopAgent> {
  const key = cacheKey(target, mode, context);
  let agent = agentCache.get(key);
  if (!agent) {
    agent = createDesktopAgent({
      target,
      researchMode: mode !== 'chat',
      notebookMode: mode === 'notebook',
      context: context as WorkspaceContext | undefined,
    });
    agentCache.set(key, agent);
  }
  return agent;
}

function resetAgents() {
  agentCache.clear();
}

/** Text of the user's latest message, concatenated (empty when there is none). */
function lastUserText(messages: UIMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) return '';
  return lastUser.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join(' ');
}

/**
 * Heuristic: pick the system-prompt mode for this turn from the user's latest
 * message. "Notebook" verbs (build me a tutorial/guide/paper) also imply the
 * research protocol, since a generated notebook must be researched first.
 */
function detectMode(messages: UIMessage[]): AgentMode {
  const text = lastUserText(messages);
  if (
    /\b(notebook|tutorial|walkthrough|guide|paper|documentation|getting[\s-]?started|step[\s-]?by[\s-]?step|from scratch)\b/i.test(
      text,
    )
  ) {
    return 'notebook';
  }
  if (
    /\b(research|investigate|deep[\s-]?dive|report on|write a report|analyze|analyse|summarise|summarize)\b/i.test(
      text,
    )
  ) {
    return 'research';
  }
  return 'chat';
}

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // ── Sessions ──────────────────────────────────────────────────────────────

  ipcMain.handle('sessions:list', () => listSessions());

  ipcMain.handle('sessions:create', (_e, { title }: { title?: string }) =>
    createSession(title),
  );

  ipcMain.handle('sessions:delete', (_e, { id }: { id: string }) =>
    deleteSession(id),
  );

  ipcMain.handle('sessions:rename', (_e, { id, title }: { id: string; title: string }) =>
    updateSessionTitle(id, title),
  );

  ipcMain.handle('sessions:messages', (_e, { id }: { id: string }) =>
    loadMessages(id),
  );

  // The renderer owns the reconstructed UIMessages, so it hands them back for
  // persistence. Upserts are keyed by message id, making re-sends idempotent.
  ipcMain.handle(
    'sessions:save-messages',
    (_e, { sessionId, messages }: { sessionId: string; messages: UIMessage[] }) => {
      if (!sessionId || !Array.isArray(messages)) return;
      for (const message of messages) {
        if (message?.id && Array.isArray(message.parts)) {
          upsertMessage(sessionId, message);
        }
      }
    },
  );

  // ── Settings ──────────────────────────────────────────────────────────────

  ipcMain.handle('settings:get', () => {
    const s = getRawSettings();
    // Only expose whether a key is set (boolean), never the actual value.
    const sanitizedProviders: Record<string, { apiKey?: boolean; baseURL?: string }> = {};
    for (const [k, v] of Object.entries(s.providers)) {
      sanitizedProviders[k] = {
        apiKey: !!(v as { apiKey?: string })?.apiKey,
        baseURL: (v as { baseURL?: string })?.baseURL,
      };
    }
    const serviceKeysSet: Record<string, boolean> = {};
    for (const status of listServiceStatuses()) {
      serviceKeysSet[status.id] = status.configured;
    }

    return {
      activeProvider: s.activeProvider,
      activeModel: s.activeModel,
      fallbackEnabled: s.fallbackEnabled !== false,
      braveApiKeySet: Boolean(s.braveApiKey),
      providers: sanitizedProviders,
      serviceKeysSet,
    };
  });

  ipcMain.handle('settings:save', (_e, incoming: Partial<AppSettings>) => {
    // The renderer only sends the fields it edits, so merge over the decrypted
    // current settings rather than replacing them – otherwise saving would drop
    // unrelated configuration such as custom providers or the embedding setup.
    const current = getSettings();
    const merged: AppSettings = {
      ...current,
      ...incoming,
      providers: { ...current.providers, ...(incoming.providers ?? {}) },
    };
    // Brave key is only replaced when the renderer sends a new one; an empty
    // string clears it, an absent field leaves the stored value untouched.
    if (typeof incoming.braveApiKey === 'string') {
      merged.braveApiKey = incoming.braveApiKey.trim() || undefined;
    } else {
      merged.braveApiKey = current.braveApiKey;
    }
    // External-service keys: merge per service. A non-empty value replaces the
    // stored key; an empty string clears it. Absent services are untouched.
    if (incoming.serviceKeys) {
      const nextServiceKeys: Record<string, string> = { ...(current.serviceKeys ?? {}) };
      for (const [id, value] of Object.entries(incoming.serviceKeys)) {
        const trimmed = typeof value === 'string' ? value.trim() : '';
        if (trimmed) nextServiceKeys[id] = trimmed;
        else delete nextServiceKeys[id];
      }
      merged.serviceKeys = nextServiceKeys;
    }
    saveSettings(merged);
    resetAgents();
  });

  // ── Providers ─────────────────────────────────────────────────────────────

  ipcMain.handle('providers:list', (): ProviderInfo[] => {
    const settings = getSettings();

    return PROVIDERS.map((provider) => {
      const fromSettings = settings.providers?.[provider.id]?.apiKey;
      const hasStoredKey = Boolean(fromSettings && fromSettings.trim());
      const hasEnvKey = Boolean(envApiKey(provider));

      return {
        id: provider.id,
        name: provider.name,
        baseURL: provider.baseURL,
        freeModels: provider.freeModels ?? [],
        note: provider.note,
        // A keyless provider (a local Ollama) counts as configured.
        apiKeySet: hasStoredKey || hasEnvKey || !provider.apiKeyEnvs?.length,
        apiKeySource: hasStoredKey
          ? ('settings' as const)
          : hasEnvKey
            ? ('environment' as const)
            : null,
      };
    });
  });

  ipcMain.handle('providers:models', (_e, { providerId }: { providerId: string }) =>
    listProviderModels(providerId),
  );

  // ── External services ─────────────────────────────────────────────────────

  ipcMain.handle('services:list', () => listServiceStatuses());

  // ── Tools ─────────────────────────────────────────────────────────────────

  ipcMain.handle('tools:list', () => {
    return Object.entries(allTools).map(([name, t]) => ({
      name,
      description: typeof t.description === 'function' ? 'Tool' : (t.description ?? ''),
      requiresApproval: name in toolApprovalPolicy,
    }));
  });

  ipcMain.handle(
    'tools:execute',
    async (
      event: IpcMainInvokeEvent,
      { toolName, params }: { toolName: string; params: Record<string, unknown> },
    ) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const targetTool = (allTools as Record<string, any>)[toolName];
      if (!targetTool) {
        throw new Error(`Tool not found: ${toolName}`);
      }

      // Manual execution must honour the same approval policy as the agent
      // loop, otherwise the Tools page would be an approval bypass.
      if (toolName in toolApprovalPolicy) {
        const { response } = await dialog.showMessageBox(
          BrowserWindow.fromWebContents(event.sender) ?? mainWindow,
          {
            type: 'warning',
            buttons: ['Cancel', 'Run'],
            defaultId: 1,
            cancelId: 0,
            title: 'Confirm tool execution',
            message: `Run "${toolName}"?`,
            detail: `${targetTool.description ?? ''}\n\nArguments:\n${JSON.stringify(params, null, 2)}`,
          },
        );
        if (response !== 1) {
          return { success: false, denied: true, error: 'Execution cancelled by user.' };
        }
      }

      return await targetTool.execute(params, { messages: [] });
    },
  );

  // ── Workspace: notebooks ──────────────────────────────────────────────────

  ipcMain.handle('notebooks:list', () => listNotebooks());

  ipcMain.handle(
    'notebooks:create',
    (_e, { title, description, icon }: { title: string; description?: string; icon?: string }) =>
      createNotebook(title, description, icon),
  );

  ipcMain.handle(
    'notebooks:update',
    (_e, patch: { id: string; title?: string; description?: string; icon?: string }) => {
      const { id, ...rest } = patch;
      updateNotebook(id, rest);
    },
  );

  ipcMain.handle('notebooks:delete', (_e, { id }: { id: string }) => {
    deleteNotebook(id);
  });

  // ── Workspace: pages ──────────────────────────────────────────────────────

  ipcMain.handle('pages:list', (_e, { notebookId }: { notebookId?: string }) =>
    listPages(notebookId),
  );

  ipcMain.handle('pages:get', (_e, { id }: { id: string }): PageDetail | null => {
    const page = getPage(id);
    if (!page) return null;
    return {
      page,
      blocks: loadPageBlocks(id),
      markdown: loadPageMarkdown(id),
      tags: listPageTags(id),
      backlinks: listBacklinks(id).map((p) => ({ id: p.id, title: p.title })),
      outgoing: listOutgoingLinks(id).map((p) => ({ id: p.id, title: p.title })),
      related: relatedPages(id).map((p) => ({ id: p.id, title: p.title })),
      versions: listPageVersions(id),
    };
  });

  ipcMain.handle(
    'pages:create',
    (_e, { notebookId, title, parentPageId }: { notebookId: string; title: string; parentPageId?: string | null }) =>
      createPage(notebookId, title, parentPageId ?? null),
  );

  ipcMain.handle('pages:rename', (_e, { id, title }: { id: string; title: string }) => {
    updatePage(id, { title });
  });

  ipcMain.handle(
    'pages:move',
    (_e, { id, parentPageId }: { id: string; parentPageId: string | null; notebookId?: string }) => {
      updatePage(id, { parent_page: parentPageId });
    },
  );

  ipcMain.handle('pages:delete', (_e, { id }: { id: string }) => {
    deletePage(id);
  });

  ipcMain.handle(
    'pages:save-blocks',
    (_e, { id, blocks, title }: { id: string; blocks: unknown[]; title?: string }) => {
      // Blocks come from the renderer; validate the shape minimally before
      // they reach the store.
      const safeBlocks = (Array.isArray(blocks) ? blocks : []).map((b, index) => {
        const block = b as {
          id?: string;
          type?: string;
          text?: string;
          checked?: boolean;
          language?: string;
        };
        return {
          id: typeof block.id === 'string' && block.id ? block.id : `imported-${index}`,
          type: isBlockType(block.type) ? block.type : ('paragraph' as const),
          text: typeof block.text === 'string' ? block.text : '',
          ...(block.type === 'todo' ? { checked: Boolean(block.checked) } : {}),
          ...(block.type === 'code' && block.language ? { language: block.language } : {}),
        };
      });
      savePageBlocks(id, safeBlocks, {
        ...(title !== undefined ? { title } : {}),
        versionOrigin: 'manual',
      });
    },
  );

  ipcMain.handle('pages:search', (_e, { query, limit }: { query: string; limit?: number }) =>
    searchPages(query, limit ?? 20),
  );

  ipcMain.handle('pages:restore-version', (_e, { versionId }: { versionId: string }) => {
    return Boolean(restoreVersion(versionId));
  });

  ipcMain.handle('workspace:tags', () => listTags());

  // ── Research ──────────────────────────────────────────────────────────────

  ipcMain.handle('research:trace', (_e, { runId }: { runId: string }) => {
    const trace = getResearchTrace(runId);
    return trace ?? null;
  });

  ipcMain.handle(
    'research:list',
    (_e, filter: { pageId?: string; notebookId?: string }) => listResearchRuns(filter),
  );

  // ── Agent Chat (streaming) ────────────────────────────────────────────────

  ipcMain.handle(
    'agent:chat',
    async (
      _e,
      {
        sessionId,
        messages,
        context,
      }: { sessionId: string; messages: UIMessage[]; context?: ChatContext },
    ) => {
      const fail = (err: unknown) => {
        if (mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('agent:stream-error', {
          error: err instanceof Error ? err.message : String(err),
        });
      };

      try {
        // Convert UIMessages to model messages once and reuse them for every
        // attempt – the conversion is pure and the turn is stateless.
        const modelMessages = await convertToModelMessages(messages);

        const mode = detectMode(messages);
        const chain = resolveModelChain();
        if (chain.length === 0) {
          throw new Error(
            'No model configured. Pick a provider and model in Settings.',
          );
        }

        let lastError: unknown;

        for (let attempt = 0; attempt < chain.length; attempt += 1) {
          const target = chain[attempt];
          // Once a content-bearing chunk has reached the renderer this attempt
          // is committed: retrying elsewhere would duplicate or contradict
          // what the user can already see. Lifecycle chunks do not count – the
          // SDK emits `start` before a provider error.
          let emitted = false;

          try {
            const agent = getAgent(target, mode, context);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await (agent as any).stream({ messages: modelMessages });

            // `fullStream` reports provider failures as an `error` part rather
            // than throwing, so capture it and let the catch block decide.
            let streamError: unknown;
            for await (const chunk of result.fullStream) {
              if (mainWindow.isDestroyed()) return;
              if (chunk?.type === 'error') {
                streamError = chunk.error;
                break;
              }
              if (isOutputChunk(chunk?.type)) emitted = true;
              mainWindow.webContents.send('agent:stream-chunk', JSON.stringify(chunk));
            }

            if (streamError) throw streamError;

            // Persistence is handled by the renderer via
            // `sessions:save-messages` once it has folded the stream into
            // UIMessages – the raw model messages are not in UIMessage shape.
            mainWindow.webContents.send('agent:stream-done', { sessionId });
            return;
          } catch (err) {
            lastError = err;

            const isLast = attempt === chain.length - 1;
            const canFallback =
              !emitted && !isLast && isRetryableProviderError(err);

            if (!canFallback) break;

            const next = chain[attempt + 1];
            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send('agent:stream-fallback', {
                fromProvider: target.providerId,
                fromModel: target.modelId,
                toProvider: next.providerId,
                toModel: next.modelId,
                reason: describeFallbackReason(err),
              });
            }
          }
        }

        fail(lastError);
      } catch (err) {
        fail(err);
      }
    },
  );

  // ── Agentic terminal ──────────────────────────────────────────────────────

  /**
   * Bridge agent/direct-execution events onto IPC. Built once per call site so
   * `terminal:execute-command`, `terminal:rerun-block` and `terminal:run-goal`
   * all emit through an identical channel set — the renderer needs one code path.
   */
  const makeTerminalEmitter = (currentGoal?: string): TerminalAgentEmitter => ({
    onBlockProposed(block) {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:block-proposed', block);
      }
    },
    onBlockUpdated(patch) {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:block-update-event', patch);
      }
    },
    onDone(sid, summary) {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:agent-done', { sessionId: sid, summary });
      }
      // Auto-rename: truncate goal to a clean title and notify sidebar
      const autoTitle = currentGoal
        ? (currentGoal.length > 48 ? `${currentGoal.slice(0, 45)}…` : currentGoal)
        : undefined;
      updateTerminalSession(sid, {
        status: 'done',
        ...(autoTitle ? { title: autoTitle } : {}),
      });
      if (!mainWindow.isDestroyed()) {
        if (autoTitle) {
          mainWindow.webContents.send('terminal:session-renamed', {
            sessionId: sid,
            title: autoTitle,
          });
        }
        mainWindow.webContents.send('terminal:session-status', {
          sessionId: sid,
          status: 'done',
        });
        mainWindow.webContents.send('terminal:sessions-changed');
      }
    },
    onError(sid, error) {
      updateTerminalSession(sid, { status: 'error' });
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:agent-error', { sessionId: sid, error });
        mainWindow.webContents.send('terminal:session-status', {
          sessionId: sid,
          status: 'error',
        });
        mainWindow.webContents.send('terminal:sessions-changed');
      }
    },
  });

  ipcMain.handle('terminal:sessions-list', () => {
    const list = listTerminalSessions();
    const ptyMgr = getPtyManager();
    if (ptyMgr) {
      return list.map((session) => {
        if (ptyMgr.hasActiveRunningCommand(session.id)) {
          return { ...session, status: 'running' as const };
        }
        return session;
      });
    }
    return list;
  });

  ipcMain.handle('terminal:session-get', (_e, { id }: { id: string }) => {
    const session = getTerminalSession(id);
    if (!session) return null;
    const ptyMgr = getPtyManager();
    if (ptyMgr && ptyMgr.hasActiveRunningCommand(id)) {
      return { ...session, status: 'running' as const };
    }
    return session;
  });

  ipcMain.handle(
    'terminal:session-create',
    (_e, { title, goal, cwd }: { title?: string; goal?: string; cwd?: string }) => {
      const session = createTerminalSession({ title, goal, cwd });
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:sessions-changed');
      }
      return session;
    },
  );

  ipcMain.handle(
    'terminal:session-delete',
    (_e, { id }: { id: string }) => {
      stopSessionProcesses(id);
      getPtyManager()?.killBySessionId(id);
      clearSessionEnv(id);
      deleteTerminalSession(id);
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:sessions-changed');
      }
    },
  );

  ipcMain.handle(
    'terminal:session-rename',
    (_e, { id, title }: { id: string; title: string }) => {
      updateTerminalSession(id, { title });
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:session-renamed', { sessionId: id, title });
        mainWindow.webContents.send('terminal:sessions-changed');
      }
    },
  );

  ipcMain.handle(
    'terminal:blocks-get',
    (_e, { sessionId }: { sessionId: string }) => getSessionBlocks(sessionId),
  );

  ipcMain.handle(
    'terminal:block-update',
    (_e, { id, patch }: { id: string; patch: Parameters<typeof updateBlock>[1] }) =>
      updateBlock(id, patch),
  );

  ipcMain.handle(
    'terminal:run-goal',
    (_e, { sessionId, goal }: { sessionId: string; goal: string }) => {
      // Update the session with the goal text
      updateTerminalSession(sessionId, { goal, status: 'running' });

      // Notify sidebar immediately so the spinner appears
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:session-status', {
          sessionId,
          status: 'running',
        });
        mainWindow.webContents.send('terminal:sessions-changed');
      }

      // Build the emitter — bridges agent events to IPC events
      const emitter = makeTerminalEmitter(goal);

      // Fire-and-forget — agent runs async, IPC events carry progress
      void runGoal({ sessionId, goal, emitter });
    },
  );

  ipcMain.handle(
    'terminal:execute-command',
    (
      _e,
      { sessionId, command, cwd }: { sessionId: string; command: string; cwd?: string },
    ) => {
      const session = getTerminalSession(sessionId);
      const effectiveCwd = cwd || session?.cwd || process.cwd();

      // If the session title starts with "cd " and a real command is now run, update the title
      if (session && session.title.startsWith('cd ') && !command.trim().startsWith('cd')) {
        const folder = effectiveCwd ? path.basename(effectiveCwd) : '';
        const shortCmd = command.length > 25 ? `${command.slice(0, 22)}…` : command;
        const newTitle = `${shortCmd} · ${folder || 'terminal'}`;
        updateTerminalSession(sessionId, { title: newTitle });
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('terminal:session-renamed', {
            sessionId,
            title: newTitle,
          });
          mainWindow.webContents.send('terminal:sessions-changed');
        }
      }

      updateTerminalSession(sessionId, { status: 'running', ...(effectiveCwd ? { cwd: effectiveCwd } : {}) });
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:session-status', {
          sessionId,
          status: 'running',
        });
        mainWindow.webContents.send('terminal:sessions-changed');
      }

      const emitter = makeTerminalEmitter();
      void executeDirectCommand({
        sessionId,
        command,
        cwd: effectiveCwd,
        emitter: {
          ...emitter,
          onCwdChanged: (newCwd) => {
            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send('pty:cwd-changed', { ptyId: '', cwd: newCwd });
            }
          },
          onDone: (sid, summary) => {
            emitter.onDone(sid, summary);
            updateTerminalSession(sid, { status: 'idle' });
            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send('terminal:session-status', {
                sessionId: sid,
                status: 'idle',
              });
              mainWindow.webContents.send('terminal:sessions-changed');
            }
          },
          onError: (sid, err) => {
            emitter.onError(sid, err);
            updateTerminalSession(sid, { status: 'error' });
            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send('terminal:session-status', {
                sessionId: sid,
                status: 'error',
              });
              mainWindow.webContents.send('terminal:sessions-changed');
            }
          },
        },
      });
    },
  );

  ipcMain.handle(
    'terminal:rerun-block',
    (_e, { sessionId, blockId }: { sessionId: string; blockId: string }) => {
      const block = getBlock(blockId);
      if (!block || !block.command) return;

      // A re-run is a *new* block rather than a mutation, so the original
      // result and its duration stay in the transcript as history.
      void executeDirectCommand({
        sessionId,
        command: block.command,
        emitter: makeTerminalEmitter(),
      });
    },
  );

  ipcMain.handle(
    'terminal:suggest-fix',
    async (_e, { blockId }: { blockId: string }) => {
      // Returns a proposal only; the renderer puts it in the input bar.
      return suggestFix(blockId);
    },
  );

  ipcMain.handle(
    'terminal:approve',
    (_e, { sessionId, blockId }: { sessionId: string; blockId: string }) => {
      resolveApproval(sessionId, blockId, true);
    },
  );

  ipcMain.handle(
    'terminal:reject',
    (_e, { sessionId, blockId }: { sessionId: string; blockId: string }) => {
      resolveApproval(sessionId, blockId, false);
    },
  );

  ipcMain.handle(
    'terminal:explain',
    async (_e, { blockId }: { blockId: string }) => {
      const explanation = await explainBlock(blockId);
      return { explanation };
    },
  );

  ipcMain.handle(
    'terminal:stop-command',
    (_e, { blockId }: { blockId: string }) => {
      return { stopped: stopCommand(blockId) };
    },
  );

  ipcMain.handle(
    'terminal:open-url',
    (_e, { url }: { url: string }) => {
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        void shell.openExternal(url);
      }
    },
  );

  ipcMain.handle(
    'terminal:get-context-info',
    async (_e, opts?: { cwd?: string }) => {
      const dir = opts?.cwd || process.env.HOME || process.cwd();
      let gitBranch: string | null = null;
      try {
        const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
          exec('git rev-parse --abbrev-ref HEAD', { cwd: dir, timeout: 1500 }, (err, out) => {
            if (err) reject(err);
            else resolve({ stdout: out });
          });
        });
        const trimmed = stdout.trim();
        if (trimmed && !trimmed.includes('\n')) {
          gitBranch = trimmed;
        }
      } catch {
        // Not a git repo or git not found
      }
      return { cwd: dir, gitBranch };
    },
  );

  // ── ADHD task manager ─────────────────────────────────────────────────────

  ipcMain.handle(
    'tasks:list',
    (_e, { status }: { status?: import('../db/tasks').TaskStatus }) =>
      listTasks({ status }),
  );

  ipcMain.handle(
    'tasks:create',
    (
      _e,
      req: Parameters<typeof createTask>[0],
    ) => createTask(req),
  );

  ipcMain.handle(
    'tasks:update',
    (_e, { id, ...patch }: { id: string } & Parameters<typeof updateTask>[1]) =>
      updateTask(id, patch),
  );

  ipcMain.handle(
    'tasks:delete',
    (_e, { id }: { id: string }) => deleteTask(id),
  );

  ipcMain.handle(
    'tasks:increment-pomodoro',
    (_e, { id }: { id: string }) => incrementPomodoro(id),
  );

  ipcMain.handle('tasks:prioritize', async () => {
    const { getSettings } = await import('../ai/settings.js');
    const { resolveModel } = await import('../ai/provider.js');
    const { generateText } = await import('ai');
    const allTasks = listTasks();
    if (allTasks.length === 0) return { orderedIds: [], reasoning: 'No tasks to prioritize.' };

    const settings = getSettings();
    const model = resolveModel(settings.activeProvider, settings.activeModel);

    const taskList = allTasks
      .map((t) => `- id:${t.id} priority:${t.priority} status:${t.status} title:"${t.title}"`)
      .join('\n');

    const result = await generateText({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      model: model as any,
      system: 'You are a productivity assistant. Given a list of tasks, return a JSON object with "orderedIds" (array of task ids, highest priority first) and "reasoning" (one sentence explaining your decision). Output only valid JSON.',
      prompt: `Tasks:\n${taskList}\n\nReturn JSON only.`,
      stopWhen: isStepCount(1),
    });

    try {
      const parsed = JSON.parse(result.text ?? '{}') as { orderedIds?: string[]; reasoning?: string };
      return {
        orderedIds: parsed.orderedIds ?? allTasks.map((t) => t.id),
        reasoning: parsed.reasoning ?? 'Prioritized by AI.',
      };
    } catch {
      return {
        orderedIds: allTasks.map((t) => t.id),
        reasoning: 'Could not parse AI response. Order unchanged.',
      };
    }
  });

  // ── Focus system · breakdown steps ────────────────────────────────────────

  ipcMain.handle(
    'tasks:steps-list',
    (_e, { taskId }: { taskId: string }) => listSteps(taskId),
  );

  ipcMain.handle(
    'tasks:step-add',
    (_e, { taskId, title }: { taskId: string; title: string }) =>
      createStep({ task_id: taskId, title }),
  );

  ipcMain.handle(
    'tasks:step-toggle',
    (_e, { id, done }: { id: string; done: boolean }) => setStepDone(id, done),
  );

  ipcMain.handle(
    'tasks:step-delete',
    (_e, { id }: { id: string }) => deleteStep(id),
  );

  ipcMain.handle('tasks:steps-progress', () => stepProgressMap());

  // ── Focus system · time blocking ──────────────────────────────────────────

  ipcMain.handle(
    'tasks:blocks-list',
    (_e, req: { from?: number; to?: number } | void) =>
      listBlocks(req ?? undefined),
  );

  ipcMain.handle(
    'tasks:block-create',
    (_e, req: Parameters<typeof createBlock>[0]) => createBlock(req),
  );

  ipcMain.handle(
    'tasks:block-update',
    (
      _e,
      { id, ...patch }: { id: string } & Parameters<typeof updateBlock>[1],
    ) => updateBlock(id, patch),
  );

  ipcMain.handle(
    'tasks:block-delete',
    (_e, { id }: { id: string }) => deleteBlock(id),
  );

  // ── Focus system · sessions & stats ───────────────────────────────────────

  ipcMain.handle(
    'focus:session-create',
    (_e, req: Parameters<typeof createFocusSession>[0]) =>
      createFocusSession(req),
  );

  ipcMain.handle(
    'focus:sessions-list',
    (_e, req: { from?: number; to?: number } | void) =>
      listFocusSessions(req ?? undefined),
  );

  ipcMain.handle('focus:stats', () => getFocusStats());

  // ── AI focus copilot ──────────────────────────────────────────────────────

  ipcMain.handle(
    'tasks:breakdown',
    async (_e, { taskId }: { taskId: string }) => {
      const task = getTask(taskId);
      if (!task) throw new Error('Task not found');
      const { steps, note } = await breakdownTask({
        title: task.title,
        description: task.description,
      });
      return { steps: createSteps(taskId, steps), note };
    },
  );

  ipcMain.handle(
    'tasks:brain-dump',
    async (_e, { text }: { text: string }) => {
      const trimmed = (text ?? '').trim();
      if (!trimmed) return { tasks: [], note: 'Nothing to add.' };
      const { tasks: drafts, note } = await expandBrainDump(trimmed);
      const created = drafts.map((d) =>
        createTask({
          title: d.title,
          description: d.description,
          priority: d.priority,
          estimate_mins: d.estimate_mins,
          status: 'backlog',
        }),
      );
      return { tasks: created, note };
    },
  );

  ipcMain.handle(
    'tasks:plan-day',
    async (
      _e,
      req: { day?: number; workStartMin?: number; workEndMin?: number } | void,
    ) => {
      const nowSec = Math.floor(Date.now() / 1000);
      const dayStart = startOfDay(req?.day ?? nowSec);
      const dayEnd = dayStart + 86_400;
      const workStartMin = req?.workStartMin ?? 9 * 60;
      const workEndMin = req?.workEndMin ?? 18 * 60;

      const openTasks = listTasks().filter((t) => t.status !== 'done');
      if (openTasks.length === 0) {
        return { blocks: [], note: 'No open tasks to schedule.' };
      }

      const busy = listBlocks({ from: dayStart, to: dayEnd }).map((b) => ({
        title: b.title || b.task_title || 'Time block',
        start_min: Math.max(0, Math.round((b.start_at - dayStart) / 60)),
        end_min: Math.round((b.end_at - dayStart) / 60),
      }));

      const { blocks: proposals, note } = await planDay({
        tasks: openTasks.map((t) => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          estimate_mins: t.estimate_mins,
          due_at: t.due_at,
        })),
        busy,
        workStartMin,
        workEndMin,
      });

      const validIds = new Set(openTasks.map((t) => t.id));
      const created = proposals
        .filter((p) => validIds.has(p.task_id))
        .map((p) => {
          const start = dayStart + p.start_min * 60;
          return createBlock({
            task_id: p.task_id,
            title: p.title,
            start_at: start,
            end_at: start + p.duration_min * 60,
          });
        });

      return { blocks: created, note };
    },
  );

  // ── Focus copilot (agent with tools) ──────────────────────────────────────

  /**
   * One copilot turn. Mirrors `agent:chat` but runs the task copilot agent,
   * streams over copilot-namespaced events, and signals `copilot:changed` so the
   * board refreshes after tools have (possibly) mutated task data.
   */
  ipcMain.handle(
    'copilot:chat',
    async (_e, { messages }: { messages: UIMessage[] }) => {
      const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const fail = (err: unknown) => {
        if (mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('copilot:stream-error', {
          error: err instanceof Error ? err.message : String(err),
        });
      };

      try {
        const modelMessages = await convertToModelMessages(messages);
        const agent = createTaskCopilotAgent();
        const result = await agent.stream({ messages: modelMessages });

        for await (const chunk of result.fullStream) {
          if (mainWindow.isDestroyed()) return;
          if (chunk?.type === 'error') {
            fail(chunk.error);
            return;
          }
          mainWindow.webContents.send(
            'copilot:stream-chunk',
            JSON.stringify(chunk),
          );
        }

        if (mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('copilot:stream-done', { runId });
        // Tools may have added/changed tasks, blocks, or terminal sessions.
        mainWindow.webContents.send('copilot:changed');
      } catch (err) {
        fail(err);
      }
    },
  );
}
