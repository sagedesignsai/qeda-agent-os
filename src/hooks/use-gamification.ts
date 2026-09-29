/**
 * hooks/use-gamification.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React binding for the Gamification & Dopamine Engine.
 *
 * Provides real-time level progress, XP awards with optimistic updates,
 * audio chime triggers, and level-up celebrations.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useIpcEvent } from './use-ipc';
import { celebrationAudio } from '@/lib/celebration-audio';
import type { GamificationState } from '@/main/ipc/channels';

export interface UseGamificationReturn {
  state: GamificationState | null;
  loading: boolean;
  awardXp: (amount: number, source: string, entityId?: string) => Promise<void>;
  useShield: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useGamification(): UseGamificationReturn {
  const [state, setState] = useState<GamificationState | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const current = await window.electron.ipc.invoke<GamificationState>(
        'gamification:get-state',
      );
      setState(current);
    } catch {
      /* best-effort */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Sync across windows or actions
  useIpcEvent('gamification:updated', (raw: unknown) => {
    const payload = raw as { state: GamificationState; leveledUp: boolean };
    if (!payload?.state) return;
    setState(payload.state);
    if (payload.leveledUp) {
      celebrationAudio.playLevelUpFanfare();
      toast.success(
        `Level Up! You reached Level ${payload.state.currentLevel}`,
        {
          description: `Rank: ${payload.state.rankTitle}`,
        },
      );
    }
  });

  const awardXp = useCallback(
    async (amount: number, source: string, entityId?: string) => {
      if (amount <= 0) return;
      try {
        const result = await window.electron.ipc.invoke<{
          state: GamificationState;
          leveledUp: boolean;
        }>('gamification:award-xp', { amount, source, entityId });

        setState(result.state);
        celebrationAudio.playCompletionChime();

        if (result.leveledUp) {
          celebrationAudio.playLevelUpFanfare();
          toast.success(
            `Level Up! You reached Level ${result.state.currentLevel}`,
            {
              description: `Rank: ${result.state.rankTitle}`,
            },
          );
        }
      } catch {
        /* best-effort */
      }
    },
    [],
  );

  const useShield = useCallback(async () => {
    try {
      const updated = await window.electron.ipc.invoke<GamificationState>(
        'gamification:use-shield',
      );
      setState(updated);
      toast.info('Streak shield consumed to protect your daily flow streak');
    } catch {
      toast.error('Could not use streak shield');
    }
  }, []);

  return {
    state,
    loading,
    awardXp,
    useShield,
    refresh: load,
  };
}
