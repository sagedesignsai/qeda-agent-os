/**
 * hooks/use-copilot-chat.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Binds the shared `useAgentChat` machinery to the copilot's IPC channels.
 *
 * The copilot conversation is deliberately ephemeral (`persist: false`,
 * `hydrate: false`): it is a working session against the task board, not a
 * chat thread to file away. The tools it calls are what persist.
 *
 * When the active provider is "offline" (Transformers.js), this hook routes
 * through `useOfflineAI` in the renderer instead of the main process agent,
 * so the model runs locally via WebGPU/WASM.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UIMessage } from 'ai';
import {
  useAgentChat,
  type AgentTransport,
  type UseAgentChatReturn,
  type AgentStatus,
} from './use-agent-chat';
import { useOfflineAI } from './use-offline-ai';

/** Namespaced so a copilot turn never collides with a main-chat turn. */
const COPILOT_TRANSPORT: AgentTransport = {
  invokeChannel: 'copilot:chat',
  chunkChannel: 'copilot:stream-chunk',
  doneChannel: 'copilot:stream-done',
  errorChannel: 'copilot:stream-error',
  fallbackChannel: 'copilot:stream-fallback',
};

/**
 * Read the active provider and offline model id from settings via IPC.
 * Cached so the hook does not re-fetch on every render.
 */
function useActiveProvider() {
  const [provider, setProvider] = useState('');
  const [offlineModel, setOfflineModel] = useState('');

  useEffect(() => {
    let cancelled = false;
    window.electron.ipc
      .invoke<Record<string, unknown>>('settings:get')
      .then((s) => {
        if (cancelled) return;
        setProvider((s?.activeProvider as string) ?? '');
        setOfflineModel((s?.offlineModel as string) ?? '');
      })
      .catch(() => {});

    // Listen for settings changes (e.g., user switches provider in Settings)
    const handler = () => {
      window.electron.ipc
        .invoke<Record<string, unknown>>('settings:get')
        .then((s) => {
          if (cancelled) return;
          setProvider((s?.activeProvider as string) ?? '');
          setOfflineModel((s?.offlineModel as string) ?? '');
        })
        .catch(() => {});
    };
    const cleanup = window.electron.ipc.on('settings:changed', handler);
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return { provider, offlineModel };
}

/**
 * Adapter that wraps `useOfflineAI` to produce a `UseAgentChatReturn`-compatible
 * interface so the copilot UI works with both cloud and offline models.
 */
function useOfflineCopilotChat(
  modelId: string,
): UseAgentChatReturn {
  const offline = useOfflineAI({ modelId: modelId || undefined });

  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [status, setStatus] = useState<AgentStatus>('ready');
  const [error, setError] = useState<Error | undefined>();
  const streamingRef = useRef(false);

  const sendMessage = useCallback(
    async (text: string) => {
      if (streamingRef.current || !text.trim()) return;

      const userMessage: UIMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        parts: [{ type: 'text', text }],
      };
      setMessages((prev) => [...prev, userMessage]);
      setStatus('streaming');
      streamingRef.current = true;
      setError(undefined);

      // Build a system prompt from prior messages for context
      const priorMessages = messages;
      const systemParts = priorMessages
        .map((m) => {
          const part = m.parts[0] as { type?: string; text?: string };
          const role = m.role === 'user' ? 'User' : 'Assistant';
          return part?.text ? `${role}: ${part.text}` : '';
        })
        .filter(Boolean)
        .join('\n\n');

      const prompt = systemParts
        ? `${systemParts}\n\nAssistant:`
        : text;

      try {
        // Initialize the model if needed
        if (offline.status === 'idle' || offline.status === 'error') {
          await offline.initialize();
        }

        const stream = await offline.generate(prompt);
        let assistantMessage: UIMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          parts: [{ type: 'text', text: '' }],
        };

        setMessages((prev) => [...prev, assistantMessage]);

        for await (const chunk of stream) {
          assistantMessage = {
            ...assistantMessage,
            parts: [
              {
                type: 'text',
                text:
                  ((assistantMessage.parts[0] as { text?: string })?.text ?? '') +
                  chunk,
              },
            ],
          };
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = assistantMessage;
            return copy;
          });
        }
      } catch (err) {
        setError(
          err instanceof Error ? err : new Error(String(err)),
        );
      } finally {
        setStatus('ready');
        streamingRef.current = false;
      }
    },
    [messages, offline],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setStatus('ready');
    setError(undefined);
  }, []);

  return {
    messages,
    status,
    error,
    fallbackNotice: undefined,
    dismissFallbackNotice: () => {},
    sendMessage,
    respondToApproval: () => {},
    abortStream: () => {
      streamingRef.current = false;
      setStatus('ready');
    },
    clearMessages,
  };
}

export function useCopilotChat(opts?: {
  projectId?: string;
}): UseAgentChatReturn {
  const { provider, offlineModel } = useActiveProvider();

  // When the offline provider is active, route through the renderer's
  // Transformers.js hook instead of the main process agent.
  if (provider === 'offline') {
    return useOfflineCopilotChat(offlineModel);
  }

  return useAgentChat({
    sessionId: 'focus-copilot',
    transport: COPILOT_TRANSPORT,
    context: opts?.projectId ? { projectId: opts.projectId } : undefined,
    persist: false,
    hydrate: false,
  });
}
