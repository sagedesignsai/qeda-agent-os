jest.mock('node-pty', () => ({
  spawn: jest.fn(),
}));

import Database from 'better-sqlite3';
import { spawn } from 'node-pty';
import { PtyManager } from '../main/pty/manager';
import { useTestDatabase } from '../main/db/client';
import { applyMigrations } from '../main/db/schema';
import { createTerminalSession } from '../main/db/terminal';

describe('PtyManager session command recovery', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);
    useTestDatabase(db);
  });

  afterEach(() => {
    useTestDatabase(null as unknown as Database.Database);
    db.close();
    jest.clearAllMocks();
  });

  it('exposes an active command while running and clears it on shell completion', () => {
    let onData: ((data: string) => void) | undefined;
    const ptyProcess = {
      write: jest.fn(),
      resize: jest.fn(),
      kill: jest.fn(),
      onData: jest.fn((listener: (data: string) => void) => {
        onData = listener;
        return { dispose: jest.fn() };
      }),
      onExit: jest.fn(),
    };
    (spawn as jest.Mock).mockReturnValue(ptyProcess);
    const window = {
      isDestroyed: () => false,
      webContents: { send: jest.fn() },
    };
    const manager = new PtyManager(window as never);
    const session = createTerminalSession({ title: 'CLI session' });
    const ptyId = manager.create({
      cols: 80,
      rows: 24,
      sessionId: session.id,
      enableShellIntegration: false,
    });

    expect(manager.getActiveCommand(session.id)).toBeNull();
    expect(manager.runCommand(ptyId, 'opencode')).toBe(true);

    onData?.('\x1b]133;A\x07$ \x1b]133;B\x07');
    expect(manager.getActiveCommand(session.id)).toBe('opencode');
    expect(ptyProcess.write).toHaveBeenCalledWith('opencode\r');

    onData?.('opencode\x1b]133;C\x07');
    onData?.('\x1b]133;D;130\x07');
    expect(manager.getActiveCommand(session.id)).toBeNull();
  });
});
