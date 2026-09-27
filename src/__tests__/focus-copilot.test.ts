/**
 * __tests__/focus-copilot.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The copilot's job is plumbing: resolve a model, call `generateObject` with a
 * schema, hand back the parsed object. These tests pin that contract without
 * touching a real provider.
 * ─────────────────────────────────────────────────────────────────────────────
 */

jest.mock('ai', () => ({ generateObject: jest.fn() }));
jest.mock('../main/ai/provider.js', () => ({ resolveModel: jest.fn(() => ({})) }));
jest.mock('../main/ai/settings.js', () => ({
  getSettings: jest.fn(() => ({ activeProvider: 'test', activeModel: 'test' })),
}));

import { generateObject } from 'ai';
import {
  breakdownTask,
  expandBrainDump,
  planDay,
} from '../main/ai/task-copilot';

const mockGenerateObject = generateObject as unknown as jest.Mock;

describe('task-copilot', () => {
  beforeEach(() => {
    mockGenerateObject.mockReset();
  });

  it('returns breakdown steps and note from the model object', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        steps: ['Open the doc', 'Write one sentence'],
        note: 'Starting is the hard part.',
      },
    });

    const result = await breakdownTask({ title: 'Write essay' });

    expect(result.steps).toEqual(['Open the doc', 'Write one sentence']);
    expect(result.note).toBe('Starting is the hard part.');
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    // The prompt must carry the task title through to the model.
    const call = mockGenerateObject.mock.calls[0][0];
    expect(JSON.stringify(call.prompt)).toContain('Write essay');
  });

  it('maps a brain dump to draft tasks', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        tasks: [
          {
            title: 'Call the dentist',
            description: 'Book a cleaning',
            priority: 1,
            estimate_mins: 10,
          },
        ],
        note: 'One thing worth doing today.',
      },
    });

    const result = await expandBrainDump('dentist!! also maybe fix bike?');

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].title).toBe('Call the dentist');
    expect(result.tasks[0].priority).toBe(1);
  });

  it('passes the planning window and busy slots to the model', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        blocks: [
          { task_id: 't1', title: 'Deep work', start_min: 540, duration_min: 60 },
        ],
        note: 'Front-loaded the hardest task.',
      },
    });

    const result = await planDay({
      tasks: [
        {
          id: 't1',
          title: 'Deep work',
          priority: 1,
          estimate_mins: 60,
          due_at: null,
        },
      ],
      busy: [{ title: 'Standup', start_min: 570, end_min: 585 }],
      workStartMin: 540,
      workEndMin: 1080,
    });

    expect(result.blocks[0]).toEqual({
      task_id: 't1',
      title: 'Deep work',
      start_min: 540,
      duration_min: 60,
    });

    const call = mockGenerateObject.mock.calls[0][0];
    expect(call.prompt).toContain('Standup');
    expect(call.prompt).toContain('09:00');
  });
});
