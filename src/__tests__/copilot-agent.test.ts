/**
 * __tests__/copilot-agent.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies the copilot agent's surface: it composes task verbs with read-only
 * context tools, and its approval policy gates exactly the risky ones.
 * ─────────────────────────────────────────────────────────────────────────────
 */

jest.mock('ai', () => ({
  ToolLoopAgent: jest.fn(),
  isStepCount: jest.fn(),
  tool: jest.fn((config: unknown) => config),
  embed: jest.fn(),
  embedMany: jest.fn(),
}));
jest.mock('../main/ai/provider.js', () => ({
  resolveModel: jest.fn(() => ({})),
}));
jest.mock('../main/ai/settings.js', () => ({
  getSettings: jest.fn(() => ({ activeProvider: 'test', activeModel: 'test' })),
}));

import {
  copilotTools,
  isRiskyCopilotTool,
} from '../main/ai/task-copilot-agent';

describe('copilot agent definition', () => {
  it('exposes the task verb tools', () => {
    for (const name of [
      'listTasks',
      'listProjects',
      'getTask',
      'getFocusStats',
      'listBlocks',
      'createTask',
      'createTasks',
      'createProject',
      'addSteps',
      'scheduleBlock',
      'updateTask',
      'completeTask',
      'deleteTask',
      'assignTaskToProject',
      'moveBlock',
      'deleteBlock',
      'handToTerminal',
    ]) {
      expect(copilotTools).toHaveProperty(name);
    }
  });

  it('exposes read-only context tools for grounding tasks', () => {
    for (const name of [
      'webSearch',
      'fetchUrl',
      'libraryDocs',
      'findPages',
      'listPages',
      'getPage',
      'relatedPages',
      'searchDocs',
      'readFile',
      'listDir',
    ]) {
      expect(copilotTools).toHaveProperty(name);
    }
  });

  it('flags exactly the gated tools for approval', () => {
    // The `destructive` verbs, unchanged from the old hand-maintained set.
    for (const toolName of [
      'updateTask',
      'completeTask',
      'deleteTask',
      'assignTaskToProject',
      'moveBlock',
      'deleteBlock',
    ]) {
      expect(isRiskyCopilotTool(toolName)).toBe(true);
    }

    // Plus the two `cost` indexing tools, which are new intended behaviour.
    expect(isRiskyCopilotTool('indexFile')).toBe(true);
    expect(isRiskyCopilotTool('indexPage')).toBe(true);

    for (const toolName of [
      'createTask',
      'createTasks',
      'createProject',
      'addSteps',
      'scheduleBlock',
      'handToTerminal',
      'webSearch',
      'listTasks',
      // Read-only repo tools must never gate.
      'gitStatus',
      'gitLog',
      'gitDiffStat',
      'grepSearch',
    ]) {
      expect(isRiskyCopilotTool(toolName)).toBe(false);
    }
  });
});
