/**
 * __tests__/plan-hooks.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for plan extraction and hooks.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { UIMessage } from 'ai';
import {
  extractPlanFromMessages,
} from '../hooks/use-agent-plan';
import type { BuilderSessionEvent } from '../lib/builder-session';

describe('extractPlanFromMessages', () => {
  it('extracts plan from folded assistant tool call parts', () => {
    const messages: UIMessage[] = [
      {
        id: 'm1',
        role: 'user',
        parts: [{ type: 'text', text: 'Build a feature' }],
      },
      {
        id: 'm2',
        role: 'assistant',
        parts: [
          {
            type: 'tool-createPlan',
            toolCallId: 'c1',
            input: {
              items: [
                { id: 'task-1', title: 'Write tests' },
                { id: 'task-2', title: 'Implement feature' },
              ],
            },
          } as any,
          {
            type: 'tool-updatePlanItem',
            toolCallId: 'c2',
            input: {
              id: 'task-1',
              status: 'done',
            },
          } as any,
          {
            type: 'tool-updatePlanItem',
            toolCallId: 'c3',
            input: {
              id: 'task-2',
              status: 'in-progress',
            },
          } as any,
        ],
      },
    ];

    const plan = extractPlanFromMessages(messages);
    expect(plan).not.toBeNull();
    expect(plan?.version).toBe(1);
    expect(plan?.items).toHaveLength(2);
    expect(plan?.items[0]).toEqual({
      id: 'task-1',
      title: 'Write tests',
      status: 'done',
    });
    expect(plan?.items[1]).toEqual({
      id: 'task-2',
      title: 'Implement feature',
      status: 'in-progress',
    });
  });

  it('handles re-planning in later messages', () => {
    const messages: UIMessage[] = [
      {
        id: 'm1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-createPlan',
            input: { items: [{ id: 't1', title: 'Old' }] },
          } as any,
        ],
      },
      {
        id: 'm2',
        role: 'assistant',
        parts: [
          {
            type: 'tool-createPlan',
            input: { items: [{ id: 't1', title: 'New 1' }, { id: 't2', title: 'New 2' }] },
          } as any,
        ],
      },
    ];

    const plan = extractPlanFromMessages(messages);
    expect(plan?.version).toBe(2);
    expect(plan?.items).toHaveLength(2);
    expect(plan?.items[0].title).toBe('New 1');
  });

  it('returns null when no plan tools were called', () => {
    const messages: UIMessage[] = [
      {
        id: 'm1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Just a text reply' }],
      },
    ];
    expect(extractPlanFromMessages(messages)).toBeNull();
  });
});
