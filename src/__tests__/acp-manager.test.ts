import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import type { BrowserWindow } from 'electron';
import * as acp from '@agentclientprotocol/sdk';
import { spawn } from 'node:child_process';
import { buildExecutionEnv } from '../main/ai/shell-env';
import { AcpManager } from '../main/pty/acp-manager';

jest.mock('node:child_process', () => ({
  spawn: jest.fn(),
}));

jest.mock('@agentclientprotocol/sdk', () => ({
  PROTOCOL_VERSION: 1,
  methods: {
    agent: {
      initialize: 'initialize',
      session: { cancel: 'session/cancel' },
    },
    client: {
      session: {
        update: 'session/update',
        requestPermission: 'session/request_permission',
      },
    },
  },
  ndJsonStream: jest.fn(),
  client: jest.fn(),
}));

jest.mock('../main/ai/shell-env', () => ({
  buildExecutionEnv: jest.fn(),
}));

jest.mock('../main/db/terminal.js', () => ({
  updateTerminalSession: jest.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('AcpManager', () => {
  let directory: string;
  let manager: AcpManager;
  type PermissionHandler = (request: {
    params: {
      options: Array<{ optionId: string; name: string; kind: 'allow_once' }>;
      toolCall: { title: string; toolCallId: string };
    };
    requestId: string;
  }) => Promise<unknown>;
  let permissionHandler: PermissionHandler | undefined;
  let connectionClosed: ReturnType<typeof deferred<void>>;
  let sentEvents: Array<{ sessionId: string; event: unknown }>;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qeda-acp-'));
    const executable = path.join(directory, 'opencode');
    fs.writeFileSync(executable, '#!/bin/sh\n');
    fs.chmodSync(executable, 0o755);
    jest.mocked(buildExecutionEnv).mockReturnValue({
      PATH: directory,
    });

    connectionClosed = deferred<void>();
    sentEvents = [];
    permissionHandler = undefined;

    const activeSession = {
      sessionId: 'acp-session',
      prompt: jest.fn(() => new Promise(() => {})),
      nextUpdate: jest.fn(() => new Promise(() => {})),
    };
    const connection = {
      agent: {
        request: jest.fn().mockResolvedValue({}),
        buildSession: jest.fn(() => ({
          start: jest.fn().mockResolvedValue(activeSession),
        })),
        notify: jest.fn().mockResolvedValue(undefined),
      },
      closed: connectionClosed.promise,
      close: jest.fn(() => connectionClosed.resolve()),
    };
    const builder: {
      onNotification: jest.Mock;
      onRequest: jest.Mock;
      connect: jest.Mock;
    } = {
      onNotification: jest.fn(),
      onRequest: jest.fn(),
      connect: jest.fn(() => connection),
    };
    builder.onNotification.mockReturnValue(builder);
    builder.onRequest.mockImplementation(
      (_method: unknown, handler: PermissionHandler) => {
        permissionHandler = handler;
        return builder;
      },
    );
    jest.mocked(acp.client).mockReturnValue(builder as never);
    jest.mocked(acp.ndJsonStream).mockReturnValue({} as never);

    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      exitCode: null as number | null,
      killed: false,
      kill: jest.fn(function (this: { killed: boolean; exitCode: number | null }) {
        this.killed = true;
        this.exitCode = 0;
        return true;
      }),
    });
    jest.mocked(spawn).mockReturnValue(child as never);

    const window = {
      isDestroyed: () => false,
      webContents: {
        send: (sessionId: string, event: unknown) =>
          sentEvents.push({ sessionId, event }),
      },
    } as unknown as BrowserWindow;
    manager = new AcpManager(window);
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  it('holds ACP permission requests until the user selects an allowed option', async () => {
    await manager.startOrPrompt({
      sessionId: 'terminal-session',
      provider: 'opencode',
      cwd: directory,
      prompt: 'Inspect this project',
    });

    expect(spawn).toHaveBeenCalledWith(
      path.join(directory, 'opencode'),
      ['acp'],
      expect.objectContaining({ cwd: directory, stdio: ['pipe', 'pipe', 'pipe'] }),
    );
    expect(permissionHandler).toBeDefined();
    const permissionRequest = permissionHandler!({
      requestId: 'permission-1',
      params: {
        toolCall: { title: 'Read package manifest', toolCallId: 'tool-1' },
        options: [
          { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
        ],
      },
    });

    expect(manager.getState('terminal-session')?.pendingPermissions).toHaveLength(
      1,
    );
    expect(
      sentEvents.some(
        ({ event }) =>
          (event as { event?: { type?: string } }).event?.type ===
          'permission-request',
      ),
    ).toBe(true);

    expect(() =>
      manager.respondToPermission(
        'terminal-session',
        'permission-1',
        'unlisted-option',
      ),
    ).toThrow('The selected permission option is invalid.');
    expect(manager.getState('terminal-session')?.pendingPermissions).toHaveLength(
      1,
    );

    manager.respondToPermission(
      'terminal-session',
      'permission-1',
      'allow-once',
    );
    await expect(permissionRequest).resolves.toEqual({
      outcome: { outcome: 'selected', optionId: 'allow-once' },
    });
    expect(manager.getState('terminal-session')?.pendingPermissions).toHaveLength(
      0,
    );

    await manager.stop('terminal-session');
    expect(jest.mocked(spawn).mock.results[0]?.value.kill).toHaveBeenCalledWith(
      'SIGTERM',
    );
  });
});
