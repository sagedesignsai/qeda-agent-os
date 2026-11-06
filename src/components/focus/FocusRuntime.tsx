/**
 * components/focus/FocusRuntime.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The app-wide effects for focus and audio. Mounted once by `AppLayout`.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Focus used to be page-local: `Tasks.tsx` owned the interval, and navigating
 * away silently killed the pomodoro. This component owns the interval, records
 * finished phases, awards XP, notifies the OS and holds the power blocker.
 * The session's UI lives in the sidebar (`SidebarFocusPlayer`); this only keeps
 * an open overlay from staying in a hidden `modal` state after navigation.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { toast } from 'sonner';
import { useFocusStore } from '@/stores/focus-store';
import { useMusicStore } from '@/stores/music-store';
import { useSoundscapeStore } from '@/stores/soundscape-store';
import { useMusicPlayer } from '@/hooks/use-music-player';
import { useMusicCopilotCommands } from '@/hooks/use-music-copilot-commands';
import { XP_REWARDS } from '@/lib/gamification';
import { fetchSceneTracks } from '@/lib/music/scene-tracks';
import { BUILTIN_SCENES, findScene } from '@/lib/music/scenes';
import type { MusicScene } from '@/lib/music/types';
import type { PhaseCompleteInfo } from '@/lib/focus/timer';


export function FocusRuntime() {
  // Hydration is app-wide: the first mount of this component loads the queue,
  // volume and scene from SQLite regardless of which route is visible.
  useMusicPlayer();
  useMusicCopilotCommands();

  // The session's resting home is the sidebar player; the full-screen overlay
  // belongs to /tasks. Leaving the page parks an open overlay in the rail so a
  // hidden 'modal' state cannot reopen the overlay on the next visit.
  const location = useLocation();
  useEffect(() => {
    if (location.pathname.startsWith('/tasks')) return;
    const { displayMode, setDisplayMode } = useFocusStore.getState();
    if (displayMode === 'modal') setDisplayMode('sidebar');
  }, [location.pathname]);

  const running = useFocusStore((s) => s.timer.running);
  const phase = useFocusStore((s) => s.timer.phase);
  const lastEvent = useFocusStore((s) => s.lastEvent);
  const consumeEvent = useFocusStore((s) => s.consumeEvent);
  const tick = useFocusStore((s) => s.tick);
  const sceneId = useSoundscapeStore((s) => s.sceneId);
  const sceneStarted = useSoundscapeStore((s) => s.started);
  const currentTrackId = useMusicStore((s) => s.queue[s.index]?.id ?? null);
  const musicPlaying = useMusicStore((s) => s.playing);

  const playedTrackIdsRef = useRef<string[]>([]);
  const workPhaseRef = useRef(false);

  // ── The one ticker ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!running) return undefined;
    const id = window.setInterval(() => {
      tick();
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, tick]);

  // ── Listening history for the work phase ──────────────────────────────────
  // A phase owns one list. Reset it when work begins, not when the user pauses
  // and resumes, so a mid-phase pause does not erase the first half.
  useEffect(() => {
    if (phase !== 'work') {
      workPhaseRef.current = false;
      return;
    }
    if (workPhaseRef.current) return;
    workPhaseRef.current = true;
    playedTrackIdsRef.current = [];
    const music = useMusicStore.getState();
    const current = music.currentTrack();
    if (current && music.playing) playedTrackIdsRef.current.push(current.id);
  }, [phase]);

  useEffect(() => {
    if (!running || phase !== 'work' || !musicPlaying || !currentTrackId) return;
    if (!playedTrackIdsRef.current.includes(currentTrackId)) {
      playedTrackIdsRef.current.push(currentTrackId);
    }
  }, [currentTrackId, musicPlaying, running, phase]);

  const handlePhase = useCallback(async (info: PhaseCompleteInfo) => {
    const task = useFocusStore.getState().focusedTask;
    try {
      await window.electron.ipc.invoke('focus:session-create', {
        task_id: task?.id ?? null,
        kind: info.phase,
        planned_sec: info.plannedSec,
        actual_sec: info.actualSec,
        completed: info.completed,
        // Music belongs to work; break sessions record no listening history.
        track_ids:
          info.phase === 'work' ? [...playedTrackIdsRef.current] : undefined,
      });
    } catch {
      /* session recording is best-effort */
    }

    if (info.phase === 'work' && info.completed) {
      const minutes = Math.max(1, Math.round(info.actualSec / 60));
      const xp = minutes * XP_REWARDS.FOCUS_MINUTE + XP_REWARDS.POMODORO_COMPLETE;
      void window.electron.ipc
        .invoke('gamification:award-xp', {
          amount: xp,
          source: 'pomodoro_complete',
          entityId: task?.id,
        })
        .catch(() => {});
      if (task) {
        void window.electron.ipc
          .invoke('tasks:increment-pomodoro', { id: task.id })
          .catch(() => {});
      }
      // Music belongs to the work phase. The soundscape stays, so the break
      // does not fall into silence — the room just gets its rain back.
      if (useMusicStore.getState().playing) useMusicStore.getState().pause();
      toast.success('Pomodoro complete! Take a break.');
      void window.electron.ipc
        .invoke('notifications:notify', {
          title: 'Pomodoro complete',
          body: 'Great focus session. Take a restorative break.',
        })
        .catch(() => {});
    } else if (info.phase === 'break' && info.completed) {
      toast.info('Break finished. Ready to resume flow.');
      void window.electron.ipc
        .invoke('notifications:notify', {
          title: 'Break finished',
          body: 'Your break is done. Jump back into flow state.',
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!lastEvent) return;
    consumeEvent();
    void handlePhase(lastEvent);
  }, [lastEvent, consumeEvent, handlePhase]);

  // ── Power integration ─────────────────────────────────────────────────────
  useEffect(() => {
    void window.electron.ipc.invoke('focus:set-power-blocker', { enabled: running });
  }, [running]);

  useEffect(
    () => () => {
      void window.electron.ipc.invoke('focus:set-power-blocker', {
        enabled: false,
      });
    },
    [],
  );

  useEffect(() => {
    return window.electron.ipc.on('power:suspended', () => {
      useFocusStore.getState().pause();
    });
  }, []);

  // ── Scene ritual: start the scene's music when work begins ────────────────
  const ritualRef = useRef(false);
  useEffect(() => {
    const isWorkStart = running && phase === 'work';
    if (!isWorkStart) {
      ritualRef.current = false;
      return;
    }
    if (ritualRef.current) return;
    ritualRef.current = true;

    void (async () => {
      if (!useSoundscapeStore.getState().started) {
        await useSoundscapeStore.getState().start();
      }
      try {
        const userScenes = await window.electron.ipc.invoke<MusicScene[]>(
          'music:scenes-list',
        );
        const scene = findScene(
          [...BUILTIN_SCENES, ...(userScenes ?? [])],
          useSoundscapeStore.getState().sceneId,
        );
        const source = scene.config.music;
        if (!source) return;
        if (useMusicStore.getState().playing) return;
        const tracks = await fetchSceneTracks(source);
        if (tracks.length === 0) return;
        await useMusicStore.getState().playTracks(tracks, 0);
      } catch {
        /* a scene without a playable source is not an error */
      }
    })();
  }, [running, phase, sceneId, sceneStarted]);

  return null;
}
