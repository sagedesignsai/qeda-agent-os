/**
 * ipc/handlers.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Registers all IPC handlers on the main process side.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { exec } from 'node:child_process';
import {
  ipcMain,
  dialog,
  BrowserWindow,
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
  createTerminalSession,
  deleteTerminalSession,
  updateTerminalSession,
  getSessionBlocks,
  getBlock,
  updateBlock,
} from '../db/terminal';
import {
  runGoal,
  resolveApproval,
  explainBlock,
  suggestFix,
  executeDirectCommand,
  type TerminalAgentEmitter,
} from '../ai/terminal-agent';
import {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  incrementPomodoro,
} from '../db/tasks';

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
      if (!currentGoal) return;
      const autoTitle = currentGoal.length > 48 ? `${currentGoal.slice(0, 45)}…` : currentGoal;
      updateTerminalSession(sid, { title: autoTitle });
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:session-renamed', {
          sessionId: sid,
          title: autoTitle,
        });
      }
    },
    onError(sid, error) {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:agent-error', { sessionId: sid, error });
      }
    },
  });

  ipcMain.handle('terminal:sessions-list', () => listTerminalSessions());

  ipcMain.handle(
    'terminal:session-create',
    (_e, { title }: { title?: string }) => createTerminalSession({ title }),
  );

  ipcMain.handle(
    'terminal:session-delete',
    (_e, { id }: { id: string }) => deleteTerminalSession(id),
  );

  ipcMain.handle(
    'terminal:session-rename',
    (_e, { id, title }: { id: string; title: string }) =>
      updateTerminalSession(id, { title }),
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
      // Fire-and-forget: the block moves pending → running → done over IPC.
      void executeDirectCommand({
        sessionId,
        command,
        cwd,
        emitter: makeTerminalEmitter(),
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
}
