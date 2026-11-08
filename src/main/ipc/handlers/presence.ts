/**
 * ipc/handlers/presence.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IPC handlers for the Presence coach — batches, items, posts, profile, streak,
 * and System Browser integration.
 *
 * Follows the same pattern as every other handler module: register function
 * takes mainWindow for broadcasting, uses prepared DB functions, and emits
 * `presence:changed` after every mutation.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';
import { shell } from 'electron';
import { openBrowser } from '../../browser-use.js';
import {
  createBatch,
  createItem,
  deleteItem,
  getBatch,
  getBatchDetail,
  listBatches,
  listPosts,
  listRecentItems,
  logPost,
  counts,
  updateItem,
  getProfile,
  updateProfile,
  getStreak,
  updateStreak,
} from '../../db/presence.js';
import { listContacts } from '../../db/correspondence.js';
import { generatePresenceBatch } from '../../ai/presence-coach.js';
import { getProject } from '../../db/projects.js';
import type {
  PresenceBatchDetail,
  PresenceItem,
  PresenceItemPatch,
  PresencePost,
  PresenceProfile,
} from '../../db/presence.js';

// ─── Broadcast ────────────────────────────────────────────────────────────────

function broadcastChanged(mainWindow: BrowserWindow): void {
  mainWindow.webContents.send('presence:changed');
}

// ─── Register ─────────────────────────────────────────────────────────────────

export function registerPresenceHandlers({ mainWindow }: { mainWindow: BrowserWindow }): void {
  // ── Batches ──────────────────────────────────────────────────────────────

  ipcMain.handle('presence:batches-list', (_event, payload?: { projectId?: string | null }) => {
    const projectId = payload?.projectId ?? null;
    return listBatches(projectId);
  });

  ipcMain.handle('presence:batch-get', (_event, { id }: { id: string }): PresenceBatchDetail | null => {
    return getBatchDetail(id);
  });

  // ── Generate ─────────────────────────────────────────────────────────────

  ipcMain.handle(
    'presence:generate',
    async (_event, { projectId, focus }: { projectId: string; focus?: string }): Promise<PresenceBatchDetail> => {
      // Gather context
      const contacts = listContacts(projectId).slice(0, 20);
      const recentItems = listRecentItems(projectId, 10);
      const profile = getProfile(projectId);

      // Project info
      const project = getProject(projectId);
      const projectName = project?.name ?? '';
      const projectOutcome = (project as any)?.outcome ?? '';
      const projectDeadline: string | null = (project as any)?.deadline ?? null;

      const onboardingPlatforms = profile ? (JSON.parse(profile.platforms_json) as string[]) : [];
      const onboardingGoal = profile?.goal ?? '';
      const streak = getStreak(projectId);

      const result = await generatePresenceBatch({
        projectId,
        focus,
        context: {
          projectName,
          projectOutcome,
          projectDeadline,
          contacts: contacts.map((c: any) => ({
            name: c.name,
            role: c.role,
            id: c.id,
          })),
          recentItems: recentItems.map((item: any) => ({
            kind: item.kind,
            status: item.status,
            feedback: item.feedback,
            title: item.title,
          })),
          onboardingPlatforms,
          onboardingGoal,
          streakCount: streak.streak_count,
        },
      });

      // Persist batch + items
      const batch = createBatch(projectId, focus ?? '', {
        projectName,
        focus,
      });

      result.items.forEach((item: any) => {
        createItem(
          batch.id,
          item.kind,
          item.title,
          item.body,
          item.platform,
          item.sourceKind,
          item.sourceId,
        );
      });

      broadcastChanged(mainWindow);

      return getBatchDetail(batch.id)!;
    },
  );

  // ── Items ────────────────────────────────────────────────────────────────

  ipcMain.handle(
    'presence:item-update',
    (_event, { id, patch }: { id: string; patch: PresenceItemPatch }): PresenceItem | null => {
      const updated = updateItem(id, patch);
      if (updated && (patch.status === 'done' || patch.status === 'edited')) {
        // Update streak — need project_id from the batch
        try {
          const batch = getBatch(updated.batch_id);
          if (batch?.project_id) {
            updateStreak(batch.project_id);
          }
        } catch {
          // Streak update failed — don't block the item update
        }
      }
      broadcastChanged(mainWindow);
      return updated;
    },
  );

  ipcMain.handle('presence:item-delete', (_event, { id }: { id: string }): boolean => {
    const deleted = deleteItem(id);
    if (deleted) broadcastChanged(mainWindow);
    return deleted;
  });

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
      const post = logPost(projectId, platform as any, content, metrics, itemId);
      broadcastChanged(mainWindow);
      return post;
    },
  );

  ipcMain.handle('presence:posts-list', (_event, payload?: { projectId?: string | null }) => {
    const projectId = payload?.projectId ?? null;
    return listPosts(projectId);
  });

  // ── Counts ───────────────────────────────────────────────────────────────

  ipcMain.handle('presence:counts', (_event, payload?: { projectId?: string | null }) => {
    const projectId = payload?.projectId ?? null;
    return counts(projectId);
  });

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
      if (onboardingComplete !== undefined) patch.onboarding_complete = onboardingComplete;
      if (platforms !== undefined) patch.platforms_json = JSON.stringify(platforms);
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

  // ── System Browser ───────────────────────────────────────────────────────

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
}
