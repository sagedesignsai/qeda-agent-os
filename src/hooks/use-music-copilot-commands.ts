/**
 * hooks/use-music-copilot-commands.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The renderer end of the Music Copilot's tool calls.
 *
 * Tools that affect sound cannot run in main: the audio engine, the queues and
 * the focus timer are renderer singletons. The agent therefore emits a typed
 * command, and this app-wide listener translates it into store actions.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useNavigate } from 'react-router';
import { useIpcEvent } from './use-ipc';
import { useMusicStore } from '@/stores/music-store';
import { useSoundscapeStore } from '@/stores/soundscape-store';
import { useFocusStore } from '@/stores/focus-store';
import { fetchSceneTracks } from '@/lib/music/scene-tracks';
import type { Task } from '@/main/ipc/channels';
import type { MusicCopilotCommand, MusicTrack } from '@/lib/music/types';

/** Apply one command. Exported so it can be exercised without an IPC event. */
export async function applyMusicCopilotCommand(
  command: MusicCopilotCommand,
  navigate: (path: string) => void,
): Promise<void> {
  switch (command.type) {
    case 'play': {
      const tracks = await window.electron.ipc.invoke<MusicTrack[]>(
        'music:tracks-by-ids',
        { ids: command.trackIds },
      );
      if (!tracks || tracks.length === 0) return;
      const store = useMusicStore.getState();
      if (command.shuffle !== undefined) store.setShuffle(command.shuffle);
      await store.playTracks(tracks, 0);
      return;
    }

    case 'pause':
      useMusicStore.getState().pause();
      return;

    case 'resume':
      if (useMusicStore.getState().currentTrack()) {
        await useMusicStore.getState().play();
      }
      return;

    case 'next':
      await useMusicStore.getState().next(false);
      return;

    case 'previous':
      await useMusicStore.getState().previous();
      return;

    case 'stop':
      useMusicStore.getState().clearQueue();
      return;

    case 'levels': {
      if (command.music !== undefined) {
        useMusicStore.getState().setVolume(command.music);
      }
      if (command.ambience !== undefined) {
        useSoundscapeStore
          .getState()
          .patchState({ masterVolume: command.ambience });
      }
      return;
    }

    case 'scene': {
      const soundscape = useSoundscapeStore.getState();
      soundscape.setScene(command.sceneId, command.config.soundscape);
      useMusicStore.getState().setCrossfadeSec(command.config.crossfadeSec);
      useMusicStore.getState().setDuckDb(command.config.duckDb);
      if (!command.start) return;

      await soundscape.start(command.config.soundscape);

      // A scene with a music source is a ritual: start it unless the user is
      // already listening to something they chose.
      if (command.config.music && !useMusicStore.getState().playing) {
        try {
          const tracks = await fetchSceneTracks(command.config.music);
          if (tracks.length > 0) {
            await useMusicStore.getState().playTracks(tracks, 0);
          }
        } catch {
          /* an empty library is not an error */
        }
      }
      return;
    }

    case 'focus': {
      const tasks = await window.electron.ipc.invoke<Task[]>('tasks:list', {});
      const task = tasks?.find((entry) => entry.id === command.taskId);
      if (!task) return;
      if (command.presetIndex !== undefined) {
        useFocusStore.getState().setPresetIndex(command.presetIndex);
      }
      useFocusStore.getState().startFocus(task);
      navigate('/tasks');
      return;
    }
  }
}

export function useMusicCopilotCommands(): void {
  const navigate = useNavigate();

  useIpcEvent(
    'music:copilot-command',
    (payload: unknown) => {
      void applyMusicCopilotCommand(
        payload as MusicCopilotCommand,
        navigate,
      ).catch(() => {
        /* a command against a stale queue is best-effort */
      });
    },
    [navigate],
  );
}
