/**
 * hooks/use-soundlab.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Page-level orchestrator hook for SoundLab. Wires SoundLabStore, SoundLabEngine,
 * IPC persistence, and 1-second debounced autosave together into one clean
 * surface consumed by SoundLabPage.
 *
 * Lives at the page level (not inside sub-components) so the AudioContext
 * and session state survive navigation between tabs within the DAW.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { soundLabStore, useSoundLabState } from './use-soundlab-store';
import { SoundLabEngine } from '@/lib/soundlab-engine';
import { buildDefaultTracks } from '@/lib/soundlab-types';
import type {
  SoundLabSessionWithTracks,
  SoundLabSession,
  BrainwaveBand,
} from '@/lib/soundlab-types';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface UseSoundLabReturn {
  loading: boolean;
  saveStatus: SaveStatus;
  sessions: SoundLabSession[];
  createSession: (templateId: string, band: BrainwaveBand, bpm: number) => Promise<string>;
  deleteSession: (id: string) => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  saveNow: () => Promise<void>;
}

let engineSingleton: SoundLabEngine | null = null;

function getEngine(): SoundLabEngine {
  if (!engineSingleton) engineSingleton = new SoundLabEngine();
  return engineSingleton;
}

export function useSoundLab(sessionId?: string): UseSoundLabReturn {
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<SoundLabSession[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const state = useSoundLabState();

  // ── Load session list ─────────────────────────────────────────────────────

  const loadList = useCallback(async () => {
    try {
      const list = await window.electron.ipc.invoke<SoundLabSession[]>(
        'soundlab:list',
        {},
      );
      setSessions(list ?? []);
    } catch {
      setSessions([]);
    }
  }, []);

  // ── Load a specific session ───────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId) {
      void loadList();
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        const data = await window.electron.ipc.invoke<SoundLabSessionWithTracks | null>(
          'soundlab:get',
          { id: sessionId },
        );
        if (data) soundLabStore.loadSession(data);
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId, loadList]);

  // ── Autosave on store changes (1s debounce) ───────────────────────────────

  useEffect(() => {
    if (!state.session) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const data = soundLabStore.getSessionWithTracks();
      if (!data) return;
      setSaveStatus('saving');
      try {
        await window.electron.ipc.invoke('soundlab:save', data);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('error');
      }
    }, 1000);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.tracks, state.session]);

  // ── Dispose engine on unmount ─────────────────────────────────────────────

  useEffect(() => {
    return () => {
      void getEngine().dispose();
      engineSingleton = null;
    };
  }, []);

  // ── Transport ─────────────────────────────────────────────────────────────

  const play = useCallback(async () => {
    const data = soundLabStore.getSessionWithTracks();
    if (!data) return;
    const engine = getEngine();
    if (engine.isPlaying) {
      engine.stop();
      soundLabStore.setPlaying(false);
      return;
    }
    await engine.start(
      data,
      (beat) => soundLabStore.seek(beat),
      () => { soundLabStore.setPlaying(false); soundLabStore.seek(0, true); },
    );
    soundLabStore.setPlaying(true);
  }, []);

  const pause = useCallback(() => {
    getEngine().stop();
    soundLabStore.setPlaying(false);
  }, []);

  const stop = useCallback(() => {
    getEngine().stop();
    soundLabStore.setPlaying(false);
    soundLabStore.seek(0, true);
  }, []);

  // ── Session management ────────────────────────────────────────────────────

  const createSession = useCallback(
    async (templateId: string, band: BrainwaveBand, bpm: number): Promise<string> => {
      const id = `sl-${Date.now().toString(36)}`;
      const now = Math.floor(Date.now() / 1000);
      const newSession: SoundLabSessionWithTracks = {
        id,
        projectId: null,
        title: templateId === 'blank' ? 'Untitled Session' : `${band.charAt(0).toUpperCase() + band.slice(1)} Session`,
        bpm,
        keySignature: 'C',
        targetBand: band,
        durationBeats: 128,
        loopEnabled: false,
        loopStartBeat: 0,
        loopEndBeat: 32,
        createdAt: now,
        updatedAt: now,
        tracks: buildDefaultTracks(id, band),
      };
      await window.electron.ipc.invoke('soundlab:save', newSession);
      await loadList();
      return id;
    },
    [loadList],
  );

  const deleteSession = useCallback(
    async (id: string) => {
      await window.electron.ipc.invoke('soundlab:delete', { id });
      await loadList();
    },
    [loadList],
  );

  const saveNow = useCallback(async () => {
    const data = soundLabStore.getSessionWithTracks();
    if (!data) return;
    setSaveStatus('saving');
    try {
      await window.electron.ipc.invoke('soundlab:save', data);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  }, []);

  return {
    loading,
    saveStatus,
    sessions,
    createSession,
    deleteSession,
    play,
    pause,
    stop,
    saveNow,
  };
}

export { getEngine };
