/**
 * hooks/use-presence.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side state and transport for the Presence coach.
 *
 * Reads go through `useDbResource` with `presence:changed` invalidation.
 * Writes are plain invokes — no local state patch.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useMemo } from 'react';
import { useDbResource } from './use-db-resource';
import type {
  PresenceBatch,
  PresenceBatchDetail,
  PresenceItem,
  PresenceItemPatch,
  PresencePost,
  PresenceProfile,
} from '@/main/ipc/channels';
import { getGreetingMessage, getMilestoneMessage } from '@/lib/presence';

// ── Batches ───────────────────────────────────────────────────────────────────

export function usePresenceBatches(projectId: string | null) {
  const { data, loading, error, refresh } = useDbResource<PresenceBatch[]>({
    channel: 'presence:batches-list',
    event: 'presence:changed',
    enabled: !!projectId,
    select: (raw) => (Array.isArray(raw) ? (raw as PresenceBatch[]) : []),
  });

  return {
    batches: data ?? [],
    loading,
    error,
    refresh,
  };
}

// ── Batch detail ──────────────────────────────────────────────────────────────

export function usePresenceBatchDetail(batchId: string | null) {
  const { data, loading, error, refresh } = useDbResource<PresenceBatchDetail>({
    channel: 'presence:batch-get',
    event: 'presence:changed',
    enabled: !!batchId,
    resourceKey: batchId ?? '',
  });

  return {
    detail: data,
    loading,
    error,
    refresh,
  };
}

// ── Counts ────────────────────────────────────────────────────────────────────

export function usePresenceCounts(projectId: string | null) {
  const { data, loading, error, refresh } = useDbResource<{
    batches: number;
    pending: number;
    done: number;
    skipped: number;
  }>({
    channel: 'presence:counts',
    event: 'presence:changed',
    enabled: !!projectId,
  });

  return {
    counts: data ?? { batches: 0, pending: 0, done: 0, skipped: 0 },
    loading,
    error,
    refresh,
  };
}

// ── Posts ─────────────────────────────────────────────────────────────────────

export function usePresencePosts(projectId: string | null) {
  const { data, loading, error, refresh } = useDbResource<PresencePost[]>({
    channel: 'presence:posts-list',
    event: 'presence:changed',
    enabled: !!projectId,
    select: (raw) => (Array.isArray(raw) ? (raw as PresencePost[]) : []),
  });

  return {
    posts: data ?? [],
    loading,
    error,
    refresh,
  };
}

// ── Profile ───────────────────────────────────────────────────────────────────

export function usePresenceProfile(projectId: string | null) {
  const { data, loading, error, refresh } = useDbResource<PresenceProfile | null>({
    channel: 'presence:profile-get',
    event: 'presence:changed',
    enabled: !!projectId,
    resourceKey: projectId ?? '',
  });

  const platforms = useMemo(() => {
    if (!data?.platforms_json) return [];
    try {
      return JSON.parse(data.platforms_json) as string[];
    } catch {
      return [];
    }
  }, [data?.platforms_json]);

  return {
    profile: data,
    platforms,
    goal: data?.goal ?? '',
    onboardingComplete: data?.onboarding_complete ?? false,
    loading,
    error,
    refresh,
  };
}

// ── Streak ────────────────────────────────────────────────────────────────────

export function usePresenceStreak(projectId: string | null) {
  const { data, loading, error, refresh } = useDbResource<{
    streak_count: number;
    last_active_date: string | null;
  }>({
    channel: 'presence:streak-get',
    event: 'presence:changed',
    enabled: !!projectId,
    resourceKey: projectId ?? '',
  });

  const streakCount = data?.streak_count ?? 0;
  const lastActiveDate = data?.last_active_date ?? null;
  const milestoneMessage = streakCount > 0 ? getMilestoneMessage(streakCount) : null;

  return {
    streakCount,
    lastActiveDate,
    milestoneMessage,
    loading,
    error,
    refresh,
  };
}

// ── Greeting ──────────────────────────────────────────────────────────────────

export function useGreeting(projectId: string | null) {
  const { streakCount, lastActiveDate } = usePresenceStreak(projectId);
  const { onboardingComplete } = usePresenceProfile(projectId);

  const message = useMemo(
    () => getGreetingMessage(streakCount, lastActiveDate, onboardingComplete),
    [streakCount, lastActiveDate, onboardingComplete],
  );

  return { message, onboardingComplete };
}

// ── Actions ───────────────────────────────────────────────────────────────────

export interface PresenceActions {
  generate: (projectId: string, focus?: string) => Promise<PresenceBatchDetail>;
  updateItem: (id: string, patch: PresenceItemPatch) => Promise<PresenceItem | null>;
  deleteItem: (id: string) => Promise<boolean>;
  logPost: (input: {
    projectId: string | null;
    platform: string;
    content: string;
    metrics?: string;
    itemId?: string;
  }) => Promise<PresencePost>;
  openBrowser: (url: string) => Promise<boolean>;
  updateProfile: (input: {
    projectId: string;
    onboardingComplete?: boolean;
    platforms?: string[];
    goal?: string;
  }) => Promise<PresenceProfile>;
}

export function usePresenceActions(): PresenceActions {
  const generate = useCallback(
    async (projectId: string, focus?: string) => {
      const result = await window.electron.ipc.invoke('presence:generate', { projectId, focus });
      return result as PresenceBatchDetail;
    },
    [],
  );

  const updateItem = useCallback(
    async (id: string, patch: PresenceItemPatch) => {
      const result = await window.electron.ipc.invoke('presence:item-update', { id, patch });
      return result as PresenceItem | null;
    },
    [],
  );

  const deleteItem = useCallback(
    async (id: string) => {
      const result = await window.electron.ipc.invoke('presence:item-delete', { id });
      return result as boolean;
    },
    [],
  );

  const logPost = useCallback(
    async (input: {
      projectId: string | null;
      platform: string;
      content: string;
      metrics?: string;
      itemId?: string;
    }) => {
      const result = await window.electron.ipc.invoke('presence:post-log', input);
      return result as PresencePost;
    },
    [],
  );

  const openBrowser = useCallback(
    async (url: string) => {
      const result = await window.electron.ipc.invoke('presence:open-browser', { url });
      return result as boolean;
    },
    [],
  );

  const updateProfile = useCallback(
    async (input: {
      projectId: string;
      onboardingComplete?: boolean;
      platforms?: string[];
      goal?: string;
    }) => {
      const result = await window.electron.ipc.invoke('presence:profile-update', input);
      return result as PresenceProfile;
    },
    [],
  );

  return { generate, updateItem, deleteItem, logPost, openBrowser, updateProfile };
}
