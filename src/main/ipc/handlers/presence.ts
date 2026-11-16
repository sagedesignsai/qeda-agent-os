/**
 * ipc/handlers/presence.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IPC handlers for the Presence copilot — batches, items, posts, profile, streak,
 * agentic suggestion generation, and System Browser integration.
 *
 * Two entry points into the agent:
 *   • `presence:generate` runs one agent turn to completion and returns the
 *     batch it created. This is the promise-shaped path the Presence page uses.
 *   • `presence:chat` is the canonical streaming turn (same transport shape as
 *     the Focus, Correspondence, and Studio copilots) for a future chat surface.
 *
 * Both paths stream `presence-copilot:stream-*` events and broadcast
 * `presence:changed` when the turn finishes, so any open read hook refreshes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { randomUUID } from 'node:crypto';
import type { UIMessage } from 'ai';
import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';
import {
  attachPresenceBrowser,
  closeAllPresenceViews,
  closePresenceView,
  goBackPresenceView,
  goForwardPresenceView,
  openPresenceViewExternal,
  hidePresenceView,
  navigatePresenceView,
  reloadPresenceView,
  setPresenceViewBounds,
  showPresenceView,
} from '../../presence-browser.js';
import {
  describeFallbackReason,
  isOutputChunk,
  isRetryableProviderError,
} from '../../ai/fallback.js';
import { prepareModelMessages } from '../../ai/messages.js';
import { PlanManager } from '../../ai/plan-manager.js';
import {
  renderProjectContext,
  resolveActiveProjectId,
} from '../../ai/project-context.js';
import { resolveModelChain } from '../../ai/provider.js';
import { createPresenceCopilotAgent } from '../../ai/presence-copilot-agent.js';
import type { AgentPlanEvent } from '../../../lib/agent-plan.js';
import {
  PRESENCE_PLATFORMS,
  type PresenceBrowserBounds,
  type PresencePlatform,
} from '../../../lib/presence.js';
import {
  assertBatchInProject,
  assertItemInProject,
  deleteBatch,
  deleteItem,
  getBatch,
  getBatchDetail,
  getActivityBetween,
  listBatches,
  listPosts,
  logPost,
  counts,
  updateItem,
  getProfile,
  updateProfile,
  getStreak,
  type PresenceActivity,
  type PresenceBatchDetail,
  type PresenceItem,
  type PresenceItemPatch,
  type PresencePost,
  type PresenceProfile,
} from '../../db/presence.js';

// ─── Stream plumbing ──────────────────────────────────────────────────────────

function send(
  mainWindow: BrowserWindow,
  channel: string,
  payload?: unknown,
): void {
  if (mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function broadcastChanged(mainWindow: BrowserWindow): void {
  send(mainWindow, 'presence:changed');
}

// ─── Abort control ────────────────────────────────────────────────────────────

const presenceAbortControllers = new Map<string, AbortController>();
const ABORT_SESSION_ID = 'presence-copilot';

interface PresenceTurnOptions {
  mainWindow: BrowserWindow;
  projectId: string;
  messages: UIMessage[];
  /**
   * When true, run the turn without writing to `presence-copilot:*`.
   *
   * Used by the promise-shaped `presence:generate` path. Those channels are the
   * chat surface's transport; a background generate emitting into them would
   * fold its plan and reasoning into whatever conversation the user has open.
   */
  quiet?: boolean;
}

/**
 * Run one Presence copilot turn, streaming `fullStream` chunks to the renderer.
 *
 * The provider-fallback loop is structurally identical to the one in
 * `copilot.ts`, `correspondence-copilot.ts`, and `document-drafter.ts`. The
 * invariant is `emitted`: once any output chunk has reached the renderer the
 * turn is partially visible, so retrying on another provider would splice two
 * answers together. Retry is only safe before first output.
 */
