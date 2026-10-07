/**
 * __tests__/builder-session-events.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Exercises the OpenCode v2 → renderer-safe event adapter at its transport
 * boundary without needing an OpenCode service or Electron runtime.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { V2Event } from '@opencode/client';
import { normalizeBuilderSessionEvent } from '@/main/builder/session-events';

const event = (value: unknown) => value as V2Event;

describe('normalizeBuilderSessionEvent', () => {
  it('translates assistant deltas while preserving the session and message IDs', () => {
    expect(
      normalizeBuilderSessionEvent(
        event({
          id: 'evt-1',
          created: 100,
          type: 'session.text.delta',
          data: {
            sessionID: 'session-a',
            assistantMessageID: 'message-a',
            ordinal: 0,
            delta: 'Hello',
          },
        }),
        'session-a',
      ),
    ).toEqual({
      sessionId: 'session-a',
      eventId: 'evt-1',
      createdAt: 100,
      type: 'text-delta',
      messageId: 'message-a',
      delta: 'Hello',
    });
  });

  it('drops events from all other OpenCode sessions', () => {
    expect(
      normalizeBuilderSessionEvent(
        event({
          id: 'evt-other',
          created: 101,
          type: 'session.text.delta',
          data: {
            sessionID: 'session-b',
            assistantMessageID: 'message-b',
            ordinal: 0,
            delta: 'not ours',
          },
        }),
        'session-a',
      ),
    ).toBeNull();
  });

  it('normalizes permission requests for the explicit decision card', () => {
    const normalized = normalizeBuilderSessionEvent(
      event({
        id: 'evt-permission',
        created: 102,
        type: 'permission.asked',
        data: {
          id: 'permission-a',
          sessionID: 'session-a',
          action: 'bash',
          resources: ['npm test'],
          message: 'Run this command?',
        },
      }),
      'session-a',
    );

    expect(normalized).toMatchObject({
      type: 'permission',
      request: {
        id: 'permission-a',
        action: 'bash',
        resources: ['npm test'],
      },
    });
  });

  it('handles form-created events whose session id is nested in the form payload', () => {
    const normalized = normalizeBuilderSessionEvent(
      event({
        id: 'evt-form',
        created: 103,
        type: 'form.created',
        data: {
          form: {
            id: 'form-a',
            sessionID: 'session-a',
            title: 'Choose a framework',
            fields: [{ key: 'framework', type: 'string', required: true }],
          },
        },
      }),
      'session-a',
    );

    expect(normalized).toMatchObject({
      type: 'form',
      form: { id: 'form-a', title: 'Choose a framework' },
    });
  });
});
