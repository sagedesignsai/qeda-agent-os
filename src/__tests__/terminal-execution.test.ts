/**
 * __tests__/terminal-execution.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for direct command execution, process cancellation, and stopCommand.
 * ─────────────────────────────────────────────────────────────────────────────
 */

jest.mock('ai', () => ({
  generateText: jest.fn(),
  tool: jest.fn((config) => config),
  isStepCount: jest.fn(),
}));

jest.mock('../main/ai/provider.js', () => ({
  resolveModel: jest.fn(),
}));

import Database from 'better-sqlite3';
import { useTestDatabase } from '../main/db/client';
import { applyMigrations } from '../main/db/schema';
import { createTerminalSession, getBlock } from '../main/db/terminal';
import {
  executeDirectCommand,
  stopCommand,
  type TerminalAgentEmitter,
} from '../main/ai/terminal-agent';

describe('terminal-execution and stopCommand', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db);
  });

  afterEach(() => {
    useTestDatabase(null);
    db.close();
  });

  it('returns false when stopping a non-existent process', () => {
    expect(stopCommand('non-existent-id')).toBe(false);
  });

  it('runs a short direct command, updates the block, and finishes as done', async () => {
    const session = createTerminalSession({ title: 'Test Session' });
    const blockIds: string[] = [];
    const updates: { id: string; status?: string; output?: string }[] = [];

    const mockEmitter: TerminalAgentEmitter = {
      onBlockProposed: (block) => {
        blockIds.push(block.id);
      },
      onBlockUpdated: (patch) => {
        updates.push(patch);
      },
      onDone: jest.fn(),
      onError: jest.fn(),
    };

    await executeDirectCommand({
      sessionId: session.id,
      command: 'echo "hello developer"',
      emitter: mockEmitter,
    });

    expect(blockIds.length).toBe(1);
    const block = getBlock(blockIds[0]);
    expect(block).not.toBeNull();
    expect(block?.status).toBe('done');
    expect(block?.output).toContain('hello developer');
    expect(block?.exit_code).toBe(0);
    expect(block?.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('allows stopping an active long-running command via stopCommand', async () => {
    const session = createTerminalSession({ title: 'Dev Server Session' });
    let spawnedBlockId: string | null = null;

    const mockEmitter: TerminalAgentEmitter = {
      onBlockProposed: (block) => {
        spawnedBlockId = block.id;
      },
      onBlockUpdated: jest.fn(),
      onDone: jest.fn(),
      onError: jest.fn(),
    };

    // Start a long-running sleep command (like a dev server)
    const runPromise = executeDirectCommand({
      sessionId: session.id,
      command: 'sleep 30',
      emitter: mockEmitter,
    });

    // Wait 50ms for the child process to spawn
    await new Promise((r) => setTimeout(r, 60));
    expect(spawnedBlockId).not.toBeNull();

    // Signal stop (equivalent to clicking Stop or pressing Ctrl+C)
    const stopped = stopCommand(spawnedBlockId!);
    expect(stopped).toBe(true);

    // Command should finish shortly after SIGINT
    await runPromise;

    const block = getBlock(spawnedBlockId!);
    expect(block).not.toBeNull();
    // SIGINT terminates with exit code 130 or 0
    expect(['done', 'error']).toContain(block?.status);
    expect(block?.duration_ms).toBeLessThan(5000);
  });
});