async function runPresenceTurn({
  mainWindow,
  projectId,
  messages,
  quiet = false,
}: PresenceTurnOptions): Promise<void> {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const abortController = new AbortController();
  if (presenceAbortControllers.has(ABORT_SESSION_ID)) {
    throw new Error('The Presence coach is already running a turn.');
  }
  presenceAbortControllers.set(ABORT_SESSION_ID, abortController);
  let cancellationSent = false;
  const notifyCancelled = () => {
    if (cancellationSent) return;
    cancellationSent = true;
    send(mainWindow, 'agent:stream-cancelled', {
      sessionId: ABORT_SESSION_ID,
    });
    broadcastChanged(mainWindow);
  };

  try {
    const modelMessages = await prepareModelMessages(messages);
    const activeProject = renderProjectContext({ projectId });

    const chain = resolveModelChain();
    if (chain.length === 0) {
      throw new Error(
        'No model configured. Pick a provider and model in Settings.',
      );
    }

    let lastError: unknown;

    for (let attempt = 0; attempt < chain.length; attempt += 1) {
      if (abortController.signal.aborted) {
        notifyCancelled();
        return;
      }

      const target = chain[attempt];
      let emitted = false;

      try {
        const planManager = new PlanManager((event: AgentPlanEvent) => {
          if (quiet) return;
          send(mainWindow, 'presence-copilot:plan-event', event);
        });

        const agent = createPresenceCopilotAgent({
          projectId,
          activeProject,
          target,
          planManager,
        });

        const result = await agent.stream({
          messages: modelMessages,
          abortSignal: abortController.signal,
        });

        let streamError: unknown;
        for await (const chunk of result.fullStream) {
          if (mainWindow.isDestroyed()) return;
          if (abortController.signal.aborted) {
            notifyCancelled();
            return;
          }
          if (chunk?.type === 'error') {
            streamError = chunk.error;
            break;
          }
          if (isOutputChunk(chunk?.type)) emitted = true;
          if (!quiet) {
            send(
              mainWindow,
              'presence-copilot:stream-chunk',
              JSON.stringify(chunk),
            );
          }
        }

        if (streamError) throw streamError;

        if (abortController.signal.aborted) {
          notifyCancelled();
          return;
        }

        if (!quiet) send(mainWindow, 'presence-copilot:stream-done', { runId });
        broadcastChanged(mainWindow);
        return;
      } catch (err) {
        if (abortController.signal.aborted) {
          notifyCancelled();
          return;
        }

        lastError = err;
        const isLast = attempt === chain.length - 1;
        const canFallback = !emitted && !isLast && isRetryableProviderError(err);
        if (!canFallback) break;

        const next = chain[attempt + 1];
        if (!quiet) {
          send(mainWindow, 'presence-copilot:stream-fallback', {
            fromProvider: target.providerId,
            fromModel: target.modelId,
            toProvider: next.providerId,
            toModel: next.modelId,
            reason: describeFallbackReason(err),
          });
        }
      }
    }

    throw lastError ?? new Error('Presence coach turn failed.');
  } catch (err) {
    if (abortController.signal.aborted) {
      notifyCancelled();
      return;
    }
    throw err;
  } finally {
    if (presenceAbortControllers.get(ABORT_SESSION_ID) === abortController) {
      presenceAbortControllers.delete(ABORT_SESSION_ID);
    }
  }
}

function generationPrompt(focus?: string): string {
  return focus
    ? `Generate a new batch of presence suggestions focused on: "${focus}"`
    : 'Generate a new batch of presence suggestions based on my recent activity and contacts.';
}

// ─── Register ─────────────────────────────────────────────────────────────────

