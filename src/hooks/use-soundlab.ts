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
import { buildDefaultTracks, SESSION_TEMPLATES } from '@/lib/soundlab-types';
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
  createSession: (
    templateId: string,
    band: BrainwaveBand,
    bpm: number,
  ) => Promise<string>;
  deleteSession: (id: string) => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  saveNow: () => Promise<void>;
  reloadSession: () => Promise<void>;
}

let engineSingleton: SoundLabEngine | null = null;

export function getEngine(): SoundLabEngine {
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

  // ── Reload/sync session from disk / copilot ──────────────────────────────

  const reloadSession = useCallback(async () => {
    if (!sessionId) {
      void loadList();
      return;
    }
    try {
      const data =
        await window.electron.ipc.invoke<SoundLabSessionWithTracks | null>(
          'soundlab:get',
          { id: sessionId },
        );
      if (data) soundLabStore.syncSession(data);
    } catch {
      // ignore
    }
  }, [sessionId, loadList]);

  // ── Load a specific session ───────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId) {
      void loadList();
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        const data =
          await window.electron.ipc.invoke<SoundLabSessionWithTracks | null>(
            'soundlab:get',
            { id: sessionId },
          );
        if (data) soundLabStore.loadSession(data);
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId, loadList]);

  useEffect(() => {
    const off = window.electron.ipc.on('soundlab:changed', () => {
      void loadList();
    });
    return off;
  }, [loadList]);

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
  }, [state.tracks, state.session]);

  useEffect(() => {
    if (!engineSingleton?.isPlaying) return;
    const data = soundLabStore.getSessionWithTracks();
    if (data) engineSingleton.updateSession(data);
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
    const storedData = soundLabStore.getSessionWithTracks();
    if (!storedData) return;
    const engine = getEngine();
    if (engine.isPlaying) {
      const beat = soundLabStore.getState().playheadBeat;
      engine.stop();
      soundLabStore.seek(beat, true);
      soundLabStore.setPlaying(false);
      return;
    }
    const currentState = soundLabStore.getState();
    let data = storedData;
    let fromBeat = currentState.playheadBeat;
    if (currentState.playMode === 'pattern') {
      const selectedTrack = currentState.tracks.find(
        (track) => track.id === currentState.selectedTrackId,
      );
      const track = selectedTrack?.patterns.length
        ? selectedTrack
        : currentState.tracks.find((item) => item.patterns.length > 0);
      const pattern =
        track?.patterns.find(
          (item) => item.id === currentState.selectedPatternId,
        ) ?? track?.patterns[0];
      if (track && pattern) {
        data = {
          ...storedData,
          durationBeats: pattern.lengthBeats,
          loopEnabled: true,
          loopStartBeat: 0,
          loopEndBeat: pattern.lengthBeats,
          tracks: storedData.tracks.map((item) => ({
            ...item,
            clips:
              item.id === track.id
                ? [
                    {
                      id: `preview-${pattern.id}`,
                      trackId: item.id,
                      patternId: pattern.id,
                      startBeat: 0,
                      durationBeats: pattern.lengthBeats,
                    },
                  ]
                : [],
          })),
        };
        fromBeat = 0;
      }
    }
    await engine.start(
      data,
      (beat) => soundLabStore.seek(beat),
      () => {
        soundLabStore.setPlaying(false);
        soundLabStore.seek(0, true);
      },
      fromBeat >= data.durationBeats ? 0 : fromBeat,
    );
    soundLabStore.setPlaying(engine.isPlaying);
  }, []);

  const pause = useCallback(() => {
    const beat = soundLabStore.getState().playheadBeat;
    getEngine().stop();
    soundLabStore.seek(beat, true);
    soundLabStore.setPlaying(false);
  }, []);

  const stop = useCallback(() => {
    getEngine().stop();
    soundLabStore.setPlaying(false);
    soundLabStore.seek(0, true);
  }, []);

  // ── Session management ────────────────────────────────────────────────────

  const createSession = useCallback(
    async (
      templateId: string,
      band: BrainwaveBand,
      bpm: number,
    ): Promise<string> => {
      const id = `sl-${Date.now().toString(36)}`;
      const now = Math.floor(Date.now() / 1000);
      const matchedTemplate = SESSION_TEMPLATES.find(
        (t) => t.id === templateId,
      );
      const title =
        templateId === 'blank'
          ? 'Untitled Session'
          : (matchedTemplate?.label ?? 'Untitled Session');

      const newSession: SoundLabSessionWithTracks = {
        id,
        projectId: null,
        title,
        bpm,
        keySignature: 'C',
        targetBand: band,
        durationBeats: 128,
        loopEnabled: false,
        loopStartBeat: 0,
        loopEndBeat: 32,
        createdAt: now,
        updatedAt: now,
        tracks: buildDefaultTracks(id, band, templateId),
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
    reloadSession,
  };
}
