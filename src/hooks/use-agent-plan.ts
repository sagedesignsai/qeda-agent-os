/**
 * hooks/use-agent-plan.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React hooks to extract and subscribe to AgentPlan state across all three
 * agent surfaces (Builder, Chat, Task Copilot).
 *
 *   • useBuilderPlan(events)       – derives plan state from BuilderSessionEvent[]
 *   • useIpcPlan(channel, messages) – subscribes to live IPC plan-events and
 *                                    falls back to message history on reload
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useMemo, useState } from 'react';
import type { UIMessage } from 'ai';
import type { AgentPlan, AgentPlanEvent } from '@/lib/agent-plan';
import type { BuilderSessionEvent } from '@/lib/builder-session';
import { useIpcEvent } from './use-ipc';

/**
 * Derive the current AgentPlan from a BuilderSessionEvent array.
 * Deterministic and pure — replays buffered events on reconnect.
 */
export function useBuilderPlan(
  events: BuilderSessionEvent[],
): AgentPlan | null {
  return useMemo(() => {
    let current: AgentPlan | null = null;

    for (const event of events) {
      if (event.type === 'plan-created') {
        current = {
          ...event.plan,
          items: event.plan.items.map((item) => ({ ...item })),
        };
      } else if (event.type === 'plan-item-updated' && current !== null) {
        const existing: AgentPlan = current;
        current = {
          ...existing,
          items: existing.items.map((item) =>
            item.id === event.itemId ? { ...item, status: event.status } : item,
          ),
        };
      }
    }

    return current;
  }, [events]);
}

/**
 * Fallback parser to reconstruct the plan from folded UIMessages in chat/copilot.
 */
export function extractPlanFromMessages(
  messages: UIMessage[],
): AgentPlan | null {
  let current: AgentPlan | null = null;

  for (const msg of messages) {
    if (msg.role !== 'assistant' || !Array.isArray(msg.parts)) continue;
    for (const part of msg.parts as any[]) {
      if (part.type === 'tool-createPlan' && part.input?.items) {
        const nextVersion: number = current !== null ? current.version + 1 : 1;
        current = {
          version: nextVersion,
          createdAt: Date.now(),
          items: (part.input.items as Array<{ id: string; title: string }>).map(
            (i) => ({ id: i.id, title: i.title, status: 'pending' }),
          ),
        };
      } else if (
        part.type === 'tool-updatePlanItem' &&
        part.input?.id &&
        current !== null
      ) {
        const existing: AgentPlan = current;
        const { id, status } = part.input;
        current = {
          ...existing,
          items: existing.items.map((item) =>
            item.id === id ? { ...item, status } : item,
          ),
        };
      }
    }
  }

  return current;
}

export type PlanEventChannel =
  | 'agent:plan-event'
  | 'copilot:plan-event'
  | 'document-drafter:plan-event'
  | 'studio-copilot:plan-event'
  | 'soundlab-copilot:plan-event'
  | 'correspondence-copilot:plan-event'
  | 'terminal:plan-event';

/**
 * Live subscription to any *:plan-event channel.
 * Seamlessly integrates live IPC events with historical message extraction.
 */
export function useIpcPlan(
  channel: PlanEventChannel,
  messages?: UIMessage[],
): {
  plan: AgentPlan | null;
  clearPlan: () => void;
} {
  const [livePlan, setLivePlan] = useState<AgentPlan | null>(null);

  useIpcEvent(channel, (event: unknown) => {
    const planEvent = event as AgentPlanEvent;
    if (!planEvent?.type) return;

    if (planEvent.type === 'plan-created') {
      setLivePlan({
        ...planEvent.plan,
        items: planEvent.plan.items.map((item) => ({ ...item })),
      });
    } else if (planEvent.type === 'plan-item-updated') {
      setLivePlan((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          items: prev.items.map((item) =>
            item.id === planEvent.itemId
              ? { ...item, status: planEvent.status }
              : item,
          ),
        };
      });
    }
  });

  const clearPlan = useCallback(() => {
    setLivePlan(null);
  }, []);

  // Use live plan if available; otherwise fallback to extracting from loaded messages
  const messagePlan = useMemo(
    () => (messages ? extractPlanFromMessages(messages) : null),
    [messages],
  );

  return {
    plan: livePlan ?? messagePlan,
    clearPlan,
  };
}