export function registerPresenceHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  // The embedded tabs draw into this window; bind before any show request.
  attachPresenceBrowser(mainWindow);

  // ── Batches ──────────────────────────────────────────────────────────────

  ipcMain.handle(
    'presence:batches-list',
    (_event, payload?: { projectId?: string | null }) => {
      const projectId = resolveActiveProjectId(payload?.projectId);
      return projectId ? listBatches(projectId) : [];
    },
  );

  ipcMain.handle(
    'presence:batch-get',
    (
      _event,
      {
        id,
        projectId: scopedProjectId,
      }: { id: string; projectId: string | null },
    ): PresenceBatchDetail | null => {
      const projectId = resolveActiveProjectId(scopedProjectId);
      if (!projectId) return null;
      const batch = getBatch(id);
      if (!batch) return null;
      assertBatchInProject(id, projectId);
      return getBatchDetail(id);
    },
  );

  ipcMain.handle(
    'presence:batch-delete',
    (
      _event,
      { id, projectId: scopedProjectId }: { id: string; projectId: string | null },
    ): boolean => {
      const projectId = resolveActiveProjectId(scopedProjectId);
      if (!projectId) {
        throw new Error('Select a project before deleting a presence batch.');
      }
      assertBatchInProject(id, projectId);
      const deleted = deleteBatch(id);
      if (deleted) broadcastChanged(mainWindow);
      return deleted;
    },
  );

  // ── Generation via the Presence Copilot ──────────────────────────────────

  /**
   * One-shot generation. Runs a full agent turn, then returns the newest batch
   * it created. The agent owns the batch/item writes through its tools, so this
   * handler never re-implements the generation logic.
   */
  ipcMain.handle(
    'presence:generate',
    async (
      _event,
      {
        projectId: scopedProjectId,
        focus,
      }: { projectId: string; focus?: string },
    ): Promise<PresenceBatchDetail> => {
      const projectId = resolveActiveProjectId(scopedProjectId);
      if (!projectId) {
        throw new Error(
          'Select a project before generating presence suggestions.',
        );
      }

      const before = new Set(listBatches(projectId).map((batch) => batch.id));

      await runPresenceTurn({
        mainWindow,
        projectId,
        // Silent: the chat surface owns `presence-copilot:*`. This path returns
        // its result as a promise instead of borrowing that transport.
        quiet: true,
        messages: [
          {
            id: randomUUID(),
            role: 'user',
            parts: [{ type: 'text', text: generationPrompt(focus) }],
          },
        ],
      });

      const created = listBatches(projectId).filter(
        (batch) => !before.has(batch.id),
      );
      const newest = created[0];
      const detail = newest ? getBatchDetail(newest.id) : null;

      if (!detail) {
        throw new Error(
          'The presence coach finished without creating a batch. Try again.',
        );
      }

      return detail;
    },
  );

  /**
   * Streaming chat turn. The Presence coach thread consumes this through
   * `useAgentChat` + the `presence-copilot:*` transport.
   */
  ipcMain.handle(
    'presence:chat',
    async (
      _event,
      {
        messages,
        context,
      }: { messages: UIMessage[]; context?: { projectId?: string } },
    ): Promise<void> => {
      const projectId = resolveActiveProjectId(context?.projectId);
      if (!projectId) {
        send(mainWindow, 'presence-copilot:stream-error', {
          error: 'Select a project before using the presence coach.',
        });
        return;
      }

      try {
        await runPresenceTurn({ mainWindow, projectId, messages });
      } catch (err) {
        send(mainWindow, 'presence-copilot:stream-error', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  /**
   * Abort the currently running presence copilot turn.
   */
  ipcMain.handle('presence:abort', (): boolean => {
    const controller = presenceAbortControllers.get(ABORT_SESSION_ID);
    if (controller) {
      controller.abort();
      return true;
    }
    return false;
  });

  // ── Items ────────────────────────────────────────────────────────────────

  ipcMain.handle(
    'presence:item-update',
    (
      _event,
      {
        id,
        projectId: scopedProjectId,
        patch,
      }: {
        id: string;
        projectId: string | null;
        patch: PresenceItemPatch;
      },
    ): PresenceItem | null => {
      const projectId = resolveActiveProjectId(scopedProjectId);
      if (!projectId) {
        throw new Error('Select a project before updating a presence item.');
      }
      assertItemInProject(id, projectId);
      const updated = updateItem(id, patch, projectId);
      broadcastChanged(mainWindow);
      return updated;
    },
  );

  ipcMain.handle(
    'presence:item-delete',
    (
      _event,
      { id, projectId: scopedProjectId }: { id: string; projectId: string | null },
    ): boolean => {
      const projectId = resolveActiveProjectId(scopedProjectId);
      if (!projectId) {
        throw new Error('Select a project before deleting a presence item.');
      }
      assertItemInProject(id, projectId);
      const deleted = deleteItem(id, projectId);
      if (deleted) broadcastChanged(mainWindow);
      return deleted;
    },
  );

  // ── Posts ────────────────────────────────────────────────────────────────

  ipcMain.handle(
    'presence:post-log',
    (
      _event,
      {
        projectId,
        platform,
        content,
        metrics = '',
        itemId = null,
      }: {
        projectId: string | null;
        platform: PresencePlatform;
        content: string;
        metrics?: string;
        itemId?: string | null;
      },
    ): PresencePost => {
      const resolvedProjectId = resolveActiveProjectId(projectId);
      if (!resolvedProjectId) {
        throw new Error('No active project to log post to');
      }
      if (!PRESENCE_PLATFORMS.includes(platform)) {
        throw new Error(`Unsupported Presence platform: ${platform}`);
      }
      if (!content.trim()) {
        throw new Error('Post content cannot be empty.');
      }
      if (itemId) assertItemInProject(itemId, resolvedProjectId);

      const post = logPost(
        resolvedProjectId,
        platform,
        content,
        metrics,
        itemId,
      );
      broadcastChanged(mainWindow);
      return post;
    },
  );

  ipcMain.handle(
    'presence:posts-list',
    (_event, payload?: { projectId?: string | null }) => {
      const projectId = resolveActiveProjectId(payload?.projectId);
      return projectId ? listPosts(projectId) : [];
    },
  );

  // ── Counts ───────────────────────────────────────────────────────────────

  ipcMain.handle(
    'presence:counts',
    (_event, payload?: { projectId?: string | null }) => {
      const projectId = resolveActiveProjectId(payload?.projectId);
      return projectId
        ? counts(projectId)
        : { batches: 0, pending: 0, done: 0, skipped: 0 };
    },
  );

  // ── Profile ──────────────────────────────────────────────────────────────

  ipcMain.handle(
    'presence:profile-get',
    (_event, { projectId }: { projectId: string }): PresenceProfile | null => {
      const resolvedProjectId = resolveActiveProjectId(projectId);
      return resolvedProjectId ? getProfile(resolvedProjectId) : null;
    },
  );

  ipcMain.handle(
    'presence:profile-update',
    (
      _event,
      {
        projectId,
        onboardingComplete,
        platforms,
        goal,
      }: {
        projectId: string;
        onboardingComplete?: boolean;
        platforms?: string[];
        goal?: string;
      },
    ): PresenceProfile => {
      const resolvedProjectId = resolveActiveProjectId(projectId);
      if (!resolvedProjectId) {
        throw new Error('Select a project before updating the Presence profile.');
      }
      const patch: Parameters<typeof updateProfile>[1] = {};
      if (onboardingComplete !== undefined)
        patch.onboarding_complete = onboardingComplete;
      if (platforms !== undefined)
        patch.platforms_json = JSON.stringify(platforms);
      if (goal !== undefined) patch.goal = goal;
      const profile = updateProfile(resolvedProjectId, patch);
      broadcastChanged(mainWindow);
      return profile;
    },
  );

  // ── Streak ───────────────────────────────────────────────────────────────

  ipcMain.handle(
    'presence:streak-get',
    (_event, { projectId }: { projectId: string }) => {
      const resolvedProjectId = resolveActiveProjectId(projectId);
      return resolvedProjectId ? getStreak(resolvedProjectId) : {
        streak_count: 0,
        last_active_date: null,
      };
    },
  );

  ipcMain.handle(
    'presence:activity-days',
    (
      _event,
      { projectId, startDate, endDate }: {
        projectId: string | null;
        startDate: string;
        endDate: string;
      },
    ): PresenceActivity[] => {
      const resolvedProjectId = resolveActiveProjectId(projectId);
      if (!resolvedProjectId) return [];
      return getActivityBetween(resolvedProjectId, startDate, endDate);
    },
  );

  // ── Embedded Presence browser ────────────────────────────────────────────

  ipcMain.handle(
    'presence:browser-show',
    (
      _event,
      {
        id,
        url,
        bounds,
      }: {
        id: string;
        url: string;
        bounds: PresenceBrowserBounds;
      },
    ): void => {
      showPresenceView({ id, url, bounds });
    },
  );

  ipcMain.handle(
    'presence:browser-bounds',
    (
      _event,
      { id, bounds }: { id: string; bounds: PresenceBrowserBounds },
    ): void => {
      setPresenceViewBounds(id, bounds);
    },
  );

  ipcMain.handle('presence:browser-hide', (): void => {
    hidePresenceView();
  });

  ipcMain.handle('presence:browser-close', (_event, { id }: { id: string }) => {
    closePresenceView(id);
  });

  ipcMain.handle('presence:browser-close-all', (): void => {
    closeAllPresenceViews();
  });

  ipcMain.handle(
    'presence:browser-navigate',
    async (_event, { id, url }: { id: string; url: string }) => {
      await navigatePresenceView(id, url);
    },
  );

  ipcMain.handle(
    'presence:browser-reload',
    (_event, { id }: { id: string }) => {
      reloadPresenceView(id);
    },
  );

  ipcMain.handle('presence:browser-back', (_event, { id }: { id: string }) => {
    goBackPresenceView(id);
  });

  ipcMain.handle('presence:browser-forward', (_event, { id }: { id: string }) => {
    goForwardPresenceView(id);
  });

  ipcMain.handle('presence:browser-open-external', (_event, { id }: { id: string }) => {
    openPresenceViewExternal(id);
  });
}
