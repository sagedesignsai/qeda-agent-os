/**
 * hooks/use-soundlab-copilot.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook binding the SoundLab Copilot Agent to IPC streaming channels.
 *
 * Runs turns over `soundlab-copilot:*` channels with session and playhead context.
 * Ephemeral session (persist: false, hydrate: false) — the DAW session mutations
 * are what persist, not the chat history.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  useAgentChat,
  type AgentTransport,
  type UseAgentChatReturn,
} from './use-agent-chat';

const SOUNDLAB_COPILOT_TRANSPORT: AgentTransport = {
  invokeChannel: 'soundlab-copilot:chat',
  chunkChannel: 'soundlab-copilot:stream-chunk',
  doneChannel: 'soundlab-copilot:stream-done',
  errorChannel: 'soundlab-copilot:stream-error',
  fallbackChannel: 'soundlab-copilot:stream-fallback',
};

export interface UseSoundLabCopilotOptions {
  sessionId: string;
  projectId?: string;
  currentBeat?: number;
}

export function useSoundLabCopilot({
  sessionId,
  projectId,
  currentBeat,
}: UseSoundLabCopilotOptions): UseAgentChatReturn {
  return useAgentChat({
    sessionId: `soundlab-copilot-${sessionId}`,
    transport: SOUNDLAB_COPILOT_TRANSPORT,
    context: {
      sessionId,
      projectId,
      currentBeat,
    },
    persist: false,
    hydrate: false,
  });
}
