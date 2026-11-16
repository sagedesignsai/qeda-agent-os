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
import { ipcMain, shell } from 'electron';
import { openBrowser } from '../../browser-use.js';
import {
  attachPresenceBrowser,
  closeAllPresenceViews,
  closePresenceView,
  goBackPresenceView,
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
import type { PresenceBrowserBounds } from '../../../lib/presence.js';
import {
  deleteItem,
  getBatch,
  getBatchDetail,
  listBatches,
  listPosts,
  logPost,
  counts,
  updateItem,
  getProfile,
  updateProfile,
  getStreak,
  updateStreak,
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

      const result = await agent.stream({ messages: modelMessages });

      let streamError: unknown;
      for await (const chunk of result.fullStream) {
        if (mainWindow.isDestroyed()) return;
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

      if (!quiet) send(mainWindow, 'presence-copilot:stream-done', { runId });
      // The agent's tools may have created batches, items, or profile rows.
      broadcastChanged(mainWindow);
      return;
    } catch (err) {
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

  throw lastError;
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
      const projectId = payload?.projectId ?? null;
      return listBatches(projectId);
    },
  );

  ipcMain.handle(
    'presence:batch-get',
    (_event, { id }: { id: string }): PresenceBatchDetail | null => {
      return getBatchDetail(id);
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

  // ── Items ────────────────────────────────────────────────────────────────

  ipcMain.handle(
    'presence:item-update',
    (
      _event,
      { id, patch }: { id: string; patch: PresenceItemPatch },
    ): PresenceItem | null => {
      const updated = updateItem(id, patch);
      if (updated && (patch.status === 'done' || patch.status === 'edited')) {
        // Update streak — need project_id from the batch.
        try {
          const batch = getBatch(updated.batch_id);
          if (batch?.project_id) {
            updateStreak(batch.project_id);
          }
        } catch {
          // Streak update failed — don't block the item update.
        }
      }
      broadcastChanged(mainWindow);
      return updated;
    },
  );

  ipcMain.handle(
    'presence:item-delete',
    (_event, { id }: { id: string }): boolean => {
      const deleted = deleteItem(id);
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
        itemId = null as any,
      }: {
        projectId: string | null;
        platform: string;
        content: string;
        metrics?: string;
        itemId?: string;
      },
    ): PresencePost => {
      const post = logPost(
        projectId,
        platform as any,
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
      const projectId = payload?.projectId ?? null;
      return listPosts(projectId);
    },
  );

  // ── Counts ───────────────────────────────────────────────────────────────

  ipcMain.handle(
    'presence:counts',
    (_event, payload?: { projectId?: string | null }) => {
      const projectId = payload?.projectId ?? null;
      return counts(projectId);
    },
  );

  // ── Profile ──────────────────────────────────────────────────────────────

  ipcMain.handle(
    'presence:profile-get',
    (_event, { projectId }: { projectId: string }): PresenceProfile | null => {
      return getProfile(projectId);
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
      const patch: any = {};
      if (onboardingComplete !== undefined)
        patch.onboarding_complete = onboardingComplete;
      if (platforms !== undefined)
        patch.platforms_json = JSON.stringify(platforms);
      if (goal !== undefined) patch.goal = goal;
      const profile = updateProfile(projectId, patch);
      broadcastChanged(mainWindow);
      return profile;
    },
  );

  // ── Streak ───────────────────────────────────────────────────────────────

  ipcMain.handle(
    'presence:streak-get',
    (_event, { projectId }: { projectId: string }) => {
      return getStreak(projectId);
    },
  );

  // ── Standalone System Browser (legacy) ───────────────────────────────────

  ipcMain.handle(
    'presence:open-browser',
    (_event, { url }: { url: string }): boolean => {
      try {
        openBrowser(url, { visible: true, partition: 'presence' });
        return true;
      } catch {
        // Fallback to external browser
        shell.openExternal(url);
        return false;
      }
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
}
