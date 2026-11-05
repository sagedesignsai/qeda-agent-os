/**
 * __tests__/soundlab-autosave.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies SoundLab autosaves only changed session content, not a loaded or
 * otherwise identical snapshot.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { useSoundLab } from '@/hooks/use-soundlab';
import { soundLabStore } from '@/hooks/use-soundlab-store';
import { buildDefaultTracks } from '@/lib/soundlab-types';
import type { SoundLabSessionWithTracks } from '@/lib/soundlab-types';

const SESSION: SoundLabSessionWithTracks = {
  id: 'autosave-session',
  projectId: null,
  title: 'Autosave test',
  bpm: 120,
  keySignature: 'C',
  targetBand: 'alpha',
  durationBeats: 64,
  loopEnabled: false,
  loopStartBeat: 0,
  loopEndBeat: 32,
  createdAt: 1000,
  updatedAt: 1000,
  tracks: buildDefaultTracks('autosave-session', 'alpha'),
};

describe('useSoundLab autosave', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('skips unchanged snapshots and saves edited content after the debounce', async () => {
    const invoke = jest.fn((channel: string) => {
      if (channel === 'soundlab:get') return Promise.resolve(SESSION);
      return Promise.resolve({ id: SESSION.id });
    });
    window.electron = {
      ipc: { invoke, on: jest.fn(() => () => {}) },
    } as unknown as typeof window.electron;

    const { unmount } = renderHook(() => useSoundLab(SESSION.id));

    await waitFor(() => {
      expect(soundLabStore.getState().session?.id).toBe(SESSION.id);
    });
    expect(invoke).not.toHaveBeenCalledWith('soundlab:save', expect.anything());

    jest.useFakeTimers();
    const track = soundLabStore.getState().tracks[0];
    act(() => soundLabStore.updateTrack(track.id, { volume: track.volume }));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
    expect(invoke).not.toHaveBeenCalledWith('soundlab:save', expect.anything());

    act(() => soundLabStore.updateTrack(track.id, { volume: 0.37 }));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenLastCalledWith(
      'soundlab:save',
      expect.objectContaining({ tracks: expect.any(Array) }),
    );

    unmount();
  });
});
