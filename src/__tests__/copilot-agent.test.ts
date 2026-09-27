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
jest.mock('../main/ai/provider.js', () => ({ resolveModel: jest.fn(() => ({})) }));
jest.mock('../main/ai/settings.js', () => ({
  getSettings: jest.fn(() => ({ activeProvider: 'test', activeModel: 'test' })),
}));

import {
  copilotTools,
  isRiskyCopilotTool,
} from '../main/ai/task-copilot-agent';
import { RISKY_TASK_TOOLS } from '../main/tools/tasks';

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

  it('flags exactly the risky tools for approval', () => {
    for (const toolName of RISKY_TASK_TOOLS) {
      expect(isRiskyCopilotTool(toolName)).toBe(true);
    }

    for (const toolName of [
      'createTask',
      'createTasks',
      'createProject',
      'addSteps',
      'scheduleBlock',
      'handToTerminal',
      'webSearch',
      'listTasks',
    ]) {
      expect(isRiskyCopilotTool(toolName)).toBe(false);
    }
  });
});
