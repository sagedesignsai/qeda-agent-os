/**
 * main/builder/session-events.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Converts OpenCode v2's typed event stream into the small, serializable Builder
 * activity contract. The raw client/event types never cross the IPC boundary.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { V2Event } from '@opencode/client';
import type { BuilderFormField } from '../../lib/builder-interactions';
import type { BuilderSessionEvent } from '../../lib/builder-session';

export function normalizeBuilderSessionEvent(
  event: V2Event,
  sessionId: string,
): BuilderSessionEvent | null {
  const data = 'data' in event ? event.data : undefined;
  if (!data) return null;
  const eventSessionId =
    'sessionID' in data
      ? data.sessionID
      : event.type === 'form.created'
        ? event.data.form.sessionID
        : null;
  if (eventSessionId !== sessionId) return null;
  const base = {
    sessionId,
    eventId: event.id,
    createdAt: 'created' in event ? event.created : Date.now(),
  };

  switch (event.type) {
    case 'session.text.delta':
      return {
        ...base,
        type: 'text-delta',
        messageId: event.data.assistantMessageID,
        delta: event.data.delta,
      };
    case 'session.tool.input.started':
      return {
        ...base,
        type: 'tool-started',
        callId: event.data.id,
        name: event.data.name,
        input: {},
      };
    case 'session.tool.input.ended': {
      let input: unknown = event.data.text;
      try {
        input = JSON.parse(event.data.text);
      } catch {
        // Keep non-JSON tool input readable as raw text.
      }
      return { ...base, type: 'tool-input', callId: event.data.id, input };
    }
    case 'session.tool.called':
      return {
        ...base,
        type: 'tool-input',
        callId: event.data.id,
        input: event.data.input,
      };
    case 'session.tool.progress':
      return {
        ...base,
        type: 'tool-progress',
        callId: event.data.id,
        metadata: event.data.metadata,
      };
    case 'session.tool.success':
      return {
        ...base,
        type: 'tool-completed',
        callId: event.data.id,
        output: event.data.content
          .filter((item) => item.type === 'text')
          .map((item) => item.text)
          .join('\n'),
      };
    case 'session.tool.failed':
      return {
        ...base,
        type: 'tool-failed',
        callId: event.data.id,
        error: errorMessage(event.data.error),
      };
    case 'permission.asked':
      return {
        ...base,
        type: 'permission',
        request: {
          id: event.data.id,
          sessionID: event.data.sessionID,
          action: event.data.action,
          resources: event.data.resources,
          message: event.data.message,
        },
      };
    case 'permission.replied':
      return {
        ...base,
        type: 'interaction-resolved',
        interactionId: event.data.requestID,
        interactionType: 'permission',
      };
    case 'form.replied':
    case 'form.cancelled':
      return {
        ...base,
        type: 'interaction-resolved',
        interactionId: event.data.id,
        interactionType: 'form',
      };
    case 'form.created':
      return {
        ...base,
        type: 'form',
        form: {
          id: event.data.form.id,
          sessionID: event.data.form.sessionID,
          title: event.data.form.title,
          fields: event.data.form.fields as unknown as BuilderFormField[],
        },
      };
    case 'session.execution.started':
      return { ...base, type: 'status', status: 'running' };
    case 'session.status':
      return event.data.status.type === 'idle'
        ? { ...base, type: 'status', status: 'idle' }
        : event.data.status.type === 'busy'
          ? { ...base, type: 'status', status: 'running' }
          : {
              ...base,
              type: 'status',
              status: 'retrying',
              message: event.data.status.message,
            };
    case 'session.idle':
    case 'session.execution.succeeded':
      return { ...base, type: 'status', status: 'idle' };
    case 'session.execution.interrupted':
      return { ...base, type: 'status', status: 'interrupted' };
    case 'session.execution.failed':
      return {
        ...base,
        type: 'status',
        status: 'failed',
        message: errorMessage(event.data.error),
      };
    default:
      return null;
  }
}

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'OpenCode reported an error.';
}
