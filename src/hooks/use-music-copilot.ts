/**
 * hooks/use-music-copilot.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React binding for the Music Copilot. Ephemeral by design: the conversation is
 * a listening session, while the playlists and playback state it creates
 * persist through their own stores.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useMusicStore } from '@/stores/music-store';
import { useSoundscapeStore } from '@/stores/soundscape-store';
import {
  useAgentChat,
  type AgentTransport,
  type UseAgentChatReturn,
} from './use-agent-chat';

const MUSIC_COPILOT_TRANSPORT: AgentTransport = {
  invokeChannel: 'music-copilot:chat',
  chunkChannel: 'music-copilot:stream-chunk',
  doneChannel: 'music-copilot:stream-done',
  errorChannel: 'music-copilot:stream-error',
  fallbackChannel: 'music-copilot:stream-fallback',
};

export function useMusicCopilot(): UseAgentChatReturn {
  const playing = useMusicStore((s) => s.playing);
  const queueLength = useMusicStore((s) => s.queue.length);
  const current = useMusicStore((s) => s.queue[s.index] ?? null);
  const sceneId = useSoundscapeStore((s) => s.sceneId);

  return useAgentChat({
    sessionId: 'music-copilot',
    transport: MUSIC_COPILOT_TRANSPORT,
    context: {
      playing,
      queueLength,
      currentTrackTitle: current?.title ?? null,
      currentTrackArtist: current?.artist ?? null,
      sceneId,
    },
    persist: false,
    hydrate: false,
  });
}
